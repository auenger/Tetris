# 功能截图 / Feature screenshots

这些图片使用生产画布、分组、xterm 和提醒组件，在隔离的浏览器 fixture 中生成。仅终端输出和通知数据是演示数据，不会读取用户文件、连接真实终端或运行 Agent。图片展示画布区域，不是完整原生 App 窗口截图。

These images render production canvas, group, xterm and notification components in an isolated browser fixture. Terminal output and notifications are synthetic. The fixture does not access user files, connect to real terminals or run agents. Images show the canvas area, not the full native application window.

| 文件 / File | 内容 / Content |
| --- | --- |
| `canvas-workspace.png` | 展开的终端分组 / expanded terminal group |
| `agent-notifications.png` | 未读消息内容与列表 / unread previews and list |
| `collapsed-group.png` | 收起的分组与悬停提示 / collapsed group and tooltip |

## 重新生成 / Regenerate

```sh
cd tetris-electron
bun install --frozen-lockfile
bunx playwright-core install chromium
bun run docs:screenshots
```

也可使用现有 Chromium / Alternatively use an existing Chromium executable:

```sh
TETRIS_CHROMIUM_PATH="/absolute/path/to/chromium" bun run docs:screenshots
```

固定尺寸 1600 × 940，浅色主题，阻止外部网络资源。脚本也检查点击提醒会展开分组、消除对应提醒，以及全部已读后移除所有铃铛。

Fixed 1600 × 940 viewport, light theme, external network resources blocked. The script also checks notification navigation, group expansion, per-message dismissal and clearing all unread badges.
