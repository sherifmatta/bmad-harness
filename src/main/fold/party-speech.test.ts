import { describe, expect, it } from 'vitest'
import { HOLD_MAX, flushScan, initialScan, scanText, speakerNamed } from './party-speech'
import type { Piece, Scan } from './party-speech'

/** Feed the deltas through the scan, then flush; the pieces in order with neighbouring speech joined. */
function scan(...deltas: string[]): Piece[] {
  let state: Scan = initialScan
  const pieces: Piece[] = []
  for (const delta of deltas) {
    const taken = scanText(state, delta)
    state = taken.scan
    pieces.push(...taken.pieces)
  }
  pieces.push(...flushScan(state).pieces)
  const joined: Piece[] = []
  for (const piece of pieces) {
    const last = joined[joined.length - 1]
    if (piece.kind === 'speech' && last?.kind === 'speech') last.text += piece.text
    else joined.push({ ...piece })
  }
  return joined
}

const marker = (name: string): Piece => ({ kind: 'marker', name })
const speech = (text: string): Piece => ({ kind: 'speech', text })

describe('scanText', () => {
  it('finds `{icon} **{name}:**` at the start of a text, and the blanks after it are the marker’s', () => {
    expect(scan('🧙 **Mary:**   Hi.')).toEqual([marker('Mary'), speech('Hi.')])
  })

  it('finds `**Name**:` and a marker with no icon', () => {
    expect(scan('**Mary**: Hi.')).toEqual([marker('Mary'), speech('Hi.')])
    expect(scan('**Mary:** Hi.')).toEqual([marker('Mary'), speech('Hi.')])
  })

  it('finds a marker after a newline, and keeps the newline in the speech before it', () => {
    expect(scan('🧙 **Mary:** Hi.\n📋 **John:** No.')).toEqual([marker('Mary'), speech('Hi.\n'), marker('John'), speech('No.')])
  })

  it('reads a marker split at every point the same as one that is whole', () => {
    const whole = '🧙 **Mary:** hello'
    for (let at = 1; at < whole.length; at += 1) {
      expect(scan(whole.slice(0, at), whole.slice(at)), `split at ${at}`).toEqual([marker('Mary'), speech('hello')])
    }
    expect(scan(...[...whole])).toEqual([marker('Mary'), speech('hello')])
  })

  it('drops the blanks that arrive in a delta of their own after a marker', () => {
    expect(scan('**Mary:**', ' ', ' words')).toEqual([marker('Mary'), speech('words')])
  })

  it('is not a marker anywhere but the start of a line', () => {
    expect(scan('He said 🧙 **Mary:** hi')).toEqual([speech('He said 🧙 **Mary:** hi')])
    expect(scan('line\n  🧙 **Mary:** indented')).toEqual([speech('line\n  🧙 **Mary:** indented')])
  })

  it('releases plain prose as soon as it cannot be a marker', () => {
    const first = scanText(initialScan, 'Welcome to the room')
    expect(first.pieces).toEqual([speech('Welcome to the room')])
    expect(first.scan.held).toBe('')
  })

  it('holds the start of a line only while it may become a marker', () => {
    expect(scanText(initialScan, '🧙').scan.held).toBe('🧙')
    expect(scanText(initialScan, '🧙 **Ma').scan.held).toBe('🧙 **Ma')
    expect(scanText(initialScan, '🧙 **Mary:*').scan.held).toBe('🧙 **Mary:*')
    expect(scanText(initialScan, '🧙 **Mary**').scan.held).toBe('🧙 **Mary**')
    expect(scanText(initialScan, '🧙 hello').scan.held).toBe('')
    expect(scanText(initialScan, '🧙 **Mary** said').scan.held).toBe('')
  })

  it('never holds more than one line or HOLD_MAX characters', () => {
    const long = `**${'a'.repeat(HOLD_MAX)}`
    const taken = scanText(initialScan, long)
    expect(taken.scan.held).toBe('')
    expect(taken.pieces).toEqual([speech(long)])
    expect(scan('**not a marker\nnext')).toEqual([speech('**not a marker\nnext')])
  })

  it('releases what is held as speech at the end of a block, as written', () => {
    expect(scan('🧙 **Ma')).toEqual([speech('🧙 **Ma')])
    expect(flushScan({ held: '', lineStart: false, skipBlanks: true }).pieces).toEqual([])
  })

  it('treats the start of each block as a line start', () => {
    const first = scanText(initialScan, 'a line')
    const next = flushScan(first.scan)
    expect(scanText(next.scan, '**Mary:** hi').pieces).toEqual([marker('Mary'), speech('hi')])
  })
})

describe('speakerNamed', () => {
  const roster = [
    { id: 'mary-id', name: 'Mary' },
    { id: 'john-id', name: ' John ' }
  ]

  it('matches a name case-insensitively after trimming, on either side', () => {
    expect(speakerNamed('  mary ', roster)).toBe('mary-id')
    expect(speakerNamed('JOHN', roster)).toBe('john-id')
  })

  it('is no one for a name the roster does not have, or an empty one', () => {
    expect(speakerNamed('Zed', roster)).toBeUndefined()
    expect(speakerNamed('', roster)).toBeUndefined()
    expect(speakerNamed('Mary', [])).toBeUndefined()
  })
})

describe('scanText with an accepts rule', () => {
  const onlyIcons = (_name: string, icon: boolean): boolean => icon

  it('leaves a refused marker in the text, as written, and does not take the blanks after it', () => {
    const first = scanText(initialScan, '**Pros:**', onlyIcons)
    const next = scanText(first.scan, ' fast', onlyIcons)
    expect([...first.pieces, ...next.pieces]).toEqual([speech('**Pros:**'), speech(' fast')])
  })

  it('tells an icon from a list prefix: only a non-ASCII prefix is one', () => {
    expect(scanText(initialScan, '- **Risk:** z', onlyIcons).pieces).toEqual([speech('- **Risk:** z')])
    expect(scanText(initialScan, '1. **Cost:** z', onlyIcons).pieces).toEqual([speech('1. **Cost:** z')])
    expect(scanText(initialScan, '🎭 **Zed:** hi', onlyIcons).pieces).toEqual([marker('Zed'), speech('hi')])
  })
})
