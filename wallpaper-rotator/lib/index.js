/**
 * dsh-wallpaper-rotator — node half.
 *
 * Registers the /plugins/wallpaper-rotator routes (longest-prefix-wins, so it
 * coexists with client-modules' own /plugins bundle route):
 *   GET  /list?folder=<path>   扫描文件夹，返回图片清单（记住 name -> 绝对路径）
 *   GET  /image/<name>         提供图片字节
 *   GET  /builtin/<n>.svg      内置 SVG 壁纸集（随插件分发）
 *   GET  /config               读取持久化配置（$DSH_HOME/wallpaper-rotator.json）
 *   POST /config               保存持久化配置
 *
 * 兼容性约定：路由前缀、配置文件名、行 id（wallpaper-rotator）均唯一。
 */
import { readFile, writeFile, readdir, stat, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

/** Cordis 插件名（patch 行 id）。 */
const name = "wallpaper-rotator";
/** 依赖的服务。 */
const inject = ["webServer"];

const here = dirname(fileURLToPath(import.meta.url));
const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i;
const MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  avif: "image/avif",
  svg: "image/svg+xml"
};
/** 单张图片字节上限。 */
const MAX_BYTES = 64 * 1024 * 1024;

/** 内置壁纸集（SVG 渐变，随插件分发）。 */
const BUILTIN = [
  {
    id: "0.svg",
    name: "内置壁纸 · 晨光",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb39a"/><stop offset="0.45" stop-color="#a06bd4"/><stop offset="1" stop-color="#1f2b66"/></linearGradient><radialGradient id="h" cx="0.25" cy="0.18" r="0.55"><stop offset="0" stop-color="#fff2d8" stop-opacity="0.5"/><stop offset="1" stop-color="#fff2d8" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><rect width="1920" height="1080" fill="url(#h)"/></svg>`
  },
  {
    id: "1.svg",
    name: "内置壁纸 · 海洋",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#072a52"/><stop offset="0.5" stop-color="#0f6f8f"/><stop offset="1" stop-color="#59c9c4"/></linearGradient><radialGradient id="h" cx="0.85" cy="0.2" r="0.6"><stop offset="0" stop-color="#bdf3ea" stop-opacity="0.35"/><stop offset="1" stop-color="#bdf3ea" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><rect width="1920" height="1080" fill="url(#h)"/></svg>`
  },
  {
    id: "2.svg",
    name: "内置壁纸 · 暮色",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a50"/><stop offset="0.5" stop-color="#e23a78"/><stop offset="1" stop-color="#48113f"/></linearGradient><radialGradient id="h" cx="0.5" cy="0.28" r="0.5"><stop offset="0" stop-color="#ffd9a8" stop-opacity="0.45"/><stop offset="1" stop-color="#ffd9a8" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><rect width="1920" height="1080" fill="url(#h)"/></svg>`
  },
  {
    id: "3.svg",
    name: "内置壁纸 · 林间",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d2b1e"/><stop offset="0.55" stop-color="#1f5c3d"/><stop offset="1" stop-color="#7fb069"/></linearGradient><radialGradient id="h" cx="0.15" cy="0.8" r="0.6"><stop offset="0" stop-color="#d9f0c9" stop-opacity="0.3"/><stop offset="1" stop-color="#d9f0c9" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><rect width="1920" height="1080" fill="url(#h)"/></svg>`
  }
];
const builtin = new Map();
for (const b of BUILTIN) builtin.set(b.id, b.svg);

/** 最近一次成功扫描的 name -> 绝对路径（进程内）。 */
let images = new Map();

/** DSH 配置根目录。 */
function dshHome() {
  return process.env.DSH_HOME || join(homedir(), ".dsh");
}
/** 本插件持久化配置文件（独立文件名，避免与其他插件冲突）。 */
function configPath() {
  return join(dshHome(), "wallpaper-rotator.json");
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-cache"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("request body too large"));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function scanFolder(folder) {
  const entries = await readdir(folder, { withFileTypes: true });
  const files = [];
  const next = new Map();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!IMAGE_RE.test(entry.name)) continue;
    const ext = entry.name.split(".").pop().toLowerCase();
    next.set(entry.name, join(folder, entry.name));
    files.push({
      name: entry.name,
      url: "/plugins/wallpaper-rotator/image/" + encodeURIComponent(entry.name),
      mime: MIME[ext] || "application/octet-stream"
    });
  }
  images = next;
  return files;
}

async function handleList(req, res, query) {
  const folder = (query.get("folder") || "").trim();
  if (!folder) {
    sendJson(res, 200, { ok: false, error: "未指定图片文件夹" });
    return;
  }
  try {
    const st = await stat(folder);
    if (!st.isDirectory()) {
      sendJson(res, 200, { ok: false, error: "路径不是文件夹: " + folder });
      return;
    }
    const files = await scanFolder(folder);
    sendJson(res, 200, { ok: true, files });
  } catch (error) {
    sendJson(res, 200, { ok: false, error: String((error && error.message) || error) });
  }
}

async function handleImage(req, res, rawName) {
  if (rawName === void 0) {
    res.writeHead(400);
    res.end();
    return;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(rawName);
  } catch {
    res.writeHead(400);
    res.end();
    return;
  }
  const filePath = images.get(decoded);
  if (filePath === void 0) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const st = await stat(filePath);
    if (st.size > MAX_BYTES) {
      res.writeHead(413);
      res.end();
      return;
    }
    const body = await readFile(filePath);
    const ext = decoded.split(".").pop().toLowerCase();
    res.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "content-length": String(body.length),
      "cache-control": "no-cache"
    });
    res.end(body);
  } catch {
    res.writeHead(500);
    res.end();
  }
}

async function handleConfigGet(req, res) {
  try {
    const body = await readFile(configPath(), "utf8");
    let config = null;
    try {
      config = JSON.parse(body);
    } catch {
      config = null;
    }
    sendJson(res, 200, { ok: true, config });
  } catch (error) {
    if (error && error.code === "ENOENT") sendJson(res, 200, { ok: true, config: null });
    else sendJson(res, 500, { ok: false, error: String((error && error.message) || error) });
  }
}

async function handleConfigPost(req, res) {
  try {
    const raw = await readBody(req);
    const config = JSON.parse(raw);
    if (typeof config !== "object" || config === null || Array.isArray(config)) {
      throw new Error("config must be a JSON object");
    }
    await mkdir(dshHome(), { recursive: true });
    await writeFile(configPath(), JSON.stringify(config, null, 2), "utf8");
    sendJson(res, 200, { ok: true });
  } catch (error) {
    sendJson(res, 400, { ok: false, error: String((error && error.message) || error) });
  }
}

function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/plugins/wallpaper-rotator",
    handler: async (req, res) => {
      const url = new URL(req.url || "/", "http://x");
      const rest = url.pathname.split("/").filter(Boolean).slice(2);
      const head = rest[0];
      if (head === "list") return handleList(req, res, url.searchParams);
      if (head === "config") {
        if (req.method === "GET" || req.method === "HEAD") return handleConfigGet(req, res);
        if (req.method === "POST") return handleConfigPost(req, res);
        res.writeHead(405);
        res.end();
        return;
      }
      if (head === "image") return handleImage(req, res, rest[1]);
      if (head === "builtin") {
        const svg = builtin.get(rest[1]);
        if (svg === void 0) {
          res.writeHead(404);
          res.end();
          return;
        }
        res.writeHead(200, {
          "content-type": "image/svg+xml",
          "cache-control": "no-cache"
        });
        res.end(svg);
        return;
      }
      sendJson(res, 404, { ok: false, error: "not found" });
    }
  }), "wallpaper-rotator: routes");
}

export { apply, inject, name };
