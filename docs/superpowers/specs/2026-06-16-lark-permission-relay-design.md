# 设计：飞书通道插件 + 卡片按钮权限审批（fork 自 claude-code-lark）

日期：2026-06-16

## 目标

把成熟的 `MocA-Love/claude-code-lark`（Apache-2.0）fork 成自己的开源插件，
**新增 Claude Code 危险操作权限审批的飞书转发能力**：当 Claude Code 触发权限
请求时，向已配对的飞书私聊推送一张交互卡片，用户点 ✅允许 / ❌拒绝 即可远程
批准，无需回到终端。其余能力（收发消息、图片/文件、群@、线程、多会话锁）原样
保留、不改。

> 说明：底座 fork 当前**完全没有**权限审批功能（文字审批是 Telegram 插件 /
> 另一飞书插件 AnInteger 才有的，本 fork 没有）。因此本次是"新增"权限审批，
> 且**唯一对用户可见的审批方式就是卡片按钮**。除此之外不增加任何功能。

## 背景与依据

- Telegram 官方通道插件已实现该模式：声明 MCP 能力 `claude/channel/permission`，
  监听 `notifications/claude/channel/permission_request`，用 inline 按钮回 allow/deny，
  并发 `notifications/claude/channel/permission` 应答。
- 底座 `claude-code-lark` 已声明 `claude/channel` 并跑通双向消息，但**没有**权限审批。
- 飞书 SDK `@larksuiteoapi/node-sdk`（本机 1.60.0）：`WSClient.start({eventDispatcher})`
  把所有长连接事件交给 `EventDispatcher.invoke()`，handler 返回值原样回传——满足
  卡片回调"更新卡片/弹 toast"机制。卡片回调事件 key 为 `card.action.trigger`。

## 范围

仅改 `server.ts` + `skills/access`（+ 文档/署名）。不引入新依赖。单文件结构维持。

## 设计

### 1. 声明能力
`capabilities.experimental` 增加 `'claude/channel/permission': {}`。
（语义：本 server 能鉴别点击者身份——`gate()`/`allowFrom` 已保证只有白名单 DM 收到。）

### 2. 接收权限请求 → 发卡片
`mcp.setNotificationHandler('notifications/claude/channel/permission_request')`：
- 入参 `{request_id, tool_name, description, input_preview}`。
- 把 detail 存入内存 `Map<request_id, {...}>`（供"查看详情"展开）。
- 向 `access.allowFrom` 里**每个 DM 的 chat_id**（经 `chat-mapping.json` 反查 open_id→chat_id）
  发一张 interactive 卡片：
  - 标题：`🔐 权限请求：<tool_name>`
  - 按钮（callback 模式，`value` 带 `{action, request_id}`）：`查看详情` / `✅ 允许` / `❌ 拒绝`
- **群聊不发**（与 Telegram 安全约定一致：群成员未经显式配对）。

### 3. 接收卡片点击 → 回应答
`EventDispatcher` 注册 `'card.action.trigger'`：
- 校验 `open_id ∈ allowFrom`，否则 toast「无权限」、不动作。
- `查看详情`：从 Map 取 detail，更新卡片展示 tool_name/description/格式化后的 input_preview + 保留 允许/拒绝 两个按钮。
- `允许`/`拒绝`：发 `notifications/claude/channel/permission` `{request_id, behavior:'allow'|'deny'}`，
  删 Map 项，**更新卡片**为最终结果（去掉按钮，附「✅ 已允许 / ❌ 已拒绝」），防重复点。
- handler 返回卡片更新 payload（SDK 会回传给飞书完成卡片刷新）。

### 4. 文本兜底（内部安全网，非用户功能）
卡片按钮是唯一对用户可见的审批方式。文本兜底仅作为**实现期的内部安全网**：
若 §3 的卡片回调验证（spike）不通过、需要额外接线，则临时在 `handleInbound` 里
匹配 `^\s*(y|yes|n|no)\s+(<request_id>)\s*$` 触发同样的 permission 应答，保证审批可用。
**spike 验证卡片回调可用后，此兜底即移除，不写入文档、不作为功能宣传。**

### 5. access skill
`/lark:access set` 不新增必需项。卡片审批默认开启；如需开关，加可选 `permissionCard: bool`（默认 true）。

## 实现风险与对策

- **风险**：长连接下 `card.action.trigger` 的 envelope 能否被 `EventDispatcher.parse`
  识别成该 type（SDK 另有 `CardActionHandler` 类，`WSClient.start` 不收它）。
- **对策**：实现第一步做 15 分钟 spike——发一张测试卡片、点击、看长连接是否回调到 dispatcher。
  - 成功 → 按 §3 实现。
  - 失败 → 改用 `CardActionHandler` 并自行把它接到 WSClient 的事件分发，或退到飞书"回调请求地址"
    （需公网，不可取）→ 则卡片按钮降级，以 §4 文本审批为主、卡片仅展示不带交互按钮。
- 无论如何，§4 保证审批功能可用。

## 发布与合规（Apache-2.0）

- 保留原 `LICENSE`；新增 `NOTICE` 署名上游 `MocA-Love/claude-code-lark`。
- README 顶部声明：Forked from MocA-Love/claude-code-lark；列出新增的权限审批功能；标注修改。
- 用 GitHub Fork 方式建仓（保留 fork 关系）。`marketplace.json` 指向新仓库。
- 凭证不入库：沿用 `/lark:configure <app_id> <app_secret>` 写本机 `.env`（跨设备各自配置）。
- 其他设备安装：`claude plugin marketplace add <repo>` + `claude plugin install`。

## 测试

1. SDK spike：卡片回调是否经 dispatcher 到达（见风险对策）。
2. 端到端：本机 `claude --dangerously-load-development-channels` 起插件 → 触发一次权限请求
   （如读敏感文件）→ 飞书收到卡片 → 点允许 → 终端放行；点拒绝 → 终端拒绝。
3. 文本兜底：发 `y <request_id>` 同样放行。
4. 安全：非白名单用户点按钮 → 被拒；群聊不收卡片。
5. 回归：原有收发消息/图片/群@/线程不受影响。

## 不做（YAGNI）

- 不做权限请求的历史/审计面板。
- 不做多用户投票审批。
- 不动多会话锁、takeover、fetch_messages 等既有逻辑。
