import { describe, expect, test } from 'bun:test'
import {
  CARD_MARKDOWN_LIMIT,
  PERMISSION_PREVIEW_LIMIT,
  buildMarkdownCard,
  buildPermissionCard,
  looksLikeMarkdown,
  normalizeMarkdown,
  truncate,
} from '../lib/cards.ts'

const detail = {
  toolName: 'Bash',
  description: 'run a command',
  inputPreview: '{"command":"rm -rf /tmp/x"}',
  cwd: '/home/user/project',
}

function findActions(card: any): any[] {
  return card.elements.find((e: any) => e.tag === 'action')?.actions ?? []
}

function cardText(card: any): string {
  return JSON.stringify(card)
}

describe('truncate', () => {
  test('leaves short text alone', () => {
    expect(truncate('abc', 10)).toBe('abc')
  })

  test('marks what was cut', () => {
    const out = truncate('x'.repeat(50), 10)
    expect(out.startsWith('x'.repeat(10))).toBe(true)
    expect(out).toContain('40 more chars')
  })
})

describe('buildPermissionCard', () => {
  test('collapsed card offers details, allow and deny', () => {
    const actions = findActions(buildPermissionCard('r1', detail))
    expect(actions.map((a: any) => a.value.action)).toEqual(['more', 'allow', 'deny'])
    expect(actions.every((a: any) => a.value.request_id === 'r1')).toBe(true)
  })

  test('collapsed card hides the payload', () => {
    expect(cardText(buildPermissionCard('r1', detail))).not.toContain('rm -rf')
  })

  test('expanded card shows description and payload but drops the details button', () => {
    const card = buildPermissionCard('r1', detail, { expanded: true })
    expect(cardText(card)).toContain('rm -rf')
    expect(findActions(card).map((a: any) => a.value.action)).toEqual(['allow', 'deny'])
  })

  test('the working directory is shown so multi-session users can tell sessions apart', () => {
    expect(cardText(buildPermissionCard('r1', detail))).toContain('/home/user/project')
  })

  test('an outcome replaces every button', () => {
    const card = buildPermissionCard('r1', detail, { expanded: true, outcome: '✅ 已允许' })
    expect(findActions(card)).toEqual([])
    expect(cardText(card)).toContain('已允许')
    expect(card.header.template).toBe('grey')
  })

  test('an oversized payload is truncated so the card can still be sent', () => {
    const big = { ...detail, inputPreview: 'y'.repeat(50_000) }
    const card = buildPermissionCard('r1', big, { expanded: true })
    expect(cardText(card).length).toBeLessThan(PERMISSION_PREVIEW_LIMIT * 3)
  })

  test('a non-JSON payload is passed through rather than dropped', () => {
    const card = buildPermissionCard('r1', { ...detail, inputPreview: 'plain text' }, { expanded: true })
    expect(cardText(card)).toContain('plain text')
  })

  test('update_multi stays on — the callback cannot update the card without it', () => {
    expect(buildPermissionCard('r1', detail).config.update_multi).toBe(true)
  })
})

describe('looksLikeMarkdown', () => {
  test.each([
    ['# Heading', true],
    ['- bullet', true],
    ['1. ordered', true],
    ['**bold**', true],
    ['```\ncode\n```', true],
    ['`inline`', true],
    ['[link](https://x)', true],
    ['> quote', true],
    ['| a | b |', true],
    ['ok, done', false],
    ['Deployed to staging.', false],
  ])('%p → %p', (input, expected) => {
    expect(looksLikeMarkdown(input as string)).toBe(expected)
  })
})

describe('normalizeMarkdown', () => {
  test('renders task lists as box glyphs', () => {
    expect(normalizeMarkdown('- [ ] todo\n- [x] done')).toBe('- ☐ todo\n- ☑ done')
  })

  test('leaves markdown Feishu renders on its own untouched', () => {
    const ok = '## Title\n\n> quote\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n`inline`'
    expect(normalizeMarkdown(ok)).toBe(ok)
  })
})

describe('buildMarkdownCard', () => {
  test('wraps content in a markdown element', () => {
    const card = buildMarkdownCard('## Hi')
    expect(card.body.elements[0]).toEqual({ tag: 'markdown', content: '## Hi' })
  })

  // Headings, blockquotes, tables and inline code only render under 2.0. Drop
  // this and the card silently regresses to showing markdown source.
  test('declares schema 2.0 — 1.0 renders headings and tables as raw source', () => {
    const card = buildMarkdownCard('## Hi')
    expect(card.schema).toBe('2.0')
    expect(card.elements).toBeUndefined()
  })

  test('caps content at the card limit', () => {
    const card = buildMarkdownCard('z'.repeat(CARD_MARKDOWN_LIMIT + 5000))
    expect(card.body.elements[0].content.length).toBeLessThan(CARD_MARKDOWN_LIMIT + 100)
  })
})
