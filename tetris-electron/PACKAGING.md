# Intel Mac 本地打包规范

2026-11-05 记录。以后为本机或用户本地使用打包 Intel Mac App，默认按本方案执行：仅构建 x64，直接交付 `.app`，不生成 ZIP，不自动发布。

## 标准命令

在 macOS 上执行（优先使用 Intel Mac，便于直接验证）：

```sh
cd tetris-electron
bun run package:intel
```

该命令先构建通用架构 Touch Bar 辅助程序，再执行：

```sh
bun ./scripts/package.mjs --no-sign --arch x64 --dir
```

产物：`tetris-electron/dist/mac/Tetris.app`。构建结束后在 Finder 显示：

```sh
open -R dist/mac/Tetris.app
```

不要仅修改文件名来表示 Intel 版本；必须检查实际二进制架构。不要复用旧的失败包。默认不覆盖 `/Applications/Tetris.app`，由用户替换；如明确要求安装，先退出旧应用并保留必要的备份。

## 必须保留的构建设置

- `--arch x64` 同时指定平台目标名称，避免 `package.json` 中各目标自带的 `arch` 数组重新加入 arm64。`--dir` 使用 `dir` 目标，跳过归档。
- 本地 `--no-sign` 实际使用一致的 ad-hoc 签名：`mac.identity=-`，不是 `mac.identity=null`。让 electron-builder 对应用和嵌套代码统一签名。
- 仅对本地 ad-hoc 包设置 `mac.hardenedRuntime=false`，避免没有 Team ID 的代码触发 hardened runtime 的库验证问题。不要把这个设置改成正式发行包的全局默认值。
- 设置 `CSC_IDENTITY_AUTO_DISCOVERY=false`、`SKIP_NOTARIZE=true`，避免自动选择本机开发证书或触发公证。
- 保留 macOS 原生模块重建，确保 node-pty 等模块与 Electron 版本和 x64 架构匹配。打包后恢复开发目录的宿主架构依赖。
- 本地包没有 Apple Developer ID 公证；正式对外发行需使用完整 Developer ID 签名及公证流程，不能把本方案描述为已公证。

## 交付前验证

在 `tetris-electron` 目录执行：

```sh
file dist/mac/Tetris.app/Contents/MacOS/Tetris
codesign --verify --deep --strict dist/mac/Tetris.app
codesign -dv --verbose=4 dist/mac/Tetris.app
/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' dist/mac/Tetris.app/Contents/Info.plist
```

要求：主程序为 `x86_64`；深度签名检查通过；主程序是 ad-hoc 签名且没有 `runtime` 标记。本次 Electron 40.6.0 产物最低 macOS 版本为 12.0，后续升级须重新检查实际产物。

然后必须启动**新产物路径下**的应用，确认主窗口页面正常加载；测试终端能够启动 shell 并返回输出，同时检查 sharp 和 @parcel/watcher 能加载。不要误启动 `/Applications` 下的旧版来验证新版。可使用 Playwright Electron 启动新产物，读取窗口加载状态并在测试后退出。

## 本次故障与验证记录

旧版崩溃报告显示 `DYLD / Library missing`，加载 `Electron Framework.framework` 时提示 `mapping process and mapped file (non-platform) have different Team IDs`。该报告对应 `/Applications/Tetris.app`；主程序和框架均为 x86_64，失败包使用 ad-hoc 签名却启用了 hardened runtime。这是启动时的代码签名/库验证问题，不能仅凭系统通用提示判定为 macOS 版本不兼容。

修复后，`dist/mac/Tetris.app` 已在 Intel Mac、macOS 26.5.1 上通过深度签名检查、实际主窗口加载，以及 sharp、文件监听模块加载和 PTY shell 输出验证。用户要求直接交付 `.app`，不需要 ZIP。
