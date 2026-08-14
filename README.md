# DSH 壁纸轮换器 (dsh-wallpaper-rotator)

定时轮换 DSH 应用背景壁纸的插件：交叉淡化微动效、内置壁纸集、毛玻璃/压暗/文字阴影等可读性调节，设置页一键配置。

## 特性

- **定时轮换**：间隔可配（秒/分/时），顺序 / 随机模式，立即切换
- **平滑动效**：交叉淡化；预加载 + 被覆盖写入 + 延迟清除，轮换收尾无跳变
- **内置壁纸集**：4 张 SVG 渐变壁纸随插件分发（晨光/海洋/暮色/林间），未配置文件夹时自动使用
- **可读性**：背景不透明度（对话区遮罩）、壁纸压暗（随层内嵌）、毛玻璃模糊（0–24px）、文字阴影（三档）
- **持久化**：配置存 `$DSH_HOME/wallpaper-rotator.json`，重启保留
- **DSH 原生风格设置页**：设置 → 壁纸轮换（`settings.section`）

## 安装（dsh plugin add）

```powershell
dsh plugin --profile web add D:\developing\DSH-plugin\dsh-bg-rotator\wallpaper-rotator
```

安装后**重启 `dsh web`** 生效（bundle 层栈与客户端清单在启动时组合）。发布到 npm/GitHub 后可直接：

```powershell
dsh plugin --profile web add dsh-wallpaper-rotator        # npm
dsh plugin --profile web add github:<owner>/<repo>        # GitHub
```

卸载：

```powershell
dsh plugin --profile web remove dsh-wallpaper-rotator
```

## 使用

1. 重启后打开 **设置 → 壁纸轮换**
2. 默认立即使用内置壁纸集开始轮换；在「图片文件夹」输入路径（或点「浏览…」）并「应用」即可换用自有图片（png/jpg/webp/gif/bmp/avif/svg）
3. 按需调整：轮换间隔、过渡时长、轮换模式、面板透明度、背景不透明度、壁纸压暗、毛玻璃模糊、文字阴影

## 包结构

```
wallpaper-rotator/
├── package.json        # dsh.bundle.patch + dsh.client 声明（web 插件标准格式）
├── cordis.patch.yml    # 插件行：{ id: wallpaper-rotator, name: dsh-wallpaper-rotator }
└── lib/
    ├── index.js        # Host 半区：/plugins/wallpaper-rotator 路由（扫描/图片/内置壁纸/配置）
    └── client.js       # 浏览器半区：壁纸引擎 + 设置页（__ModuleLoader__ 格式）
```

- Host 路由（webServer，最长前缀优先，与 client-modules 的 `/plugins` 兼容）：
  - `GET /plugins/wallpaper-rotator/list?folder=<path>` 扫描文件夹
  - `GET /plugins/wallpaper-rotator/image/<name>` 图片字节
  - `GET /plugins/wallpaper-rotator/builtin/<n>.svg` 内置壁纸
  - `GET|POST /plugins/wallpaper-rotator/config` 配置读写

## 兼容性约定

- 路由前缀、行 id（`wallpaper-rotator`）、包名（`dsh-wallpaper-rotator`）、配置文件名、主题覆盖 source、CSS 类前缀（`.dswp-`）均唯一
- 壁纸层只使用 `html::before/::after`（`z-index:-1`）与 `<body>` 内联 CSS 变量，不触碰其他插件的 DOM
- 主题覆盖经 `theme.overrideTokens` 分层合成，不影响其他插件的令牌
- 设置页走 `settings.section` 的 additive 槽位，不替换任何既有页面

## 已知限制

- 背景改造依赖主题令牌（`--dsw-alias-bg-base` 等），若其他插件同样覆盖这些令牌，后注册层生效（本插件设置页可见）
- 全局 `text-shadow` 规则作用于整个应用文字，可在设置页关闭
- 动态插件版本（仓库根目录 `host-half.js` / `client-half.js`，cordis_define 流程）仅作开发参考；静态包安装后请勿同时启用动态版本，避免路由/设置项重复

## 版本历史

| 版本 | 说明 |
|---|---|
| 1.0.0 | 静态插件包：路由/配置持久化/内置壁纸集/毛玻璃/文字阴影/压暗随层内嵌/无跳变交叉淡化 |
