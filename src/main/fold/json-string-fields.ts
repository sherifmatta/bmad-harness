/**
 * An incremental decoder for the string fields of a JSON object that arrives in
 * pieces. A tool call's input streams as fragments of one JSON text, and the
 * words inside a long string field are wanted as they arrive rather than when
 * the object closes.
 *
 * It reads only the top level of the object. For each watched field it yields
 * the decoded text as it becomes whole: an escape or a surrogate pair that is
 * split across fragments is held until its last part arrives, so every emitted
 * piece is made of whole characters and the pieces concatenate to exactly the
 * decoded value. Fields it does not watch are skipped without being kept. Input
 * that is not the JSON it expected puts the decoder in a terminal `broken` mode
 * that yields nothing further; it never throws.
 *
 * The state is a plain value handed in and returned, never mutated, so the same
 * fragments from the same starting state always give the same result.
 */

type Mode =
  | 'before-object'
  | 'before-key'
  | 'key'
  | 'after-key'
  | 'before-value'
  | 'string'
  | 'skip-string'
  | 'skip-nested'
  | 'skip-primitive'
  | 'after-value'
  | 'done'
  | 'broken'

export type FieldDecoder = {
  readonly mode: Mode
  /** The key being read, or the last one read. */
  readonly key: string
  /** The watched field whose string is open, if any. */
  readonly field: string | null
  /** A backslash sequence cut off by the end of a fragment, backslash included. */
  readonly escape: string
  /** A high surrogate waiting for the low half that completes the character. */
  readonly high: string
  /** Bracket depth while skipping a nested value. */
  readonly depth: number
  readonly nestedInString: boolean
  readonly nestedEscape: boolean
}

/** Text decoded from a watched field, or the signal that its string closed. */
export type FieldOp = { kind: 'text'; field: string; text: string } | { kind: 'end'; field: string }

export const initialFieldDecoder: FieldDecoder = {
  mode: 'before-object',
  key: '',
  field: null,
  escape: '',
  high: '',
  depth: 0,
  nestedInString: false,
  nestedEscape: false
}

const SIMPLE_ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t'
}

const isSpace = (ch: string): boolean => ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t'
const isHigh = (ch: string): boolean => ch >= '\ud800' && ch <= '\udbff'
const isLow = (ch: string): boolean => ch >= '\udc00' && ch <= '\udfff'

/** Feed one fragment. Returns the next state and the ops it produced, in order. */
export function feedFields(
  state: FieldDecoder,
  chunk: string,
  watched: readonly string[]
): { state: FieldDecoder; ops: FieldOp[] } {
  let { mode, key, field, escape, high, depth, nestedInString, nestedEscape } = state
  const ops: FieldOp[] = []
  let out = ''

  const flush = (): void => {
    if (out !== '' && field !== null) ops.push({ kind: 'text', field, text: out })
    out = ''
  }

  // A high surrogate is held until the next unit shows whether it has a partner.
  const push = (unit: string): void => {
    if (high !== '') {
      if (isLow(unit)) {
        out += high + unit
        high = ''
        return
      }
      out += high
      high = ''
    }
    if (isHigh(unit)) high = unit
    else out += unit
  }

  for (let i = 0; i < chunk.length; i += 1) {
    const ch = chunk[i]
    switch (mode) {
      case 'before-object':
        if (ch === '{') mode = 'before-key'
        else if (!isSpace(ch)) mode = 'broken'
        break
      case 'before-key':
        if (ch === '"') {
          key = ''
          mode = 'key'
        } else if (ch === '}') mode = 'done'
        else if (!isSpace(ch) && ch !== ',') mode = 'broken'
        break
      case 'key':
        if (escape !== '') {
          key += ch
          escape = ''
        } else if (ch === '\\') escape = '\\'
        else if (ch === '"') mode = 'after-key'
        else key += ch
        break
      case 'after-key':
        if (ch === ':') mode = 'before-value'
        else if (!isSpace(ch)) mode = 'broken'
        break
      case 'before-value':
        if (isSpace(ch)) break
        if (ch === '"') {
          if (watched.includes(key)) {
            field = key
            mode = 'string'
          } else mode = 'skip-string'
        } else if (ch === '{' || ch === '[') {
          depth = 1
          nestedInString = false
          nestedEscape = false
          mode = 'skip-nested'
        } else if (ch === ',' || ch === '}' || ch === ']' || ch === ':') mode = 'broken'
        else mode = 'skip-primitive'
        break
      case 'string':
        if (escape !== '') {
          escape += ch
          if (escape.length === 2 && ch !== 'u') {
            push(SIMPLE_ESCAPES[ch] ?? ch)
            escape = ''
          } else if (escape.length === 6) {
            const hex = escape.slice(2)
            if (/^[0-9a-fA-F]{4}$/.test(hex)) push(String.fromCharCode(parseInt(hex, 16)))
            else mode = 'broken'
            escape = ''
          }
        } else if (ch === '\\') escape = '\\'
        else if (ch === '"') {
          if (high !== '') {
            out += high
            high = ''
          }
          flush()
          ops.push({ kind: 'end', field: field ?? key })
          field = null
          mode = 'after-value'
        } else push(ch)
        break
      case 'skip-string':
        if (escape !== '') escape = ''
        else if (ch === '\\') escape = '\\'
        else if (ch === '"') mode = 'after-value'
        break
      case 'skip-nested':
        if (nestedInString) {
          if (nestedEscape) nestedEscape = false
          else if (ch === '\\') nestedEscape = true
          else if (ch === '"') nestedInString = false
        } else if (ch === '"') nestedInString = true
        else if (ch === '{' || ch === '[') depth += 1
        else if (ch === '}' || ch === ']') {
          depth -= 1
          if (depth === 0) mode = 'after-value'
        }
        break
      case 'skip-primitive':
        if (isSpace(ch)) mode = 'after-value'
        else if (ch === ',') mode = 'before-key'
        else if (ch === '}') mode = 'done'
        break
      case 'after-value':
        if (ch === ',') mode = 'before-key'
        else if (ch === '}') mode = 'done'
        else if (!isSpace(ch)) mode = 'broken'
        break
      case 'done':
      case 'broken':
        break
    }
    if (mode === 'broken') break
  }

  flush()
  return {
    state: { mode, key, field, escape, high, depth, nestedInString, nestedEscape },
    ops
  }
}
