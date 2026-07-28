/**
 * Inbound access decisions.
 *
 * `evaluateGate` is pure with respect to I/O: it takes the already-loaded
 * access config, mutates it in place when a decision changes state (a new
 * pairing code, a resend counter, an expiry sweep), and reports whether the
 * caller needs to persist it. server.ts owns the load/save.
 */

import type { LarkMention } from './text.ts'

export type PendingEntry = {
  senderId: string
  chatId: string
  createdAt: number
  expiresAt: number
  replies: number
}

export type GroupPolicy = {
  requireMention: boolean
  allowFrom: string[]
}

export type ReplyFormat = 'text' | 'card'

export type Access = {
  dmPolicy: 'pairing' | 'allowlist' | 'disabled'
  allowFrom: string[]
  groups: Record<string, GroupPolicy>
  pending: Record<string, PendingEntry>
  mentionPatterns?: string[]
  ackReaction?: string
  doneReaction?: string
  replyToMode?: 'off' | 'first' | 'all'
  replyFormat?: ReplyFormat
  textChunkLimit?: number
  chunkMode?: 'length' | 'newline'
}

export type GateDecision =
  | { action: 'deliver' }
  | { action: 'drop' }
  | { action: 'pair'; code: string; isResend: boolean; chatId: string }

export type GateContext = {
  senderId: string
  chatId: string
  chatType: string
  text: string
  mentions?: LarkMention[]
  botOpenId: string
  now: number
  /** Injected so tests get deterministic codes. */
  newCode: () => string
}

/** How long a pairing code stays valid. */
export const PAIRING_TTL_MS = 60 * 60 * 1000
/** How many unapproved pairing codes may exist at once. */
export const MAX_PENDING_CODES = 3
/** How many times the bot re-sends the same code before going quiet. */
export const MAX_PAIRING_REPLIES = 2

export function defaultAccess(): Access {
  return { dmPolicy: 'pairing', allowFrom: [], groups: {}, pending: {} }
}

/** Drop expired pairing codes. Returns true when something was removed. */
export function pruneExpired(access: Access, now: number): boolean {
  let changed = false
  for (const [code, p] of Object.entries(access.pending)) {
    if (p.expiresAt < now) {
      delete access.pending[code]
      changed = true
    }
  }
  return changed
}

export function isMentioned(
  text: string,
  botOpenId: string,
  mentions?: LarkMention[],
  extraPatterns?: string[],
): boolean {
  if (botOpenId) {
    for (const m of mentions ?? []) {
      if (m?.id?.open_id === botOpenId) return true
    }
  }
  for (const pat of extraPatterns ?? []) {
    try {
      if (new RegExp(pat, 'i').test(text)) return true
    } catch {
      // A malformed user-supplied regex must not take the channel down.
    }
  }
  return false
}

export function evaluateGate(
  access: Access,
  ctx: GateContext,
): { decision: GateDecision; changed: boolean } {
  let changed = pruneExpired(access, ctx.now)

  if (access.dmPolicy === 'disabled') return { decision: { action: 'drop' }, changed }

  if (ctx.chatType === 'p2p') {
    if (access.allowFrom.includes(ctx.senderId)) {
      return { decision: { action: 'deliver' }, changed }
    }
    if (access.dmPolicy === 'allowlist') return { decision: { action: 'drop' }, changed }

    // Pairing mode — reuse this sender's outstanding code if there is one.
    for (const [code, p] of Object.entries(access.pending)) {
      if (p.senderId !== ctx.senderId) continue
      if ((p.replies ?? 1) >= MAX_PAIRING_REPLIES) {
        return { decision: { action: 'drop' }, changed }
      }
      p.replies = (p.replies ?? 1) + 1
      return {
        decision: { action: 'pair', code, isResend: true, chatId: ctx.chatId },
        changed: true,
      }
    }

    if (Object.keys(access.pending).length >= MAX_PENDING_CODES) {
      return { decision: { action: 'drop' }, changed }
    }

    const code = ctx.newCode()
    access.pending[code] = {
      senderId: ctx.senderId,
      chatId: ctx.chatId,
      createdAt: ctx.now,
      expiresAt: ctx.now + PAIRING_TTL_MS,
      replies: 1,
    }
    return {
      decision: { action: 'pair', code, isResend: false, chatId: ctx.chatId },
      changed: true,
    }
  }

  if (ctx.chatType === 'group') {
    const policy = access.groups[ctx.chatId]
    if (!policy) return { decision: { action: 'drop' }, changed }
    const groupAllowFrom = policy.allowFrom ?? []
    if (groupAllowFrom.length > 0 && !groupAllowFrom.includes(ctx.senderId)) {
      return { decision: { action: 'drop' }, changed }
    }
    if (
      (policy.requireMention ?? true) &&
      !isMentioned(ctx.text, ctx.botOpenId, ctx.mentions, access.mentionPatterns)
    ) {
      return { decision: { action: 'drop' }, changed }
    }
    return { decision: { action: 'deliver' }, changed }
  }

  return { decision: { action: 'drop' }, changed }
}
