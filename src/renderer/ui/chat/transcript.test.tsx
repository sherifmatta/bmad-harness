// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { createProseStore } from './prose-store'
import { pinnedRun, Turns } from './transcript'
import type { RunCollapse } from './transcript'
import type { RunCardEntry, TranscriptEntry } from './transcript-entry'

const PM = 'bmad-agent-pm'
const ARCHITECT = 'bmad-agent-architect'

const card = (id: string, over: Partial<RunCardEntry> = {}): RunCardEntry => ({
  kind: 'run',
  id,
  at: 100,
  runId: id,
  sessionId: `s-${id}`,
  agentId: PM,
  status: 'running',
  notes: [],
  documents: [],
  ...over
})

const user = (id: string, at: number): TranscriptEntry => ({ kind: 'user', id, at, text: `said ${id}` })

describe('pinnedRun (Story 3.14)', () => {
  it('is the viewed persona’s run in flight', () => {
    const pm = card('r1')
    expect(pinnedRun([user('u1', 50), pm], PM)).toBe(pm)
  })

  it('is nothing for a plain chat turn', () => {
    expect(pinnedRun([user('u1', 50)], PM)).toBeNull()
    expect(pinnedRun([], PM)).toBeNull()
  })

  it('is nothing for another persona’s run: only the viewed persona’s card pins', () => {
    expect(pinnedRun([card('r1')], ARCHITECT)).toBeNull()
  })

  it('is nothing with no viewed persona, and nothing for a card with no agent id', () => {
    expect(pinnedRun([card('r1')], undefined)).toBeNull()
    expect(pinnedRun([card('r1', { agentId: undefined })], PM)).toBeNull()
  })

  it('is nothing for a card in any terminal state', () => {
    for (const status of ['finished', 'stopped', 'failed'] as const) {
      expect(pinnedRun([card('r1', { status })], PM), status).toBeNull()
    }
  })

  it('takes the greatest `at` of two runs in flight, and the later entry on a tie', () => {
    const older = card('r1', { at: 100 })
    const newer = card('r2', { at: 200 })
    expect(pinnedRun([newer, older], PM)).toBe(newer)
    expect(pinnedRun([older, newer], PM)).toBe(newer)
    const tied = card('r3', { at: 100 })
    expect(pinnedRun([older, tied], PM)).toBe(tied)
    expect(pinnedRun([tied, older], PM)).toBe(older)
  })

  it('ignores a terminal card that is newer than the one in flight', () => {
    const running = card('r1', { at: 100 })
    expect(pinnedRun([running, card('r2', { at: 300, status: 'finished' })], PM)).toBe(running)
  })
})

describe('Turns with a pinned run (Story 3.14)', () => {
  const draw = (entries: readonly TranscriptEntry[], pinnedRunId?: string): string => {
    const prose = createProseStore({ raf: (run) => run() })
    return renderToStaticMarkup(<Turns entries={entries} prose={prose} pinnedRunId={pinnedRunId} />)
  }
  const cards = (markup: string): number => (markup.match(/class="run-card"/g) ?? []).length

  it('draws the card at its time position when nothing is pinned', () => {
    const markup = draw([user('u1', 50), card('r1', { at: 100 }), user('u2', 150)])
    expect(cards(markup)).toBe(1)
    expect(markup.indexOf('said u1')).toBeLessThan(markup.indexOf('run-card'))
    expect(markup.indexOf('run-card')).toBeLessThan(markup.indexOf('said u2'))
  })

  it('skips the pinned entry and draws every other card and turn', () => {
    const markup = draw([user('u1', 50), card('r1', { at: 100 }), card('r2', { at: 200 }), user('u2', 250)], 'r2')
    expect(cards(markup)).toBe(1)
    expect(markup).toContain('said u1')
    expect(markup).toContain('said u2')
    expect(markup.indexOf('said u1')).toBeLessThan(markup.indexOf('run-card'))
    expect(markup.indexOf('run-card')).toBeLessThan(markup.indexOf('said u2'))
  })

  it('draws no card when the only one is the pinned one', () => {
    expect(cards(draw([card('r1')], 'r1'))).toBe(0)
  })
})

describe('Turns with collapsed cards (Story 3.5)', () => {
  const ARCH = 'bmad-agent-architect'
  const collapse = (over: Partial<RunCollapse> = {}): RunCollapse => ({
    viewedId: ARCH,
    expanded: new Set(),
    nameOf: (agentId) => (agentId === PM ? 'John' : (agentId ?? '')),
    onExpand: () => {},
    ...over
  })
  const draw = (entries: readonly TranscriptEntry[], toCollapse: RunCollapse | undefined, pinnedRunId?: string): string => {
    const prose = createProseStore({ raf: (run) => run() })
    return renderToStaticMarkup(<Turns entries={entries} prose={prose} pinnedRunId={pinnedRunId} collapse={toCollapse} />)
  }
  const count = (markup: string, className: string): number => (markup.match(new RegExp(`class="${className}[ "]`, 'g')) ?? []).length

  it('draws a running card of a persona that is not viewed as one line, and no card', () => {
    const markup = draw([card('r1')], collapse())
    expect(count(markup, 'run-card-line')).toBe(1)
    expect(count(markup, 'run-card')).toBe(0)
    expect(markup).toContain('John')
  })

  it('draws every card full without `collapse`, as before', () => {
    const markup = draw([card('r1')], undefined)
    expect(count(markup, 'run-card-line')).toBe(0)
    expect(count(markup, 'run-card')).toBe(1)
  })

  it('draws the viewed persona’s running card full, in the thread when it is not the pinned one', () => {
    const markup = draw([card('r1')], collapse({ viewedId: PM }))
    expect(count(markup, 'run-card-line')).toBe(0)
    expect(count(markup, 'run-card')).toBe(1)
  })

  it('draws the pinned entry in neither form: the slot has it', () => {
    const markup = draw([card('r1')], collapse(), 'r1')
    expect(count(markup, 'run-card-line')).toBe(0)
    expect(count(markup, 'run-card')).toBe(0)
  })

  it('draws a card with no agent id, or an orphan’s, as a line, named by what the window says', () => {
    const markup = draw([card('r1', { agentId: undefined }), card('r2', { agentId: 'bmad-agent-ghost', at: 200 })], collapse({ viewedId: undefined }))
    expect(count(markup, 'run-card-line')).toBe(2)
    expect(markup).toContain('bmad-agent-ghost')
    expect(markup.match(/class="run-card-line-name"/g)).toHaveLength(1)
  })

  it('draws a terminal card full, however the run ended, and an expanded one full', () => {
    for (const status of ['finished', 'failed', 'stopped'] as const) {
      const markup = draw([card('r1', { status, endedAt: 200 })], collapse())
      expect(count(markup, 'run-card-line'), status).toBe(0)
      expect(count(markup, 'run-card'), status).toBe(1)
    }
    const expanded = draw([card('r1')], collapse({ expanded: new Set(['r1']) }))
    expect(count(expanded, 'run-card-line')).toBe(0)
    expect(count(expanded, 'run-card')).toBe(1)
  })

  it('keeps the line at its time position among the turns', () => {
    const markup = draw([user('u1', 50), card('r1', { at: 100 }), user('u2', 150)], collapse())
    expect(markup.indexOf('said u1')).toBeLessThan(markup.indexOf('run-card-line'))
    expect(markup.indexOf('run-card-line')).toBeLessThan(markup.indexOf('said u2'))
  })

  it('asks the card to take focus for the run named by `focusRunId` alone, and for no line', () => {
    const entries = [card('r1', { at: 100 }), card('r2', { at: 200 }), card('r3', { at: 300, agentId: ARCH })]
    const markup = draw(entries, collapse({ expanded: new Set(['r1', 'r2']), focusRunId: 'r1' }))
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(1)
    // The card of r1 comes first, and the one tabindex is on it and not on r2's.
    const sections = markup.split('<section').slice(1)
    expect(sections).toHaveLength(3)
    expect(sections[0]).toContain('tabindex="-1"')
    expect(sections[1]).not.toContain('tabindex')
    expect(draw(entries, collapse({ expanded: new Set(['r1', 'r2']) })).match(/tabindex/g)).toBeNull()
    // A line is never a focus target.
    expect(draw([card('r1')], collapse({ focusRunId: 'r1' })).match(/tabindex/g)).toBeNull()
  })
})

describe('Turns with a run revealed from elsewhere (Story 3.10)', () => {
  // jsdom has no scrollIntoView: the stub records the element it was called on.
  let scrolled: Element[]
  beforeEach(() => {
    scrolled = []
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this)
    }
  })
  let mounted: Mounted | null = null
  afterEach(() => {
    mounted?.unmount()
    mounted = null
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  const ended = (id: string, at: number): RunCardEntry => card(id, { at, status: 'finished', endedAt: at + 1 })
  const collapse = (over: Partial<RunCollapse> = {}): RunCollapse => ({
    viewedId: ARCHITECT,
    expanded: new Set(),
    nameOf: () => 'John',
    onExpand: () => {},
    ...over
  })
  const drawLive = (entries: readonly TranscriptEntry[], toCollapse: RunCollapse): HTMLElement => {
    const prose = createProseStore({ raf: (run) => run() })
    mounted = mount(<Turns entries={entries} prose={prose} collapse={toCollapse} />)
    return mounted.container
  }

  it('scrolls the one card named by `revealRunId` into view, and no other, and spends the request once', () => {
    const spent: number[] = []
    const entries = [ended('r1', 100), ended('r2', 200), ended('r3', 300)]

    const container = drawLive(entries, collapse({ revealRunId: 'r2', onRevealed: () => void spent.push(spent.length) }))

    const sections = [...container.querySelectorAll('section.run-card')]
    expect(sections).toHaveLength(3)
    expect(scrolled).toEqual([sections[1]])
    expect(spent).toEqual([0])
    expect(document.activeElement).toBe(document.body)
  })

  it('scrolls nothing with no reveal, and nothing for an id no card in the thread has', () => {
    const entries = [ended('r1', 100), user('u1', 150)]
    drawLive(entries, collapse())
    expect(scrolled).toEqual([])

    mounted?.unmount()
    drawLive(entries, collapse({ revealRunId: 'r9', onRevealed: () => {} }))
    expect(scrolled).toEqual([])
  })
})
