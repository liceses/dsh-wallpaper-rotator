// 壁纸轮换器 · Host 半区（wallp-2 / pkg-6，v4）
// 用法：作为 cordis_define code.host 的完整函数体使用。
// 职责：扫描图片文件夹（fs）+ 通过 webServer 路由提供图片字节与内置 SVG 壁纸。
return {
  inject: ['fs', 'webServer'],
  apply(ctx) {
    const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif|svg)$/i
    const MIME = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      bmp: 'image/bmp',
      avif: 'image/avif',
      svg: 'image/svg+xml'
    }
    const MAX_BYTES = 64 * 1024 * 1024
    // name -> displayPath, rebuilt on every successful scan
    let images = new Map()

    // ============ 内置壁纸集（SVG 渐变，随插件分发） ============
    const BUILTIN = [
      {
        id: 'builtin-0.svg',
        name: '内置壁纸 · 晨光',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb39a"/><stop offset="0.45" stop-color="#a06bd4"/><stop offset="1" stop-color="#1f2b66"/></linearGradient><radialGradient id="h" cx="0.25" cy="0.18" r="0.55"><stop offset="0" stop-color="#fff2d8" stop-opacity="0.5"/><stop offset="1" stop-color="#fff2d8" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><rect width="1920" height="1080" fill="url(#h)"/></svg>`
      },
      {
        id: 'builtin-1.svg',
        name: '内置壁纸 · 海洋',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#072a52"/><stop offset="0.5" stop-color="#0f6f8f"/><stop offset="1" stop-color="#59c9c4"/></linearGradient><radialGradient id="h" cx="0.85" cy="0.2" r="0.6"><stop offset="0" stop-color="#bdf3ea" stop-opacity="0.35"/><stop offset="1" stop-color="#bdf3ea" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><rect width="1920" height="1080" fill="url(#h)"/></svg>`
      },
      {
        id: 'builtin-2.svg',
        name: '内置壁纸 · 暮色',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a50"/><stop offset="0.5" stop-color="#e23a78"/><stop offset="1" stop-color="#48113f"/></linearGradient><radialGradient id="h" cx="0.5" cy="0.28" r="0.5"><stop offset="0" stop-color="#ffd9a8" stop-opacity="0.45"/><stop offset="1" stop-color="#ffd9a8" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><rect width="1920" height="1080" fill="url(#h)"/></svg>`
      },
      {
        id: 'builtin-3.svg',
        name: '内置壁纸 · 林间',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d2b1e"/><stop offset="0.55" stop-color="#1f5c3d"/><stop offset="1" stop-color="#7fb069"/></linearGradient><radialGradient id="h" cx="0.15" cy="0.8" r="0.6"><stop offset="0" stop-color="#d9f0c9" stop-opacity="0.3"/><stop offset="1" stop-color="#d9f0c9" stop-opacity="0"/></radialGradient></defs><rect width="1920" height="1080" fill="url(#g)"/><rect width="1920" height="1080" fill="url(#h)"/></svg>`
      }
    ]
    const builtin = new Map()
    for (const b of BUILTIN) builtin.set(b.id, b.svg)

    ctx.effect(() => harness.handle('scan', async (args) => {
      const folder = args && typeof args.folder === 'string' ? args.folder.trim() : ''
      if (!folder) return { ok: false, error: '未指定图片文件夹' }
      try {
        const target = await ctx.fs.resolve(folder)
        const info = await ctx.fs.stat(target)
        if (!info) return { ok: false, error: '文件夹不存在: ' + folder }
        if (info.type !== 'directory') return { ok: false, error: '路径不是文件夹: ' + folder }
        const entries = await ctx.fs.listDir(target)
        const files = []
        const next = new Map()
        for (const entry of entries) {
          if (entry.type !== 'file') continue
          if (!IMAGE_RE.test(entry.name)) continue
          const ext = entry.name.split('.').pop().toLowerCase()
          next.set(entry.name, entry.target.displayPath)
          files.push({
            name: entry.name,
            size: typeof entry.size === 'number' ? entry.size : null,
            mime: MIME[ext] || 'application/octet-stream',
            url: '/dsh-wallpaper/' + encodeURIComponent(entry.name)
          })
        }
        images = next
        return { ok: true, folder: target.displayPath, files }
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) }
      }
    }))

    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/dsh-wallpaper',
      handler: async (req, res) => {
        let name = null
        try {
          const pathname = String(req.url || '/').split('?')[0]
          const parts = pathname.split('/').filter(Boolean)
          if (parts.length !== 2) throw new Error('bad path')
          name = decodeURIComponent(parts[1])
        } catch {
          res.writeHead(400)
          res.end()
          return
        }
        const displayPath = images.get(name)
        if (!displayPath) {
          const svg = builtin.get(name)
          if (svg) {
            res.writeHead(200, {
              'Content-Type': 'image/svg+xml',
              'Cache-Control': 'no-store'
            })
            res.end(svg)
            return
          }
          res.writeHead(404)
          res.end()
          return
        }
        try {
          const target = await ctx.fs.resolve(displayPath)
          const bytes = await ctx.fs.readBytes(target, undefined, MAX_BYTES)
          const ext = name.split('.').pop().toLowerCase()
          res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Content-Length': String(bytes.length),
            'Cache-Control': 'no-store'
          })
          res.end(bytes)
        } catch {
          res.writeHead(500)
          res.end()
        }
      }
    }))
  }
}
