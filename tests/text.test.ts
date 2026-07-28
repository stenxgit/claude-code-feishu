import { describe, expect, test } from 'bun:test'
import { chunk, extractImageKey, extractTextContent, resolveMentions } from '../lib/text.ts'

describe('chunk', () => {
  test('returns a single piece when under the limit', () => {
    expect(chunk('hello', 10, 'length')).toEqual(['hello'])
  })

  test('length mode cuts exactly at the limit', () => {
    expect(chunk('abcdefghij', 4, 'length')).toEqual(['abcd', 'efgh', 'ij'])
  })

  test('every piece respects the limit', () => {
    const text = 'word '.repeat(500)
    for (const piece of chunk(text, 40, 'newline')) {
      expect(piece.length).toBeLessThanOrEqual(40)
    }
  })

  test('newline mode prefers a paragraph break', () => {
    const text = `${'a'.repeat(30)}\n\n${'b'.repeat(30)}`
    expect(chunk(text, 40, 'newline')[0]).toBe('a'.repeat(30))
  })

  test('newline mode ignores a break in the first half', () => {
    // A single early newline must not produce a stream of tiny chunks.
    const text = `ab\n${'c'.repeat(100)}`
    expect(chunk(text, 40, 'newline')[0].length).toBeGreaterThan(20)
  })

  test('terminates on text with no break opportunities', () => {
    const pieces = chunk('x'.repeat(1000), 7, 'newline')
    expect(pieces.join('')).toBe('x'.repeat(1000))
  })

  test('rejects a nonsensical limit instead of hanging', () => {
    expect(() => chunk('abc', 0, 'length')).toThrow()
  })
})

describe('extractTextContent', () => {
  test('text', () => {
    expect(extractTextContent('text', '{"text":"hi"}')).toBe('hi')
  })

  test('post flattens paragraphs, links and mentions', () => {
    const content = JSON.stringify({
      title: 'T',
      content: [[{ tag: 'text', text: 'a ' }, { tag: 'a', text: 'link', href: 'https://x' }], [{ tag: 'at', user_name: 'bob' }]],
    })
    expect(extractTextContent('post', content)).toBe('T\na [link](https://x)\n@bob')
  })

  test('post surfaces code blocks', () => {
    const content = JSON.stringify({ content: [[{ tag: 'code_block', text: 'ls -la' }]] })
    expect(extractTextContent('post', content)).toContain('ls -la')
  })

  test('interactive reads a v1 card', () => {
    const content = JSON.stringify({
      header: { title: { content: 'Title' } },
      elements: [[{ tag: 'text', text: 'body' }]],
    })
    expect(extractTextContent('interactive', content)).toBe('Title\nbody')
  })

  test('interactive reads a v2 card body', () => {
    const content = JSON.stringify({
      header: { title: { content: 'T2' } },
      body: { elements: [{ tag: 'markdown', content: 'hello' }] },
    })
    expect(extractTextContent('interactive', content)).toContain('hello')
  })

  test('interactive degrades gracefully when empty', () => {
    expect(extractTextContent('interactive', '{}')).toBe('(card message)')
  })

  test('system uses template, not text', () => {
    expect(extractTextContent('system', '{"template":"joined"}')).toBe('(system: joined)')
  })

  test('location uses name/lat/lon', () => {
    const out = extractTextContent('location', '{"name":"HQ","latitude":1,"longitude":2}')
    expect(out).toBe('(location: HQ lat:1 lon:2)')
  })

  test('todo falls back to summary.content when title is empty', () => {
    const content = JSON.stringify({ summary: { title: '', content: [[{ tag: 'text', text: 'buy milk' }]] } })
    expect(extractTextContent('todo', content)).toBe('(todo: buy milk)')
  })

  test('share_chat has no chat_name field', () => {
    expect(extractTextContent('share_chat', '{"chat_id":"oc_1"}')).toBe('(shared group: oc_1)')
  })

  test('unknown types are labelled, not dropped', () => {
    expect(extractTextContent('brand_new_type', '{}')).toBe('(brand_new_type)')
  })

  test('malformed JSON falls back to the raw string', () => {
    expect(extractTextContent('text', 'not json')).toBe('not json')
  })
})

describe('extractImageKey', () => {
  test('image type', () => {
    expect(extractImageKey('image', '{"image_key":"img_1"}')).toBe('img_1')
  })

  test('post with an embedded image', () => {
    const content = JSON.stringify({ content: [[{ tag: 'text', text: 'see' }, { tag: 'img', image_key: 'img_2' }]] })
    expect(extractImageKey('post', content)).toBe('img_2')
  })

  test('returns undefined when there is no image', () => {
    expect(extractImageKey('text', '{"text":"hi"}')).toBeUndefined()
  })

  test('survives a null paragraph', () => {
    expect(extractImageKey('post', '{"content":[null]}')).toBeUndefined()
  })
})

describe('resolveMentions', () => {
  test('substitutes placeholders with display names', () => {
    const mentions = [{ key: '@_user_1', id: { open_id: 'ou_1' }, name: 'Ada' }]
    expect(resolveMentions('hey @_user_1 there', mentions)).toBe('hey @Ada there')
  })

  test('is a no-op without mentions', () => {
    expect(resolveMentions('plain', undefined)).toBe('plain')
  })
})
