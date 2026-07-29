/**
 * Feishu/Lark interactive card payloads.
 *
 * Two kinds live here: the permission-approval card (this fork's headline
 * feature) and the markdown reply card used when `replyFormat` is `card`.
 */

/** Cards are capped server-side (~30KB of JSON). Stay well under. */
export const CARD_MARKDOWN_LIMIT = 20000

/** A tool's `input_preview` can be arbitrarily large; cards cannot. */
export const PERMISSION_PREVIEW_LIMIT = 2000

export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text
  return `${text.slice(0, limit)}\n… (truncated, ${text.length - limit} more chars)`
}

// ─── Permission card ────────────────────────────────────────────────────────

export type PermissionDetail = {
  toolName: string
  description: string
  inputPreview: string
  /** Working directory of the requesting session — disambiguates multi-session setups. */
  cwd?: string
}

export type PermissionCardOptions = {
  /** Show description + payload rather than just the header. */
  expanded?: boolean
  /** When set, the buttons are replaced by this outcome line. */
  outcome?: string
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function buildPermissionCard(
  requestId: string,
  detail: PermissionDetail,
  opts: PermissionCardOptions = {},
): any {
  const { expanded = false, outcome } = opts
  const elements: any[] = []

  if (detail.cwd) {
    elements.push({
      tag: 'div',
      text: { tag: 'lark_md', content: `📁 \`${detail.cwd}\`` },
    })
  }

  if (expanded) {
    if (detail.description) {
      elements.push({
        tag: 'div',
        text: { tag: 'lark_md', content: `**说明**: ${detail.description}` },
      })
    }
    const payload = truncate(prettyJson(detail.inputPreview), PERMISSION_PREVIEW_LIMIT)
    if (payload) {
      elements.push({ tag: 'div', text: { tag: 'lark_md', content: '```\n' + payload + '\n```' } })
    }
  }

  if (outcome) {
    elements.push({ tag: 'div', text: { tag: 'lark_md', content: outcome } })
  } else {
    const actions: any[] = []
    if (!expanded) {
      actions.push({
        tag: 'button',
        text: { tag: 'plain_text', content: '查看详情' },
        type: 'default',
        value: { action: 'more', request_id: requestId },
      })
    }
    actions.push({
      tag: 'button',
      text: { tag: 'plain_text', content: '✅ 允许' },
      type: 'primary',
      value: { action: 'allow', request_id: requestId },
    })
    actions.push({
      tag: 'button',
      text: { tag: 'plain_text', content: '❌ 拒绝' },
      type: 'danger',
      value: { action: 'deny', request_id: requestId },
    })
    elements.push({ tag: 'action', actions })
  }

  return {
    // update_multi: true is required for the card to be updatable by the
    // card.action.trigger callback response (verified via spike 2026-06-16).
    config: { wide_screen_mode: true, update_multi: true },
    header: {
      title: { tag: 'plain_text', content: `🔐 权限请求：${detail.toolName}` },
      template: outcome ? 'grey' : 'orange',
    },
    elements,
  }
}

// ─── Markdown reply card ────────────────────────────────────────────────────

/**
 * Nudge assistant-flavoured markdown toward what Feishu's card renderer
 * actually supports. Deliberately minimal — anything Feishu doesn't render is
 * shown verbatim, which is no worse than the plain-text path it replaces.
 */
export function normalizeMarkdown(text: string): string {
  return text
    // Task lists render as literal "[ ]" in Feishu; use box glyphs instead.
    .replace(/^(\s*[-*+]\s+)\[ \]\s+/gm, '$1☐ ')
    .replace(/^(\s*[-*+]\s+)\[[xX]\]\s+/gm, '$1☑ ')
}

/**
 * Wrap markdown in a minimal interactive card.
 *
 * The `schema: '2.0'` line is what makes markdown render. Feishu's docs are
 * explicit: headings, blockquotes, inline quotes, tables and inline code are
 * "只支持在 JSON 2.0 结构的富文本组件中使用". Under the 1.0 structure (top-level
 * `elements`, no `schema`) the very same `tag: 'markdown'` component renders
 * those as raw source — "## title", "> quote", "| a | b |" — while bold,
 * lists and code fences work. Verified against live cards on 2026-07-29.
 *
 * `width_mode` is 2.0's spelling of 1.0's `wide_screen_mode`.
 */
export function buildMarkdownCard(text: string): any {
  return {
    schema: '2.0',
    config: { width_mode: 'fill' },
    body: {
      elements: [
        { tag: 'markdown', content: truncate(normalizeMarkdown(text), CARD_MARKDOWN_LIMIT) },
      ],
    },
  }
}

/**
 * True when the text contains markup that plain text would mangle. Used to
 * skip the card round-trip for one-line acknowledgements.
 */
export function looksLikeMarkdown(text: string): boolean {
  return /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+\.\s|>\s)|```|\*\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|\|.*\|/.test(
    text,
  )
}
