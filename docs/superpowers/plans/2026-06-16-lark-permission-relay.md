# 飞书通道插件：卡片按钮权限审批 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 fork 自 `MocA-Love/claude-code-lark` 的飞书通道插件新增危险操作权限审批——Claude Code 权限请求推送为飞书交互卡片，点 ✅允许/❌拒绝 远程批准。

**Architecture:** 在单文件 `server.ts` 中：(1) MCP 能力声明加 `claude/channel/permission`；(2) 监听 `permission_request` 通知 → 向白名单 DM 发交互卡片；(3) `EventDispatcher` 注册 `card.action.trigger` → 校验点击者 → 回 `permission` 应答 + 更新卡片。其余逻辑不动。发布走 GitHub Fork + Apache-2.0 署名。

**Tech Stack:** Bun + TypeScript，`@larksuiteoapi/node-sdk`（WSClient 长连接 + 卡片回调），`@modelcontextprotocol/sdk`。

**测试说明：** 本仓库无自动化测试框架，沿用上游做法——以"独立 spike 脚本 + `claude --dangerously-load-development-channels` 端到端手测"验证。下文 Run/Expected 均为可执行命令与可观察结果。

---

## 文件结构

- 修改：`server.ts` — 全部新增逻辑（能力声明、permission 通知 handler、卡片构造、card.action.trigger handler）
- 修改：`skills/access/SKILL.md` — 补一句卡片审批说明（不新增必填项）
- 修改：`README.md` — fork 署名 + 新增功能说明
- 创建：`NOTICE` — Apache-2.0 署名上游
- 临时：`spike-card-callback.ts` — 验证卡片回调路由（验证完删除）

---

## Task 0: 环境与建仓准备

**Files:** 无代码改动

- [ ] **Step 1: 安装 gh CLI**

Run:
```bash
sudo apt-get update && sudo apt-get install -y gh
```
Expected: `gh version 2.x` via `gh --version`。
（若 apt 无 gh 源，回退：`curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg` 等官方步骤。）

- [ ] **Step 2: 用户交互登录（用户在终端执行）**

提示用户运行：`!gh auth login`（选 GitHub.com → HTTPS → 浏览器/粘贴 token）。
Run（验证）：`gh auth status`
Expected: `Logged in to github.com as <user>`。

- [ ] **Step 3: Fork 上游仓库到用户账号**

Run:
```bash
gh repo fork MocA-Love/claude-code-lark --clone=false --fork-name claude-code-lark
```
Expected: `Created fork <user>/claude-code-lark`。

- [ ] **Step 4: 在本地工作副本接上 fork remote**

Run:
```bash
cd /home/selion/cc-workspace01/claude-code-lark
git remote add origin "https://github.com/<user>/claude-code-lark.git"
git remote rename origin upstream-fork 2>/dev/null || true
git remote -v
```
Expected: 看到指向 `<user>/claude-code-lark` 的 remote。
（确切 remote 名以执行时为准；目标是 push 到用户 fork。）

- [ ] **Step 5: 建工作分支**

Run:
```bash
git checkout -b feat/permission-card
```
Expected: `Switched to a new branch 'feat/permission-card'`。

---

## Task 1: SDK 卡片回调路由验证 spike（最高风险，先做）

**Files:**
- 创建（临时）：`spike-card-callback.ts`

- [ ] **Step 1: 写 spike 脚本**

`spike-card-callback.ts`：起一个最小 WSClient，注册 `card.action.trigger`，并暴露一个一次性触发——脚本启动后用 REST 给自己（已知 chat_id）发一张带 callback 按钮的卡片，然后等待点击事件打印。

```ts
#!/usr/bin/env bun
import * as Lark from '@larksuiteoapi/node-sdk'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

for (const line of readFileSync(join(homedir(), '.claude/channels/lark/.env'), 'utf8').split('\n')) {
  const m = line.match(/^(\w+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const APP_ID = process.env.LARK_APP_ID!, APP_SECRET = process.env.LARK_APP_SECRET!
const DOMAIN = process.env.LARK_DOMAIN ?? 'open.feishu.cn'
const CHAT_ID = process.env.SPIKE_CHAT_ID! // 手动传入一个已配对 DM 的 chat_id

const dispatcher = new Lark.EventDispatcher({}).register({
  'card.action.trigger': (data: any) => {
    console.error('=== CARD CALLBACK RECEIVED ===')
    console.error(JSON.stringify(data, null, 2))
    return { toast: { type: 'success', content: 'got it' } }
  },
})
const ws = new Lark.WSClient({ appId: APP_ID, appSecret: APP_SECRET,
  domain: DOMAIN === 'open.feishu.cn' ? Lark.Domain.Feishu : Lark.Domain.Lark })
ws.start({ eventDispatcher: dispatcher })

// 发一张带 callback 按钮的卡片
const card = {
  config: { wide_screen_mode: true },
  header: { title: { tag: 'plain_text', content: 'spike: 点我' }, template: 'orange' },
  elements: [{ tag: 'action', actions: [
    { tag: 'button', text: { tag: 'plain_text', content: '点击测试' }, type: 'primary',
      value: { action: 'test', request_id: 'spike1' } },
  ] }],
}
const tokenRes = await fetch(`https://${DOMAIN}/open-apis/auth/v3/tenant_access_token/internal`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET }) })
const token = (await tokenRes.json() as any).tenant_access_token
await fetch(`https://${DOMAIN}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ receive_id: CHAT_ID, msg_type: 'interactive', content: JSON.stringify(card) }) })
console.error('card sent — go tap it in Feishu')
```

- [ ] **Step 2: 运行 spike，在飞书点按钮**

Run:
```bash
cd /home/selion/cc-workspace01/claude-code-lark
SPIKE_CHAT_ID=<你的DM chat_id> bun spike-card-callback.ts
```
然后到飞书私聊点「点击测试」按钮。
Expected: 终端 stderr 打印 `=== CARD CALLBACK RECEIVED ===` 及完整 payload（含 `operator.open_id`、`action.value`）。

- [ ] **Step 3: 记录结论 + 决定路径**

- 若收到回调 → 路由 OK，按 Task 2~4 用 `EventDispatcher` 实现，**不需要文本兜底**。
- 若未收到 → 改用 `Lark.CardActionHandler` 自接，或临时启用文本兜底（spec §4）。把实际结论写进 commit message。
记录 payload 中字段实名（`operator.open_id` vs `open_id`、`action.value` 结构、回调响应是否接受 `{toast, card}`），后续 Task 以此为准。

- [ ] **Step 4: 删除 spike，提交结论**

Run:
```bash
rm spike-card-callback.ts
git add -A && git commit -m "chore: verify card.action.trigger routes via WSClient EventDispatcher"
```

---

## Task 2: 声明 permission 能力 + permission_request 通知 handler

**Files:**
- Modify: `server.ts`（capabilities 对象；MCP server 定义后新增 handler）

- [ ] **Step 1: 能力声明加 permission**

把 `server.ts` 中：
```ts
capabilities: { tools: {}, experimental: { 'claude/channel': {} } },
```
改为：
```ts
capabilities: { tools: {}, experimental: { 'claude/channel': {}, 'claude/channel/permission': {} } },
```

- [ ] **Step 2: 引入 zod + 加 pendingPermissions 缓存与通知 handler**

在 `server.ts` 顶部 import 区加：
```ts
import { z } from 'zod'
```
在 `const mcp = new Server(...)` 之后、`mcp.setRequestHandler(ListToolsRequestSchema, ...)` 之前插入：
```ts
// 权限请求详情缓存（供"查看详情"展开），key = request_id
const pendingPermissions = new Map<string, { tool_name: string; description: string; input_preview: string }>()

mcp.setNotificationHandler(
  z.object({
    method: z.literal('notifications/claude/channel/permission_request'),
    params: z.object({
      request_id: z.string(),
      tool_name: z.string(),
      description: z.string(),
      input_preview: z.string(),
    }),
  }),
  async ({ params }) => {
    const { request_id, tool_name, description, input_preview } = params
    pendingPermissions.set(request_id, { tool_name, description, input_preview })
    const access = loadAccess()
    const mapping = loadChatMapping()
    const card = buildPermCard(request_id, tool_name, false)
    // 仅发给白名单 DM；群聊不发（安全约定）
    for (const openId of access.allowFrom) {
      const chatId = mapping.openToChat[openId]
      if (!chatId) continue
      void larkApi('POST', '/im/v1/messages?receive_id_type=chat_id', {
        receive_id: chatId,
        msg_type: 'interactive',
        content: JSON.stringify(card),
      }).catch(e => process.stderr.write(`lark channel: permission card send to ${chatId} failed: ${e}\n`))
    }
  },
)
```

- [ ] **Step 3: 类型检查**

Run:
```bash
cd /home/selion/cc-workspace01/claude-code-lark && bun build server.ts --target=bun > /dev/null && echo OK
```
Expected: `OK`（无类型/语法错误；`buildPermCard`/`handleCardAction` 将在 Task 3 定义，本步若报未定义先继续 Task 3 再统一验证）。

- [ ] **Step 4: 提交**

```bash
git add server.ts && git commit -m "feat: declare claude/channel/permission and forward permission_request as Feishu card"
```

---

## Task 3: 卡片构造 + card.action.trigger handler

**Files:**
- Modify: `server.ts`（新增 `buildPermCard`、`handleCardAction`；`EventDispatcher.register` 加 `card.action.trigger`）

> 字段名以 Task 1 spike 实测 payload 为准；下方按 Feishu 2024+ 卡片回调标准 schema 写。

- [ ] **Step 1: 加 buildPermCard**

在 `server.ts`（`pendingPermissions` 附近）新增：
```ts
function buildPermCard(
  requestId: string,
  toolName: string,
  expanded: boolean,
  detail?: { description: string; input_preview: string },
  outcome?: string,
): any {
  const elements: any[] = []
  if (expanded && detail) {
    let pretty: string
    try { pretty = JSON.stringify(JSON.parse(detail.input_preview), null, 2) }
    catch { pretty = detail.input_preview }
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: `**description**: ${detail.description}` } })
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: '```\n' + pretty + '\n```' } })
  }
  if (outcome) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: outcome } })
  } else {
    const actions: any[] = []
    if (!expanded) actions.push({ tag: 'button', text: { tag: 'plain_text', content: '查看详情' },
      type: 'default', value: { action: 'more', request_id: requestId } })
    actions.push({ tag: 'button', text: { tag: 'plain_text', content: '✅ 允许' },
      type: 'primary', value: { action: 'allow', request_id: requestId } })
    actions.push({ tag: 'button', text: { tag: 'plain_text', content: '❌ 拒绝' },
      type: 'danger', value: { action: 'deny', request_id: requestId } })
    elements.push({ tag: 'action', actions })
  }
  return {
    config: { wide_screen_mode: true },
    header: { title: { tag: 'plain_text', content: `🔐 权限请求：${toolName}` }, template: 'orange' },
    elements,
  }
}
```

- [ ] **Step 2: 加 handleCardAction**

```ts
async function handleCardAction(data: any): Promise<any> {
  // 字段名以 spike 实测为准
  const openId = data.operator?.open_id ?? data.open_id ?? ''
  const value = data.action?.value ?? {}
  const action = value.action as string | undefined
  const requestId = value.request_id as string | undefined
  if (!action || !requestId) return {}

  const access = loadAccess()
  if (!access.allowFrom.includes(openId)) {
    return { toast: { type: 'error', content: '无权限' } }
  }

  if (action === 'more') {
    const d = pendingPermissions.get(requestId)
    if (!d) return { toast: { type: 'warning', content: '详情已过期' } }
    return { card: { type: 'raw', data: buildPermCard(requestId, d.tool_name, true,
      { description: d.description, input_preview: d.input_preview }) } }
  }

  if (action === 'allow' || action === 'deny') {
    void mcp.notification({
      method: 'notifications/claude/channel/permission',
      params: { request_id: requestId, behavior: action },
    })
    const d = pendingPermissions.get(requestId)
    pendingPermissions.delete(requestId)
    const outcome = action === 'allow' ? '✅ 已允许' : '❌ 已拒绝'
    return {
      toast: { type: 'success', content: outcome },
      card: { type: 'raw', data: buildPermCard(requestId, d?.tool_name ?? '', true,
        d ? { description: d.description, input_preview: d.input_preview } : undefined, outcome) },
    }
  }
  return {}
}
```

- [ ] **Step 3: EventDispatcher 注册 card.action.trigger**

把 `server.ts` 中：
```ts
const eventDispatcher = new Lark.EventDispatcher({}).register({
  'im.message.receive_v1': (data: any) => {
    if (data.sender?.sender_type === 'app') return
    handleInbound(data).catch(e =>
      process.stderr.write(`lark: handleInbound failed: ${e}\n`),
    )
  },
})
```
改为（新增 `card.action.trigger`，注意 handler **return** 其结果以回传卡片更新）：
```ts
const eventDispatcher = new Lark.EventDispatcher({}).register({
  'im.message.receive_v1': (data: any) => {
    if (data.sender?.sender_type === 'app') return
    handleInbound(data).catch(e =>
      process.stderr.write(`lark: handleInbound failed: ${e}\n`),
    )
  },
  'card.action.trigger': (data: any) =>
    handleCardAction(data).catch(e => {
      process.stderr.write(`lark: handleCardAction failed: ${e}\n`)
      return {}
    }),
})
```

- [ ] **Step 4: 类型/构建检查**

Run:
```bash
cd /home/selion/cc-workspace01/claude-code-lark && bun build server.ts --target=bun > /dev/null && echo OK
```
Expected: `OK`。

- [ ] **Step 5: 提交**

```bash
git add server.ts && git commit -m "feat: handle card.action.trigger to relay allow/deny and update card"
```

---

## Task 4: 端到端手测

**Files:** 无改动（验证）

- [ ] **Step 1: 清缓存 + 起开发插件**

Run:
```bash
rm -rf ~/.claude/plugins/cache/claude-code-lark/
cd /home/selion/cc-workspace01/claude-code-lark
claude --dangerously-load-development-channels plugin:lark@claude-code-lark
```
确保 `.env` 已配 `LARK_APP_ID/SECRET`，且自己已 `/lark:access pair` 进白名单。

- [ ] **Step 2: 触发一次权限请求**

在该 Claude 会话里让它执行一个需要授权的动作（如运行未授权的 bash 命令）。
Expected: 飞书私聊收到「🔐 权限请求：Bash」卡片，带 查看详情/允许/拒绝 三个按钮。

- [ ] **Step 3: 点「查看详情」**

Expected: 卡片刷新，显示 description + 格式化 input_preview，保留 允许/拒绝。

- [ ] **Step 4: 点「✅ 允许」**

Expected: 终端会话获得放行继续；卡片刷新为「✅ 已允许」且无按钮；toast 成功。

- [ ] **Step 5: 再触发一次，点「❌ 拒绝」**

Expected: 终端会话权限被拒；卡片刷新「❌ 已拒绝」。

- [ ] **Step 6: 安全验证**

- 非白名单飞书用户点按钮 → toast「无权限」，终端无反应。
- 群聊中触发权限 → 群里**不**收卡片。

- [ ] **Step 7: 回归**

普通收发消息、图片、群@、线程回复均正常（随手验证一两条）。

---

## Task 5: 文档、署名与发布

**Files:**
- Create: `NOTICE`
- Modify: `README.md`、`skills/access/SKILL.md`

- [ ] **Step 1: 写 NOTICE**

`NOTICE`：
```
This product includes software developed by MocA-Love
(https://github.com/MocA-Love/claude-code-lark), licensed under Apache-2.0.

Modifications by <你的名字/账号> (2026): added Claude Code permission-request
relay via Feishu/Lark interactive cards (claude/channel/permission).
```

- [ ] **Step 2: README 顶部加 fork 署名 + 新功能**

在 `README.md` 标题下插入一段：
```markdown
> **Fork notice:** Forked from [MocA-Love/claude-code-lark](https://github.com/MocA-Love/claude-code-lark) (Apache-2.0).
> **Added in this fork:** Claude Code permission-request approval over Feishu/Lark
> interactive cards — tap ✅ Allow / ❌ Deny in chat to authorize dangerous operations remotely.
```

- [ ] **Step 3: access SKILL 补一句**

`skills/access/SKILL.md` 在说明处加：权限审批卡片默认发给所有白名单 DM；群聊不发。

- [ ] **Step 4: 提交**

```bash
git add NOTICE README.md skills/access/SKILL.md
git commit -m "docs: attribute upstream fork (Apache-2.0) and document permission card feature"
```

- [ ] **Step 5: 推送到用户 fork**

Run:
```bash
git push -u <fork-remote-name> feat/permission-card
```
Expected: 分支推送成功，gh 返回可建 PR/分支链接。
（是否合并到 fork 的默认分支由用户决定；可直接 `git push <remote> feat/permission-card:main` 或在 GitHub 上 merge。）

- [ ] **Step 6: 验证别的设备可一键装（文档核对）**

确认 `README`/`llms.md` 的安装命令指向用户 fork：
`claude plugin marketplace add <user>/claude-code-lark` → `claude plugin install lark@claude-code-lark`。

---

## Self-Review

- **Spec 覆盖**：§1 能力→Task2S1；§2 发卡片→Task2S2；§3 卡片回调→Task3；§4 文本兜底→Task1S3 决策（仅回调失败时启用）；发布合规→Task5；测试→Task4。全覆盖。
- **占位扫描**：spike 实测字段名、fork remote 名、用户账号为执行期实测/输入值，已显式标注"以执行时为准"，非占位 TODO。
- **类型一致**：`buildPermCard`、`handleCardAction`、`pendingPermissions`、`loadAccess`、`loadChatMapping`、`larkApi`、`mcp.notification` 命名跨 Task 一致；卡片回调响应统一用 `{toast, card:{type:'raw',data}}`。
