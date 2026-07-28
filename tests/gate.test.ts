import { describe, expect, test } from 'bun:test'
import {
  MAX_PAIRING_REPLIES,
  MAX_PENDING_CODES,
  PAIRING_TTL_MS,
  defaultAccess,
  evaluateGate,
  isMentioned,
  pruneExpired,
  type Access,
} from '../lib/gate.ts'

const NOW = 1_700_000_000_000
const BOT = 'ou_bot'

function ctx(over: Partial<Parameters<typeof evaluateGate>[1]> = {}) {
  return {
    senderId: 'ou_alice',
    chatId: 'oc_dm',
    chatType: 'p2p',
    text: 'hello',
    mentions: undefined,
    botOpenId: BOT,
    now: NOW,
    newCode: () => 'code01',
    ...over,
  }
}

describe('DM policies', () => {
  test('allowlisted sender is delivered', () => {
    const access: Access = { ...defaultAccess(), allowFrom: ['ou_alice'] }
    expect(evaluateGate(access, ctx()).decision.action).toBe('deliver')
  })

  test('disabled drops even an allowlisted sender', () => {
    const access: Access = { ...defaultAccess(), dmPolicy: 'disabled', allowFrom: ['ou_alice'] }
    expect(evaluateGate(access, ctx()).decision.action).toBe('drop')
  })

  test('allowlist policy drops an unknown sender silently', () => {
    const access: Access = { ...defaultAccess(), dmPolicy: 'allowlist' }
    const { decision, changed } = evaluateGate(access, ctx())
    expect(decision.action).toBe('drop')
    expect(changed).toBe(false)
  })

  test('pairing mints a code and asks the caller to persist', () => {
    const access = defaultAccess()
    const { decision, changed } = evaluateGate(access, ctx())
    expect(decision).toMatchObject({ action: 'pair', code: 'code01', isResend: false })
    expect(changed).toBe(true)
    expect(access.pending.code01).toMatchObject({
      senderId: 'ou_alice',
      chatId: 'oc_dm',
      expiresAt: NOW + PAIRING_TTL_MS,
      replies: 1,
    })
  })

  test('a second message reuses the same code and marks it a resend', () => {
    const access = defaultAccess()
    evaluateGate(access, ctx())
    const { decision } = evaluateGate(access, ctx({ newCode: () => 'other' }))
    expect(decision).toMatchObject({ action: 'pair', code: 'code01', isResend: true })
    expect(Object.keys(access.pending)).toEqual(['code01'])
  })

  test('the bot goes quiet after the reply cap', () => {
    const access = defaultAccess()
    for (let i = 0; i < MAX_PAIRING_REPLIES; i++) evaluateGate(access, ctx())
    expect(evaluateGate(access, ctx()).decision.action).toBe('drop')
  })

  test('pending codes are capped', () => {
    const access = defaultAccess()
    for (let i = 0; i < MAX_PENDING_CODES; i++) {
      evaluateGate(access, ctx({ senderId: `ou_${i}`, newCode: () => `c${i}` }))
    }
    const { decision } = evaluateGate(access, ctx({ senderId: 'ou_late', newCode: () => 'late' }))
    expect(decision.action).toBe('drop')
    expect(access.pending.late).toBeUndefined()
  })

  test('an expired code frees a slot and is swept', () => {
    const access = defaultAccess()
    evaluateGate(access, ctx())
    const later = NOW + PAIRING_TTL_MS + 1
    const { decision } = evaluateGate(access, ctx({ now: later, newCode: () => 'fresh' }))
    expect(access.pending.code01).toBeUndefined()
    expect(decision).toMatchObject({ action: 'pair', code: 'fresh', isResend: false })
  })
})

describe('group policies', () => {
  const withGroup = (over: Partial<{ requireMention: boolean; allowFrom: string[] }> = {}): Access => ({
    ...defaultAccess(),
    groups: { oc_team: { requireMention: true, allowFrom: [], ...over } },
  })

  test('an unlisted group is dropped', () => {
    const c = ctx({ chatType: 'group', chatId: 'oc_other' })
    expect(evaluateGate(withGroup(), c).decision.action).toBe('drop')
  })

  test('requireMention drops an unmentioned message', () => {
    const c = ctx({ chatType: 'group', chatId: 'oc_team' })
    expect(evaluateGate(withGroup(), c).decision.action).toBe('drop')
  })

  test('a structured @bot mention passes', () => {
    const c = ctx({
      chatType: 'group',
      chatId: 'oc_team',
      mentions: [{ key: '@_user_1', id: { open_id: BOT }, name: 'bot' }],
    })
    expect(evaluateGate(withGroup(), c).decision.action).toBe('deliver')
  })

  test('--no-mention delivers everything', () => {
    const c = ctx({ chatType: 'group', chatId: 'oc_team' })
    expect(evaluateGate(withGroup({ requireMention: false }), c).decision.action).toBe('deliver')
  })

  test('a per-group allowlist excludes other members', () => {
    const access = withGroup({ requireMention: false, allowFrom: ['ou_bob'] })
    const c = ctx({ chatType: 'group', chatId: 'oc_team' })
    expect(evaluateGate(access, c).decision.action).toBe('drop')
  })

  test('an unknown chat type is dropped', () => {
    expect(evaluateGate(defaultAccess(), ctx({ chatType: 'topic' })).decision.action).toBe('drop')
  })
})

describe('isMentioned', () => {
  test('matches a configured regex, case-insensitively', () => {
    expect(isMentioned('hey CLAUDE', BOT, undefined, ['@?claude'])).toBe(true)
  })

  test('a malformed regex does not throw', () => {
    expect(() => isMentioned('x', BOT, undefined, ['(unclosed'])).not.toThrow()
    expect(isMentioned('x', BOT, undefined, ['(unclosed'])).toBe(false)
  })

  test('another user mention is not a bot mention', () => {
    const mentions = [{ key: '@_user_1', id: { open_id: 'ou_someone' }, name: 'x' }]
    expect(isMentioned('hi', BOT, mentions)).toBe(false)
  })
})

describe('pruneExpired', () => {
  test('reports whether anything changed', () => {
    const access = defaultAccess()
    expect(pruneExpired(access, NOW)).toBe(false)
    access.pending.old = { senderId: 'a', chatId: 'b', createdAt: 0, expiresAt: NOW - 1, replies: 1 }
    expect(pruneExpired(access, NOW)).toBe(true)
    expect(access.pending.old).toBeUndefined()
  })
})
