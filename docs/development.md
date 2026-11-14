# Tetris 开发 / Development

[文档目录 / Index](README.md)

## 运行 / Run

Node.js 22+、Bun 和平台原生模块编译工具 / Node.js 22+, Bun and platform native-module build tools.

```sh
cd tetris-electron
bun install --frozen-lockfile
bun run dev
bun run build
bun run package:unsigned
```

`out/` 为编译结果，`dist/` 为打包结果。/ Compiled output goes to `out/`; packages go to `dist/`.

Intel Mac 本地打包统一使用 `bun run package:intel`，直接交付 `.app`，不生成 ZIP。签名、架构与启动验收步骤见 [Intel Mac 打包规范](../tetris-electron/PACKAGING.md)。

## 目录 / Layout

| 路径 / Path | 职责 / Purpose |
| --- | --- |
| `tetris-electron/src/main` | Electron 主进程、IPC、文件服务、通知 / main process, IPC, files, notifications |
| `tetris-electron/src/main/sidecar` | 独立 PTY 会话托管 / persistent terminal host |
| `tetris-electron/src/preload` | 受限窗口桥接 API / window bridge APIs |
| `tetris-electron/src/windows/shell` | 画布、分组、终端嵌入、提醒列表 / canvas, groups, embedded terminals, notification list |
| `tetris-electron/src/windows/nav` | 文件树与目录 / file tree and workspaces |
| `tetris-electron/packages` | `@tetris/*` 内部包和 Agent 指令 / internal packages and agent instructions |
| `tetris-electron/resources/agent-notify.cjs` | Claude Code / Codex hook |
| `tetris-electron/cli/tetris-cli.mjs` | `tetris-canvas` 命令 / CLI |
| `tetris-electron/scripts` | 开发、构建、打包与截图 / development, build, package and screenshots |
| `docs/screenshots` | README 功能截图 / feature screenshots |

## 检查 / Checks

运行与改动相关的 Bun 测试。Updater 的 mock 测试应独立运行，避免全局模块 mock 影响其他用例。/ Run relevant Bun tests; updater mocks run in separate processes to avoid cross-suite module interference.

```sh
bun test src/main/integrations.test.ts
bun run test:updater
bun run build
```

通知与文件查看器的交互回归使用独立 Electron profile 和临时测试文件，不启动真实 Agent：

```sh
node scripts/test-notification-ui.cjs
node scripts/test-file-viewer.cjs # 先执行 bun run build
node scripts/test-provider-quota-ui.cjs
node scripts/test-tile-status-ui.cjs
node scripts/preview-dynamic-island.cjs --check
```

截图与通知交互验证 / Screenshots and notification interaction checks:

```sh
bun run docs:screenshots
```

先准备 Chromium，或设置 `TETRIS_CHROMIUM_PATH` 指向浏览器可执行文件。详见[截图说明](screenshots/README.md)。/ Install Chromium first or set `TETRIS_CHROMIUM_PATH`; see the screenshot notes.

## 命名与兼容 / Naming and compatibility

主源码目录为 `tetris-electron`，内部包命名空间为 `@tetris/*`，CLI 为 `tetris-canvas`。运行时旧数据路径、协议、环境变量、bundle ID 和旧命令别名有意保留，以兼容已有会话。不要仅为替换品牌文字而迁移这些标识。

Source uses `tetris-electron`, `@tetris/*` and `tetris-canvas`. Legacy data paths, protocols, environment variables, bundle ID and command aliases intentionally remain compatible with existing sessions.

Tetris 未配置发布源，自动更新关闭。配置正式发布仓库前，不要启用发布或继承上游更新源。/ No Tetris release feed is configured; updates are disabled. Configure the intended repository before enabling publishing or updates.


## Apple Silicon 灵动岛 / Dynamic Island on Apple Silicon

当前布局已由用户于 2026-11-14 在目标 Mac 上测试认可。收起高度为屏幕摄像头安全区高度加 8pt，左右各 76pt；展开保持屏幕顶部锚点，宽 400pt、高度最多 420pt。曲线轮廓、状态常显和 GIF 动画属于 Electron 浮层方案；原生 ActivityKit 组件仍未编译验证。

Current appearance was accepted on the target Mac. Both compact and expanded states remain attached to the display top. This validates the overlay appearance, not native ActivityKit integration.

在 `tetris-electron` 目录运行 / Run from `tetris-electron`:

```sh
bun test src/main/island-position.test.ts src/main/island-presentation.test.ts src/main/island-state.test.ts
node scripts/preview-dynamic-island.cjs --check --notch
node scripts/preview-dynamic-island.cjs --check --mock-notch
node scripts/preview-dynamic-island.cjs --check
# 仅在更新动画源图后重新生成 GIF / Rebuild GIFs only after artwork changes
node scripts/build-island-avatar-gifs.mjs
# ARM64 本地 .app，不发布 / Local ARM64 .app, no publishing
bun ./scripts/package.mjs --no-sign --arch arm64 --dir
codesign --verify --deep --strict dist/mac-arm64/Tetris.app
file dist/mac-arm64/Tetris.app/Contents/MacOS/Tetris
```

输出为 `dist/mac-arm64/Tetris.app`。本地包使用 ad-hoc 签名，不等同于公证发行包。预览使用临时 profile 和模拟数据，不安装生产 hooks；`--notch` 指读取本机屏幕几何，不代表原生 ActivityKit 模式。仅修改 Markdown 时无需重建 App。

The output is an ad-hoc signed local build, not a notarized release. Preview checks use isolated profiles and simulated data. `--notch` means detected display geometry, not native ActivityKit. Documentation-only edits do not require repackaging.

详见 [灵动岛实现说明](../tetris-electron/resources/dynamic-island/README.md)、[动画源图及提示词](../tetris-electron/artwork/island-avatars/README.md)、[原生支持启用与验证清单](../tetris-electron/native/agent-activity/README.md)。等待正式版系统与 SDK 的既定路线不变；仅升级系统不会自动让现有包启用原生功能。
