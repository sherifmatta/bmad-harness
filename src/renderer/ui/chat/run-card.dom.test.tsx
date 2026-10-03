// @vitest-environment jsdom
import { Profiler, act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { createProseStore } from './prose-store'
import type { ProseStore } from './prose-store'
import { RunCard } from './run-card'
import { SkillRow } from './skill-row'
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
  status: 'running',
  notes: [],
  sections: [],
  ...over
})

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.unmount()
  mounted = null
})

function draw(store: ProseStore, entry: RunCardEntry = card()) {
  let commits = 0
  const element = (next: RunCardEntry) =>
    createElement(Profiler, { id: 'card', onRender: () => void (commits += 1) }, createElement(RunCard, { entry: next, prose: store }))
  const root = mount(element(entry))
  mounted = root
  const text = (): string => root.container.querySelector('.run-card-text')?.textContent ?? ''
  return {
    root,
    text,
    commits: () => commits,
    rerender: (next: RunCardEntry) => {
      // A fresh mount stands in for React's own re-render with new props.
      root.unmount()
      return draw(store, next)
    }
  }
}

describe('the run card’s prose', () => {
  it('applies thousands of pieces with one DOM write per frame and no React render per piece', () => {
    const frames = crank()
    const store = createProseStore(frames)
    const view = draw(store)
    const node = view.root.container.querySelector('.run-card-text') as HTMLElement
    const observer = new MutationObserver(() => {})
    observer.observe(node, { characterData: true, childList: true, subtree: true })
    const before = view.commits()

    const pieces = Array.from({ length: 3947 }, (_, at) => `piece ${at}\n`)
    const writes: number[] = []
    for (let at = 0; at < pieces.length; at += 1) {
      store.append('r1', 'c1', '_bmad/prd.md', pieces[at])
      // A frame every 40 pieces: many pieces arrive between two refreshes.
      if (at % 40 === 39 || at === pieces.length - 1) {
        frames.frame()
        writes.push(observer.takeRecords().length)
      }
    }

    expect(view.text()).toBe(pieces.join(''))
    expect(writes.every((count) => count === 1)).toBe(true)
    // React renders once, when the card first has text and a path, and never again for a piece.
    expect(view.commits() - before).toBe(1)
    expect(view.root.container.querySelector('.run-card-path')?.textContent).toBe('_bmad/prd.md')
    observer.disconnect()
  })

  it('starts the text again when a new call begins, under the new path', () => {
    const frames = crank()
    const store = createProseStore(frames)
    const view = draw(store)
    store.append('r1', 'c1', 'a.md', 'first write')
    frames.frame()
    store.append('r1', 'c2', 'b.md', 'revision')
    frames.frame()
    expect(view.text()).toBe('revision')
    expect(view.root.container.querySelector('.run-card-path')?.textContent).toBe('b.md')
  })

  it('draws the whole text on mounting after a reload, having seen none of its pieces', () => {
    const frames = crank()
    const store = createProseStore(frames)
    store.seed('r1', { callId: 'c1', path: 'a.md', text: '## Vision\nwhole' })
    const view = draw(store)
    expect(view.text()).toBe('## Vision\nwhole')
    expect(view.root.container.querySelector('.run-card-caret')).not.toBeNull()
  })

  it('removes the caret, rather than fading it, when the run finishes, and drops aria-busy', () => {
    const frames = crank()
    const store = createProseStore(frames)
    store.seed('r1', { callId: 'c1', path: 'a.md', text: 'text' })
    const running = draw(store)
    expect(running.root.container.querySelector('section')?.getAttribute('aria-busy')).toBe('true')
    const finished = running.rerender(card({ status: 'finished', endedAt: Date.now(), sections: ['A'] }))
    expect(finished.root.container.querySelector('.run-card-caret')).toBeNull()
    expect(finished.root.container.querySelector('section')?.hasAttribute('aria-busy')).toBe(false)
    expect(finished.root.container.querySelector('.run-card-status')?.textContent).toBe('saved · just now · 1 section')
  })
})

describe('the skill row’s buttons', () => {
  it('hand their code, and nothing else, to the one callback; a disabled one hands nothing', () => {
    const ran: unknown[][] = []
    const items = [
      { code: 'CP', description: 'Create the PRD' },
      { code: 'VP', description: 'Validate a PRD' }
    ]
    mounted = mount(createElement(SkillRow, { name: 'John', items, disabled: false, onRun: (...args: unknown[]) => void ran.push(args) }))
    const buttons = [...mounted.container.querySelectorAll('button')]
    act(() => buttons[1].click())
    expect(ran).toEqual([['VP']])

    mounted.unmount()
    mounted = mount(createElement(SkillRow, { name: 'John', items, disabled: true, onRun: (...args: unknown[]) => void ran.push(args) }))
    act(() => mounted?.container.querySelector('button')?.click())
    expect(ran).toEqual([['VP']])
  })
})
