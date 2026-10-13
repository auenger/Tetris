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

截图与通知交互验证 / Screenshots and notification interaction checks:

```sh
bun run docs:screenshots
```

先准备 Chromium，或设置 `TETRIS_CHROMIUM_PATH` 指向浏览器可执行文件。详见[截图说明](screenshots/README.md)。/ Install Chromium first or set `TETRIS_CHROMIUM_PATH`; see the screenshot notes.

## 命名与兼容 / Naming and compatibility

主源码目录为 `tetris-electron`，内部包命名空间为 `@tetris/*`，CLI 为 `tetris-canvas`。运行时旧数据路径、协议、环境变量、bundle ID 和旧命令别名有意保留，以兼容已有会话。不要仅为替换品牌文字而迁移这些标识。

Source uses `tetris-electron`, `@tetris/*` and `tetris-canvas`. Legacy data paths, protocols, environment variables, bundle ID and command aliases intentionally remain compatible with existing sessions.

Tetris 未配置发布源，自动更新关闭。配置正式发布仓库前，不要启用发布或继承上游更新源。/ No Tetris release feed is configured; updates are disabled. Configure the intended repository before enabling publishing or updates.
