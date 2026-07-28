import { describe, expect, test } from 'bun:test'
import { parseEnvFile } from '../lib/env.ts'

describe('parseEnvFile', () => {
  test('parses plain assignments', () => {
    expect(parseEnvFile('LARK_APP_ID=cli_abc\nLARK_APP_SECRET=s3cret')).toEqual({
      LARK_APP_ID: 'cli_abc',
      LARK_APP_SECRET: 's3cret',
    })
  })

  test('strips CRLF line endings', () => {
    // A .env saved on Windows used to leave \r inside the secret, which Lark
    // rejects with an opaque credential error.
    const parsed = parseEnvFile('LARK_APP_ID=cli_abc\r\nLARK_APP_SECRET=s3cret\r\n')
    expect(parsed.LARK_APP_SECRET).toBe('s3cret')
    expect(parsed.LARK_APP_SECRET).not.toContain('\r')
  })

  test('strips matching quotes', () => {
    expect(parseEnvFile('A="dq"\nB=\'sq\'').A).toBe('dq')
    expect(parseEnvFile('A="dq"\nB=\'sq\'').B).toBe('sq')
  })

  test('leaves unbalanced quotes alone', () => {
    expect(parseEnvFile('A="oops').A).toBe('"oops')
  })

  test('accepts an export prefix', () => {
    expect(parseEnvFile('export LARK_DOMAIN=open.larksuite.com')).toEqual({
      LARK_DOMAIN: 'open.larksuite.com',
    })
  })

  test('ignores comments, blanks and malformed lines', () => {
    expect(parseEnvFile('# comment\n\n   \nnot-an-assignment\nA=1')).toEqual({ A: '1' })
  })

  test('keeps = inside values', () => {
    expect(parseEnvFile('TOKEN=abc==def').TOKEN).toBe('abc==def')
  })

  test('tolerates whitespace around the separator', () => {
    expect(parseEnvFile('  A = 1  ').A).toBe('1')
  })
})
