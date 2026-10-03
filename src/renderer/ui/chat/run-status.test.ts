import { describe, expect, it } from 'vitest'
import { noteOf, runDotState, runLifecycleLine, runStatusText, sectionCount } from './run-status'
import type { RunCardEntry } from './transcript-entry'

const card = (over: Partial<RunCardEntry> = {}): RunCardEntry => ({
  kind: 'run',
  id: 'r1',
  at: 1_000,
  runId: 'r1',
  sessionId: 's1',
  agentId: 'bmad-agent-pm',
  status: 'running',
  notes: [],
  sections: [],
  ...over
})

describe('the run card’s words', () => {
  it('read writing, then saved with its age and the count of sections, or failed or stopped', () => {
    expect(runStatusText(card(), 5_000)).toBe('writing')
    expect(runStatusText(card({ status: 'finished', endedAt: 2_000, sections: ['A', 'B'] }), 2_500)).toBe(
      'saved · just now · 2 sections'
    )
    expect(runStatusText(card({ status: 'finished', endedAt: 2_000, sections: ['A'] }), 2_000 + 5 * 60_000)).toBe(
      'saved · 5m · 1 section'
    )
    expect(runStatusText(card({ status: 'failed', endedAt: 2_000 }), 3_000)).toBe('failed')
    expect(runStatusText(card({ status: 'stopped', endedAt: 2_000 }), 3_000)).toBe('stopped')
  })

  it('never carry a denominator', () => {
    for (const status of ['running', 'finished', 'failed', 'stopped'] as const) {
      expect(runStatusText(card({ status, endedAt: 2_000, sections: ['A'] }), 3_000)).not.toMatch(/\bof\b|\//)
    }
    expect(sectionCount(0)).toBe('0 sections')
  })

  it('give the dot work while writing, live once saved, and error otherwise', () => {
    expect(runDotState(card())).toBe('work')
    expect(runDotState(card({ status: 'finished' }))).toBe('live')
    expect(runDotState(card({ status: 'failed' }))).toBe('error')
    expect(runDotState(card({ status: 'stopped' }))).toBe('error')
  })

  it('announce the persona and what became of the run', () => {
    expect(runLifecycleLine(card(), 'John')).toBe('John · writing')
    expect(runLifecycleLine(card({ status: 'finished', sections: ['A', 'B', 'C'] }), 'John')).toBe('John · saved · 3 sections')
    expect(runLifecycleLine(card({ status: 'failed' }), 'John')).toBe('John · failed')
  })

  it('take a memlog line apart for the feed, with the time it was observed', () => {
    const at = Date.UTC(2026, 9, 3, 9, 7)
    const note = noteOf('- (decision) **Fast** path', at)
    expect(note).toMatchObject({ kind: 'decision', reason: '**Fast** path' })
    expect(note.time).toMatch(/^\d{2}:\d{2}$/)
    expect(noteOf('not an entry', at)).toMatchObject({ kind: null, reason: 'not an entry' })
  })
})
