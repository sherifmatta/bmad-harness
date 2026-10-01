import { describe, expect, it } from 'vitest'
import { feedFields, initialFieldDecoder } from './json-string-fields'
import type { FieldDecoder, FieldOp } from './json-string-fields'

function decode(chunks: string[], watched: string[]): Record<string, string> {
  let state: FieldDecoder = initialFieldDecoder
  const ops: FieldOp[] = []
  for (const chunk of chunks) {
    const fed = feedFields(state, chunk, watched)
    state = fed.state
    ops.push(...fed.ops)
  }
  const fields: Record<string, string> = {}
  for (const op of ops) if (op.kind === 'text') fields[op.field] = (fields[op.field] ?? '') + op.text
  return fields
}

/** Every way of cutting a string into two pieces. */
function splits(text: string): string[][] {
  return Array.from({ length: text.length + 1 }, (_, at) => [text.slice(0, at), text.slice(at)])
}

describe('feedFields', () => {
  const value = 'line one\n"quoted" \\ back \t tab é \u{1f600} end'
  const json = JSON.stringify({ skip: { a: [1, '"}'], b: null }, n: 12, file_path: '/p/x.md', content: value, flag: true })

  it('decodes a watched field exactly as JSON.parse would, however the text is cut', () => {
    for (const parts of splits(json)) {
      expect(decode(parts, ['content', 'file_path'])).toEqual({ file_path: '/p/x.md', content: value })
    }
  })

  it('decodes escaped unicode and surrogate pairs split across fragments', () => {
    const wire = '{"content": "a\\ud83d\\ude00b\\u00e9c"}'
    for (const parts of splits(wire)) {
      expect(decode(parts, ['content'])).toEqual({ content: 'a\u{1f600}béc' })
    }
  })

  it('decodes a lone surrogate like JSON.parse however the input is split', () => {
    const cases = ['{"content": "a\\ud83dX"}', '{"content": "a\\ud83d"}', '{"content": "\\ud83d\\u0041\\ude00"}']
    for (const wire of cases) {
      const expected = (JSON.parse(wire) as { content: string }).content
      for (const parts of splits(wire)) {
        expect(decode(parts, ['content'])).toEqual({ content: expected })
      }
    }
  })

  it('yields only whole characters at every emission', () => {
    const wire = '{"content": "\\ud83d\\ude00"}'
    let state: FieldDecoder = initialFieldDecoder
    const emitted: string[] = []
    for (const char of wire) {
      const fed = feedFields(state, char, ['content'])
      state = fed.state
      for (const op of fed.ops) if (op.kind === 'text') emitted.push(op.text)
    }
    expect(emitted).toEqual(['\u{1f600}'])
  })

  it('skips fields it does not watch', () => {
    expect(decode(['{"other": "secret", "content": "kept"}'], ['content'])).toEqual({ content: 'kept' })
  })

  it('goes quiet on malformed input instead of throwing', () => {
    expect(decode(['not json', ' {"content": "x"}'], ['content'])).toEqual({})
    expect(decode(['{"content": "\\uZZZZ and more"}'], ['content'])).toEqual({})
  })

  it('signals the end of a field when its string closes', () => {
    const fed = feedFields(initialFieldDecoder, '{"file_path": "/a"', ['file_path'])
    expect(fed.ops).toEqual([
      { kind: 'text', field: 'file_path', text: '/a' },
      { kind: 'end', field: 'file_path' }
    ])
  })
})
