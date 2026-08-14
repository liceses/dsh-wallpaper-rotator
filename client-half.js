// 壁纸轮换器 · Client 半区（wallp-2 / pkg-6，v4）
// 用法：作为 cordis_define code.client 的完整函数体使用。
// 职责：壁纸图层与交叉淡化引擎、主题覆盖、设置页 UI。
return {
  inject: ['slots', 'theme', 'timer'],
  apply(ctx) {
    const h = React.createElement

    // ================= 内置壁纸集（随插件分发，由 Host 路由输出 SVG） =================
    const BUILTIN_IMAGES = [
      { name: '内置壁纸 · 晨光', url: '/dsh-wallpaper/builtin-0.svg' },
      { name: '内置壁纸 · 海洋', url: '/dsh-wallpaper/builtin-1.svg' },
      { name: '内置壁纸 · 暮色', url: '/dsh-wallpaper/builtin-2.svg' },
      { name: '内置壁纸 · 林间', url: '/dsh-wallpaper/builtin-3.svg' }
    ]

    // ================= 小型内存 store（插件生命周期内有效） =================
    const listeners = new Set()
    let state = {
      folder: '',
      intervalMs: 600000,   // 默认 10 分钟
      transitionMs: 1200,   // 默认 1.2 秒
      mode: 'sequential',   // sequential | shuffle
      enabled: true,
      panelAlpha: 80,       // 面板不透明度 0-100（侧栏/卡片）
      baseAlpha: 55,        // 背景不透明度 0-100（对话区等主区域遮罩）
      scrim: 30,            // 壁纸压暗 0-90（随壁纸层内嵌，与动画同步）
      textShadow: 1,        // 文字阴影 0 关闭 / 1 轻微 / 2 明显
      blurPx: 10,           // 毛玻璃模糊 0-24 px
      files: [],
      current: null,
      error: null,
      scanning: false
    }
    const store = {
      get: () => state,
      set(patch) { state = Object.assign({}, state, patch); for (const l of listeners) l(state) },
      subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } }
    }

    // ================= 壁纸层：html 双伪元素（压暗随层内嵌）+ 可读性变量 =================
    const TS = ['none', '0 1px 2px rgba(0,0,0,0.25)', '0 1px 3px rgba(0,0,0,0.5)']
    styles.insert(`
      html::before, html::after {
        content: "";
        position: fixed;
        left: 0; top: 0;
        width: 100%; height: 100%;
        background-position: center;
        background-size: cover;
        background-repeat: no-repeat;
        pointer-events: none;
        z-index: -1;
        filter: blur(var(--dswp-blur, 0px));
      }
      html::before {
        background-image:
          linear-gradient(rgba(0,0,0,var(--wp-scrim, 0)), rgba(0,0,0,var(--wp-scrim, 0))),
          var(--wp-cur, none);
        opacity: var(--wp-cur-op, 1);
        transition: opacity var(--wp-dur, 1200ms) ease;
      }
      html::after {
        background-image:
          linear-gradient(rgba(0,0,0,var(--wp-scrim, 0)), rgba(0,0,0,var(--wp-scrim, 0))),
          var(--wp-next, none);
        opacity: var(--wp-next-op, 0);
        transition: opacity var(--wp-dur, 1200ms) ease;
      }
      body * {
        text-shadow: var(--dswp-ts, none);
      }
      @media (prefers-reduced-motion: reduce) {
        html::before, html::after { transition: none; }
      }
    `)

    const rootStyle = () => document.documentElement.style
    const setVar = (name, value) => rootStyle().setProperty(name, value)
    setVar('--wp-cur', 'none')
    setVar('--wp-cur-op', '1')
    setVar('--wp-next', 'none')
    setVar('--wp-next-op', '0')
    setVar('--wp-dur', state.transitionMs + 'ms')
    setVar('--wp-scrim', String(state.scrim / 100))
    setVar('--dswp-ts', TS[state.textShadow] || 'none')
    setVar('--dswp-blur', 'blur(' + state.blurPx + 'px)')

    // ================= 主题覆盖：基底可调 + 面板半透明 =================
    let disposeOverrides = null
    function applyPanels() {
      if (disposeOverrides) { disposeOverrides(); disposeOverrides = null }
      if (!state.enabled) return
      const a = Math.max(0, Math.min(1, state.panelAlpha / 100))
      const ba = Math.max(0, Math.min(1, state.baseAlpha / 100))
      const light = 'rgba(255,255,255,' + a + ')'
      const dark = 'rgba(28,30,38,' + a + ')'
      const lightBase = 'rgba(255,255,255,' + ba + ')'
      const darkBase = 'rgba(16,18,24,' + ba + ')'
      disposeOverrides = ctx.theme.overrideTokens('dsh-wallpaper', {
        '--dsw-alias-bg-base': { light: lightBase, dark: darkBase },
        '--dsw-specific-sidebar-fill': { light, dark },
        '--dsw-alias-bg-layer-1': { light, dark },
        '--dsw-alias-bg-layer-2': { light, dark }
      })
    }

    // ================= 壁纸应用（预加载 + 被覆盖写入 + 延迟清除，杜绝收尾跳变） =================
    const layerOf = (layer) => layer === 'next'
      ? { image: '--wp-next', opacity: '--wp-next-op' }
      : { image: '--wp-cur', opacity: '--wp-cur-op' }
    const setLayerImage = (layer, value) => setVar(layerOf(layer).image, value)
    const setLayerOpacity = (layer, value) => setVar(layerOf(layer).opacity, String(value))

    function preload(url) {
      return new Promise((resolve) => {
        let done = false
        const finish = () => { if (!done) { done = true; resolve() } }
        try {
          const img = new Image()
          img.onload = finish
          img.onerror = finish
          img.src = url
        } catch {
          finish()
        }
        ctx.timeout(finish, 10000)
      })
    }

    let currentUrl = null
    let fadeToken = 0
    async function applyWallpaper(entry, fadeIn) {
      const url = entry ? entry.url : null
      const token = ++fadeToken
      if (url === null) {
        setLayerImage('cur', 'none')
        setLayerOpacity('cur', 0)
        setLayerImage('next', 'none')
        setLayerOpacity('next', 0)
        currentUrl = null
        return
      }
      await preload(url)
      if (token !== fadeToken) return
      const quoted = 'url("' + url + '")'
      if (currentUrl === null || fadeIn) {
        // 首张 / 重新显示：底层淡入（此时 next 层应为空）
        setLayerImage('cur', quoted)
        setLayerOpacity('cur', 0)
        setLayerImage('next', 'none')
        setLayerOpacity('next', 0)
        void document.documentElement.offsetHeight
        setLayerOpacity('cur', 1)
        currentUrl = url
        return
      }
      // 交叉淡化：新图始终在顶层 (next) 淡入，旧图留在底层 (cur)
      setLayerImage('next', quoted)
      setLayerOpacity('next', 0)
      void document.documentElement.offsetHeight
      setLayerOpacity('next', 1)
      currentUrl = url
      ctx.timeout(() => {
        if (token !== fadeToken) return
        // ① 新图写入被顶层完全覆盖的底层（不可见，此处开始底层重绘）
        setLayerImage('cur', quoted)
        // ② 顶层以完整过渡时长淡出——期间底层完成重绘，两层同图，淡出不可见
        setLayerOpacity('next', 0)
        ctx.timeout(() => {
          if (token !== fadeToken) return
          // ③ 顶层已透明，清除其图像（不可见）
          setLayerImage('next', 'none')
        }, state.transitionMs + 60)
      }, state.transitionMs + 80)
    }

    // ================= 轮换引擎 =================
    let nextAt = Date.now() + state.intervalMs
    function schedule() { nextAt = Date.now() + state.intervalMs }

    function pickNext() {
      const files = state.files
      if (files.length === 0) return null
      if (files.length === 1) return files[0]
      const cur = state.current ? state.current.name : null
      if (state.mode === 'shuffle') {
        for (let i = 0; i < 10; i += 1) {
          const f = files[Math.floor(Math.random() * files.length)]
          if (f.name !== cur) return f
        }
      }
      const idx = cur === null ? -1 : files.findIndex((f) => f.name === cur)
      return files[(idx + 1) % files.length]
    }

    function applyNext(entry) {
      store.set({ current: entry })
      applyWallpaper(entry, false)
      schedule()
    }

    function tick() {
      if (!state.enabled) return
      if (Date.now() < nextAt) return
      schedule()
      if (state.files.length < 2) return
      const next = pickNext()
      if (!next) return
      if (state.current && next.name === state.current.name) return
      applyNext(next)
    }
    ctx.effect(() => ctx.interval(tick, 1000))

    // ================= 扫描（空/无效/无图时回退内置壁纸集） =================
    function useBuiltin() {
      const first = BUILTIN_IMAGES[0]
      store.set({ files: BUILTIN_IMAGES, current: first })
      applyWallpaper(first, true)
      schedule()
    }

    async function scan(folder) {
      const raw = (folder || '').trim()
      if (!raw) {
        store.set({ scanning: false, error: null })
        useBuiltin()
        return
      }
      store.set({ scanning: true, error: null })
      try {
        const res = await host.call('scan', { folder: raw })
        if (!res || !res.ok) {
          store.set({ scanning: false, error: (res && res.error) || '扫描失败' })
          useBuiltin()
          return
        }
        const files = Array.isArray(res.files) ? res.files : []
        if (files.length === 0) {
          store.set({ scanning: false, error: null })
          useBuiltin()
          return
        }
        store.set({ scanning: false, files, current: files[0], error: null })
        applyWallpaper(files[0], true)
        schedule()
      } catch (err) {
        store.set({ scanning: false, error: String((err && err.message) || err) })
        useBuiltin()
      }
    }

    // ================= 配置应用 =================
    function applyConfig(patch) {
      const prev = state
      store.set(patch)
      const next = state
      setVar('--wp-dur', next.transitionMs + 'ms')
      if (next.enabled !== prev.enabled) {
        if (next.enabled) {
          applyPanels()
          if (next.current) applyWallpaper(next.current, true)
          schedule()
        } else {
          applyPanels()
          applyWallpaper(null, false)
        }
        setVar('--wp-scrim', next.enabled ? String(Math.max(0, Math.min(0.9, next.scrim / 100))) : '0')
        setVar('--dswp-ts', next.enabled ? (TS[next.textShadow] || 'none') : 'none')
        setVar('--dswp-blur', next.enabled ? 'blur(' + next.blurPx + 'px)' : 'blur(0px)')
      } else {
        if (next.panelAlpha !== prev.panelAlpha || next.baseAlpha !== prev.baseAlpha) applyPanels()
        if (next.scrim !== prev.scrim) setVar('--wp-scrim', String(Math.max(0, Math.min(0.9, next.scrim / 100))))
        if (next.textShadow !== prev.textShadow) setVar('--dswp-ts', TS[next.textShadow] || 'none')
        if (next.blurPx !== prev.blurPx) setVar('--dswp-blur', 'blur(' + next.blurPx + 'px)')
      }
      if (next.folder !== prev.folder) {
        scan(next.folder)
      } else if (next.intervalMs !== prev.intervalMs) {
        schedule()
      }
    }

    function switchNow() {
      const next = pickNext()
      if (!next) return
      applyNext(next)
    }

    // ================= 启动 =================
    applyPanels()
    scan(state.folder)

    // ================= 设置页 UI（DSH 风格） =================
    styles.insert(`
      .dswp-page { padding: 4px 20px 28px; max-width: 620px; display: flex; flex-direction: column; gap: 16px; }
      .dswp-card {
        background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px;
      }
      .dswp-title { font-size: 15px; line-height: 22px; font-weight: 600; color: var(--dsw-alias-label-primary); margin: 0; }
      .dswp-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .dswp-row .dswp-grow { flex: 1; min-width: 0; }
      .dswp-label { font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); flex: none; width: 96px; }
      .dswp-input, .dswp-select {
        box-sizing: border-box; height: 32px; padding: 0 10px;
        background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
        font-family: inherit; font-size: 13px; line-height: 20px; outline: none; min-width: 0;
      }
      .dswp-input:focus, .dswp-select:focus { border-color: var(--dsw-alias-brand-primary); }
      .dswp-input.dswp-num { width: 84px; }
      .dswp-btn {
        box-sizing: border-box; height: 32px; padding: 0 14px; cursor: pointer;
        background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary);
        border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px;
        font-family: inherit; font-size: 13px; line-height: 20px; flex: none;
      }
      .dswp-btn:hover { background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2)); }
      .dswp-btn-primary {
        background: var(--dsw-alias-brand-primary); border-color: transparent; color: #fff;
      }
      .dswp-btn-primary:hover { opacity: 0.9; background: var(--dsw-alias-brand-primary); }
      .dswp-hint { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
      .dswp-error { font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); }
      .dswp-ok { font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-success-primary); }
      .dswp-switch { position: relative; width: 40px; height: 22px; flex: none; cursor: pointer; display: inline-block; }
      .dswp-switch input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
      .dswp-switch .dswp-track {
        position: absolute; inset: 0; border-radius: 11px;
        background: var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-layer-2));
        border: 1px solid var(--dsw-alias-border-l1); transition: background 0.15s ease;
      }
      .dswp-switch .dswp-thumb {
        position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%;
        background: var(--dsw-alias-label-secondary); transition: transform 0.15s ease, background 0.15s ease;
      }
      .dswp-switch input:checked ~ .dswp-track { background: var(--dsw-alias-brand-primary); border-color: transparent; }
      .dswp-switch input:checked ~ .dswp-thumb { transform: translateX(18px); background: #fff; }
      .dswp-slider { flex: 1; accent-color: var(--dsw-alias-brand-primary); }
      .dswp-preview {
        width: 180px; height: 101px; border-radius: 10px; object-fit: cover; flex: none;
        border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-2);
      }
      .dswp-meta { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
      .dswp-name {
        font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
    `)

    const UNIT_MS = { seconds: 1000, minutes: 60000, hours: 3600000 }
    function unitForMs(ms) { return ms % 60000 === 0 ? 'minutes' : 'seconds' }
    function toUnit(ms, u) { return Math.round((ms / UNIT_MS[u]) * 10) / 10 }
    function clampMs(ms) { return Math.min(24 * 3600000, Math.max(3000, ms)) }
    function fmtCountdown(s) {
      if (s >= 3600) return Math.floor(s / 60) + ' 分钟'
      if (s >= 60) return Math.floor(s / 60) + ' 分 ' + (s % 60) + ' 秒'
      return s + ' 秒'
    }

    function SettingsView() {
      const [snap, setSnap] = React.useState(store.get())
      const [draft, setDraft] = React.useState(snap.folder)
      const [now, setNow] = React.useState(Date.now())
      React.useEffect(() => store.subscribe(setSnap), [])
      React.useEffect(() => ctx.interval(() => setNow(Date.now()), 1000), [])
      React.useEffect(() => { setDraft(snap.folder) }, [snap.folder])

      const [unit, setUnit] = React.useState(unitForMs(snap.intervalMs))
      const [iv, setIv] = React.useState(toUnit(snap.intervalMs, unitForMs(snap.intervalMs)))
      const [tr, setTr] = React.useState(Math.round(snap.transitionMs / 100) / 10)

      function commitInterval(value, u) {
        const ms = clampMs(Math.round(Number(value) * UNIT_MS[u]))
        applyConfig({ intervalMs: ms })
      }
      function commitTransition(sec) {
        const ms = Math.min(10000, Math.max(0, Math.round(Number(sec) * 1000)))
        applyConfig({ transitionMs: ms })
      }
      function commitFolder() { applyConfig({ folder: draft }) }
      async function pickFolder() {
        const ws = ctx.get('workspaces')
        if (!ws || typeof ws.pickDirectory !== 'function') {
          store.set({ error: '当前环境不支持系统文件夹选择，请手动输入路径' })
          return
        }
        try {
          const picked = await ws.pickDirectory()
          if (picked) { setDraft(picked); applyConfig({ folder: picked }) }
        } catch (err) {
          store.set({ error: String((err && err.message) || err) })
        }
      }

      const remaining = snap.enabled && snap.files.length > 0 ? Math.max(0, Math.ceil((nextAt - now) / 1000)) : 0
      const filesInfo = snap.scanning
        ? h('span', { className: 'dswp-hint' }, '正在扫描…')
        : snap.error
          ? h('span', { className: 'dswp-error' }, snap.error)
          : snap.folder === ''
            ? h('span', { className: 'dswp-hint' }, '未配置文件夹，使用内置壁纸集（' + snap.files.length + ' 张）')
            : snap.files.length === 0
              ? h('span', { className: 'dswp-hint' }, '文件夹中没有找到图片（已回退到内置壁纸集）')
              : h('span', { className: 'dswp-ok' }, '共 ' + snap.files.length + ' 张图片')

      const countdownText = !snap.enabled
        ? '轮换已暂停'
        : snap.files.length < 2
          ? '至少需要 2 张图片才能自动轮换'
          : remaining > 0 ? '下次轮换：' + fmtCountdown(remaining) : '即将轮换…'

      return h('div', { className: 'dswp-page' }, [
        // 总开关
        h('div', { className: 'dswp-card' }, [
          h('div', { className: 'dswp-row' }, [
            h('div', { className: 'dswp-grow' }, [
              h('div', { className: 'dswp-title' }, '壁纸轮换'),
              h('div', { className: 'dswp-hint' }, '从指定文件夹定时切换应用背景壁纸；未配置时使用内置壁纸集')
            ]),
            h('label', { className: 'dswp-switch' }, [
              h('input', {
                type: 'checkbox',
                checked: snap.enabled,
                'aria-label': '启用壁纸轮换',
                onChange: (e) => applyConfig({ enabled: e.target.checked })
              }),
              h('span', { className: 'dswp-track' }),
              h('span', { className: 'dswp-thumb' })
            ])
          ])
        ]),
        // 文件夹
        h('div', { className: 'dswp-card' }, [
          h('div', { className: 'dswp-title' }, '图片文件夹'),
          h('div', { className: 'dswp-row' }, [
            h('input', {
              className: 'dswp-input dswp-grow',
              value: draft,
              placeholder: '留空使用内置壁纸集',
              spellCheck: false,
              onChange: (e) => setDraft(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter') commitFolder() }
            }),
            h('button', { className: 'dswp-btn', onClick: pickFolder }, '浏览…'),
            h('button', { className: 'dswp-btn dswp-btn-primary', onClick: commitFolder }, '应用')
          ]),
          h('div', { className: 'dswp-row' }, filesInfo)
        ]),
        // 轮换设置
        h('div', { className: 'dswp-card' }, [
          h('div', { className: 'dswp-title' }, '轮换设置'),
          h('div', { className: 'dswp-row' }, [
            h('span', { className: 'dswp-label' }, '轮换间隔'),
            h('input', {
              className: 'dswp-input dswp-num',
              type: 'number', min: 0.1, step: 1,
              value: iv,
              onChange: (e) => { const v = e.target.value; setIv(v); commitInterval(v, unit) }
            }),
            h('select', {
              className: 'dswp-select',
              value: unit,
              onChange: (e) => {
                const u = e.target.value
                setUnit(u)
                setIv(toUnit(snap.intervalMs, u))
                commitInterval(toUnit(snap.intervalMs, u), u)
              }
            }, [
              h('option', { value: 'seconds' }, '秒'),
              h('option', { value: 'minutes' }, '分钟'),
              h('option', { value: 'hours' }, '小时')
            ])
          ]),
          h('div', { className: 'dswp-row' }, [
            h('span', { className: 'dswp-label' }, '过渡时长'),
            h('input', {
              className: 'dswp-input dswp-num',
              type: 'number', min: 0, max: 10, step: 0.1,
              value: tr,
              onChange: (e) => { const v = e.target.value; setTr(v); commitTransition(v) }
            }),
            h('span', { className: 'dswp-hint' }, '秒（交叉淡化动效）')
          ]),
          h('div', { className: 'dswp-row' }, [
            h('span', { className: 'dswp-label' }, '轮换模式'),
            h('select', {
              className: 'dswp-select',
              value: snap.mode,
              onChange: (e) => applyConfig({ mode: e.target.value })
            }, [
              h('option', { value: 'sequential' }, '顺序轮换'),
              h('option', { value: 'shuffle' }, '随机轮换')
            ])
          ]),
          h('div', { className: 'dswp-row' }, [
            h('span', { className: 'dswp-label' }, '面板透明度'),
            h('input', {
              className: 'dswp-slider',
              type: 'range', min: 0, max: 100, step: 5,
              value: snap.panelAlpha,
              onChange: (e) => applyConfig({ panelAlpha: Number(e.target.value) })
            }),
            h('span', { className: 'dswp-hint dswp-num' }, snap.panelAlpha + '%')
          ])
        ]),
        // 背景与可读性
        h('div', { className: 'dswp-card' }, [
          h('div', { className: 'dswp-title' }, '背景与可读性'),
          h('div', { className: 'dswp-row' }, [
            h('span', { className: 'dswp-label' }, '背景不透明度'),
            h('input', {
              className: 'dswp-slider',
              type: 'range', min: 0, max: 100, step: 5,
              value: snap.baseAlpha,
              onChange: (e) => applyConfig({ baseAlpha: Number(e.target.value) })
            }),
            h('span', { className: 'dswp-hint dswp-num' }, snap.baseAlpha + '%')
          ]),
          h('div', { className: 'dswp-row' }, [
            h('span', { className: 'dswp-label' }, '壁纸压暗'),
            h('input', {
              className: 'dswp-slider',
              type: 'range', min: 0, max: 90, step: 5,
              value: snap.scrim,
              onChange: (e) => applyConfig({ scrim: Number(e.target.value) })
            }),
            h('span', { className: 'dswp-hint dswp-num' }, snap.scrim + '%')
          ]),
          h('div', { className: 'dswp-row' }, [
            h('span', { className: 'dswp-label' }, '毛玻璃模糊'),
            h('input', {
              className: 'dswp-slider',
              type: 'range', min: 0, max: 24, step: 1,
              value: snap.blurPx,
              onChange: (e) => applyConfig({ blurPx: Number(e.target.value) })
            }),
            h('span', { className: 'dswp-hint dswp-num' }, snap.blurPx === 0 ? '关闭' : snap.blurPx + 'px')
          ]),
          h('div', { className: 'dswp-row' }, [
            h('span', { className: 'dswp-label' }, '文字阴影'),
            h('select', {
              className: 'dswp-select',
              value: snap.textShadow,
              onChange: (e) => applyConfig({ textShadow: Number(e.target.value) })
            }, [
              h('option', { value: 0 }, '关闭'),
              h('option', { value: 1 }, '轻微'),
              h('option', { value: 2 }, '明显')
            ])
          ]),
          h('div', { className: 'dswp-hint' }, '背景不透明度控制主区域盖住壁纸的程度；压暗随壁纸层内嵌（轮换全程平滑），毛玻璃柔化壁纸，文字阴影提升对比度。')
        ]),
        // 当前壁纸
        h('div', { className: 'dswp-card' }, [
          h('div', { className: 'dswp-title' }, '当前壁纸'),
          snap.current
            ? h('div', { className: 'dswp-row' }, [
                h('img', { className: 'dswp-preview', src: snap.current.url, alt: snap.current.name }),
                h('div', { className: 'dswp-meta' }, [
                  h('div', { className: 'dswp-name' }, snap.current.name),
                  h('div', { className: 'dswp-hint' }, countdownText),
                  h('div', { className: 'dswp-row' }, [
                    h('button', { className: 'dswp-btn', onClick: switchNow }, '立即切换'),
                    h('button', { className: 'dswp-btn', onClick: () => scan(snap.folder) }, '重新扫描')
                  ])
                ])
              ])
            : h('div', { className: 'dswp-hint' }, '配置图片文件夹后，壁纸将自动显示')
        ]),
        h('div', { className: 'dswp-hint' }, '配置保存在本次运行期间；插件停止或重启后恢复默认（动态插件不写入持久化配置）。')
      ])
    }

    ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register(
      { name: 'settings.section', id: 'wallpaper', order: 25, label: '壁纸轮换' },
      () => h('div', { className: 'dswp-page' }, h(SettingsView))
    )))
  }
}
