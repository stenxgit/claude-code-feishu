# Lark(Larksuite / 飞书)

[English](./README.md)

通过 MCP 服务器把飞书 / Lark 机器人接入你的 Claude Code。

当机器人收到消息时,MCP 服务器会把消息转发给 Claude,并提供回复、表情回应、编辑消息等工具。同时支持 **Lark**(国际版)和 **飞书**(中国版)。

> **Fork 说明:** 本仓库 fork 自 [MocA-Love/claude-code-lark](https://github.com/MocA-Love/claude-code-lark)(Apache-2.0)。详见 [NOTICE](./NOTICE)。
>
> **本 fork 新增——远程权限审批:** 当 Claude Code 请求执行危险操作的权限时,本插件会向白名单内的私聊推送一张飞书 / Lark **交互卡片**。直接在聊天里点 **✅ 允许** 或 **❌ 拒绝** 即可远程授权,无需切回终端。(声明了 `claude/channel/permission` MCP 能力;出于安全考虑,群聊不参与审批。)

## 给 LLM 的说明

如果你是协助用户安装本插件的 AI 助手,请参阅 [llms.md](./llms.md) 获取自动化安装指引。

## 前置条件

- [Bun](https://bun.sh) —— MCP 服务器运行在 Bun 上。安装命令:`curl -fsSL https://bun.sh/install | bash`。

## 快速配置

> 以下是单用户私聊机器人的默认配对流程。群聊和多用户配置见 [ACCESS.md](./ACCESS.md)。

**1. 创建飞书 / Lark 应用和机器人。**

前往 [飞书开放平台](https://open.feishu.cn/app)(国际版用 [Lark Open Platform](https://open.larksuite.com/app)),点击 **创建企业自建应用**,起一个名字。

进入 **添加应用能力** → **机器人**,开启机器人能力。

**2. 配置权限。**

进入 **权限管理**,添加以下权限:

- `im:message` —— 读取与发送单聊及群聊消息
- `im:message:readonly` —— 读取单聊及群聊消息
- `im:message:send_as_bot` —— 以应用身份发送消息
- `im:message.group_at_msg:readonly` —— 获取群聊中@机器人的消息
- `im:message.group_msg` —— 读取群聊中的所有消息(群聊中使用 `fetch_messages` 必需)
- `im:message.p2p_msg:readonly` —— 获取用户发给机器人的单聊消息
- `im:resource` —— 读取与上传图片或其他文件
- `im:chat` —— 获取与更新群信息
- `im:chat:readonly` —— 获取群信息

创建版本并发布上线(企业自建应用需管理员审批)。

**3. 开启事件订阅。**

进入 **事件与回调** → **事件配置**:
- 选择 **"使用长连接接收事件"**(推荐)
- 点击 **添加事件**,添加:`im.message.receive_v1`(接收消息)
- 保存

无需公网 URL、加密或 webhook 配置——SDK 通过 WebSocket 处理一切。

**4. 获取应用凭证。**

进入 **凭证与基础信息**,复制 **App ID** 和 **App Secret**。

**5. 安装插件。**

```bash
claude plugin marketplace add stenxgit/claude-code-feishu
claude plugin install lark@claude-code-feishu
```

**6. 把凭证交给服务器。**

```
/lark:configure cli_xxxx your_app_secret_here
```

这会把 `LARK_APP_ID=...` 和 `LARK_APP_SECRET=...` 写入 `~/.claude/channels/lark/.env`。

**7. 带通道参数重启。**

退出当前会话,启动新会话:

```sh
claude --dangerously-load-development-channels plugin:lark@claude-code-feishu
```

> **为什么要加 `--dangerously-load-development-channels`?** Claude Code 只会给位于内置 *approved channels(已批准通道)* 名单里的通道插件注入入站消息。本 fork 不是官方插件,不在该名单内——不加这个参数时 MCP 工具照样会加载(能发消息),但 **入站消息会被静默丢弃**(收不到消息)。这个参数把本插件显式纳入。每次启动都要带;`settings.json` 没有等价开关。

**8. 配对。**

Claude Code 运行后,在飞书 / Lark 上私聊你的机器人——它会回复一个配对码。在 Claude Code 会话中:

```
/lark:access pair <code>
```

之后你的私聊消息就能到达助手了。

**9. 锁定权限。**

配对只是为了捕获 ID。进来之后,切换到 `allowlist`:

```
/lark:access policy allowlist
```

## 域名(飞书 vs Lark 国际版)

域名 **默认是 `open.feishu.cn`(飞书,中国)**——用飞书无需额外步骤。

如果用 Lark 国际版,在配置时把域名作为可选的第三个参数传入:

```
/lark:configure cli_xxxx your_app_secret open.larksuite.com
```

或之后单独修改:

```
/lark:configure domain open.larksuite.com
```

## 访问控制

私聊策略、群聊、@提及检测、投递配置、技能命令以及 `access.json` 结构详见 **[ACCESS.md](./ACCESS.md)**。

速查:ID 是 Lark 的 **open_id**(如 `ou_xxxx`,用于用户)和 **chat_id**(如 `oc_xxxx`,用于会话)。默认策略是 `pairing`。群聊需按 chat_id 逐个开启。

## 回复渲染

飞书纯文本消息不解析 markdown——`**加粗**`、`#` 标题、列表、代码块都会原样显示成字符,而助手的输出恰恰几乎全是 markdown。把 `replyFormat` 设为 `card`,含 markdown 的回复就改用交互卡片发送,由飞书正常渲染:

```
/lark:access set replyFormat card
```

全新安装时 `/lark:configure` 会自动写入 `card`;已有安装保持 `text` 不变,直到你手动切换。两种模式下纯散文(比如"好的,已完成")仍走纯文本消息;若卡片被飞书拒绝,回复会自动降级重发为文本,不会丢失。

## 远程权限审批

这是本 fork 在上游基础上新增的功能。当 Claude Code 需要你批准某个危险操作(未在白名单内的 shell 命令、写文件等)时,它不再卡在终端等待,而是向你与机器人的私聊推送一张**交互卡片**——于是你在任何地方都能授权,包括手机上。

**你会看到:** 一张卡片,显示工具名、发起请求的会话所在工作目录,以及三个按钮:

- **查看详情** —— 展开说明和完整的请求内容
- **✅ 允许** —— 批准这一次操作
- **❌ 拒绝** —— 拒绝它

点击按钮后卡片会就地刷新显示结果;你的决定直接回传给正在等待的 Claude Code 会话。

**工作原理:** 插件声明了 `claude/channel/permission` MCP 能力。收到 `notifications/claude/channel/permission_request` 时,它把卡片发给每个白名单内的私聊。按钮点击以 `card.action.trigger` 事件到达(与消息走同一条 WebSocket),插件再用 `notifications/claude/channel/permission` 回传 `{request_id, behavior}`。

**配置:** 除上面的步骤外无需额外设置。第 3 步的长连接事件订阅同时覆盖卡片回调——不需要单独的 webhook 或回调 URL。(卡片用了 `update_multi: true`,所以点击后能就地刷新。)

**安全:** 卡片只发给白名单内的私聊。**群聊被排除在外**——审批永远不会发到群里,且只有白名单里的 `open_id` 能操作。

**一个请求只结算一次。** 白名单里有多人时每人都会收到卡片,但只有第一次点击生效。结论只会回传给 Claude Code 一次,其余各端的同一张卡片会被就地更新成"已由他人处理",不会让人对着一个已经定案的请求继续点按钮。15 分钟内无人处理的请求,卡片会被标记为超时(这类请回终端处理)。

**是哪个会话在请求?** 卡片上会显示发起会话的工作目录。如果你同时在多个项目里跑 Claude Code,靠这一行区分。

## 暴露给助手的工具

| 工具 | 用途 |
| --- | --- |
| `reply` | 向某个会话发送消息。需要 `chat_id` + `text`,可选 `reply_to`(message_id,用于线程回复)和 `files`(绝对路径,用于附件)。图片以 Lark 图片消息发送,其他文件以文档发送。自动分块;返回已发送消息的 ID。 |
| `react` | 给任意消息(按 ID)添加表情回应。使用 Lark 表情类型名(THUMBSUP、HEART、SMILE 等)。 |
| `edit_message` | 编辑机器人此前发送的消息。仅对机器人自己的消息有效;文本消息和卡片都支持。 |
| `fetch_messages` | 拉取某会话的近期历史(由旧到新)。每次最多 50 条。每行包含消息 ID。 |
| `download_attachment` | 按消息 ID 把图片或文件下载到 `~/.claude/channels/lark/inbox/`。返回文件路径 + 元数据。 |

## 环境变量

均设置在 `~/.claude/channels/lark/.env`:

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `LARK_APP_ID` | 是 | 开发者后台的 App ID(以 `cli_` 开头) |
| `LARK_APP_SECRET` | 是 | 开发者后台的 App Secret |
| `LARK_DOMAIN` | 否 | API 域名。默认:`open.feishu.cn`(飞书)。Lark 国际版用 `open.larksuite.com`。 |
| `LARK_ACCESS_MODE` | 否 | 设为 `static` 可在启动时冻结访问配置。 |

该文件的解析是宽松的:CRLF 换行、`export FOO=bar`、`#` 注释、带引号的值都能正确读取。

## 架构

```
用户(Lark) → Lark 云 ←WebSocket→ Lark SDK (WSClient)
                                       ↓
                                 MCP 服务器 ←stdio→ Claude Code
                                       ↓
                                 Lark REST API → 用户(Lark)
```

无需公网 URL。SDK 与 Lark 服务器之间维持一条持久 WebSocket 连接。

## 多会话与 `/lark:takeover`

同一时刻只有一个 Claude Code 会话能接收 Lark 消息。插件用一个锁文件(`~/.claude/channels/lark/ws.lock`)保证 WebSocket 连接独占——最先启动的会话拿到锁,其他会话跳过连接。

要把 Lark 连接切换到另一个会话,在目标会话中运行:

```
/lark:takeover
```

查看哪些会话在运行、谁持有锁:

```
/lark:takeover status
```

每个插件进程会把自己注册到 `~/.claude/channels/lark/sessions/`,记录 PID、工作目录和启动时间。takeover 技能读取这个注册表来即时识别会话——无需遍历进程树。

上一个会话会在约 3 秒内释放连接,当前会话随即接管。这在你想用手机通过 Lark 继续工作时很有用——切换到你正在处理的会话,Lark 消息就会带着完整上下文到达它。

### 僵尸连接

如果一个会话被 `kill -9`(SIGKILL)杀掉,锁文件和会话文件可能变成陈旧残留。其他会话会自动检测死进程并清理。你也可以手动清理:

```bash
# 列出正在运行的 Lark 插件进程
ps aux | grep "bun.*server.ts" | grep -v grep

# 杀掉僵尸进程
kill <pid>
```

## 升级

已安装的插件锁定在你安装时的版本——本仓库有了新提交,不会自动到达已有安装。要拉取新版本:

```bash
claude plugin marketplace update claude-code-feishu
claude plugin update lark@claude-code-feishu
```

然后 **重启 Claude Code 会话**(照旧带上 `--dangerously-load-development-channels`)。更新不会作用于正在运行的会话。

如果新行为仍然没出现,清掉插件缓存再重启一次:

```bash
rm -rf ~/.claude/plugins/cache/claude-code-feishu/
```

**新增配置项不会追溯启用。** `/lark:configure` 只在 `access.json` 里**缺少**某个键时才写入投递默认值(`ackReaction`、`doneReaction`、`replyFormat`),绝不覆盖你已有的值。这保证升级不会在你不知情的情况下改变行为——但也意味着你首次配置之后才引入的设置项会一直处于关闭状态,直到你手动打开。查看当前状态:

```
/lark:configure
```

其中显示为未设置的项,都可以用 `/lark:access set <key> <value>` 开启。最典型的是:在 `replyFormat` 出现之前创建的安装会一直用纯文本回复,直到你执行 `/lark:access set replyFormat card`。

## 开发

### 目录结构

```
server.ts    MCP 服务器:所有 I/O、状态、Lark SDK 接线、工具处理
lib/         纯函数,不做 I/O —— 有单元测试覆盖
  env.ts           .env 解析
  text.ts          消息体解析、出站分块
  gate.ts          入站访问决策
  attachments.ts   附件文件名净化
  cards.ts         交互卡片结构
tests/       bun test 测试,按 lib 模块一一对应
skills/      /lark:configure、/lark:access、/lark:takeover
```

### 检查

```bash
bun install
bun run check      # 类型检查 + 测试
bun test
bun run typecheck
```

CI 会在每次 push 和 PR 上跑这两项。

### 插件缓存

Claude Code 把已安装插件缓存在 `~/.claude/plugins/cache/`。本地开发时,对源文件的修改 **不会自动生效**——这时没有 `claude plugin update` 这一步可跑,因为你的工作副本就是源。每次改动后清除缓存:

```bash
rm -rf ~/.claude/plugins/cache/claude-code-feishu/
```

然后重启 Claude Code 会话。(如果你是使用者而非贡献者,请看 [升级](#升级) 一节。)

## 许可证

Apache-2.0
