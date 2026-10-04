import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { createProseStore } from './prose-store'
import { pinnedRun, Turns } from './transcript'
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
