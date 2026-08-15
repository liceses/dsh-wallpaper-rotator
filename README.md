# DSH 壁纸轮换器

定时轮换 DSH（DeepSeek Harness）应用背景壁纸的插件：交叉淡化微动效、内置壁纸集、毛玻璃 / 压暗 / 文字阴影等可读性调节，设置页一键配置，配置持久化。

> 📦 可安装插件包位于 [`wallpaper-rotator/`](wallpaper-rotator/README.md)（`dsh plugin add` 直接安装）。

## 特性

- **定时轮换**：间隔可配（秒/分/时），顺序 / 随机模式，立即切换，重新扫描
- **平滑动效**：交叉淡化；预加载 + 被覆盖写入 + 延迟清除，轮换收尾无跳变
- **内置壁纸集**：4 张 SVG 渐变壁纸随插件分发（晨光 / 海洋 / 暮色 / 林间），未配置文件夹、文件夹无效或无图片时自动使用
- **可读性**：背景不透明度（对话区遮罩）、壁纸压暗（随层内嵌）、毛玻璃模糊（0–24px）、文字阴影（三档）
- **持久化**：配置存 `$DSH_HOME/wallpaper-rotator.json`，重启保留
- **DSH 原生风格设置页**：设置 → 壁纸轮换（`settings.section`）

## 快速开始

```powershell
# 1. 安装（npm / GitHub 均可）
dsh plugin --profile web add dsh-wallpaper-rotator                   # npm（已发布）
dsh plugin --profile web add github:liceses/dsh-wallpaper-rotator    # GitHub

# 本机开发时也可用仓库内本地路径（仅本机可用）
# dsh plugin --profile web add D:\path\to\wallpaper-rotator

# 2. 重启 dsh web 生效
dsh web
```

重启后打开 **设置 → 壁纸轮换**：默认立即用内置壁纸集开始轮换；输入图片文件夹路径（或「浏览…」）并「应用」即切换为自有图片。支持 png / jpg / webp / gif / bmp / avif / svg。

卸载：

```powershell
dsh plugin --profile web remove dsh-wallpaper-rotator
```

## 目录结构

```
.
├── wallpaper-rotator/        # 📦 可安装插件包（dsh plugin add）
│   ├── package.json         #   dsh.bundle.patch + dsh.client 声明
│   ├── cordis.patch.yml     #   插件行 { id: wallpaper-rotator, ... }
│   ├── lib/index.js         #   Host 半区：路由（扫描/图片/内置壁纸/配置）
│   ├── lib/client.js        #   浏览器半区：壁纸引擎 + 设置页
│   └── README.md            #   包内文档
├── host-half.js             # 🧪 动态插件版 Host 源码（开发参考，cordis_define 流程）
├── client-half.js           # 🧪 动态插件版 Client 源码（开发参考）
├── demo-wallpapers/         # 🖼 演示壁纸（渐变 PNG，可用于测试文件夹模式）
├── README.md
└── LICENSE                  # MIT
```

## 配置参考

设置页修改自动写回 `$DSH_HOME/wallpaper-rotator.json`（字段见包内 README）。默认值：

| 项 | 默认 | 说明 |
|---|---|---|
| 文件夹 | 空 | 留空 = 内置壁纸集 |
| 轮换间隔 | 10 分钟 | 秒/分/时 |
| 过渡时长 | 1.2 秒 | 交叉淡化 |
| 轮换模式 | 顺序 | 顺序 / 随机 |
| 面板透明度 | 80% | 侧栏 / 卡片 |
| 背景不透明度 | 55% | 对话区等主区域遮罩 |
| 壁纸压暗 | 30% | 随壁纸层内嵌，轮换全程平滑 |
| 毛玻璃模糊 | 10px | 0 = 关闭 |
| 文字阴影 | 轻微 | 关 / 轻微 / 明显 |

## 兼容性

- 路由前缀 `/plugins/wallpaper-rotator`（webServer 最长前缀优先，与 client-modules 的 `/plugins` bundle 路由共存）
- 行 id `wallpaper-rotator`、包名 `dsh-wallpaper-rotator`、配置文件名、主题覆盖 source、CSS 类前缀 `.dswp-` 均唯一
- 壁纸层仅用 `html::before/::after`（`z-index:-1`）与 `<html>` 内联 CSS 变量，不触碰其他插件 DOM
- 主题覆盖经 `theme.overrideTokens` 分层合成；设置页走 `settings.section` additive 槽位

## 常见问题

**重启后设置里没有「壁纸轮换」？**
确认 `dsh plugin add` 后 `profiles/web/package.json` 的 `dsh.profile.bundles` 包含 `dsh-wallpaper-rotator`；重启的是 `dsh web` 进程本身。

**boot 页报 "Failed to load plugins"？**
通常为 client bundle 语法错误——`node --check wallpaper-rotator/lib/client.js` 校验，并检查浏览器控制台具体报错。

**与动态插件版本重复？**
动态版（`host-half.js` / `client-half.js` 经 cordis_define 定义）仅进程内有效，重启即消失；不要与静态包同时启用（避免路由/设置项重复）。

## 版本历史

| 版本 | 说明 |
|---|---|
| 1.0.0 | 静态插件包：路由 / 配置持久化 / 内置壁纸集 / 毛玻璃 / 文字阴影 / 压暗随层内嵌 / 无跳变交叉淡化 |

## License

[MIT](LICENSE)
