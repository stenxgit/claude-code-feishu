import { describe, expect, test } from 'bun:test'
import { join } from 'path'
import { attachmentFileName, safeExtension, safeFileName } from '../lib/attachments.ts'

const INBOX = '/home/user/.claude/channels/lark/inbox'

describe('safeExtension', () => {
  test('accepts a normal extension', () => {
    expect(safeExtension('report.PDF')).toBe('.pdf')
  })

  test('rejects an extension containing separators', () => {
    expect(safeExtension('x.../../../.bashrc')).toBeNull()
  })

  test('rejects dotfiles with no real extension', () => {
    expect(safeExtension('.bashrc')).toBeNull()
    expect(safeExtension('noext')).toBeNull()
  })

  test('rejects absurdly long extensions', () => {
    expect(safeExtension(`a.${'x'.repeat(40)}`)).toBeNull()
  })

  test('takes the basename before looking for a dot', () => {
    expect(safeExtension('a/b/c.png')).toBe('.png')
  })
})

describe('attachmentFileName', () => {
  test('produces a plain basename', () => {
    const name = attachmentFileName(1700000000000, 'img_v2_abc', 'image', 'photo.jpg')
    expect(name).toBe('1700000000000-img_v2_abc.jpg')
  })

  test('a crafted file_name cannot escape the inbox', () => {
    // Regression: the old code took everything after the last dot as the
    // extension, so this name resolved to ~/.bashrc.
    const name = attachmentFileName(1, 'file_v2_abc', 'file', 'x.../../../../.bashrc')
    expect(name).not.toContain('/')
    expect(name).not.toContain('..')
    expect(join(INBOX, name).startsWith(`${INBOX}/`)).toBe(true)
  })

  test('a crafted file_key cannot escape the inbox', () => {
    const name = attachmentFileName(1, '../../../../etc/cron.d/evil', 'file')
    expect(name).not.toContain('/')
    expect(join(INBOX, name).startsWith(`${INBOX}/`)).toBe(true)
  })

  test('never yields a leading dot', () => {
    expect(attachmentFileName(1, '...', 'file').startsWith('1-')).toBe(true)
  })

  test('falls back by type when the name has no usable extension', () => {
    expect(attachmentFileName(1, 'k', 'image')).toBe('1-k.png')
    expect(attachmentFileName(1, 'k', 'file')).toBe('1-k.bin')
  })

  test('caps the key length', () => {
    const name = attachmentFileName(1, 'k'.repeat(200), 'file')
    expect(name.length).toBeLessThan(80)
  })
})

describe('safeFileName', () => {
  test('neutralises characters that break tool output', () => {
    expect(safeFileName('a[b]c\nd;e')).toBe('a_b_c_d_e')
  })
})
