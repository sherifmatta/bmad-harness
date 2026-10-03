import { describe, expect, it } from 'vitest'
import type { ContractEvent } from '../../shared/events'
import { coalesce, flushProse } from './coalesce'
import type { ProseBuffer } from './coalesce'

const prose = (text: string, callId = 'c1', at = 1, path = 'a.md', runId = 'r1'): ContractEvent => ({
  name: 'doc:prose',
  payload: { runId, sessionId: 's1', callId, path, text, at }
})
const note = (text: string): ContractEvent => ({
  name: 'run:note',
  payload: { runId: 'r1', sessionId: 's1', text, at: 9 }
})

function feed(events: ContractEvent[], from: ProseBuffer = undefined): { buffer: ProseBuffer; out: ContractEvent[] } {
  let buffer = from
  const out: ContractEvent[] = []
  for (const event of events) {
    const step = coalesce(buffer, event)
    buffer = step.buffer
    out.push(...step.out)
  }
  return { buffer, out }
}

const texts = (events: ContractEvent[]): string[] =>
  events.map((event) => (event.name === 'doc:prose' || event.name === 'run:note' ? event.payload.text : event.name))

describe('coalesce', () => {
  it('holds consecutive pieces of one call and releases them as one, keeping the first at', () => {
    const { buffer, out } = feed([prose('a', 'c1', 1), prose('b', 'c1', 2), prose('c', 'c1', 3)])
    expect(out).toEqual([])
    expect(flushProse(buffer).out).toEqual([prose('abc', 'c1', 1)])
    expect(flushProse(buffer).buffer).toBeUndefined()
  })

  it('releases what it holds before any other event, so order holds', () => {
    const { buffer, out } = feed([prose('a'), prose('b'), note('n'), prose('c')])
    expect(texts(out)).toEqual(['ab', 'n'])
    expect(texts(flushProse(buffer).out)).toEqual(['c'])
  })

  it('never joins two calls, two paths or two runs', () => {
    const { buffer, out } = feed([
      prose('a', 'c1'),
      prose('b', 'c2'),
      prose('c', 'c2', 1, 'b.md'),
      prose('d', 'c2', 1, 'b.md', 'r2')
    ])
    expect(texts([...out, ...flushProse(buffer).out])).toEqual(['a', 'b', 'c', 'd'])
  })

  it('preserves every byte and the order of a long stream', () => {
    const pieces = Array.from({ length: 4000 }, (_, at) => `${at}\u{1f600}é\n`)
    const { buffer, out } = feed(pieces.map((text) => prose(text)))
    const all = [...out, ...flushProse(buffer).out]
    expect(all).toHaveLength(1)
    expect(texts(all).join('')).toBe(pieces.join(''))
  })

  it('releases nothing when nothing is held', () => {
    expect(flushProse(undefined)).toEqual({ buffer: undefined, out: [] })
    expect(coalesce(undefined, note('n'))).toEqual({ buffer: undefined, out: [note('n')] })
  })
})
