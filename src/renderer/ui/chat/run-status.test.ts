import { describe, expect, it } from 'vitest'
import { bodyNotes, collapsedReason, isCollapsed, noteOf, progressWords, runDotState, runLifecycleLine, runStatusText, startNote, subjectWritten } from './run-status'
import { NO_PROGRESS } from './prose-store'
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
  steps: [],
  documents: [],
  ...over
})

describe('the run card’s words', () => {
  it('read writing, then saved with its age and the count of sections, or failed or stopped', () => {
    expect(runStatusText(card(), 5_000, [])).toBe('writing')
    expect(runStatusText(card({ status: 'finished', endedAt: 2_000 }), 2_500, ['Vision', 'Scope'])).toBe('saved · just now · 2 sections')
    expect(runStatusText(card({ status: 'finished', endedAt: 2_000 }), 2_000 + 5 * 60_000, ['Vision'])).toBe('saved · 5m · 1 section')
    expect(runStatusText(card({ status: 'failed', endedAt: 2_000 }), 3_000, [])).toBe('failed')
    expect(runStatusText(card({ status: 'stopped', endedAt: 2_000 }), 3_000, [])).toBe('stopped')
  })

  it('say what a run in flight is doing: writing or revising, with the section by its place among those seen', () => {
    expect(progressWords({ revising: false })).toBe('writing')
    expect(progressWords({ revising: false, section: { name: 'Glossary', n: 4 } })).toBe('writing · §4 Glossary')
    expect(progressWords({ revising: true, section: { name: 'Vision', n: 2 } })).toBe('revising · §2 Vision')
    expect(progressWords({ revising: true })).toBe('revising')
    const running = card()
    expect(runStatusText(running, 5_000, [], { revising: false, section: { name: 'Vision', n: 2 } }, true)).toBe('writing · §2 Vision')
    // A card that has ended says what became of it, whatever progress it had.
    const progress = { revising: true, section: { name: 'Vision', n: 2 } }
    expect(runStatusText(card({ status: 'finished', endedAt: 2_000 }), 2_500, ['A', 'B'], progress)).toBe('saved · just now · 2 sections')
    expect(runStatusText(card({ status: 'stopped', endedAt: 2_000 }), 3_000, [], progress)).toBe('stopped')
    expect(runStatusText(card({ status: 'failed', endedAt: 2_000 }), 3_000, [], progress)).toBe('failed')
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
    expect(subjectWritten(entry, 'prd.md')).toHaveLength(2)
    expect(subjectWritten(entry, 'unknown.md')).toHaveLength(0)
    expect(subjectWritten(entry, undefined)).toHaveLength(0)
    expect(runStatusText(card({ ...entry, status: 'finished', endedAt: 2_000 }), 2_500, subjectWritten(entry, 'prd.md'))).toBe(
      'saved · just now · 2 sections'
    )
  })

  it('never carry a denominator', () => {
    for (const status of ['running', 'finished', 'failed', 'stopped'] as const) {
      for (const written of [[], ['Vision'], ['Vision', 'Scope']]) {
        expect(runStatusText(card({ status, endedAt: 2_000 }), 3_000, written)).not.toMatch(/\bof\b|\//)
        expect(runLifecycleLine(card({ status, endedAt: 2_000 }), 'John', written)).not.toMatch(/\bof\b|\//)
      }
    }
    // Zero, stated plainly, through the shared spelling (`section-progress.test.ts` pins the word itself).
    expect(runLifecycleLine(card({ status: 'finished' }), 'John', [])).toBe('John · saved · 0 sections')
  })

  it('give the dot work while writing, live once saved, and error otherwise', () => {
    expect(runDotState(card())).toBe('work')
    expect(runDotState(card({ status: 'finished' }))).toBe('live')
    expect(runDotState(card({ status: 'failed' }))).toBe('error')
    expect(runDotState(card({ status: 'stopped' }))).toBe('error')
  })

  it('announce the persona and what became of the run', () => {
    expect(runLifecycleLine(card(), 'John', [])).toBe('John · writing')
    expect(runLifecycleLine(card({ status: 'finished' }), 'John', ['A', 'B', 'C'])).toBe('John · saved · 3 sections')
    expect(runLifecycleLine(card({ status: 'failed' }), 'John', [])).toBe('John · failed')
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
    expect(runStatusText(card(), 5_000, [], undefined, false)).toBe('')
    expect(runStatusText(card(), 5_000, [], { revising: false }, false)).toBe('')
    expect(progressWords({ revising: false }, false)).toBe('')
    expect(progressWords({ revising: true, section: { name: 'Vision', n: 2 } }, false)).toBe('')
    expect(progressWords({ revising: false }, true)).toBe('writing')
  })

  it('leaves every terminal head as it was, whether or not text is held', () => {
    for (const hasText of [false, true]) {
      expect(runStatusText(card({ status: 'finished', endedAt: 2_000 }), 2_500, ['A', 'B'], undefined, hasText)).toBe('saved · just now · 2 sections')
      expect(runStatusText(card({ status: 'failed', endedAt: 2_000 }), 3_000, [], undefined, hasText)).toBe('failed')
      expect(runStatusText(card({ status: 'stopped', endedAt: 2_000 }), 3_000, [], undefined, hasText)).toBe('stopped')
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

describe('the collapsed line’s words (Story 3.5)', () => {
  const at = (n: number): number => 1_000 * n

  it('reads the reason of the last note, not the first, and not the section beside it', () => {
    const entry = card({
      notes: [
        { text: '- (decision) Fast path', at: at(2) },
        { text: '- (assumption) Two readers only', at: at(3) }
      ]
    })
    expect(collapsedReason(entry, { revising: false })).toBe('Two readers only')
    expect(collapsedReason(entry, { revising: false, section: { name: 'Context', n: 2 } })).toBe('Two readers only')
    // Exactly what the feed draws: the entry's tag taken apart by the same parser.
    expect(collapsedReason(entry, { revising: false })).toBe(noteOf(entry.notes[1].text, at(3)).reason)
  })

  it('reads an untagged note whole, and an empty note with no section as empty', () => {
    expect(collapsedReason(card({ notes: [{ text: 'plain words', at: at(2) }] }), { revising: false })).toBe('plain words')
    expect(collapsedReason(card({ notes: [{ text: '- (note) ', at: at(2) }] }), { revising: false })).toBe('')
  })

  it('shows a marked-up reason as plain words: the `**` emphasis markers are dropped, the text kept', () => {
    const marked = (text: string) => collapsedReason(card({ notes: [{ text, at: at(2) }] }), { revising: false })
    expect(marked('- (decision) **Fast path** chosen over the coached one')).toBe('Fast path chosen over the coached one')
    expect(marked('- (note) Two **readers** only, **no admin**')).toBe('Two readers only, no admin')
    // An unpaired marker is literal text, as the feed has it.
    expect(marked('- (note) a ** b')).toBe('a ** b')
  })

  it('falls through to the section when the last note’s reason is empty or only whitespace, and to nothing without one', () => {
    const section = { revising: false, section: { name: 'Context', n: 2 } }
    for (const text of ['- (note) ', '- (note)    ', '- (note) ****', '']) {
      expect(collapsedReason(card({ notes: [{ text: '- (decision) Earlier', at: at(2) }, { text, at: at(3) }] }), section), text).toBe('§2 Context')
      expect(collapsedReason(card({ notes: [{ text, at: at(3) }] }), { revising: false }), text).toBe('')
    }
  })

  it('falls back to the section the text has shown, as the head says it, before any note', () => {
    expect(collapsedReason(card(), { revising: false, section: { name: 'Context', n: 2 } })).toBe('§2 Context')
    expect(collapsedReason(card(), { revising: true, section: { name: 'Vision', n: 1 } })).toBe('§1 Vision')
  })

  it('is empty with neither: nothing stands in for the reason, and the start row is never a note', () => {
    expect(collapsedReason(card(), { revising: false })).toBe('')
    expect(collapsedReason(card(), { revising: true })).toBe('')
    expect(collapsedReason(card(), NO_PROGRESS)).toBe('')
    expect(collapsedReason(card(), NO_PROGRESS)).not.toBe(startNote(card()).reason)
  })

  it('collapses a running card whose persona is not the one viewed, and no other', () => {
    const none = new Set<string>()
    expect(isCollapsed(card(), 'bmad-agent-architect', none)).toBe(true)
    expect(isCollapsed(card(), 'bmad-agent-pm', none)).toBe(false)
  })

  it('collapses an orphan’s card and a card with no agent id, whoever is viewed, or nobody', () => {
    const none = new Set<string>()
    expect(isCollapsed(card({ agentId: 'bmad-agent-ghost' }), 'bmad-agent-pm', none)).toBe(true)
    expect(isCollapsed(card({ agentId: undefined }), 'bmad-agent-pm', none)).toBe(true)
    expect(isCollapsed(card({ agentId: undefined }), undefined, none)).toBe(true)
    expect(isCollapsed(card(), undefined, none)).toBe(true)
  })

  it('never collapses a terminal card: finished, failed or stopped', () => {
    for (const status of ['finished', 'failed', 'stopped'] as const) {
      expect(isCollapsed(card({ status, endedAt: 2_000 }), 'bmad-agent-architect', new Set()), status).toBe(false)
    }
  })

  it('keeps a card the user expanded drawn full, by its run id and no other', () => {
    expect(isCollapsed(card(), 'bmad-agent-architect', new Set(['r1']))).toBe(false)
    expect(isCollapsed(card(), 'bmad-agent-architect', new Set(['r2']))).toBe(true)
    expect(isCollapsed(card({ agentId: undefined }), undefined, new Set(['r1']))).toBe(false)
  })
})

describe('a run that ended early (Story 3.8)', () => {
  /** A card whose subject has had `sections` confirmed written, as a commit names them. */
  const written = (status: 'stopped' | 'failed', sections: readonly string[]): RunCardEntry =>
    card({ status, endedAt: 2_000, documents: [{ path: 'prd.md', sections: [...sections] }] })

  const NAMES = ['0. Document Purpose', '1. Vision', '2. Goals', '3. Scope']

  it('names the section the last confirmed write reached, by its place in that write’s names', () => {
    const stopped = written('stopped', NAMES)
    expect(runStatusText(stopped, 3_000, subjectWritten(stopped, 'prd.md'))).toBe('stopped · §4 Scope')
    const failed = written('failed', NAMES)
    expect(runStatusText(failed, 3_000, subjectWritten(failed, 'prd.md'))).toBe('failed · §4 Scope')
    // One name confirmed is §1, and the place is the array's length, never a share of a plan.
    expect(runStatusText(written('stopped', ['Vision']), 3_000, ['Vision'])).toBe('stopped · §1 Vision')
  })

  it('reads the bare word when nothing was confirmed: interrupted mid-Write, the subject has no commit', () => {
    const entry = card({ status: 'stopped', endedAt: 2_000, documents: [] })
    expect(subjectWritten(entry, 'prd.md')).toEqual([])
    expect(runStatusText(entry, 3_000, subjectWritten(entry, 'prd.md'))).toBe('stopped')
    expect(runStatusText(entry, 3_000, subjectWritten(entry, 'prd.md'))).not.toMatch(/§/)
    expect(runStatusText(card({ status: 'failed', endedAt: 2_000 }), 3_000, [])).toBe('failed')
  })

  it('never reads the streamed text: prose past the last commit names the commit’s last section', () => {
    const entry = written('stopped', NAMES)
    // The prose store had streamed as far as §7; the head names §4, which is what a `tool_result` confirmed.
    const prose = { revising: false, section: { name: 'Open Questions', n: 7 } }
    expect(runStatusText(entry, 3_000, subjectWritten(entry, 'prd.md'), prose, true)).toBe('stopped · §4 Scope')
    expect(runStatusText(entry, 3_000, subjectWritten(entry, 'prd.md'), prose, false)).toBe('stopped · §4 Scope')
  })

  it('names what was last confirmed when a rejected write came after it: a rejection commits no sections', () => {
    // The card's subject still holds the names of its last `ok` commit; the rejected call added none.
    const entry = written('stopped', ['Vision', 'Goals'])
    expect(runStatusText(entry, 3_000, subjectWritten(entry, 'prd.md'))).toBe('stopped · §2 Goals')
  })

  it('never renumbers a repeated heading: the place counts the names a key apart, as the live head does', () => {
    // `sectionHeadings` keeps repeats; the live head places `Goals` at §1, and so does the terminal one.
    const repeated = ['Vision', 'Goals', 'Goals']
    expect(runStatusText(written('stopped', repeated), 3_000, repeated)).toBe('stopped · §2 Goals')
    expect(runStatusText(written('failed', ['Goals', 'Goals']), 3_000, ['Goals', 'Goals'])).toBe('failed · §1 Goals')
    // Numbering in the plan's own names is stripped before the comparison, as the plan strips it.
    expect(runStatusText(written('stopped', ['1. Goals', 'Goals']), 3_000, subjectWritten(written('stopped', ['1. Goals', 'Goals']), 'prd.md'))).toBe(
      'stopped · §1 Goals'
    )
    // The saved head still counts every confirmed heading, repeats and all.
    expect(runStatusText(card({ status: 'finished', endedAt: 2_000 }), 2_500, repeated)).toBe('saved · just now · 3 sections')
  })

  it('announces the run the same way the head reads it, the bare word included', () => {
    const stopped = written('stopped', NAMES)
    expect(runLifecycleLine(stopped, 'John', subjectWritten(stopped, 'prd.md'))).toBe('John · stopped · §4 Scope')
    const failed = written('failed', NAMES)
    expect(runLifecycleLine(failed, 'John', subjectWritten(failed, 'prd.md'))).toBe('John · failed · §4 Scope')
    expect(runLifecycleLine(card({ status: 'stopped' }), 'John', [])).toBe('John · stopped')
    expect(runLifecycleLine(card({ status: 'failed' }), 'John', [])).toBe('John · failed')
    // Word for word the head's, with the persona's name before it.
    for (const entry of [stopped, failed, card({ status: 'stopped' })]) {
      const names = subjectWritten(entry, 'prd.md')
      expect(runLifecycleLine(entry, 'John', names)).toBe(`John · ${runStatusText(entry, 3_000, names)}`)
    }
  })

  it('tells stopped and failed apart in words only: the dot is the one error dot for both', () => {
    expect(runDotState(written('stopped', NAMES))).toBe('error')
    expect(runDotState(written('failed', NAMES))).toBe('error')
  })
})
