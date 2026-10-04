import { describe, expect, it } from 'vitest'
import { bodyNotes, noteOf, progressWords, runDotState, runLifecycleLine, runStatusText, sectionCount, startNote, subjectSections, subjectWritten } from './run-status'
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
  documents: [],
  ...over
})

describe('the run card’s words', () => {
  it('read writing, then saved with its age and the count of sections, or failed or stopped', () => {
    expect(runStatusText(card(), 5_000, 0)).toBe('writing')
    expect(runStatusText(card({ status: 'finished', endedAt: 2_000 }), 2_500, 2)).toBe('saved · just now · 2 sections')
    expect(runStatusText(card({ status: 'finished', endedAt: 2_000 }), 2_000 + 5 * 60_000, 1)).toBe('saved · 5m · 1 section')
    expect(runStatusText(card({ status: 'failed', endedAt: 2_000 }), 3_000, 1)).toBe('failed')
    expect(runStatusText(card({ status: 'stopped', endedAt: 2_000 }), 3_000, 1)).toBe('stopped')
  })

  it('say what a run in flight is doing: writing or revising, with the section by its place among those seen', () => {
    expect(progressWords({ revising: false })).toBe('writing')
    expect(progressWords({ revising: false, section: { name: 'Glossary', n: 4 } })).toBe('writing · §4 Glossary')
    expect(progressWords({ revising: true, section: { name: 'Vision', n: 2 } })).toBe('revising · §2 Vision')
    expect(progressWords({ revising: true })).toBe('revising')
    const running = card()
    expect(runStatusText(running, 5_000, 0, { revising: false, section: { name: 'Vision', n: 2 } }, true)).toBe('writing · §2 Vision')
    // A card that has ended says what became of it, whatever progress it had.
    const progress = { revising: true, section: { name: 'Vision', n: 2 } }
    expect(runStatusText(card({ status: 'finished', endedAt: 2_000 }), 2_500, 2, progress)).toBe('saved · just now · 2 sections')
    expect(runStatusText(card({ status: 'stopped', endedAt: 2_000 }), 3_000, 1, progress)).toBe('stopped')
    expect(runStatusText(card({ status: 'failed', endedAt: 2_000 }), 3_000, 1, progress)).toBe('failed')
  })

  it('name the sections a subject has had confirmed written, as the plan names them', () => {
    const entry = card({ documents: [{ path: 'prd.md', sections: ['0. Document Purpose', '1. Vision'] }, { path: 'a.md', sections: ['Other'] }] })
    expect(subjectWritten(entry, 'prd.md')).toEqual(['Document Purpose', 'Vision'])
    expect(subjectWritten(entry, 'unknown.md')).toEqual([])
    expect(subjectWritten(entry, undefined)).toEqual([])
  })

  it('count the sections of the subject document alone, and none without one', () => {
    const entry = card({
      documents: [
        { path: 'addendum.md', sections: ['A', 'B', 'C', 'D', 'E', 'F'] },
        { path: 'prd.md', sections: ['Vision', 'Scope'] }
      ]
    })
    expect(subjectSections(entry, 'prd.md')).toBe(2)
    expect(subjectSections(entry, 'unknown.md')).toBe(0)
    expect(subjectSections(entry, undefined)).toBe(0)
  })

  it('never carry a denominator', () => {
    for (const status of ['running', 'finished', 'failed', 'stopped'] as const) {
      expect(runStatusText(card({ status, endedAt: 2_000 }), 3_000, 1)).not.toMatch(/\bof\b|\//)
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
    expect(runLifecycleLine(card(), 'John', 0)).toBe('John · writing')
    expect(runLifecycleLine(card({ status: 'finished' }), 'John', 3)).toBe('John · saved · 3 sections')
    expect(runLifecycleLine(card({ status: 'failed' }), 'John', 3)).toBe('John · failed')
  })

  it('take a memlog line apart for the feed, with the time it was observed', () => {
    const at = Date.UTC(2026, 9, 3, 9, 7)
    const note = noteOf('- (decision) **Fast** path', at)
    expect(note).toMatchObject({ kind: 'decision', reason: '**Fast** path' })
    expect(note.time).toMatch(/^\d{2}:\d{2}$/)
    expect(noteOf('not an entry', at)).toMatchObject({ kind: null, reason: 'not an entry' })
  })
})

describe('dead air (Story 3.4)', () => {
  it('gives a running card that holds no text no status words, and a word again with the first text', () => {
    expect(runStatusText(card(), 5_000, 0, undefined, false)).toBe('')
    expect(runStatusText(card(), 5_000, 0, { revising: false }, false)).toBe('')
    expect(progressWords({ revising: false }, false)).toBe('')
    expect(progressWords({ revising: true, section: { name: 'Vision', n: 2 } }, false)).toBe('')
    expect(progressWords({ revising: false }, true)).toBe('writing')
  })

  it('leaves every terminal head as it was, whether or not text is held', () => {
    for (const hasText of [false, true]) {
      expect(runStatusText(card({ status: 'finished', endedAt: 2_000 }), 2_500, 2, undefined, hasText)).toBe('saved · just now · 2 sections')
      expect(runStatusText(card({ status: 'failed', endedAt: 2_000 }), 3_000, 1, undefined, hasText)).toBe('failed')
      expect(runStatusText(card({ status: 'stopped', endedAt: 2_000 }), 3_000, 1, undefined, hasText)).toBe('stopped')
    }
  })

  it('make the start row from the card’s own time, with no kind and the reason `run started`', () => {
    const row = startNote(card({ at: Date.UTC(2026, 9, 3, 9, 7) }))
    expect(row).toMatchObject({ kind: null, author: null, reason: 'run started' })
    expect(row.time).toMatch(/^\d{2}:\d{2}$/)
  })

  it('open the body with the start row, then each note in order, and never store the start row in the notes', () => {
    const born = card()
    expect(bodyNotes(born).map((row) => row.reason)).toEqual(['run started'])
    const noted = card({
      notes: [
        { text: '- (decision) First', at: 2_000 },
        { text: '- (open) Second', at: 3_000 }
      ]
    })
    expect(bodyNotes(noted).map((row) => row.reason)).toEqual(['run started', 'First', 'Second'])
    expect(noted.notes).toHaveLength(2)
    for (const status of ['finished', 'failed', 'stopped'] as const) {
      expect(bodyNotes(card({ status, endedAt: 9_000 })).length).toBeGreaterThanOrEqual(1)
    }
  })
})
