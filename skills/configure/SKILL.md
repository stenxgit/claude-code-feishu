---
name: configure
description: Set up the Lark channel — save the app credentials and review access policy. Use when the user asks to configure Lark, provides app credentials, asks "how do I set this up" or "who can reach me," or wants to check channel status.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(ls *)
  - Bash(mkdir *)
---

# /lark:configure — Lark Channel Setup

Writes the Lark app credentials to `~/.claude/channels/lark/.env` and orients the
user on access policy. The server reads the file at boot.

Arguments passed: `$ARGUMENTS`

---

## Dispatch on arguments

### No args — status and guidance

Read both state files and give the user a complete picture:

1. **Credentials** — check `~/.claude/channels/lark/.env` for
   `LARK_APP_ID` and `LARK_APP_SECRET`. Show set/not-set; if set, show first
   4 chars of each, masked.

2. **Domain** — check for `LARK_DOMAIN`. Default is `open.feishu.cn`
   (Feishu, China). For Lark international, it should be `open.larksuite.com`.

3. **Access** — read `~/.claude/channels/lark/access.json` (missing file
   = defaults: `dmPolicy: "pairing"`, empty allowlist). Show:
   - DM policy and what it means in one line
   - Allowed senders: count, and list open_id values
   - Pending pairings: count, with codes
   - Group chats opted in: count
   - Status icons: `ackReaction`/`doneReaction` values (or "off" if unset/empty)

4. **What next** — end with a concrete next step based on state:
   - No credentials → *"Run `/lark:configure <app_id> <app_secret>` with your
     app credentials from the Feishu/Lark Open Platform Developer Console."*
   - Credentials set, policy is pairing, nobody allowed → *"DM your bot on
     Feishu/Lark. It replies with a code; approve with `/lark:access pair <code>`."*
   - Credentials set, someone allowed → *"Ready. DM your bot to reach the
     assistant."*

**Push toward lockdown — always.** Once the IDs are in, pairing has done its
job and should be turned off.

> This channel uses a WebSocket long connection (Lark SDK `WSClient`) — there
> is **no webhook, no public URL, no ngrok, and no encryption key** to set up.
> Just credentials + (optionally) domain.

### `<app_id> <app_secret> [domain]` — save credentials (one-liner)

1. Treat first arg as app_id, second as app_secret (trim whitespace).
   App IDs start with `cli_`. App secrets are alphanumeric strings.
2. Third arg is the optional domain. **Default (omitted) = `open.feishu.cn`**
   (Feishu, China). Pass `open.larksuite.com` for Lark international.
3. `mkdir -p ~/.claude/channels/lark`
4. Read existing `.env` if present; update/add the `LARK_APP_ID=`,
   `LARK_APP_SECRET=`, and `LARK_DOMAIN=` lines, preserve other keys. Write
   back, no quotes. If `LARK_DOMAIN` is already set and no domain arg was
   given, leave it as-is rather than overwriting.
5. **Seed status-icon defaults.** Read `~/.claude/channels/lark/access.json`
   (if missing, start from `{ "dmPolicy": "pairing", "allowFrom": [],
   "groups": {}, "pending": {} }`). If the file has **no** `ackReaction` key,
   add `"ackReaction": "OnIt"`; if it has **no** `doneReaction` key, add
   `"doneReaction": "DONE"`. **Only add a key when it is absent — never
   overwrite an existing value** (an empty string `""` is a deliberate
   "disabled" the user may have set). Write the file back. This gives every
   fresh install the processing→done status indicator (🏃 on receipt, swapped
   to ✅ when the session replies) out of the box.
6. Confirm, then show the no-args status so the user sees where they stand.
   Mention reactions are on by default and can be changed or disabled with
   `/lark:access set ackReaction ""` (and `doneReaction`).

### `domain <domain>` — change API domain only

Set `LARK_DOMAIN` in `.env`. Valid values:
- `open.feishu.cn` (Feishu, China, default)
- `open.larksuite.com` (Lark international)

### `clear` — remove credentials

Delete the `LARK_APP_ID=` and `LARK_APP_SECRET=` lines (or the file if those
are the only lines).

---

## Implementation notes

- The channels dir might not exist if the server hasn't run yet. Missing file
  = not configured, not an error.
- The server reads `.env` once at boot. Credential changes need a session
  restart or `/reload-plugins`. Say so after saving.
- `access.json` is re-read on every inbound message — policy changes via
  `/lark:access` take effect immediately, no restart.
