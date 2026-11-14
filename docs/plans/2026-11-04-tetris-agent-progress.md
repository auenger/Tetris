# Tetris Agent 实施进度与验收记录

对应计划：[实施计划](./2026-11-04-tetris-agent-implementation-plan.md)

更新：2026-11-04

状态：本轮实施与针对性验收已完成，最新本地开发 App 已重启。以下记录实际验证范围，不将受控故障注入、模拟通知点击或定向构建写成全量测试。

## 已实现

- **独立页面**：IDE 与 Tetris Agent 分别持有画布、布局、视口、选择、焦点、任务组和连接线。派发及报告进入 Agent 页面，后台派工不切换 IDE；回放使用独立只读状态。
- **独立主管**：Claude Agent SDK 原生 session、App conversationId、Agent Home、CLAUDE.md、长期与项目 Markdown 记忆。新对话、历史、归档和原生 session 恢复不再绑定项目目录。
- **自动上下文**：每轮注入带版本和时间的注册项目、IDE 与 Agent 画布上下文、任务和未读回报。隐藏或回放中的画布不提供活跃选中项。
- **任务派发**：默认 Claude / Codex、明确项目路由、TaskSpec、可选 worktree；先持久化并入队，再后台启动 Worker，主对话可以继续收消息。
- **真实记录**：Task / Run / Decision / Event / Artifact 账本；主管工具调用另外保存输入、原始结果、错误、起止时间和来源消息，不依赖 provider transcript，也不覆盖用户原话。普通创建、补充和取消另存 `user.intent`，回放同时保留人的原话与解释后的指令。
- **决策与回报**：自然语言决策、原话及交付指令、一次性权限、原会话继续；会话确实丢失时保留 Task 并建立明确的恢复 run。普通网络错误不会自动创建替代 Worker。
- **结果区分**：原始执行日志、结果摘要、正式产物分别保存；正式产物有内容 hash、版本和原扩展名。异常结束或声明产物缺失不会被 App 标成完成，worker 原始回报仍保留。主管接收回报及查询状态时，同时获得 App 判定原因和原始停止原因，避免 worker 的完成声明遮蔽实际受阻状态。
- **通知**：应用内持久未读与系统通知，按 eventId 去重，定位原对话及 Task。仅当前实际可见的实时任务抑制系统横幅；停留 IDE、其他任务和回放时仍可提醒。
- **恢复一致性**：派发、权限和决定交付都有中断记录。交付未确认的决定明确标记；关闭时未执行的排队指令保留在历史并退出运行队列，避免以后被再次执行。
- **交互**：Tetris logo、Task 列表、记忆编辑、完整动态边框、常驻连线、选中强调、约 100 单位间隔、内部滚动及 reduced-motion。旧终端 guest / PTY 保留，进入 Agent 页不会改写原终端模式偏好。

## 按计划第 12 节核对

以下说明验证的实际边界；没有运行全量测试。

| 场景 | 已取得的直接证据 |
| --- | --- |
| 1. 两项目按名称路由 | 真实主管在两个临时注册 Git 项目中按名称选择目标；实际 Claude / Codex Worker 接收正确 cwd。 |
| 2. 目录歧义 | 真实主管面对没有明确上下文的请求先澄清，Task 数量保持为零。 |
| 3. 默认及指定执行器 | 真实路由测试验证默认 Codex、单次 Claude 覆盖、修改默认后旧 Task 仍保持原 provider。 |
| 4. 执行期间聊天 / 新任务 / 新对话 | 真实 Claude、Codex 决策往返测试中创建第二个主管对话并正常回复；组合路由测试同时派发不同项目 Task。 |
| 5. 自然语言决定继续 | 两种真实 Worker 都完成“请求决定 → 人的原话 → 同一 worker session 第二轮 → 报告与通知”。 |
| 6. 两项待决策及重复 / 陈旧决定 | 两次真实主管推理验证含糊回复零变更、明确选择只处理 Task B；持久账本和执行边界测试验证跨任务、重复与陈旧请求拒绝。该双待决策测试使用 fixture Worker transport。 |
| 7. 总结失败 | 注入主管故障，重新加载三个真实持久 store 后，报告、原对话回报、未读通知仍在，其他对话无污染。 |
| 8. 通知回原对话 | 实际 Electron Notification 实例模拟 click，真实窗口 restore/show/focus、原 conversation/task/event IPC、已读落盘均通过；页面有 preload 缓存及 React ready 握手。 |
| 9. 页面切换 / 后台派工 / 恢复 | 原生画布 fixture、持久化迁移测试、完整生产 shell 的 16 项 IPC / 按键检查；运行中 App 的 IDE / Agent scoped RPC 也确认数据分离。 |
| 10. 真正 webview 内滚动 | 当前构建的实际 WorkerView 通过原生 CDP wheel 使 scrollTop 从 0 增加到 240；IDE viewport 与 Agent transform 均未改变。 |
| 11. 多轮历史回放 | 决策原话、主管总结、同一 run 的多个 artifact ID、历史内容 hash、播放 / 暂停 / 跳转均有针对性验证；被修改或丢失的历史文件明确标记。 |
| 12. 回放与实时进展隔离 | 回放期间后台新增 Worker；退出后新 Worker 保留，原实时视口与连接线不变。隐藏页面暂停回放。 |
| 13. 崩溃边界 | 实际 registerAgentIpc 注入启动 / 关闭故障；账本测试覆盖决定保存、排队、交付前后与重复启动；通知测试覆盖 pending / attempted 边界。没有自动重放真实命令。 |
| 14. 目录 / session / 取消 / 关闭视图 | 实际 Electron 控制流注入缺失 session、网络错误、删除目录、取消权限、延迟启动；历史与产物保留，关闭 Agent 视图不取消任务或删除 IDE tile。 |

正常执行链路使用真实 Claude / Codex；失联、崩溃和异常停止使用受控 provider 注入，以验证确定的故障窗口。通知测试模拟原生 click 事件，**未实际点击 macOS 系统横幅**；本机 CUA native pipe 不可用，不将其写成物理点击实测。

## 可重复验证入口

在 `tetris-electron` 运行需要的相关项即可，不需要全部重复执行。

| 入口 | 范围 |
| --- | --- |
| `bun test src/main/supervisor.test.ts src/main/supervisor-tool-ledger.test.ts` | 会话、用户优先队列、总结失败、原话和主管工具账本 |
| `bun test src/main/agent-home.test.ts` | 记忆路径、来源、原子更新与 revision 冲突 |
| `bun test src/main/task-ledger.test.ts src/main/worker-recovery.test.ts src/main/worker-artifacts.test.ts` | TaskSpec、状态、决策、崩溃队列、正式产物及恢复 |
| `bun test src/main/task-notification-delivery.test.ts src/main/task-notification-store.test.ts` | 可见性、去重、交付中断、未读持久化 |
| `bun test src/main/canvas-persistence.test.ts` | 旧数据备份、准确迁移、保存顺序、scope 隔离、损坏数据保护 |
| `node scripts/test-tetris-agent-faults.mjs` | 实际 Electron IPC、受控 provider 故障、异常结束和正式产物打开 |
| `./node_modules/.bin/electron scripts/test-agent-canvas.cjs` | 原生独立画布及回放投影 |
| `scripts/test-shell-agent-isolation.cjs` | 实际生产 shell / preload、原生按键、页面和旧终端模式；构建与执行方式见画布核查记录 |
| `node scripts/test-tetris-agent-e2e.mjs` | 真实 Claude 主管与 Worker 决策往返；`TETRIS_E2E_WORKER=codex` 切换 Worker |
| `TETRIS_E2E_CASE=routing node scripts/test-tetris-agent-e2e.mjs` | 真实项目澄清、执行器优先级及报告 |
| `TETRIS_E2E_CASE=notifications node scripts/test-tetris-agent-e2e.mjs` | 真实 Electron Notification wrapper 的模拟 click |
| `bun scripts/tests/tetris-agent-decision-routing.ts` | 真实模型在两个待决策任务间澄清与选择 |
| `bun scripts/tests/tetris-agent-runtime-ledger.ts` | 单轮真实 SDK 工具调用的 App 账本与 native session 持久化 |

补充范围与检查项见[独立画布核查](./tetris-agent-canvas-audit.md)。测试使用临时项目 / userData，没有向用户项目派发测试修改。

## 构建与运行状态

- main、preload、shell、agent-chat 定向生产构建通过：`/tmp/tetris-agent-focused-build.log`；最后的主进程回报改动另经定向构建通过：`/tmp/tetris-agent-main-final.log`。没有执行其他窗口的全量构建测试，也未构建发布安装包。
- Agent Chat 定向 TypeScript 检查通过。主进程相关依赖图仍报告原有 `packages/shared/src/path-utils.ts:183/196` 两处错误；不能宣称全项目类型检查通过。
- 本轮已验证最小 asar 中实际 SDK / CLI 的加载与执行；这不等于正式安装包验收。
- 实际 Codex 在非 Git 临时目录会拒绝执行；测试改用 Git fixture 后通过，产品保留该错误并通知，不静默绕过其目录检查。
- 工作树保留全部实现和此前动画 / 滚动修复，当前未自动提交或推送。
- 本地启动：`COLLAB_DEV_WORKTREE_ROOT=/Users/ryan/mycode/collab/tetris-electron node scripts/run-local-bin.mjs electron-vite dev`。
- 开发日志：`/tmp/tetris-user-test-app.log`；socket：`/Users/ryan/.collaborator/dev/worktree-15291efe4909/ipc.sock`。

## 最近运行核对

- 最新开发 App 已重新构建、重启并进入 Agent 页面。scoped RPC 确认 `agent:live.visible=true`、`replaying=false`；进入前后 IDE snapshot 完全一致，IDE 与 Agent 各保留 1 个原有 tile。记录：`/tmp/tetris-agent-startup-final.json`。
- 未发现应用级 Uncaught / TypeError / IPC 启动错误。Electron 在本机输出的 macOS task-policy 系统诊断不属于应用逻辑异常。
- 恢复 tile 绑定与 `user.intent` 回放的 8 项原生画布检查全部通过。同一个 Task 更换 Worker session 时复用原 tile、位置、分组与连线；历史回放同时显示用户原话和实际指令。
- 最终受控故障链路再次通过：异常停止、App 受阻原因向主管传递、精确产物归属和关闭期间延迟启动均有回归证据，日志为 `/tmp/tetris-agent-faults-final.log`。本轮未重复执行已通过且未受后续改动影响的全量测试。

## 导航与回放体验更新（2026-11-04）

用户反馈顶部切换按钮突兀，回放无需额外流程节点。此次只调整导航和回放呈现，Task 事件记录、真实执行及存储契约沿用既有实现。

参考公开项目及官方材料：

- [tldraw](https://github.com/tldraw/tldraw) 的 [UI 分区](https://tldraw.dev/sdk-features/ui-components) 将页面菜单与视口工具分开；[Pages](https://tldraw.dev/sdk-features/pages) 保留各页独立相机与选择状态，适合 IDE / Agent 画布切换。
- [AFFiNE](https://github.com/toeverything/AFFiNE) 的 [工作空间与页面指南](https://affine.pro/blog/getting-started-with-affine) 区分全局工作空间和页面视图，借鉴其导航层级。
- [Excalidraw](https://github.com/excalidraw/excalidraw) 的 [产品界面](https://excalidraw.nyc3.cdn.digitaloceanspaces.com/github%2Fproduct_showcase.png) 将全局菜单、对象工具和缩放分组，借鉴其对画布空间的保留。

落地调整：

- 标题栏只保留「Logo + 当前画布」下拉入口，避开 macOS 窗口按钮。IDE / Agent 菜单项显示当前状态；未读数同时出现在折叠入口和 Agent 菜单项。
- 删除 Agent 画布顶部重复标题与“返回 IDE”按钮。项目筛选只在需要时显示，适应全部任务与缩放读数收在画布角落。
- 回放直接呈现委派气泡、持续更新的 Worker tile、历史报告 tile 和流光关系线；去掉节点卡排列与事件列表。只有真实打开事件才展示报告，归档事件继续保留在 Worker 记录内。
- 底部控制播放 / 暂停、进度跳转、倍速、压缩等待与返回实时。缺失与不完整历史明确提示，不填造过程，不执行真实任务。

视觉沿用现有字体、logo、灰阶表面和任务颜色；设计规范选用 True-black flat（seed 2144271450）的低干扰导航原则，已有点阵画布和用户要求的流光效果优先保留。菜单阴影只用于浮层，未添加到静止画布卡片。

本轮验证：

- 实际生产 shell 的导航、原生键盘与画布隔离 28 项检查通过；实际 WorkerView 滚动从 0 到 240，两个画布的视口均未移动。
- 画布回放在普通动画和减少动态效果模式下各通过 21 项检查，包括精确历史产物匹配、回放不触发真实执行，以及返回后恢复实时画布。
- 补齐回放 IPC 中的执行器、不完整历史标记、产物类型与原始文件名；定向回归验证保留归档版本并拒绝被修改的历史文件。
- main、preload、shell、agent-chat 定向生产构建通过，日志 `/tmp/tetris-nav-final-build.log`；本轮没有重复执行全量测试。
- 已重启本地开发 App，用原生界面操作确认画布切换及旧任务播放至结束。报告 tile 和连线正常出现，缺少校验记录的旧报告明确显示无法准确回放；没有伪造缺失内容，也没有派发测试任务。开发日志更新为 `/tmp/tetris-nav-dev.log`。
- 工作树保留修改，未提交或推送。

## 归档、统一下拉与聊天渲染更新（2026-11-04）

本轮按用户要求保留 Task card 的 JSX 与原 `supervisor.css`，优化对话界面及通用选择控件。实现参考本地 Cindy 的 `StreamingMarkdownChunk.tsx`、`MarkdownRenderer.tsx`、`composerSendOwnership.ts` 和 `composerFrameScheduler.ts`：稳定已完成内容、只处理增长尾部、草稿与发送回执归属源会话。未复制其完整渲染器或输入编辑器，也未改动 Cindy 仓库。

- **归档找回**：对话头部增加明确的“归档记录”入口，支持按标题搜索、查看原消息和恢复。恢复保留 conversation ID、Claude runtime session、消息、未读状态和 Task 归属；归档中的任务仍可回报。归档当前对话后优先进入其他活动对话，没有时才新建。
- **统一下拉**：共享无依赖 Select / menu 行为覆盖历史对话、默认 Worker、任务范围、工作台模型与权限、设置、项目筛选、回放倍速，以及画布切换和快捷命令菜单。统一深浅色、键盘选择、Escape / Tab、外部点击关闭、长文本与浮层位置；画布 transform 时仍跟随触发按钮。
- **Markdown**：复用已安装的 Streamdown 2.3，稳定分块与 memo；支持 GFM 表格、列表、引用、代码语言与复制，代码和宽表格独立横滚。原始 HTML 不执行，外链限制到安全协议；不在流式过程中切换 loading 树。
- **真实流式**：Claude SDK 的公开文本增量经消息 ID 去重、80ms 合并持久化及 IPC 推送。单会话递增 revision 防止旧轮询覆盖新文本；最终内容、失败状态及迟到回调都有归属检查，不暴露 thinking 或工具 JSON。
- **输入与阅读**：输入框自动增高，中文 IME Enter 不误发；内存草稿按对话隔离。发送等待期间的新输入和切换后的草稿不会被旧回执清空，迟到错误显示在源会话。上滚阅读不被流式拉到底部，并提供“回到最新”；回复过程中仍可继续发送。

验证与范围：

- 后端 12 项 / 118 断言通过；一轮真实 Claude SDK 在临时 Agent Home 收到 22 个增量快照，归档、恢复及重载后原 session 与消息保持一致，未启动 Worker。日志 `/tmp/tetris-agent-runtime-stream.log`。
- 实际 SupervisorView + Select + ChatMarkdown 的隔离 Electron 界面 32 项通过：归档、恢复、输入竞态、失败归属、IME、revision、滚动。360 / 560 / 900 宽度深浅色截图已目检，无横向溢出。
- Markdown 27 个解析断言及 10 项真实 DOM 检查通过，验证已完成段落节点、选区、代码横滚位置、尾段与复制内容。
- 共享控件 26 项、画布接入 7 项、生产 shell 导航隔离 29 项、原回放 21 项通过。导航 fixture 仅补充 resize 稳定后基线采样，未放宽隔离断言。
- Agent UI、runtime 的严格定向 TypeScript 检查通过；main / preload / shell / agent-chat / settings 的最终生产构建通过，日志 `/tmp/tetris-chat-final-build.log`。未重复运行全仓测试；设置页原有两处快捷键类型错误未纳入此次修复。
- 原生 App 已实际打开“归档记录”并读取此前归档的 `personal-site` 对话，原消息和 Task cards 可见，底部提供“恢复并继续”。真实用户归档未被自动恢复；恢复写入由隔离 fixture 与真实临时 runtime 验证。
- 设计 lint 按 app 模式为 0 FAIL；唯一阴影提示来自真实菜单浮层。工作树未提交或推送。

可重复运行的本轮入口（在 `tetris-electron`）：`node scripts/test-supervisor-chat.mjs`、`node scripts/test-chat-markdown.mjs`、`./node_modules/.bin/electron scripts/test-select.cjs`，以及现有 shell / canvas 定向 fixture。截图是受控样例，不代表向用户项目执行过测试任务。

## Agent 头部鼠标命中修复（2026-11-04）

用户实测右上角三个按钮点不动。原因是 shell 全宽 `#titlebar` 的原生 `app-region: drag` 覆盖了 Agent 头部；`pointer-events:none` 只改变 DOM 命中，未排除 Electron 的窗口拖动区域。此次在 Agent 面板顶部增加随面板宽度变化的局部 `no-drag` 区域，保留画布一侧的标题栏拖动区域。导航显示名称同步改为 `IDE Canvas`。

实际运行 App 中使用相同鼠标坐标复现了修复前任务按钮不响应、下方选择器正常；修复后任务、通知、归档三个按钮逐个点击均切换成功。英文菜单名称已核对，并已打开“全部任务”，两项历史任务都可见。本轮使用原生坐标点击核验，没有用 DOM / AX 按钮调用代替命中验证；未修改 Task card 或执行任何任务。

## 后台 Agent 的 Dock 图标修复（2026-11-04）

真实 App 对照确认：原 Supervisor 使用 Electron 主可执行文件承载 Claude CLI，聊天子进程被 macOS Launch Services 注册为 `Foreground`，出现额外的通用 `exec` Dock 图标。不是 Tetris 的系统通知主动请求 Dock 跳动。

- Supervisor、Claude ACP Worker 和通知 hooks 统一使用同一安装内的 Electron Helper；macOS Helper 具有 `LSUIElement` 后台身份。开发环境同样使用内置 runtime，缺失 Helper 时明确报错，不回退到主 App 或依赖系统 Node。其他平台继续使用原进程可执行文件。
- 通知 hooks 在启动 runtime 前检查 route/socket 环境变量；无 Tetris 路由直接退出。Codex JSON 参数和 Claude stdin 原样透传。升级只精确迁移当前安装生成的旧命令，保留其他安装和自定义 hooks；沿用写入前备份。
- 30 项定向回归、305 个断言通过；main / preload / shell / agent-chat / settings 定向构建通过。开发版与安装版 Helper 均验证 ASAR 加载、参数、工作目录、标准输入输出、退出码和 AbortSignal；真实 ACP 初始化返回协议版本 1。
- 真实 Electron 主进程驱动 Claude SDK 收到 116 次文本更新并正常退出。重启后的测试 App 再次聊天成功；OS 记录中 Claude 子进程从旧 `Foreground` 变为 Helper 的 `UIElement`。证据为 `/tmp/tetris-dock-baseline.jsonl`、`/tmp/tetris-dock-fixed-app.jsonl`、`/tmp/tetris-helper-native.log`、`/tmp/tetris-node-host-native.log` 和 `/tmp/tetris-acp-helper-init.log`。
- 临时诊断对话已归档，界面回到原对话；没有派发项目修改任务。测试 App 已重启，日志 `/tmp/tetris-test-app-restart.log`。未构建发布安装包，未提交或推送。

## 待验收 Task 取消修复（2026-11-04）

真实工具账本显示，两次 `cancel_task` 已执行并返回“已请求停止”，但旧取消路径仅处理正在运行、排队和受阻等状态，遗漏 `ready_for_review`；底层 `finish` 同样拒绝从待验收转为取消。任务只留下 `user.intent`，没有 `run.cancelled`，因此卡片和新对话仍读到待验收。

- 取消改为先持久化任务状态，同时清理待处理指令与尚未交付的决定，再通知运行中的 Worker。Worker 已退出或 session 不存在时也能取消待验收任务；已验收结果不会被改写。
- 工具在返回成功前重读实际状态；重复取消幂等，报告、输出与历史产物保留，迟到的 Worker 回报、错误和恢复不会重新激活已取消任务。取消后的明确继续执行创建新 run，原取消记录保留。
- 取消回报采用独立稳定事件 ID，避免被同一 run 之前的待验收回报去重。关闭已完成 Worker tile 仍只关闭 session，不隐式取消结果。
- 已取消任务的旧提醒标记已处理，待发送提醒被抑制，已有横幅关闭；历史保留，启动时先同步取消状态再恢复通知，避免新对话继续收到旧待办事项。
- 既有任务、对话、恢复和通知相关的 43 项回归 / 321 个断言通过；main / preload / shell / agent-chat / settings 定向构建通过，日志 `/tmp/tetris-task-cancel-build.log`。
- 新增取消单测 4 项 / 64 断言通过。真实 Electron IPC 两阶段测试通过：两个待验收且没有活跃 session 的任务连续取消、重复调用、已验收拒绝、取消回报去重，进程重启后新会话仍注入取消状态且不重放 Worker。延迟读取画布上下文时的继续执行 / 决策请求在任务被取消后均被拒绝；用户随后明确发出的新指令仍可创建新 run。日志 `/tmp/tetris-task-cancel-ipc.log`，最后的主进程增量构建 `/tmp/tetris-cancel-main-build.log` 通过。
- 已重启测试 App，并通过真实 Tetris Agent 自然语言对话重新执行用户此前明确授权的两项取消。首页检查、项目内容分析均已持久化为 `cancelled`，卡片显示“已停止”；随后另开独立对话查询，两项均确认不再等待验收。对照修复前快照核对：任务数量仍为 2，原 run ID、报告、输出及产物记录不变，每项只有一条取消事件；未直接改写用户数据 JSON，未派发项目修改任务。

## 主分支交付汇总（2026-11-14）

本批统一交付 Super Agent 设计与实现、IDE Canvas 协作界面、会话归档与 Markdown 渲染、任务取消/恢复/通知修复及对应回归脚本，同时纳入 Apple Silicon 灵动岛改造与 Touch Bar 移除。此前各节“未提交或推送”描述保留为当时的验证记录，不代表本批交付状态。

灵动岛当前验收版本：左右各 76pt、28pt GIF 头像与常显状态；收起高度为摄像头安全区加 8pt；展开后仍贴住屏幕顶部，宽 400pt、高最多 420pt，采用内凹肩部曲线和下方圆角，无外框描边。用户已实机测试认可。六个角色共 24 个状态 GIF，支持减少动态效果和刷新不中断播放。

原生 ActivityKit 代码属于预备实现，尚未在支持的 SDK/系统上编译验证；本批不将其标记为已启用。继续保留当前正式系统，等待支持的正式系统及 SDK 后按原生组件清单验证。

本次提交前核验：灵动岛/状态/终端活动的 21 项测试通过；额外 14 个变更中的主进程测试文件分别在独立 Bun 进程中运行，全部通过，避免模块 mock 互相影响。最近一次 ARM64 打包、三种灵动岛布局预览和深度签名校验通过；这些检查不代表全部 UI/E2E 场景已在本次重新执行。中英文 README、使用指南、开发指南及灵动岛说明已同步；本地生成的 `.app` 不进入 Git。

构建与验证入口见 [开发指南](../development.md#apple-silicon-灵动岛--dynamic-island-on-apple-silicon)，原生支持边界见 [原生组件说明](../../tetris-electron/native/agent-activity/README.md)。
