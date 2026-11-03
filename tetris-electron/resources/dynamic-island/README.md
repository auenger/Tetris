# Dynamic Island v2

<img src="../../../docs/screenshots/dynamic-island.png" width="480" alt="Real-device expanded Dynamic Island showing sessions and account usage" />

User-provided capture; values reflect capture time. See the [user guide](../../../docs/guide.en.md#touch-bar-and-dynamic-island) for setup and interaction.

Independent Electron window/controller (`src/main/dynamic-island.ts`) and event state (`island-state.ts`). Does not use the Touch Bar renderer, activity tracker, or captured terminal text. The existing Touch Bar appearance/state remain unchanged; its old native island panel is no longer enabled.

Interaction: compact avatars + working count; hover expands session path/tool/elapsed and quota detail; working avatars breathe, rings spin; activity events never expand the panel: completion appears in the compact right-hand summary for four seconds, and attention stays in that summary until resolved. Only hover or dragging expands details. Reduced motion disables CSS animations. A dedicated IPC preload exposes only expand, validated session navigation, and state subscriptions.

Enabling installs observational hooks into CODEX_HOME/hooks.json, preserving other groups and backing up existing JSON before atomic replacement. New definitions require user review in Codex `/hooks`; no trust is written automatically. Hooks only forward metadata for App-owned terminals carrying the existing route/socket environment. Existing `notify` completion also feeds the island. External terminals without those variables are not monitored. Hooks emit no approval decision and never approve a command. Disabled UI does not interrupt agents.

Quota design research: https://github.com/yetone/magpie and docs/reference.md, docs/subsystems/providers-accounts.md. Magpie distinguishes accounts, windows, readAt/errors, resets, and cache-only reads (`/v1/magpie/quotas?kept=1`). No Magpie code or credentials are imported. Current implementation displays the existing bounded Codex local weekly snapshot, clearly labeled approximate; multi-provider authenticated readers are not implemented.

Preview: `node scripts/preview-dynamic-island.cjs` uses a temporary userData directory and simulated sessions/usage, with menu actions for working/attention/completion. It does not load the production main process, start a sidecar, install hooks, or change Touch Bar. `--check` verifies hover, quota visibility, attention and completion behavior.

Assets: `avatars/` contains six imagegen-created transparent PNG sheets based on the user-approved anime character reference: Codex, Claude Code, GPT, Claude, GLM, and DeepSeek. Each sheet has three equal square cells (default, thinking, completed). The island preserves per-session character variety; these decorative characters do not identify the session's model/provider. Working and attention use thinking, done uses completed. Both Touch Bar implementations use the dedicated Codex sheet with the same expression mapping. No runtime avatar uses the old dot sheets. Originals remain available for rollback.

## 账户额度（Magpie 风格卡片）

设置 → 账户额度：按供应商分组；显示账户、套餐/来源、已用圆环、重置时间、余额、查询错误和上次成功时间。灵动岛使用同一份模型的精简卡片。圆环统一表示已用百分比，API 余额是金额，不与订阅 weekly 混算。历史仅保留本次 App 运行中的最多 96 个实际采样点；没有历史不绘制预测线。

- Codex：独立读取本地 session 日志中的 primary/secondary 额度窗口（5h/7d）和重置时间；一小时失效；不是实时官方账户查询，也不修改 Touch Bar 的读取逻辑。
- DeepSeek：官方 GET https://api.deepseek.com/user/balance，显示含赠送金额的 API 余额。[文档](https://api-docs.deepseek.com/api/get-user-balance/)
- OpenRouter：官方 GET https://openrouter.ai/api/v1/key，显示 Key 剩余限额及已用比例；未设置 Key 限额不代表账户余额无限。[文档](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key)

API Key 由 Electron safeStorage 加密后写入 userData/provider-accounts.json（0600），系统安全存储不可用时拒绝保存。渲染器只收到末四位。每五分钟刷新，失败保留上次结果并显式标记错误；也可手动刷新。只请求固定官方端点，拒绝重定向。首版不包含其他供应商登录、重置卡购买/消耗、积分续用或模型路由。

预览使用临时配置和明确标注的模拟额度；不会访问真实账户或改动已运行的 App。验证：node scripts/preview-dynamic-island.cjs --check、node scripts/test-provider-quota-ui.cjs。

## 半透明与顶部吸附

收起胶囊透明度 48%；悬停、展开或拖拽时恢复清晰。顶部头像/状态区支持拖拽，窗口始终吸附当前显示器顶部，仅修改横向锚点。松手将显示器 ID 和横向比例保存到 userData/island-position.json；展开/收起与显示器尺寸变化时保持锚点，并约束窗口不超出显示器。移除显示器时回退主屏。

## 智谱与 Z.ai Coding Plan

设置 → 账户额度新增两个独立供应商：智谱 GLM（open.bigmodel.cn）、Z.ai（api.z.ai），均查询 /api/monitor/usage/quota/limit。使用官方插件同样的裸 API Key Authorization 头，仅发送给所选供应商的固定域名。兼容 TOKENS_LIMIT / CREDIT_LIMIT 和 TIME_LIMIT，展示 5h、7d、MCP 月额度及服务端 nextResetTime，套餐名称来自 level。缺失用量不会显示成零；无套餐或查询失败会显示明确状态。尚未使用真实账户 Key 做线上验证。

参考：[Z.ai 官方用量插件](https://github.com/zai-org/zai-coding-plugins/blob/main/plugins/glm-plan-usage/skills/usage-query-skill/scripts/query-usage.mjs)、[Magpie 套餐额度解析](https://github.com/yetone/magpie/blob/main/internal/provider/planquota.go)。仅独立实现数据适配，未加入重置卡消耗操作。
