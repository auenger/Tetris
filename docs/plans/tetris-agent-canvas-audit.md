# Tetris Agent 独立画布核查

更新：2026-11-04。此文记录画布与回放范围，整体验收以[实施进度](./2026-11-04-tetris-agent-progress.md)为准。

## 已实现的隔离边界

- IDE 保留原画布；`agent:live` 有独立 tiles、选择、viewport、项目筛选、任务分组与持久连接线，分别保存到不同文件。
- Agent 页的 worker 和报告不会创建在 IDE。返回 IDE 同时收起主管对话；Agent 入口与侧边开关都会进入 Agent 页。
- 后台派发不切换页面。Agent 页可见时自动展示新 worker；隐藏或回放期间的被动定位不改变保存的布局与筛选。
- `agent:replay:<id>` 仅投影任务事件，不调用任务执行接口，不创建真实 worker。报告按 artifact ID 匹配历史版本，不以同一 run 的首份报告代替。
- 回放展示用户决定原话、实际指令、worker 回报、主管总结及恢复异常；暂停、跳转、倍速、压缩等待与退出均独立于实时任务。
- Agent 页中的关闭、方向定位、聚焦快捷键操作 Agent tiles；IDE 的 Delete / Escape / Shift / Space 监听在此页停用。新建 IDE tile 会先返回 IDE。
- 通知可见性由当前页面、主管面板及实际进入视口的 Task 汇合。回放不把新实时通知标为已读。主管加载完成后重新同步可见性，待处理通知等待 `supervisor:ready` 再转发。
- 原终端侧栏如果仍存在，进入 Agent 页时保留 guest 与 PTY，仅隐藏视图并建立主管聊天；不改写用户的终端模式偏好。

## 可重复验证

在 `tetris-electron` 运行：

```sh
bun test src/main/canvas-persistence.test.ts
./node_modules/.bin/electron scripts/test-agent-canvas.cjs
```

持久化测试：1 个用例、12 条断言通过。包括保留 IDE viewport、迁移 worker / 报告 / 分组、原文件备份、作用域分离、写入顺序、拒绝无效 scope、损坏数据禁止自动保存覆盖。

Electron 画布 fixture：14 项检查全部通过，使用生产画布与回放代码、真实 Electron DOM 和内存存储，不启动 Claude / Codex，不读取用户画布：

1. 后台创建保持页面隐藏。
2. 页面来回切换保持布局。
3. 隐藏页面的被动定位保持布局和项目筛选。
4. 隐藏页面的上下文没有活跃选中项。
5. 销毁并重新加载画布后状态一致。
6. 任务分组和报告连接线恢复。
7. 同一 run 的多份产物选择正确历史版本。
8. 显示用户决定原话及主管总结。
9. 回放期间后台派工不修改实时 viewport / 连接线。
10. 回放不声称实时 Task 正在被阅读。
11. 页面隐藏时暂停回放。
12. 退出回放保留后台新增 worker 与原实时 viewport。
13. 关闭快捷键确实移除 Agent 视图。
14. Agent 快捷键不修改独立 IDE fixture 的布局、选择及 DOM。

另有浏览器实际渲染核查，确认卡片间距、连接线、决定与历史报告可见。真正 WorkerView 的原生滚动检查此前得到 `scroll: 220, canvasUnchanged: true`；此处的新 fixture 不重复启动该组件，其 webview 为隔离空白页。

## 验证范围

上述 fixture 覆盖计划场景 9、11、12 的画布行为与场景 14 的视图清理边界；它不等同于真实模型、通知投递、session 恢复和崩溃边界的端到端验证。

## 完整生产 shell 验证补充

`scripts/test-shell-agent-isolation.cjs` 直接加载生产 shell bundle 和生产 shell preload，使用真正的 `canvas:rpc-request` / `shell:shortcut` IPC。它在单独 Electron 进程中创建临时 userData；主进程的目录、偏好、画布存储与 PTY 服务使用内存替身，guest 页面为空白测试页，不加载用户项目或启动模型。

```sh
node scripts/run-local-bin.mjs electron-vite build --config scripts/tests/shell-isolation.config.mjs --ignoreConfigWarning
./node_modules/.bin/electron scripts/test-shell-agent-isolation.cjs
```

2026-11-04 最新源码的定向构建验证结果：退出码 0，以下 16 项全部为 `true`：

| 检查 | 直接证据 |
| --- | --- |
| 启动页隔离 | IDE 默认显示，Agent 面板关闭，即使保存的旧面板偏好为 open |
| 后台派发 | Agent worker 创建后仍停留 IDE |
| 旧终端模式偏好 | `sidebar-agent-gui=false` 时 Agent 入口仍创建主管聊天 guest |
| 原生键盘已送达 | 主窗口实际收到 Delete、Backspace、Escape |
| Delete / Escape 隔离 | IDE 的真实 tile、选择和焦点快照完全一致 |
| 无错误删除 | 未触发 IDE 删除确认框 |
| 文本框按键有效 | 原生 Backspace 确实删除文本框最后一个字 |
| 文本编辑安全 | IDE 和 Agent tile 数量均不变 |
| Agent 快捷键隔离 | 方向定位和聚焦快捷键不改变 IDE viewport |
| 关闭卡片隔离 | `shell:shortcut` 的 close-tile 仅关闭 Agent 卡片 |
| 返回 IDE | Agent 页面和主管面板同时收起 |
| IDE viewport 恢复 | 返回后 pan / zoom 与进入前完全一致 |
| IDE 选择恢复 | 返回后完整 IDE 快照与进入前一致 |
| 快捷键入口 | toggle-agent IPC 进入 Agent 页面 |
| 侧边入口 | 侧边 Agent 按钮进入 Agent 页面 |
| 旧偏好和 session 保留 | 未重写 GUI 偏好、保留原 PTY session ID、没有 PTY kill 调用 |

这一验证也曾对旧构建运行并捕获“启动面板未关闭、侧边入口未切页”两项失败；最新源码构建后两项通过，确认检查能识别真实主窗口接线问题。检查过程中未重启或终止用户正在运行的 App。

## 正式产物展示与回放补充

Agent 画布接受 note / image / pdf 产物视图，保存真实类型、Task 归属和友好标题；终端等可执行类型仍须通过 worker 派发创建。历史回放按 artifact ID / 归档路径定位，分别显示原始执行日志、执行记录、结果摘要和交付文件，后到的日志不会替换结果摘要。二进制产物显示归档说明，不当作 Markdown 文本读取。

`./node_modules/.bin/electron scripts/test-agent-canvas.cjs --artifacts`：7 项检查通过，退出码 0。验证图片 / PDF 的 Agent scope、友好标题、类型与标题恢复、拒绝可执行视图、日志与结果摘要分离、`artifact.opened` 精确定位，以及任务要求 / 停止原因 / 产物不可用原因的可读展示。

## 最新真实 WorkerView 滚动验证

在当前正式产物改动构建上运行生产 shell fixture 的 `--worker-scroll` 模式。此模式加载实际 WorkerView bundle 和 universal preload，通过隔离 IPC 返回长执行输出；激活 Worker 后向其区域发送原生 CDP `Input.dispatchMouseEvent` 滚轮事件。

验证结果：真实 WorkerView 加载成功、Worker 选中且允许内部鼠标事件、`.worker-body.scrollTop` 从 **0 增加到 240**；IDE 的 pan / zoom 和 Agent 的画布 transform 均保持完全一致，退出码 0。此模式不重复运行完整 16 项键盘 / 页面检查。

```sh
./node_modules/.bin/electron scripts/test-shell-agent-isolation.cjs --worker-scroll
```

原生鼠标进入主窗口时还暴露了 tooltip 监听对 Document 调用 `closest()` 的异常，已补充非 Element 事件目标保护。

## Worker session 丢失后的视图恢复

Worker 画布卡片优先按稳定 Task ID 关联；旧数据缺少 Task ID 时允许经过归属检查的 tile ID 回填。恢复得到新 session 时复用原卡片，仅更新运行信息和 guest URL，保留卡片 ID、坐标、尺寸、分组与原连线 key；新的派发事件不会追加重复连线。其他 Task 无权凭 tile ID 改绑已有卡片。

`./node_modules/.bin/electron scripts/test-agent-canvas.cjs --recovery`：8 项检查通过，退出码 0，验证上述恢复路径、旧卡片 ID 回填、保存后重新加载的 session 绑定，以及 `user.intent` 回放中的用户原话 / 执行指令。回放将任务创建、补充要求和取消请求标为对应的用户要求，不混同于决策回复。

## 导航收敛与画布流程重现（2026-11-04）

顶部切换统一到 Logo 与当前画布名称的菜单中，保留独立页面、未读提醒和键盘导航。回放直接在空间中重现委派、Worker 状态与历史报告，去掉额外流程节点和事件列表；事件账本仍作为回放数据源。

以下相关检查通过，无需重复运行全量测试：

| 命令（在 `tetris-electron` 内） | 结果 |
| --- | --- |
| `./node_modules/.bin/electron scripts/test-shell-agent-isolation.cjs` | 28 项通过，覆盖真实鼠标、菜单键盘操作、未读状态、页面隔离与视口恢复 |
| `./node_modules/.bin/electron scripts/test-shell-agent-isolation.cjs --worker-scroll` | 实际 WorkerView 内部滚动 0 → 240，IDE / Agent 视口不变 |
| `./node_modules/.bin/electron scripts/test-agent-canvas.cjs --replay-canvas` | 21 项通过 |
| `./node_modules/.bin/electron scripts/test-agent-canvas.cjs --replay-canvas --reduced-motion` | 21 项通过 |
| `TETRIS_REPLAY_ONLY=1 node scripts/test-tetris-agent-faults.mjs` | 回放 IPC 元数据与不可变历史产物通过；无真实模型请求 |

回放检查覆盖同一 Worker 持续更新、实际打开事件才显示报告、正确归档版本、持久连线、暂停 / 跳转、减少动态效果、实时进展隔离及退出恢复。IPC 检查额外确认 `historyIncomplete`、provider、artifact kind / sourcePath 不会在传递时丢失。

main、preload、shell、agent-chat 的最终定向生产构建退出码 0，日志 `/tmp/tetris-nav-final-build.log`。本地开发 App 已更新重启，并经原生 CUA 实际点击菜单、进入旧任务回放、播放至报告出现。旧任务仅有部分事件时明确提示“部分历史记录”；无历史校验记录的产物提示无法准确回放。此次原生界面验证不涉及系统通知横幅点击。
