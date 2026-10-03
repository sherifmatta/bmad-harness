import { describe, expect, it } from 'vitest'
import { createProseStore } from './prose-store'

/** A frame that runs only when the test turns the crank. */
function crank() {
  const pending: (() => void)[] = []
  return {
    raf: (callback: () => void) => void pending.push(callback),
    frame: () => {
      for (const callback of pending.splice(0)) callback()
    },
    get waiting() {
      return pending.length
    }
  }
}

describe('the prose store', () => {
  it('joins the pieces of one call, and starts again under the new path on another', () => {
    const store = createProseStore(crank())
    store.append('r1', 'c1', 'a.md', '## A')
    store.append('r1', 'c1', 'a.md', 'bc')
    expect(store.get('r1')).toEqual({ callId: 'c1', path: 'a.md', text: '## Abc' })
    store.append('r1', 'c2', 'b.md', 'new')
    expect(store.get('r1')).toEqual({ callId: 'c2', path: 'b.md', text: 'new' })
    expect(store.get('r2')).toBeUndefined()
  })

  it('tells a run’s readers at most once a frame, however many pieces came, and only that run’s', () => {
    const frames = crank()
    const store = createProseStore(frames)
    const told: string[] = []
    store.subscribe('r1', () => told.push('r1'))
    store.subscribe('r2', () => told.push('r2'))
    for (let at = 0; at < 1000; at += 1) store.append('r1', 'c1', 'a.md', 'x')

    expect(told).toEqual([])
    expect(frames.waiting).toBe(1)
    frames.frame()
    expect(told).toEqual(['r1'])
    frames.frame()
    expect(told).toEqual(['r1'])
    expect(store.get('r1')?.text).toHaveLength(1000)
  })

  it('seeds a run as main held it, and clears every run, telling their readers', () => {
    const frames = crank()
    const store = createProseStore(frames)
    const told: string[] = []
    store.subscribe('r1', () => told.push('r1'))
    store.seed('r1', { callId: 'c1', path: 'a.md', text: 'held' })
    frames.frame()
    expect(store.get('r1')?.text).toBe('held')
    store.clear()
    frames.frame()
    expect(store.get('r1')).toBeUndefined()
    expect(told).toEqual(['r1', 'r1'])
    store.seed('r1', null)
    expect(store.get('r1')).toBeUndefined()
  })

  it('stops telling a reader that unsubscribed', () => {
    const frames = crank()
    const store = createProseStore(frames)
    let told = 0
    const stop = store.subscribe('r1', () => (told += 1))
    stop()
    store.append('r1', 'c1', 'a.md', 'x')
    frames.frame()
    expect(told).toBe(0)
  })
})
