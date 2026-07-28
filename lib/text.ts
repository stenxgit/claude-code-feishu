/**
 * Message-body parsing and outbound text chunking.
 *
 * Pure functions only — no I/O, no Lark SDK. Kept out of server.ts so the
 * message-type matrix (22 inbound types) can be exercised by unit tests.
 */

export type LarkMention = {
  key: string
  id: { open_id?: string; user_id?: string; union_id?: string }
  name: string
}

export type ChunkMode = 'length' | 'newline'

/**
 * Split `text` into pieces no longer than `limit`.
 *
 * `newline` mode prefers a paragraph break, then a line break, then a space,
 * but only when the break lands past the halfway mark — otherwise a single
 * early newline would produce a stream of tiny chunks.
 */
export function chunk(text: string, limit: number, mode: ChunkMode): string[] {
  if (limit < 1) throw new Error('chunk limit must be >= 1')
  if (text.length <= limit) return [text]
  const out: string[] = []
  let rest = text
  while (rest.length > limit) {
    let cut = limit
    if (mode === 'newline') {
      const para = rest.lastIndexOf('\n\n', limit)
      const line = rest.lastIndexOf('\n', limit)
      const space = rest.lastIndexOf(' ', limit)
      cut = para > limit / 2 ? para : line > limit / 2 ? line : space > 0 ? space : limit
    }
    out.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\n+/, '')
  }
  if (rest) out.push(rest)
  return out
}

function postBodyToText(content: any): string {
  const title = content.title ?? ''
  const body = ((content.content as any[][]) ?? [])
    .map((para: any[]) =>
      (para ?? [])
        .map((node: any) => {
          if (node.tag === 'text') return node.text ?? ''
          if (node.tag === 'a') return `[${node.text ?? ''}](${node.href ?? ''})`
          if (node.tag === 'at') return `@${node.user_name ?? node.user_id ?? ''}`
          if (node.tag === 'img') return '(image)'
          if (node.tag === 'code_block') return `\`\`\`\n${node.text ?? ''}\n\`\`\``
          if (node.tag === 'md') return node.text ?? ''
          return ''
        })
        .join(''),
    )
    .join('\n')
  return title ? `${title}\n${body}` : body
}

/**
 * Card bodies come in two shapes: the v1 `elements` array (which may hold
 * either nodes or arrays of nodes) and the v2 `body.elements` array. Walk
 * whatever is there and collect any text-bearing node.
 */
function cardToText(content: any): string {
  const title = content.title ?? content.header?.title?.content ?? ''
  const roots = content.elements ?? content.body?.elements ?? []
  const parts: string[] = []
  const visit = (node: any): void => {
    if (node == null) return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (typeof node !== 'object') return
    if (typeof node.content === 'string') parts.push(node.content)
    else if (typeof node.text === 'string') parts.push(node.text)
    else if (node.text && typeof node.text.content === 'string') parts.push(node.text.content)
    if (node.elements) visit(node.elements)
    if (node.actions) visit(node.actions)
  }
  visit(roots)
  const body = parts.filter(Boolean).join('\n')
  return title ? `${title}\n${body}`.trim() : body || '(card message)'
}

/** Render any inbound Lark message body as plain text for the transcript. */
export function extractTextContent(msgType: string, contentStr: string): string {
  try {
    const content = JSON.parse(contentStr)
    switch (msgType) {
      case 'text':
        return content.text ?? ''
      case 'post':
        return postBodyToText(content)
      case 'image':
        return '(image)'
      case 'file':
        return `(file: ${content.file_name ?? 'unknown'})`
      case 'audio':
        return '(audio)'
      case 'media':
        return '(video)'
      case 'sticker':
        return '(sticker)'
      case 'interactive':
        return cardToText(content)
      case 'merge_forward':
        return '(forwarded messages)'
      case 'share_chat':
        return `(shared group: ${content.chat_id ?? 'unknown'})`
      case 'share_user':
        return `(shared user: ${content.user_id ?? 'unknown'})`
      case 'system':
        return `(system: ${content.template || 'notification'})`
      case 'location':
        return `(location: ${content.name ?? ''} lat:${content.latitude ?? ''} lon:${content.longitude ?? ''})`
      case 'todo': {
        let todoTitle = content.summary?.title ?? ''
        if (!todoTitle && content.summary?.content) {
          todoTitle = (content.summary.content as any[][])
            .flat()
            .filter((n: any) => n?.tag === 'text')
            .map((n: any) => n.text ?? '')
            .join('')
        }
        return `(todo: ${todoTitle || (content.task_id ?? 'task')})`
      }
      case 'vote':
        return `(vote: ${content.topic ?? 'poll'})`
      case 'hongbao':
        return `(hongbao: ${content.text ?? 'red envelope'})`
      case 'share_calendar_event':
      case 'calendar':
      case 'general_calendar':
        return `(calendar: ${content.summary ?? 'event'})`
      case 'video_chat':
        return `(video chat: ${content.topic ?? ''})`
      case 'folder':
        return `(shared folder: ${content.file_name ?? ''})`
      default:
        return `(${msgType})`
    }
  } catch {
    return contentStr
  }
}

/** Pull an image_key out of an `image` message or a `post` with an inline image. */
export function extractImageKey(msgType: string, contentStr: string): string | undefined {
  try {
    const content = JSON.parse(contentStr)
    if (msgType === 'image') return content.image_key
    if (msgType === 'post' && content.content) {
      for (const para of content.content as any[][]) {
        for (const node of para ?? []) {
          if (node?.tag === 'img' && node.image_key) return node.image_key
        }
      }
    }
  } catch {}
  return undefined
}

/** Replace `@_user_N` placeholders with the display names from `mentions`. */
export function resolveMentions(text: string, mentions?: LarkMention[]): string {
  if (!mentions || mentions.length === 0) return text
  let resolved = text
  for (const m of mentions) {
    if (m?.key) resolved = resolved.replaceAll(m.key, `@${m.name}`)
  }
  return resolved
}
