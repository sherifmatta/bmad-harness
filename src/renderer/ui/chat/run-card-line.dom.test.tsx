// @vitest-environment jsdom
import { Profiler, act, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { createProseStore } from './prose-store'
import type { ProseStore } from './prose-store'
import { RunCardLine } from './run-card-line'
import type { RunCardEntry } from './transcript-entry'

/** A frame that runs only when the test turns the crank, as the window's would once a refresh. */
function crank() {
  const pending: (() => void)[] = []
  return {
    raf: (callback: () => void) => void pending.push(callback),
    frame: () => act(() => pending.splice(0).forEach((callback) => callback()))
  }
}

const card = (over: Partial<RunCardEntry> = {}): RunCardEntry => ({
  kind: 'run',
  id: 'r1',
  at: Date.now(),
  runId: 'r1',
  sessionId: 's1',
  agentId: 'bmad-agent-pm',
  status: 'running',
  notes: [],
  documents: [],
  ...over
})

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.unmount()
  mounted = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function draw(store: ProseStore, entry: RunCardEntry = card(), name = 'John', onExpand: (runId: string) => void = () => {}) {
  let commits = 0
  mounted = mount(
    createElement(
      Profiler,
      { id: 'line', onRender: () => void (commits += 1) },
      createElement(RunCardLine, { entry, name, prose: store, onExpand })
    )
  )
  const root = mounted.container
  const text = (selector: string): string | undefined => root.querySelector(selector)?.textContent ?? undefined
  return { root, text, commits: () => commits }
}

describe('the collapsed run card’s line', () => {
  it('is one section holding one button, with the dot, the name, the reason and the elapsed time in that order', () => {
    const store = createProseStore(crank())
    const view = draw(store, card({ notes: [{ text: '- (decision) Fast path', at: 1 }] }))
    const section = view.root.querySelector('section.run-card-line')
    expect(section?.getAttribute('aria-busy')).toBe('true')
    const buttons = view.root.querySelectorAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].type).toBe('button')
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false')
    expect(buttons[0].parentElement).toBe(section)
    const fields = [...buttons[0].children].map((child) => child.className.split(' ')[0])
    expect(fields).toEqual(['status-dot', 'run-card-line-name', 'run-card-line-sep', 'run-card-line-reason', 'run-card-line-sep', 'run-card-elapsed'])
    expect(view.text('.run-card-line-name')).toBe('John')
    expect(view.text('.run-card-line-reason')).toBe('Fast path')
    expect(view.text('.run-card-elapsed')).toMatch(/^\d+s$/)
  })

  it('hides the dot and the separators from a reader, and draws no stop control, spinner, bar or denominator', () => {
    const view = draw(createProseStore(crank()), card({ notes: [{ text: '- (decision) Fast path', at: 1 }] }))
    expect(view.root.querySelector('.status-dot')?.getAttribute('aria-hidden')).toBe('true')
    for (const sep of view.root.querySelectorAll('.run-card-line-sep')) {
      expect(sep.getAttribute('aria-hidden')).toBe('true')
    }
    expect(view.root.textContent).not.toMatch(/stop| of |\/|%|…|\.\.\./i)
    expect(view.root.querySelector('progress, meter, [role], [title], svg')).toBeNull()
  })

  it('hands the run’s id to onExpand on a click, once', () => {
    const expanded: string[] = []
    const view = draw(createProseStore(crank()), card({ runId: 'r7', id: 'r7' }), 'John', (runId) => expanded.push(runId))
    act(() => view.root.querySelector('button')?.click())
    expect(expanded).toEqual(['r7'])
  })

  it('reads the reason of the last note, and the first note’s no longer', () => {
    const store = createProseStore(crank())
    const view = draw(store, card({ notes: [{ text: '- (decision) First', at: 1 }, { text: '- (assumption) Second', at: 2 }] }))
    expect(view.text('.run-card-line-reason')).toBe('Second')
  })

  it('keeps the whole reason in the DOM, to be cut to one line by CSS alone', () => {
    const long = 'a very long reason '.repeat(30).trim()
    const view = draw(createProseStore(crank()), card({ notes: [{ text: `- (note) ${long}`, at: 1 }] }))
    expect(view.text('.run-card-line-reason')).toBe(long)
    expect(view.root.querySelectorAll('.run-card-line-reason')).toHaveLength(1)
    expect(view.root.querySelectorAll('br')).toHaveLength(0)
  })

  it('reads the section the text has shown before a note, and draws no reason field before either', () => {
    const frames = crank()
    const store = createProseStore(frames)
    const view = draw(store)
    expect(view.root.querySelector('.run-card-line-reason')).toBeNull()
    // Nothing stands in for the reason: only the name's own separator is drawn.
    expect(view.root.querySelectorAll('.run-card-line-sep')).toHaveLength(1)

    store.append('r1', 'c1', '_bmad/prd.md', '## 1. Vision\n## 2. Context\n')
    frames.frame()
    expect(view.text('.run-card-line-reason')).toBe('§2 Context')
    expect(view.root.querySelectorAll('.run-card-line-sep')).toHaveLength(2)
  })

  it('draws no name and no separator for a card with no agent id, and still the dot, the reason and the time', () => {
    const view = draw(createProseStore(crank()), card({ agentId: undefined, notes: [{ text: '- (note) Fast path', at: 1 }] }), '')
    expect(view.root.querySelector('.run-card-line-name')).toBeNull()
    expect([...view.root.querySelector('button')!.children].map((child) => child.className.split(' ')[0])).toEqual([
      'status-dot',
      'run-card-line-reason',
      'run-card-line-sep',
      'run-card-elapsed'
    ])
  })

  it('renders again only when its words change: thousands of pieces within one section, none; a new section, one', () => {
    const frames = crank()
    const store = createProseStore(frames)
    store.append('r1', 'c1', '_bmad/prd.md', '## 1. Vision\n')
    frames.frame()
    const view = draw(store)
    expect(view.text('.run-card-line-reason')).toBe('§1 Vision')
    const before = view.commits()

    for (let at = 0; at < 2_000; at += 1) {
      store.append('r1', 'c1', '_bmad/prd.md', `piece ${at}\n`)
      if (at % 50 === 49) frames.frame()
    }
    frames.frame()
    expect(view.commits() - before).toBe(0)

    store.append('r1', 'c1', '_bmad/prd.md', '## 2. Context\n')
    frames.frame()
    expect(view.commits() - before).toBe(1)
    expect(view.text('.run-card-line-reason')).toBe('§2 Context')
  })

  it('ticks the elapsed every second, and the setting that turns motion off does not stop it', () => {
    vi.useFakeTimers({ now: 1_000_000, toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: /prefers-reduced-motion/.test(query),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {}
    }))
    const view = draw(createProseStore(crank()), card({ at: 1_000_000 - 4_000 }))
    expect(view.text('.run-card-elapsed')).toBe('4s')

    act(() => void vi.advanceTimersByTime(1_000))
    expect(view.text('.run-card-elapsed')).toBe('5s')
    act(() => void vi.advanceTimersByTime(60_000))
    expect(view.text('.run-card-elapsed')).toBe('1m 05s')
    expect(view.root.querySelector('section')?.getAttribute('aria-busy')).toBe('true')
  })
})
