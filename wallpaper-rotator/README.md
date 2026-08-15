# dsh-wallpaper-rotator

DSH（DeepSeek Harness）壁纸轮换插件：定时轮换应用背景壁纸，交叉淡化微动效，内置 SVG 壁纸集，毛玻璃 / 压暗 / 文字阴影等可读性调节，设置页一键配置，配置持久化。

## 安装

```powershell
# npm 仓库（已发布）
dsh plugin --profile web add dsh-wallpaper-rotator

# GitHub 仓库
dsh plugin --profile web add github:liceses/dsh-wallpaper-rotator

# 本地开发路径（仅本机可用）
dsh plugin --profile web add D:\path\to\wallpaper-rotator
```

安装后**重启 `dsh web`** 生效。卸载：

```powershell
dsh plugin --profile web remove dsh-wallpaper-rotator
```

## 使用

重启后打开 **设置 → 壁纸轮换**：

- 默认使用内置壁纸集（4 张 SVG 渐变）立即开始轮换
- 「图片文件夹」输入路径或点「浏览…」并「应用」，切换为自有图片（png/jpg/webp/gif/bmp/avif/svg）；留空回到内置壁纸集
- 可调：轮换间隔（秒/分/时）、过渡时长、顺序/随机、面板透明度、背景不透明度、壁纸压暗、毛玻璃模糊（0–24px）、文字阴影（三档）
- 「立即切换」手动轮换，「重新扫描」刷新文件夹清单

## 配置

设置页修改后自动写入 **`$DSH_HOME/wallpaper-rotator.json`**（DSH_HOME 未设置时为 `~/.dsh`），重启保留。也可直接编辑该文件：

```json
{
  "folder": "",
  "intervalMs": 600000,
  "transitionMs": 1200,
  "mode": "sequential",
  "enabled": true,
  "panelAlpha": 80,
  "baseAlpha": 55,
  "scrim": 30,
  "textShadow": 1,
  "blurPx": 10
}
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `folder` | `""` | 图片文件夹；空 = 内置壁纸集 |
| `intervalMs` | `600000` | 轮换间隔（毫秒） |
| `transitionMs` | `1200` | 交叉淡化时长（毫秒） |
| `mode` | `"sequential"` | `sequential` 顺序 / `shuffle` 随机 |
| `enabled` | `true` | 总开关 |
| `panelAlpha` | `80` | 面板（侧栏/卡片）不透明度 0–100 |
| `baseAlpha` | `55` | 背景（对话区等主区域）不透明度 0–100 |
| `scrim` | `30` | 壁纸压暗 0–90 |
| `textShadow` | `1` | 文字阴影 0 关 / 1 轻微 / 2 明显 |
| `blurPx` | `10` | 毛玻璃模糊 0–24px |

## 包结构

```
wallpaper-rotator/
├── package.json        # dsh.bundle.patch + dsh.client 声明（DSH web 插件标准格式）
├── cordis.patch.yml    # 插件行 { id: wallpaper-rotator, name: dsh-wallpaper-rotator }
└── lib/
    ├── index.js        # Host 半区：/plugins/wallpaper-rotator 路由
    └── client.js       # 浏览器半区：壁纸引擎 + 设置页（__ModuleLoader__ 格式）
```

Host 路由（webServer，最长前缀优先，与 client-modules 的 `/plugins` 兼容）：

- `GET /plugins/wallpaper-rotator/list?folder=<path>` — 扫描文件夹
- `GET /plugins/wallpaper-rotator/image/<name>` — 图片字节
- `GET /plugins/wallpaper-rotator/builtin/<n>.svg` — 内置壁纸
- `GET|POST /plugins/wallpaper-rotator/config` — 配置读写

## 开发

纯 JavaScript，无构建步骤：改 `lib/` 下文件后重启 `dsh web` 即可（本地 `link:` 安装直接生效）。校验：

```powershell
node --check lib/index.js
node --check lib/client.js
```

浏览器半区是 `window.__ModuleLoader__.load({ id, factory })` 格式，`require("react")` 解析平台模块表；Host 半区是标准 ESM Cordis 插件（`exports { apply, inject, name }`）。

## 兼容性

- 路由前缀、行 id、包名、配置文件名、主题覆盖 source（`wallpaper-rotator`）、CSS 类前缀（`.dswp-`）均唯一
- 壁纸层仅使用 `html::before/::after`（`z-index:-1`）与 `<html>` 内联 CSS 变量，不触碰其他插件 DOM
- 主题覆盖经 `theme.overrideTokens` 分层合成，与其他插件令牌覆盖共存
- 设置页走 `settings.section` additive 槽位，不替换既有页面

## License

MIT
