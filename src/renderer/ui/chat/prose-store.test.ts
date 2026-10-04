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

const doc = (path: string, callId: string, text: string, written = text.length) => ({ path, callId, text, written, sections: [] })

describe('the prose store', () => {
  it('joins the pieces of one call, and a new Write to the path replaces its text', () => {
    const store = createProseStore(crank())
    store.append('r1', 'c1', 'a.md', '## A')
    store.append('r1', 'c1', 'a.md', 'bc')
    expect(store.get('r1')).toEqual({ callId: 'c1', path: 'a.md', text: '## Abc' })
    store.append('r1', 'c2', 'a.md', 'new')
    expect(store.get('r1')).toEqual({ callId: 'c2', path: 'a.md', text: 'new' })
    expect(store.documents('r1')).toEqual([{ path: 'a.md', callId: 'c2', text: 'new', written: 6 }])
    expect(store.get('r2')).toBeUndefined()
  })

  it('shows the path with the largest single Write, the earlier on a tie, switching only when another passes it', () => {
    const store = createProseStore(crank())
    store.append('r1', 'c1', 'addendum.md', 'x'.repeat(3000))
    store.append('r1', 'c2', 'prd.md', 'y'.repeat(3000))
    expect(store.get('r1')?.path).toBe('addendum.md')
    store.append('r1', 'c2', 'prd.md', 'y')
    expect(store.get('r1')?.path).toBe('prd.md')
    store.append('r1', 'c3', 'prd.md', 'short')
    expect(store.get('r1')).toEqual({ callId: 'c3', path: 'prd.md', text: 'short' })
    expect(store.paths('r1')).toEqual(['addendum.md', 'prd.md'])
  })

  it('replaces a path’s text with a commit’s, adds a path first seen on a commit, and keeps the paths array until one is added', () => {
    const store = createProseStore(crank())
    store.append('r1', 'c1', 'prd.md', '## A\nold')
    const paths = store.paths('r1')
    store.commit('r1', 'prd.md', 'c1')
    store.commit('r1', 'prd.md', 'e1', '## A\nnew')
    expect(store.get('r1')).toEqual({ callId: 'e1', path: 'prd.md', text: '## A\nnew' })
    expect(store.paths('r1')).toBe(paths)
    store.commit('r1', 'other.md', 'e2')
    expect(store.paths('r1')).toEqual(['prd.md', 'other.md'])
    expect(store.documents('r1')).toEqual([
      { path: 'prd.md', callId: 'e1', text: '## A\nnew', written: 8 },
      { path: 'other.md', callId: 'e2', text: '', written: 0 }
    ])
    expect(store.get('r1')?.path).toBe('prd.md')
    expect(store.paths('r9')).toBe(store.paths('r8'))
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
    store.seed('r1', [doc('a.md', 'c1', 'small'), doc('b.md', 'c2', 'held', 9)])
    frames.frame()
    expect(store.get('r1')).toEqual({ callId: 'c2', path: 'b.md', text: 'held' })
    expect(store.paths('r1')).toEqual(['a.md', 'b.md'])
    store.clear()
    frames.frame()
    expect(store.get('r1')).toBeUndefined()
    expect(told).toEqual(['r1', 'r1'])
    store.seed('r1', [])
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
