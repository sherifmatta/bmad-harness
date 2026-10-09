// @vitest-environment jsdom
import { Profiler, act, createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RailRow } from '../../../shared/rail'
import { CONTENTION, STOPPED, progressLabel } from '../../../shared/section-progress'
import { OutputRow } from '../outputs/output-row'
import { ownerLabel } from '../outputs/owner-label'
import { ARBITRATION, DENOMINATOR, SPINNER_MARKUP, STAND_IN, spoken } from '../testing/audit-patterns'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { createProseStore } from './prose-store'
import type { ProseStore } from './prose-store'
import { RunCard } from './run-card'
import { RunCardLine } from './run-card-line'
import type { RunCardEntry } from './transcript-entry'

/**
 * Story 3.11, the rendered half (UX-DR35, UX-DR38): the audit of what Epic 3
 * promised not to do. Every state the card can draw, its collapsed line, the
 * dead card and the rail's annotated rows are mounted through the real store and
 * components, with the clock and the frames held here, and each prohibition is
 * read off what they draw. The static half (the CSS, the spoken words in source,
 * the contract's counts) is `tests/negative-surface.test.ts`.
 *
 * A failing assertion here is fixed in the product. None may be loosened.
 */

const NOW = 1_000_000_000_000
const PM = 'bmad-agent-pm'
const SUBJECT = '_bmad/prd.md'

/** A frame that runs only when the test turns the crank. */
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
  at: NOW - 65_000,
  runId: 'r1',
  sessionId: 's1',
  agentId: PM,
  status: 'running',
  notes: [],
  steps: [],
  documents: [],
  plan: ['Vision', 'Scope', 'Users'],
  ...over
})

const BODY = '## 1. Vision\nwhat it is for\n## 2. Scope\nwhat it holds'

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.unmount()
  mounted = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** What a state is, for the audit: how to build its store, the entry, and what its head must say. */
type Case = {
  name: string
  /** Mounted as the full card, or as the collapsed line. */
  as: 'card' | 'line'
  entry: () => RunCardEntry
  seed: (store: ProseStore, frames: ReturnType<typeof crank>) => void
  /** The head's status string; empty where the card draws none. */
  head: string
  /** The controls the state may draw, by their class: only the card's stop, or the line's expanding button and stop. */
  controls: string[]
  stop: boolean
  caret: boolean
  /** The state is handed no stop at all, as a card read back after a relaunch is. */
  handedNoStop?: boolean
}

const written = (names: string[]) => [{ path: SUBJECT, sections: names }]
const streamBody = (store: ProseStore, frames: ReturnType<typeof crank>): void => {
  store.append('r1', 'c1', SUBJECT, BODY)
  frames.frame()
}

const CASES: Case[] = [
  {
    name: 'born',
    as: 'card',
    entry: () => card(),
    seed: () => {},
    head: '',
    controls: ['run-stop'],
    stop: true,
    caret: false
  },
  {
    name: 'quiet (running, notes only)',
    as: 'card',
    entry: () => card({ notes: [{ text: '- (decision) Chose one reader', at: NOW - 60_000 }] }),
    seed: () => {},
    head: '',
    controls: ['run-stop'],
    stop: true,
    caret: false
  },
  {
    name: 'streaming',
    as: 'card',
    entry: () => card(),
    seed: streamBody,
    head: 'writing · §2 Scope',
    controls: ['run-stop'],
    stop: true,
    caret: true
  },
  {
    name: 'revising',
    as: 'card',
    entry: () => card({ documents: written(['Vision']) }),
    seed: (store, frames) => {
      streamBody(store, frames)
      store.commit('r1', SUBJECT, 'e1', BODY.replace('what it is for', 'who it is for'))
      frames.frame()
    },
    head: 'revising · §1 Vision',
    controls: ['run-stop'],
    stop: true,
    caret: true
  },
  {
    name: 'stopped',
    as: 'card',
    entry: () => card({ status: 'stopped', endedAt: NOW, documents: written(['Vision']) }),
    seed: streamBody,
    head: 'stopped · §1 Vision',
    controls: [],
    stop: false,
    caret: false
  },
  {
    name: 'failed',
    as: 'card',
    entry: () => card({ status: 'failed', endedAt: NOW, documents: written(['Vision']) }),
    seed: streamBody,
    head: 'failed · §1 Vision',
    controls: [],
    stop: false,
    caret: false
  },
  {
    name: 'finished',
    as: 'card',
    entry: () => card({ status: 'finished', endedAt: NOW, documents: written(['Vision', 'Scope']) }),
    seed: streamBody,
    head: 'saved · just now · 2 sections',
    controls: [],
    stop: false,
    caret: false
  },
  {
    name: 'dead (terminal, hydrated, no stop)',
    as: 'card',
    entry: () => card({ status: 'failed', endedAt: NOW, documents: written([]) }),
    seed: (store) => store.seed('r1', [{ callId: 'c', path: SUBJECT, text: BODY, written: BODY.length, sections: [] }]),
    head: 'failed',
    controls: [],
    stop: false,
    caret: false,
    handedNoStop: true
  },
  {
    name: 'collapsed line',
    as: 'line',
    entry: () => card(),
    seed: streamBody,
    head: '',
    controls: ['run-card-line-button', 'run-stop'],
    stop: true,
    caret: false
  }
]

type Drawn = { root: HTMLElement; store: ProseStore; frames: ReturnType<typeof crank> }

function drawCase(each: Case): Drawn {
  // The clock is the test's: every elapsed time and age is read against NOW, and nothing ticks until it is told to.
  vi.useFakeTimers({ now: NOW, toFake: ['setInterval', 'clearInterval', 'Date'] })
  const frames = crank()
  const store = createProseStore(frames)
  each.seed(store, frames)
  // The dead card is handed no stop; every other state is handed one, and draws it only while its run is in flight.
  const onStop = each.handedNoStop === true ? undefined : () => {}
  const element =
    each.as === 'line'
      ? createElement(RunCardLine, { entry: each.entry(), name: 'John', prose: store, onExpand: () => {}, onStop })
      : createElement(RunCard, { entry: each.entry(), prose: store, onStop })
  mounted = mount(element)
  return { root: mounted.container, store, frames }
}

function reducedMotion(): { calls: () => number } {
  let calls = 0
  vi.stubGlobal('matchMedia', (query: string) => {
    calls += 1
    return {
      matches: /prefers-reduced-motion/.test(query),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {}
    }
  })
  return { calls: () => calls }
}

describe.each([
  ['motion as the system has it', false],
  ['reduced motion', true]
])('Epic 3 promised nothing it did not keep, under %s', (_label, reduced) => {
  // jsdom applies no media query, so the setting changes nothing a mount can see; what this pins is that no component asked.
  let media: { calls: () => number } | undefined
  beforeEach(() => {
    media = reduced ? reducedMotion() : undefined
  })
  afterEach(() => {
    expect(media?.calls() ?? 0).toBe(0)
  })

  it.each(CASES)('draws no spinner, skeleton, bar or stand-in sentence, and no denominator, when $name', (each) => {
    const { root } = drawCase(each)
    expect(root.innerHTML).not.toMatch(SPINNER_MARKUP)
    expect(spoken(root)).not.toMatch(STAND_IN)
    expect(spoken(root)).not.toMatch(DENOMINATOR)
    // No word of the card is a promise of more to come: only the foot's named list says what is still to write.
    expect(spoken(root)).not.toMatch(/nothing written|opens when|awaiting|yet to/i)
  })

  it.each(CASES)('draws its head, its caret and its elapsed as the state is, and asks nothing of the motion setting, when $name', (each) => {
    const { root } = drawCase(each)
    if (each.as === 'card') {
      expect(root.querySelector('.run-card-status')?.textContent ?? '').toBe(each.head)
      // The dot is hidden from a reader: the head's word, or the foot in dead air, is what carries the state.
      expect(root.querySelector('.status-dot')?.getAttribute('aria-hidden')).toBe('true')
    } else {
      expect(root.querySelector('.run-card-line-reason')?.textContent).toBe('§2 Scope')
    }
    expect(root.querySelectorAll('.caret').length).toBe(each.caret ? 1 : 0)
    expect(root.querySelector('.run-card-elapsed')?.textContent).toMatch(/^(?:\d+m )?\d+s$/)
  })

  it.each(CASES)('offers no dialog, no resolve, merge, revert, lock, restore or undo word, and only its own controls, when $name', (each) => {
    const { root } = drawCase(each)
    expect(root.querySelector('dialog, [role$="dialog"], [aria-modal], [aria-haspopup], [popover]')).toBeNull()
    expect(spoken(root)).not.toMatch(ARBITRATION)
    const buttons = [...root.querySelectorAll('button')]
    expect(buttons.map((button) => button.className.split(' ')[0])).toEqual(each.controls)
    if (each.stop) {
      expect(root.querySelector('.run-stop')?.textContent).toBe('stop')
    }
    // Nothing else is a control: no link, no input, no select, no role of one.
    expect(root.querySelectorAll('a, input, select, textarea, [role="button"], [role="menuitem"], [role="link"]')).toHaveLength(0)
  })

  it('draws no caret and no control on a terminal card, whatever it held, and leaves aria-busy only on a run in flight', () => {
    for (const each of CASES.filter((one) => one.as === 'card')) {
      const { root } = drawCase(each)
      const flying = each.stop
      expect(root.querySelector('[aria-busy="true"]') !== null, each.name).toBe(flying)
      if (!flying) {
        expect(root.querySelector('.caret'), each.name).toBeNull()
        expect(root.querySelector('button'), each.name).toBeNull()
      }
      mounted?.unmount()
    }
  })

  it('still says none of it after ten minutes in flight: no late spinner, no still-working sentence, no denominator', () => {
    for (const each of CASES.filter((one) => one.stop)) {
      const { root } = drawCase(each)
      act(() => void vi.advanceTimersByTime(10 * 60_000))
      expect(root.innerHTML, each.name).not.toMatch(SPINNER_MARKUP)
      expect(spoken(root), each.name).not.toMatch(STAND_IN)
      expect(spoken(root), each.name).not.toMatch(DENOMINATOR)
      expect(spoken(root), each.name).not.toMatch(/still|yet to|nothing written/i)
      expect(root.querySelector('.run-card-elapsed')?.textContent, each.name).toMatch(/^\d+m \d\ds$/)
      mounted?.unmount()
    }
  })
})

describe('a batch commit, and a streamed delta', () => {
  const PLAN = Array.from({ length: 15 }, (_, at) => `Part ${at + 1}`)

  it('removes the 15 names of the foot in one render, as one removal, with no timer set for it', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] })
    const frames = crank()
    const store = createProseStore(frames)
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let commits = 0
    const render = (entry: RunCardEntry): void =>
      act(() =>
        root.render(createElement(Profiler, { id: 'card', onRender: () => void (commits += 1) }, createElement(RunCard, { entry, prose: store })))
      )
    try {
      render(card({ plan: PLAN }))
      store.append('r1', 'c1', SUBJECT, PLAN.map((name) => `## ${name}\nwords\n`).join(''))
      frames.frame()
      expect(container.querySelectorAll('.run-card-foot-name')).toHaveLength(15)
      expect(container.querySelector('.run-card-foot-count')?.textContent).toBe('15 to write')

      const foot = container.querySelector('.run-card-foot') as HTMLElement
      const section = container.querySelector('.run-card') as HTMLElement
      const insideFoot = new MutationObserver(() => {})
      insideFoot.observe(foot, { childList: true, subtree: true, characterData: true })
      const ofCard = new MutationObserver(() => {})
      ofCard.observe(section, { childList: true })
      const timers = vi.getTimerCount()
      const before = commits

      render(card({ plan: PLAN, documents: written(PLAN) }))

      expect(commits - before).toBe(1)
      // The foot leaves whole: it is one node removed from the card, and no name was taken out of it first.
      const removals = ofCard.takeRecords().filter((record) => record.removedNodes.length > 0)
      expect(removals).toHaveLength(1)
      expect([...removals[0].removedNodes]).toEqual([foot])
      expect(insideFoot.takeRecords()).toHaveLength(0)
      expect(container.querySelector('.run-card-foot')).toBeNull()
      // Nothing was scheduled to do it, and nothing is waiting to finish it.
      expect(vi.getTimerCount()).toBe(timers)
      insideFoot.disconnect()
      ofCard.disconnect()
    } finally {
      act(() => root.unmount())
      container.remove()
    }
  })

  it('writes a 500-character delta as one text-node write in its frame, never one per character', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['setInterval', 'clearInterval', 'Date'] })
    const frames = crank()
    const store = createProseStore(frames)
    mounted = mount(createElement(RunCard, { entry: card(), prose: store }))
    const node = mounted.container.querySelector('.run-card-text') as HTMLElement
    const observer = new MutationObserver(() => {})
    observer.observe(node, { characterData: true, childList: true, subtree: true })

    // One delta of 500 characters, and then the same 500 as 500 pieces arriving inside one frame.
    store.append('r1', 'c1', SUBJECT, 'a'.repeat(500))
    frames.frame()
    expect(observer.takeRecords()).toHaveLength(1)
    for (let at = 0; at < 500; at += 1) store.append('r1', 'c1', SUBJECT, 'b')
    frames.frame()
    expect(observer.takeRecords()).toHaveLength(1)
    expect(node.textContent).toBe('a'.repeat(500) + 'b'.repeat(500))
    observer.disconnect()
  })
})

describe('the rail rows the stream annotates', () => {
  const row = (text: string, owners?: string[]): RailRow => ({
    path: SUBJECT,
    state: 'changing',
    annotation: owners === undefined ? { text, owner: { agentId: PM } } : { text, owners: owners.map((agentId) => ({ agentId })) }
  })
  const ROWS: [string, RailRow][] = [
    ['writing', row(progressLabel(false, { name: 'Scope', n: 2 }))],
    ['revising', row(progressLabel(true, { name: 'Vision', n: 1 }))],
    ['stopped', row(STOPPED)],
    ['contention', row(CONTENTION, [PM, 'bmad-agent-architect'])]
  ]

  const drawRow = (each: RailRow): HTMLElement => {
    mounted = mount(
      createElement('ul', null, createElement(OutputRow, {
        row: each,
        ownerName: ownerLabel(each, new Map([[PM, 'John'], ['bmad-agent-architect', 'Winston']])),
        now: NOW,
        tabStop: true,
        onOpen: () => {},
        onKey: () => {},
        buttonRef: () => {}
      }) as ReactElement)
    )
    return mounted.container
  }

  it.each(ROWS)('draws one button, to open, and no dialog, no arbitration word and no denominator when %s', (_name, each) => {
    const root = drawRow(each)
    expect(root.querySelectorAll('button')).toHaveLength(1)
    expect(root.querySelectorAll('a, input, select, [role="button"], dialog, [role="dialog"], [aria-modal]')).toHaveLength(0)
    expect(root.innerHTML).not.toMatch(SPINNER_MARKUP)
    expect(spoken(root)).not.toMatch(ARBITRATION)
    expect(spoken(root)).not.toMatch(DENOMINATOR)
    expect(spoken(root)).not.toMatch(STAND_IN)
    // The annotation says its words and nothing about the disk: the watcher's own state sits beside it.
    expect(root.querySelector('.output-row-annotation')?.textContent).toBe(each.annotation?.text)
  })

  it('spells the four annotations as `writing · §N <Name>`, `revising · §N <Name>`, `stopped` and `contention`', () => {
    expect(ROWS.map(([, each]) => each.annotation?.text)).toEqual(['writing · §2 Scope', 'revising · §1 Vision', 'stopped', 'contention'])
  })
})

describe('reduced motion, drawn', () => {
  it('keeps the elapsed counter ticking, the caret in the markup and every state string present, and reads no media query to do it', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['setInterval', 'clearInterval', 'Date'] })
    const media = reducedMotion()
    const frames = crank()
    const store = createProseStore(frames)
    store.append('r1', 'c1', SUBJECT, BODY)
    frames.frame()
    mounted = mount(createElement(RunCard, { entry: card({ at: NOW - 4_000 }), prose: store, onStop: () => {} }))
    const root = mounted.container
    expect(root.querySelector('.run-card-elapsed')?.textContent).toBe('4s')
    expect(root.querySelector('.run-card-status')?.textContent).toBe('writing · §2 Scope')
    expect(root.querySelector('.caret')).not.toBeNull()
    // The caret is not hidden by any attribute or inline style: nothing in the markup turns it off.
    const caret = root.querySelector('.caret') as HTMLElement
    expect(caret.hidden).toBe(false)
    expect(caret.getAttribute('style')).toBeNull()

    act(() => void vi.advanceTimersByTime(1_000))
    expect(root.querySelector('.run-card-elapsed')?.textContent).toBe('5s')
    act(() => void vi.advanceTimersByTime(60_000))
    expect(root.querySelector('.run-card-elapsed')?.textContent).toBe('1m 05s')
    expect(root.querySelector('.caret')).not.toBeNull()
    expect(root.querySelector('.run-card-status')?.textContent).toBe('writing · §2 Scope')
    // No component of the card or its dot asked the browser whether motion is reduced.
    expect(media.calls()).toBe(0)
  })

  it('ticks the collapsed line the same way', () => {
    vi.useFakeTimers({ now: NOW, toFake: ['setInterval', 'clearInterval', 'Date'] })
    const media = reducedMotion()
    mounted = mount(createElement(RunCardLine, { entry: card({ at: NOW - 4_000 }), name: 'John', prose: createProseStore(crank()), onExpand: () => {} }))
    expect(mounted.container.querySelector('.run-card-elapsed')?.textContent).toBe('4s')
    act(() => void vi.advanceTimersByTime(2_000))
    expect(mounted.container.querySelector('.run-card-elapsed')?.textContent).toBe('6s')
    expect(media.calls()).toBe(0)
  })
})
