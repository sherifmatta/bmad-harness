import { describe, expect, it } from 'vitest'
import type { RunCardSnapshot } from '../../shared/conversation'
import type { ContractEvent } from '../../shared/events'
import type { RailAnnotation } from '../../shared/rail'
import { EMPTY_ANNOTATIONS, NAME_MAX, annotationsOf, foldAnnotations } from './rail-annotations'
import type { AnnotationTable } from './rail-annotations'
import { foldRunCard, startCard } from './run-card'

const PRD = '_bmad/planning-artifacts/prd.md'
const ADDENDUM = '_bmad/planning-artifacts/addendum.md'
const JOHN = 'bmad-agent-pm'

/** `agentId` null is a run with no persona. */
const started = (runId: string, agentId: string | null = JOHN): ContractEvent => ({
  name: 'run:started',
  payload: { runId, sessionId: `s-${runId}`, ...(agentId === null ? {} : { agentId }), code: 'CP', at: 100 }
})
const prose = (runId: string, text: string, path = PRD, callId = 'c1'): ContractEvent => ({
  name: 'doc:prose',
  payload: { runId, sessionId: `s-${runId}`, callId, path, text, at: 110 }
})
const edited = (runId: string, text: string, path = PRD, callId = 'e1'): ContractEvent => ({
  name: 'doc:committed',
  payload: { ok: true, runId, sessionId: `s-${runId}`, callId, path, sections: [], text, at: 120 }
})
const committed = (runId: string, path = PRD, callId = 'c1'): ContractEvent => ({
  name: 'doc:committed',
  payload: { ok: true, runId, sessionId: `s-${runId}`, callId, path, sections: ['Vision'], at: 120 }
})
const rejected = (runId: string, path = PRD, callId = 'c1'): ContractEvent => ({
  name: 'doc:committed',
  payload: { ok: false, runId, sessionId: `s-${runId}`, callId, path, error: { code: 'doc/write-rejected', message: 'x' }, at: 120 }
})
const note = (runId: string): ContractEvent => ({
  name: 'run:note',
  payload: { runId, sessionId: `s-${runId}`, text: '- a note', at: 105 }
})
const ended = (name: 'run:finished' | 'run:stopped' | 'run:failed', runId: string): ContractEvent =>
  name === 'run:failed'
    ? { name, payload: { runId, sessionId: `s-${runId}`, error: { code: 'run/failed', message: 'x' }, at: 200 } }
    : { name, payload: { runId, sessionId: `s-${runId}`, at: 200 } }

/** The run projection's card and the annotation table, folded as main folds them: the card first. */
function world() {
  const cards = new Map<string, RunCardSnapshot>()
  let table: AnnotationTable = EMPTY_ANNOTATIONS
  return {
    send(...events: ContractEvent[]) {
      for (const event of events) {
        if (event.name === 'run:started') cards.set(event.payload.runId, startCard(event.payload))
        else if ('runId' in event.payload) {
          const card = cards.get(event.payload.runId)
          if (card !== undefined) cards.set(card.runId, foldRunCard(card, event))
        }
        table = foldAnnotations(table, event, 'runId' in event.payload ? cards.get(event.payload.runId) : undefined)
      }
      return this
    },
    get table() {
      return table
    },
    get annotations(): Record<string, RailAnnotation> {
      return Object.fromEntries(annotationsOf(table))
    }
  }
}

/** A running card of `r1` that holds `text` for the PRD. */
function cardWith(text: string): RunCardSnapshot {
  return foldRunCard(startCard({ runId: 'r1', sessionId: 's-r1', code: 'CP', at: 100 }), prose('r1', text))
}

const DOC = '# PRD\n\n## 1. Vision\nA.\n\n## 2. Goals\nB.\n'

describe('the annotation fold', () => {
  it('holds nothing for a run that has written nothing, and for events that are not a run’s', () => {
    const w = world().send(started('r1'), note('r1'))

    expect(w.annotations).toEqual({})
    expect(foldAnnotations(EMPTY_ANNOTATIONS, { name: 'session:awaiting-turn', payload: { sessionId: 's1', at: 1 } })).toBe(EMPTY_ANNOTATIONS)
    // A piece of a run it never saw start is not held.
    expect(world().send(prose('ghost', DOC)).annotations).toEqual({})
  })

  it('says `writing` with the owner before any section is seen', () => {
    expect(world().send(started('r1'), prose('r1', 'Some words, no heading yet.\n')).annotations).toEqual({
      [PRD]: { text: 'writing', owner: { agentId: JOHN } }
    })
  })

  it('says the section in flight, by its place among those seen, numbering stripped, with no denominator', () => {
    const w = world().send(started('r1'), prose('r1', '# PRD\n\n## 1. Vision\nA.\n\n## 2. Goals\n'))

    expect(w.annotations[PRD]).toEqual({ text: 'writing · §2 Goals', owner: { agentId: JOHN } })
  })

  it('moves to the next section only once its heading is whole: a half-streamed heading is not yet a section', () => {
    const w = world().send(started('r1'), prose('r1', '## Vision\nA.\n\n## Goals\nB.\n'))
    expect(w.annotations[PRD].text).toBe('writing · §2 Goals')

    w.send(prose('r1', '\n## Sc'))
    expect(w.annotations[PRD].text).toBe('writing · §2 Goals')
    w.send(prose('r1', 'ope\n'))
    expect(w.annotations[PRD].text).toBe('writing · §3 Scope')
  })

  it('has an owner of the run’s persona, and none for a run without one', () => {
    expect(world().send(started('r1', null), prose('r1', DOC)).annotations[PRD]).toEqual({ text: 'writing · §2 Goals' })
    expect(Object.keys(world().send(started('r1', null), prose('r1', DOC)).annotations[PRD])).not.toContain('owner')
  })

  it('gives each file the run holds its own section, the same owner', () => {
    const w = world().send(
      started('r1'),
      prose('r1', '## Notes\nA.\n', ADDENDUM, 'a'),
      prose('r1', '## Vision\nA.\n## Goals\nB.\n## Scope\n', PRD, 'p')
    )

    expect(w.annotations).toEqual({
      [ADDENDUM]: { text: 'writing · §1 Notes', owner: { agentId: JOHN } },
      [PRD]: { text: 'writing · §3 Scope', owner: { agentId: JOHN } }
    })
  })

  describe('a revision', () => {
    const base = world().send(started('r1'), prose('r1', '## Vision\nA.\n\n## Goals\nB.\n\n## Scope\nC.\n'))
    const text = '## Vision\nA.\n\n## Goals\nB, revised.\n\n## Scope\nC.\n'

    it('says `revising` with the section holding the first changed character', () => {
      const w = world().send(started('r1'), prose('r1', '## Vision\nA.\n\n## Goals\nB.\n\n## Scope\nC.\n'), edited('r1', text))

      expect(w.annotations[PRD]).toEqual({ text: 'revising · §2 Goals', owner: { agentId: JOHN } })
      expect(base.annotations[PRD].text).toBe('writing · §3 Scope')
    })

    it('stands until the file’s next `Write` piece returns it to `writing`', () => {
      const w = world().send(started('r1'), prose('r1', '## Vision\nA.\n\n## Goals\nB.\n\n## Scope\nC.\n'), edited('r1', text))
      w.send(prose('r1', '## Vision\nNew.\n\n## Goals\nB.\n', PRD, 'c2'))

      expect(w.annotations[PRD].text).toBe('writing · §2 Goals')
    })

    it('revises per file: an `Edit` of one file leaves another’s `writing`', () => {
      const w = world().send(
        started('r1'),
        prose('r1', '## Notes\nA.\n', ADDENDUM, 'a'),
        prose('r1', '## Vision\nA.\n\n## Goals\nB.\n', PRD, 'p'),
        edited('r1', '## Vision\nA!\n\n## Goals\nB.\n', PRD, 'e1')
      )

      expect(w.annotations[PRD].text).toBe('revising · §1 Vision')
      expect(w.annotations[ADDENDUM].text).toBe('writing · §1 Notes')
    })

    it('never renumbers a section seen: an `Edit` that moves headings keeps their places', () => {
      const w = world().send(started('r1'), prose('r1', '## Vision\nA.\n\n## Goals\nB.\n'))
      w.send(edited('r1', '## Goals\nB.\n\n## Vision\nA!\n', PRD, 'e1'))

      // The first changed character is now in Goals, which the text has first; it keeps the §2 it was seen at.
      expect(w.annotations[PRD].text).toBe('revising · §2 Goals')
    })
  })

  describe('what gives no annotation', () => {
    it('an `Edit` of a file no `Write` of the run started carries no text', () => {
      expect(world().send(started('r1'), committed('r1', PRD, 'e1')).annotations).toEqual({})
    })

    it('a rejected commit makes none, and one of the `Write` that set a path’s text drops that path’s annotation', () => {
      expect(world().send(started('r1'), rejected('r1')).annotations).toEqual({})
      const w = world().send(started('r1'), prose('r1', DOC), prose('r1', '## Notes\nA.\n', ADDENDUM, 'c2'))
      w.send(rejected('r1'))
      expect(Object.keys(w.annotations)).toEqual([ADDENDUM])
    })

    it('a rejected `Edit` leaves what the `Write` before it made, and the next `Write` piece makes it again', () => {
      const w = world().send(started('r1'), prose('r1', DOC))
      const before = w.annotations
      w.send(rejected('r1', PRD, 'e1'))
      expect(w.annotations).toEqual(before)
      w.send(rejected('r1'), prose('r1', DOC, PRD, 'c3'))
      expect(w.annotations).toEqual(before)
    })

    it('keeps what a rejected `Write` held: a retried `Write` numbers the sections from the names already seen, as the head does', () => {
      const w = world().send(started('r1'), prose('r1', '## Vision\nA.\n## Goals\nB.\n', PRD, 'c1'))
      expect(w.annotations[PRD].text).toBe('writing · §2 Goals')

      w.send(rejected('r1', PRD, 'c1'))
      expect(w.annotations).toEqual({})

      // Vision and Goals keep §1 and §2: Risks, the one new name, is §3.
      w.send(prose('r1', '## Goals\nB.\n## Risks\nC.\n', PRD, 'c2'))
      expect(w.annotations[PRD]).toEqual({ text: 'writing · §3 Risks', owner: { agentId: JOHN } })
    })

    it('shows a path again from an applied `Edit` after a rejected `Write`, the offset taken from the text it held', () => {
      const text = '## Vision\nA.\n\n## Goals\nB.\n\n## Scope\nC.\n'
      const w = world().send(started('r1'), prose('r1', text, PRD, 'c1'), rejected('r1', PRD, 'c1'))
      expect(w.annotations).toEqual({})

      w.send(edited('r1', text.replace('B.', 'B, revised.')))

      // The first changed character is in Goals, the second section the held text showed.
      expect(w.annotations[PRD]).toEqual({ text: 'revising · §2 Goals', owner: { agentId: JOHN } })
    })

    it('a confirming commit of a `Write` changes nothing the stream had said', () => {
      const w = world().send(started('r1'), prose('r1', DOC))
      const table = w.table
      w.send(committed('r1'))

      expect(w.table).toBe(table)
    })

    it('a path whose text is empty has no entry', () => {
      expect(world().send(started('r1'), prose('r1', '')).annotations).toEqual({})
      const w = world().send(started('r1'), prose('r1', DOC), edited('r1', ''))
      expect(w.annotations).toEqual({})
    })

    it('leaves the table as it was for a note and for every event that is neither prose nor a commit', () => {
      const w = world().send(started('r1'), prose('r1', DOC))
      const table = w.table
      w.send(
        note('r1'),
        { name: 'persona:state', payload: { agentId: JOHN, state: 'work', at: 1 } },
        { name: 'rail:changed', payload: { revision: 1, rows: [] } },
        { name: 'doc:section-opened', payload: { runId: 'r1', sessionId: 's-r1', callId: 'c1', path: PRD, heading: 'Vision', at: 1 } }
      )

      expect(w.table).toBe(table)
    })
  })

  describe('the end of a run', () => {
    const BRIEF = '_bmad/planning-artifacts/brief.md'
    /** What each terminal event leaves on the ended run's own paths. */
    const leaves: Record<'run:finished' | 'run:stopped' | 'run:failed', RailAnnotation | undefined> = {
      'run:finished': undefined,
      'run:stopped': { text: 'stopped', owner: { agentId: JOHN } },
      'run:failed': { text: 'stopped', owner: { agentId: JOHN } }
    }

    for (const name of ['run:finished', 'run:stopped', 'run:failed'] as const) {
      it(`${name} touches that run’s annotations and no other run’s`, () => {
        const w = world().send(
          started('r1'),
          started('r2', 'bmad-agent-analyst'),
          prose('r1', DOC, PRD, 'a'),
          prose('r2', '## Brief\nX.\n', BRIEF, 'b')
        )
        expect(Object.keys(w.annotations)).toEqual([PRD, BRIEF])

        w.send(ended(name, 'r1'))

        // The other run is still writing, and says so with its own owner.
        expect(w.annotations[BRIEF]).toEqual({ text: 'writing · §1 Brief', owner: { agentId: 'bmad-agent-analyst' } })
        expect(w.annotations[PRD]).toEqual(leaves[name])
      })
    }

    for (const name of ['run:stopped', 'run:failed'] as const) {
      it(`${name} leaves one word on every path the run was showing: no section, no count, no denominator`, () => {
        const w = world().send(started('r1'), prose('r1', DOC, PRD, 'a'), prose('r1', '## Brief\nX.\n', BRIEF, 'b'))
        expect(w.annotations[PRD].text).toBe('writing · §2 Goals')

        w.send(ended(name, 'r1'))

        expect(w.annotations).toEqual({
          [PRD]: { text: 'stopped', owner: { agentId: JOHN } },
          [BRIEF]: { text: 'stopped', owner: { agentId: JOHN } }
        })
        for (const { text } of Object.values(w.annotations)) {
          expect(text).not.toMatch(/§|\bof \d|\/\s*\d|\btotal\b/i)
        }
      })

      it(`${name} releases what the run held: a terminal run costs its path names and nothing more`, () => {
        const w = world().send(started('r1'), prose('r1', DOC), ended(name, 'r1'))
        const held = [...(w.table.get('r1')?.paths.values() ?? [])]

        expect(held).toEqual([{ text: '', seen: [], revising: false, live: true }])
      })

      it(`${name} annotates nothing for a path the run was no longer showing`, () => {
        // A rejected `Write` had set `live: false`; the path is not shown again by the end of the run.
        const w = world().send(started('r1'), prose('r1', DOC), rejected('r1'))
        expect(w.annotations).toEqual({})

        w.send(ended(name, 'r1'))

        expect(w.annotations).toEqual({})
        expect(w.table.size).toBe(0)
      })

      it(`${name} of a run that showed nothing drops it, as a finished one is dropped`, () => {
        const w = world().send(started('r1'), note('r1'), ended(name, 'r1'))

        expect(w.annotations).toEqual({})
        expect(w.table.size).toBe(0)
      })

      it(`${name} keeps a later run’s writing on the same path, and lets the path go to it`, () => {
        const w = world().send(started('r1'), prose('r1', DOC), started('r2', 'bmad-agent-analyst'), ended(name, 'r1'))
        expect(w.annotations[PRD]).toEqual({ text: 'stopped', owner: { agentId: JOHN } })

        w.send(prose('r2', '## Beta\nX.\n', PRD, 'b'))

        expect(w.annotations[PRD]).toEqual({ text: 'writing · §1 Beta', owner: { agentId: 'bmad-agent-analyst' } })
        // The dead run let the path go: it holds nothing, so the path is the later run's alone.
        expect(w.table.has('r1')).toBe(false)

        // And when the later run finishes, the path annotates nothing: the stopped word does not come back.
        w.send(ended('run:finished', 'r2'))
        expect(w.annotations).toEqual({})
        expect(w.table.size).toBe(0)
      })

      it(`${name} of a later run never masks an earlier one still writing the same path`, () => {
        const w = world().send(
          started('r1'),
          started('r2', 'bmad-agent-analyst'),
          prose('r1', '## Alpha\nX.\n', PRD, 'a'),
          prose('r2', '## Beta\nY.\n', PRD, 'b')
        )
        // The later-started run shows while both are writing.
        expect(w.annotations[PRD]).toEqual({ text: 'writing · §1 Beta', owner: { agentId: 'bmad-agent-analyst' } })

        w.send(ended(name, 'r2'))

        // r1 is still writing it, and a run writing has the last word over one that ended.
        expect(w.annotations[PRD]).toEqual({ text: 'writing · §1 Alpha', owner: { agentId: JOHN } })
        // r1's next piece takes the path outright, and the ended run is left holding nothing.
        w.send(prose('r1', '## Alpha\nX.\n## Gamma\nZ.\n', PRD, 'a'))
        expect(w.annotations[PRD]).toEqual({ text: 'writing · §2 Gamma', owner: { agentId: JOHN } })
        expect(w.table.has('r2')).toBe(false)
      })
    }

    it('takes nothing more from an ended run, however it ended', () => {
      const finished = world().send(started('r1'), prose('r1', DOC), ended('run:finished', 'r1'), prose('r1', DOC))
      expect(finished.annotations).toEqual({})
      expect(finished.table.size).toBe(0)

      for (const name of ['run:stopped', 'run:failed'] as const) {
        const w = world().send(started('r1'), prose('r1', DOC), ended(name, 'r1'))
        const table = w.table
        w.send(prose('r1', `${DOC}## Later\nC.\n`), edited('r1', `${DOC}## Later\nC.\n`), rejected('r1'), ended(name, 'r1'))

        expect(w.table).toBe(table)
        expect(w.annotations[PRD]).toEqual({ text: 'stopped', owner: { agentId: JOHN } })
      }
    })

    it('an end of a run it never saw changes nothing', () => {
      const w = world()
      w.send(ended('run:finished', 'ghost'))
      expect(w.table).toBe(EMPTY_ANNOTATIONS)
      w.send(ended('run:stopped', 'ghost'))
      expect(w.table).toBe(EMPTY_ANNOTATIONS)
    })
  })

  describe('two runs holding text for one path', () => {
    it('shows the later-started run’s, and the earlier one’s again when the later one ends', () => {
      const w = world().send(
        started('r1'),
        started('r2', 'bmad-agent-analyst'),
        prose('r2', '## Beta\nX.\n', PRD, 'b'),
        prose('r1', '## Alpha\nX.\n## Gamma\nY.\n', PRD, 'a')
      )

      // r2 started later, so its annotation shows even though r1 wrote last.
      expect(w.annotations[PRD]).toEqual({ text: 'writing · §1 Beta', owner: { agentId: 'bmad-agent-analyst' } })

      w.send(ended('run:finished', 'r2'))
      expect(w.annotations[PRD]).toEqual({ text: 'writing · §2 Gamma', owner: { agentId: JOHN } })
    })
  })

  describe('a long section name', () => {
    const heading = (name: string): string => `## ${name}\nBody.\n`

    it('is at most 40 code points: its first 39 and an ellipsis', () => {
      const name = 'A'.repeat(200)
      const text = world().send(started('r1'), prose('r1', heading(name))).annotations[PRD].text

      expect(text).toBe(`writing · §1 ${'A'.repeat(NAME_MAX - 1)}…`)
      expect(Array.from(text.slice('writing · §1 '.length))).toHaveLength(NAME_MAX)
    })

    it('leaves a name of exactly 40 as it is, and counts a surrogate pair as one character', () => {
      const exact = 'B'.repeat(NAME_MAX)
      expect(world().send(started('r1'), prose('r1', heading(exact))).annotations[PRD].text).toBe(`writing · §1 ${exact}`)

      const astral = '😀'.repeat(NAME_MAX + 5)
      const text = world().send(started('r1'), prose('r1', heading(astral))).annotations[PRD].text
      expect(text).toBe(`writing · §1 ${'😀'.repeat(NAME_MAX - 1)}…`)
    })

    it('cuts the name only in the annotation: the section is still placed by its whole name', () => {
      const long = 'C'.repeat(60)
      const w = world().send(started('r1'), prose('r1', `${heading('First')}${heading(long)}`))
      expect(w.annotations[PRD].text).toBe(`writing · §2 ${'C'.repeat(NAME_MAX - 1)}…`)
      w.send(prose('r1', heading('Last'), PRD, 'c1'))
      expect(w.annotations[PRD].text).toBe('writing · §3 Last')
    })
  })

  it('names no total in any annotation it makes', () => {
    const w = world().send(started('r1'), prose('r1', '## Out of Scope\nA.\n## Goals\n'), edited('r1', '## Out of Scope\nB.\n## Goals\n'))

    // `Out of Scope` is a section's own name; there is no `of M`, and no slash.
    expect(w.annotations[PRD].text).toBe('revising · §1 Out of Scope')
    for (const { text } of Object.values(world().send(started('r1'), prose('r1', DOC)).annotations)) {
      expect(text).not.toMatch(/\bof \d|\/\s*\d|\btotal\b/i)
    }
  })

  it('is a pure fold: a table is never mutated, and the same events give the same annotations', () => {
    const before = world().send(started('r1'), prose('r1', DOC))
    const table = before.table
    const snapshot = JSON.stringify([...annotationsOf(table)])
    foldAnnotations(table, prose('r1', 'More.\n'), cardWith('More.\n'))

    expect(JSON.stringify([...annotationsOf(table)])).toBe(snapshot)
    expect(world().send(started('r1'), prose('r1', DOC)).annotations).toEqual(before.annotations)
  })
})
