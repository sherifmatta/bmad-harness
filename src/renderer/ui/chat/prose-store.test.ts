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

describe('the prose store’s progress (Story 3.3)', () => {
  const write = (store: ReturnType<typeof createProseStore>, text: string, callId = 'c1', path = 'prd.md'): void =>
    store.append('r1', callId, path, text)

  it('says nothing of a run with no text, and is `writing` with no section before any heading', () => {
    const store = createProseStore(crank())
    expect(store.progress('r1')).toEqual({ revising: false })
    expect(store.seen('r1')).toEqual([])
    write(store, '# PRD\n\nsome words\n')
    expect(store.progress('r1')).toEqual({ revising: false })
    expect(store.seen('r1')).toEqual([])
  })

  it('names the section being written, by its place among those seen, numbering stripped', () => {
    const store = createProseStore(crank())
    write(store, '## 0. Document Purpose\nx\n## 1. Vision\ny\n## 2. Target User\nz\n')
    write(store, '## 3. Glossary\nterms')
    expect(store.progress('r1')).toEqual({ revising: false, section: { name: 'Glossary', n: 4 } })
    expect(store.seen('r1')).toEqual(['Document Purpose', 'Vision', 'Target User', 'Glossary'])
  })

  it('sees a heading on the last line only once a newline ends it, one on an earlier line always, in text order, and a fenced one never', () => {
    const store = createProseStore(crank())
    write(store, '## One\n```\n## Not\n```\n## Two')
    expect(store.seen('r1')).toEqual(['One'])
    write(store, '\n')
    expect(store.seen('r1')).toEqual(['One', 'Two'])
  })

  it('never admits half a heading: a frame that lands on `## 3. Glo` leaves seen without it, and `ssary` completes Glossary', () => {
    const store = createProseStore(crank())
    write(store, '## 1. Vision\nwords\n## 3. Glo')
    expect(store.seen('r1')).toEqual(['Vision'])
    expect(store.progress('r1').section).toEqual({ name: 'Vision', n: 1 })
    write(store, 'ssary\n')
    expect(store.seen('r1')).toEqual(['Vision', 'Glossary'])
    expect(store.progress('r1').section).toEqual({ name: 'Glossary', n: 2 })
    expect(store.seen('r1')).not.toContain('Glo')
  })

  it('adds a heading the plan lacks to the end of seen, and never renumbers one already seen', () => {
    const store = createProseStore(crank())
    write(store, '## A\nx\n## B\n')
    const before = store.seen('r1')
    expect(before).toEqual(['A', 'B'])
    // A second Write restarts the text and meets a new section ahead of those seen.
    write(store, '## A\nx\n## Risks\ny\n## B\n', 'c2')
    expect(store.seen('r1')).toEqual(['A', 'B', 'Risks'])
    expect(store.progress('r1').section).toEqual({ name: 'B', n: 2 })
    write(store, '## Risks\n', 'c3')
    expect(store.progress('r1').section).toEqual({ name: 'Risks', n: 3 })
  })

  it('keeps the same array and the same progress while neither changed, and a new one when they did', () => {
    const store = createProseStore(crank())
    write(store, '## A\nwords')
    const seen = store.seen('r1')
    const progress = store.progress('r1')
    expect(store.seen('r1')).toBe(seen)
    expect(store.progress('r1')).toBe(progress)
    write(store, ' and more words')
    expect(store.seen('r1')).toBe(seen)
    expect(store.progress('r1')).toBe(progress)
    write(store, '\n## B\n')
    expect(store.seen('r1')).not.toBe(seen)
    expect(store.progress('r1')).not.toBe(progress)
  })

  it('reads the text at most once a frame, however many pieces came in it', () => {
    const frames = crank()
    const store = createProseStore(frames)
    let told = 0
    store.subscribe('r1', () => {
      told += 1
      store.progress('r1')
    })
    const seen: string[][] = []
    for (let at = 0; at < 200; at += 1) {
      write(store, at % 50 === 0 ? `\n## S${at}\n` : 'word ')
      if (at % 40 === 39) {
        frames.frame()
        seen.push([...store.seen('r1')])
      }
    }
    expect(told).toBe(5)
    expect(seen.at(-1)).toEqual(['S0', 'S50', 'S100', 'S150'])
  })

  it('reads revising from an applied Edit: the section holding its first changed character, until the next Write piece', () => {
    const store = createProseStore(crank())
    write(store, '## 1. Vision\nold vision\n## 2. Scope\nscope words\n## 3. Risks\nrisks')
    expect(store.progress('r1').section?.name).toBe('Risks')
    store.commit('r1', 'prd.md', 'e1', '## 1. Vision\nnew vision\n## 2. Scope\nscope words\n## 3. Risks\nrisks')
    expect(store.progress('r1')).toEqual({ revising: true, section: { name: 'Vision', n: 1 } })
    store.commit('r1', 'prd.md', 'e2', '## 1. Vision\nnew vision\n## 2. Scope\nscope edited\n## 3. Risks\nrisks')
    expect(store.progress('r1')).toEqual({ revising: true, section: { name: 'Scope', n: 2 } })
    write(store, '\n## 4. More\n', 'c2')
    expect(store.progress('r1').revising).toBe(false)
    expect(store.progress('r1').section?.name).toBe('More')
  })

  it('never names a later section than the edit, and never advances the counter', () => {
    const store = createProseStore(crank())
    write(store, '## A\none\n## B\ntwo\n## C\nthree')
    store.commit('r1', 'prd.md', 'e1', '## A\none\n## B\ntwo!\n## C\nthree')
    expect(store.progress('r1').section).toEqual({ name: 'B', n: 2 })
    expect(store.seen('r1')).toEqual(['A', 'B', 'C'])
  })

  it('numbers an edit-made section after those seen, and names the section an edit before any heading changed as `revising`', () => {
    const store = createProseStore(crank())
    write(store, 'intro\n## A\none\n## B\ntwo')
    store.commit('r1', 'prd.md', 'e1', 'intro!\n## A\none\n## B\ntwo')
    expect(store.progress('r1')).toEqual({ revising: true })
    store.commit('r1', 'prd.md', 'e2', 'intro!\n## A\none\n## New\nmid\n## B\ntwo')
    expect(store.seen('r1')).toEqual(['A', 'B', 'New'])
    expect(store.progress('r1')).toEqual({ revising: true, section: { name: 'New', n: 3 } })
  })

  it('is not revising for an Edit of a file that is not the subject', () => {
    const store = createProseStore(crank())
    write(store, '## Big\n' + 'x'.repeat(100), 'c1', 'prd.md')
    write(store, '## Small\nx', 'c2', 'addendum.md')
    store.commit('r1', 'addendum.md', 'e1', '## Small\ny')
    expect(store.progress('r1')).toEqual({ revising: false, section: { name: 'Big', n: 1 } })
  })

  it('keeps seen for each file, so a subject that changes does not take the other’s numbering', () => {
    const store = createProseStore(crank())
    write(store, '## A\n## B\n' + 'z'.repeat(30), 'c1', 'addendum.md')
    write(store, '## X\n' + 'y'.repeat(20), 'c2', 'prd.md')
    expect(store.seen('r1')).toEqual(['A', 'B'])
    write(store, 'y'.repeat(20), 'c2', 'prd.md')
    expect(store.seen('r1')).toEqual(['X'])
    expect(store.progress('r1').section).toEqual({ name: 'X', n: 1 })
  })

  it('rebuilds seen from the seeded subject text, with no revision', () => {
    const store = createProseStore(crank())
    store.seed('r1', [
      { path: 'prd.md', callId: 'c1', text: '## 0. Purpose\n## 1. Vision\nwords\n## 2. Scope\n', written: 40, sections: ['Purpose'] }
    ])
    expect(store.seen('r1')).toEqual(['Purpose', 'Vision', 'Scope'])
    expect(store.progress('r1')).toEqual({ revising: false, section: { name: 'Scope', n: 3 } })
    store.seed('r1', [])
    expect(store.seen('r1')).toEqual([])
    expect(store.progress('r1')).toEqual({ revising: false })
  })
})
