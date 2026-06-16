# claude-code-feishu — LLM Installation Guide

This file is designed for LLMs (Claude Code, Cursor, Windsurf, etc.) to automatically install and configure the Lark/Feishu channel plugin.

Forked from [MocA-Love/claude-code-lark](https://github.com/MocA-Love/claude-code-lark) (Apache-2.0), adding remote permission approval via Feishu interactive cards.

## What this plugin does

Connects a Lark (Larksuite/Feishu) bot to Claude Code via WebSocket long connection. Messages sent to the bot on Lark are forwarded to the Claude Code session, and the assistant can reply back through Lark. When Claude Code requests permission for a dangerous operation, an interactive Allow/Deny card is pushed to allowlisted DMs for remote approval.

## Automated Installation Steps

Run the following commands in order:

### 1. Register the marketplace and install

```bash
claude plugin marketplace add stenxgit/claude-code-feishu
claude plugin install lark@claude-code-feishu
```

### 4. Configure credentials

The user must provide their Lark App ID and App Secret. These are obtained from the [Lark Open Platform Developer Console](https://open.larksuite.com/app).

```bash
mkdir -p ~/.claude/channels/lark
cat > ~/.claude/channels/lark/.env << 'EOF'
LARK_APP_ID=<user_provided_app_id>
LARK_APP_SECRET=<user_provided_app_secret>
EOF
chmod 600 ~/.claude/channels/lark/.env
```

Domain defaults to `open.feishu.cn` (Feishu, China). For Lark international, also add:
```
LARK_DOMAIN=open.larksuite.com
```

### 5. Launch with channel flag

```bash
claude --dangerously-load-development-channels plugin:lark@claude-code-feishu
```

## Lark App Prerequisites (User must do manually)

Before the plugin can work, the user needs to create a Lark app:

1. Go to [Lark Open Platform](https://open.larksuite.com/app) → Create Custom App
2. Enable **Bot** under Features
3. Add permissions: `im:message`, `im:message:readonly`, `im:message:send_as_bot`, `im:message.group_at_msg:readonly`, `im:message.group_msg`, `im:message.p2p_msg:readonly`, `im:resource`, `im:chat`, `im:chat:readonly`
4. Under **Events & Callbacks** → Event/Callback Configuration:
   - Select **"Receive events/callbacks through persistent connection (使用长连接接收事件/回调)"** — this single setting covers both message events and interactive-card button callbacks (`card.action.trigger`), which the permission cards depend on
   - Add event: `im.message.receive_v1`
5. Publish and approve the app version
6. Copy **App ID** (`cli_xxx`) and **App Secret** from Credentials & Basic Info

## After First Launch

Once the channel is running, the user should:

1. DM the bot on Lark → receive a pairing code
2. Run `/lark:access pair <code>` in the Claude Code session
3. Run `/lark:access policy allowlist` to lock down access

## File Structure

```
claude-code-feishu/
├── .claude-plugin/
│   ├── plugin.json          # Plugin metadata
│   └── marketplace.json     # Marketplace definition
├── skills/
│   ├── configure/SKILL.md   # /lark:configure skill
│   ├── access/SKILL.md      # /lark:access skill
│   └── takeover/SKILL.md    # /lark:takeover skill (switch Lark connection between sessions)
├── .mcp.json                # MCP server configuration
├── server.ts                # Main MCP server (Bun + Lark SDK)
├── package.json             # Dependencies
├── ACCESS.md                # Access control documentation
├── README.md                # English documentation
└── README.ja.md             # Japanese documentation
```

## Troubleshooting

| Issue | Solution |
| --- | --- |
| "LARK_APP_ID and LARK_APP_SECRET required" | Set credentials in `~/.claude/channels/lark/.env` |
| Bot doesn't respond to DMs | Check that `im:message.p2p_msg` permission is added and app version is published |
| "chat is not allowlisted" | Run `/lark:access pair <code>` first, or `/lark:access allow <open_id>` |
| WebSocket connection fails | Verify App ID/Secret are correct and the app is published |
| "skipped (another session holds the lock)" | Another Claude Code session already has the Lark connection. Run `/lark:takeover` to switch it to this session |
| `fetch_messages` returns HTTP 400 in groups | Add `im:message.group_msg` permission in Developer Console and republish the app |
