import { describe, expect, it } from 'vitest'
import { SETTLE_MS } from './rail-rows'
import type { ContractEvent, PersonaState } from '../../shared/events'
import type { RailRow, RailSnapshot } from '../../shared/rail'
import {
  EMPTY_PERSONA_TABLE,
  foldPersonaState,
  rebaseRail,
  seedRail,
  stateOfAgent
} from './persona-state'
import type { InternalEvent, PersonaInput, PersonaTable } from './persona-state'

const A = 'bmad-agent-analyst'
const B = 'bmad-agent-pm'
const NOW = 9_000

const opened = (sessionId: string, agentId: string | undefined, at = 10): ContractEvent => ({
  name: 'session:opened',
  payload: { sessionId, ...(agentId === undefined ? {} : { agentId }), at }
})
const awaiting = (sessionId: string, at = 20): ContractEvent => ({
  name: 'session:awaiting-turn',
  payload: { sessionId, at }
})
const closed = (sessionId: string, agentId: string, at = 30): ContractEvent => ({
  name: 'session:closed',
  payload: { sessionId, agentId, reason: 'closed', at }
})
const started = (sessionId: string, at?: number): InternalEvent => ({
  name: 'turn:started',
  payload: { sessionId, ...(at === undefined ? {} : { at }) }
})
const failed = (sessionId: string, at?: number): InternalEvent => ({
  name: 'turn:failed',
  payload: { sessionId, ...(at === undefined ? {} : { at }) }
})
const exited = (sessionId: string, agentId: string, at = 30): ContractEvent => ({
  name: 'session:closed',
  payload: { sessionId, agentId, reason: 'process-exited', at }
})
const runStarted = (sessionId: string, at = 40): ContractEvent => ({
  name: 'run:started',
  payload: { runId: 'r1', sessionId, code: 'CP', at }
})
const runEnd = (name: 'run:failed' | 'run:stopped' | 'run:finished', sessionId: string, at = 50): ContractEvent =>
  name === 'run:failed'
    ? {
        name,
        payload: { runId: 'r1', sessionId, error: { code: 'run/failed', message: 'run · failed' }, at }
      }
    : { name, payload: { runId: 'r1', sessionId, at } }
const attached = (sessionId: string): InternalEvent => ({
  name: 'process:attached',
  payload: { sessionId }
})
const detached = (sessionId: string): InternalEvent => ({
  name: 'process:detached',
  payload: { sessionId }
})

const row = (path: string, state: 'saved' | 'changing', agentId?: string, savedAt = 1): RailRow => ({
  path,
  ...(agentId === undefined ? {} : { owner: { agentId } }),
  ...(state === 'saved' ? { state, savedAt } : { state })
})
const rail = (revision: number, ...rows: RailRow[]): ContractEvent => ({
  name: 'rail:changed',
  payload: { revision, folder: '_bmad/', rows } satisfies RailSnapshot
})

function fold(inputs: PersonaInput[], from: PersonaTable = EMPTY_PERSONA_TABLE): PersonaTable {
  return inputs.reduce((table, input) => foldPersonaState(table, input, NOW), from)
}
/** Fold `inputs` with the injected clock reading `at`, so a rail change is observed at a chosen instant. */
function foldAt(inputs: PersonaInput[], at: number, from: PersonaTable): PersonaTable {
  return inputs.reduce((table, input) => foldPersonaState(table, input, at), from)
}
const stateOf = (table: PersonaTable, agentId = A): PersonaState => stateOfAgent(table, agentId)
const atOf = (table: PersonaTable, agentId = A): number | undefined => table.shown.get(agentId)?.at

describe('work', () => {
  it('begins when a session opens, at the opening event’s own time, and ends when it awaits a turn', () => {
    let table = fold([opened('s1', A, 10)])
    expect(stateOf(table)).toBe('work')
    expect(atOf(table)).toBe(10)

    table = fold([awaiting('s1', 20)], table)
    expect(stateOf(table)).toBe('idle')
    expect(atOf(table)).toBe(20)
  })

  it('begins at a turn start, stamped with the injected clock when the event carries no time', () => {
    const table = fold([opened('s1', A), awaiting('s1'), started('s1')])

    expect(stateOf(table)).toBe('work')
    expect(atOf(table)).toBe(NOW)
    expect(atOf(fold([started('s1', 77)], fold([opened('s1', A), awaiting('s1')])))).toBe(77)
  })

  it('begins at a run start', () => {
    const table = fold([opened('s1', A), awaiting('s1'), runStarted('s1', 40)])

    expect(stateOf(table)).toBe('work')
    expect(atOf(table)).toBe(40)
  })

  it('persists through a quiet phase, because only the turn ending ends it', () => {
    const table = fold([opened('s1', A), runStarted('s1'), runEnd('run:finished', 's1')])

    expect(stateOf(table)).toBe('work')
  })

  it('is one persona across two sessions, working until both are free, and keeps its first start', () => {
    let table = fold([opened('s1', A, 10), opened('s2', A, 15)])
    expect(stateOf(table)).toBe('work')
    expect(atOf(table)).toBe(10)

    table = fold([awaiting('s1', 20)], table)
    expect(stateOf(table)).toBe('work')
    expect(atOf(table)).toBe(10)

    table = fold([awaiting('s2', 25)], table)
    expect(stateOf(table)).toBe('idle')
    expect(atOf(table)).toBe(25)
  })

  it('ignores a session that carries no agent id, and an event about a session it does not know', () => {
    const table = fold([
      opened('room', undefined),
      awaiting('nope'),
      started('nope'),
      runStarted('nope'),
      closed('nope', A),
      attached('nope'),
      runEnd('run:failed', 'nope')
    ])

    expect(table).toBe(EMPTY_PERSONA_TABLE)
    expect(table.sessions.size).toBe(0)
    expect(table.shown.size).toBe(0)
  })

  it('ignores a skill-first session whatever it does: it opens, runs, ends and closes with no persona touched (Story 7.5)', () => {
    const skill = (event: ContractEvent): ContractEvent => event
    const table = fold([
      skill({ name: 'session:opened', payload: { sessionId: 'sk', skill: 'bmad-build', at: 10 } }),
      started('sk'),
      skill({ name: 'run:started', payload: { runId: 'r', sessionId: 'sk', code: 'bmad-build', skill: 'bmad-build', at: 11 } }),
      skill({ name: 'run:finished', payload: { runId: 'r', sessionId: 'sk', at: 12 } }),
      awaiting('sk'),
      skill({ name: 'session:closed', payload: { sessionId: 'sk', skill: 'bmad-build', reason: 'closed', at: 30 } })
    ])

    expect(table).toBe(EMPTY_PERSONA_TABLE)
  })

  it('is removed when its session closes', () => {
    const table = fold([opened('s1', A), closed('s1', A, 30)])

    expect(stateOf(table)).toBe('idle')
    expect(atOf(table)).toBe(30)
    expect(table.sessions.size).toBe(0)
  })
})

describe('error', () => {
  it('is raised by a failed or stopped run and shows once the turn has ended', () => {
    for (const end of ['run:failed', 'run:stopped'] as const) {
      let table = fold([opened('s1', A), awaiting('s1'), runStarted('s1'), runEnd(end, 's1', 50)])
      expect(stateOf(table), end).toBe('work')

      table = fold([awaiting('s1', 60)], table)
      expect(stateOf(table), end).toBe('error')
      expect(atOf(table), end).toBe(60)
    }
  })

  it('is cleared by a run that finished', () => {
    const table = fold([
      opened('s1', A),
      awaiting('s1'),
      runStarted('s1'),
      runEnd('run:failed', 's1'),
      awaiting('s1'),
      runEnd('run:finished', 's1', 70)
    ])

    expect(stateOf(table)).toBe('idle')
    expect(atOf(table)).toBe(70)
  })

  it('is cleared by the agent’s next turn start, whichever way it starts', () => {
    const failed = fold([opened('s1', A), awaiting('s1'), runEnd('run:failed', 's1')])
    expect(stateOf(failed)).toBe('error')

    expect(stateOf(fold([started('s1')], failed))).toBe('work')
    expect(stateOf(fold([started('s1'), awaiting('s1')], failed))).toBe('idle')
    expect(stateOf(fold([runStarted('s1'), awaiting('s1')], failed))).toBe('idle')
    expect(stateOf(fold([opened('s2', A), awaiting('s2')], failed))).toBe('idle')
  })

  it('stays when the session closes, and outranks note and live', () => {
    const table = fold([
      opened('s1', A),
      awaiting('s1'),
      attached('s1'),
      runEnd('run:stopped', 's1'),
      closed('s1', A)
    ])

    expect(stateOf(table)).toBe('error')
  })

  it('is not raised by a session the user closes mid-turn', () => {
    expect(stateOf(fold([opened('s1', A), closed('s1', A)]))).toBe('idle')
  })

  it('is raised by a chat turn that ended in failure, and shows once the turn is no longer working', () => {
    let table = fold([opened('s1', A), awaiting('s1'), started('s1'), failed('s1')])
    expect(stateOf(table)).toBe('work')

    table = fold([awaiting('s1', 60)], table)
    expect(stateOf(table)).toBe('error')
    expect(atOf(table)).toBe(60)
  })

  it('is cleared by the next turn that starts after a failed one', () => {
    const table = fold([opened('s1', A), failed('s1'), awaiting('s1')])
    expect(stateOf(table)).toBe('error')

    expect(stateOf(fold([started('s1')], table))).toBe('work')
    expect(stateOf(fold([started('s1'), awaiting('s1')], table))).toBe('idle')
  })

  it('is raised by a process that exits on its own, wherever the turn was, and cleared by the next session’s turn', () => {
    const mid = fold([opened('s1', A), exited('s1', A, 31)])
    expect(stateOf(mid)).toBe('error')
    expect(atOf(mid)).toBe(31)
    expect(stateOf(fold([opened('s1', A), awaiting('s1'), exited('s1', A)]))).toBe('error')

    expect(stateOf(fold([opened('s2', A), awaiting('s2')], mid))).toBe('idle')
  })

  it('ignores a failure for a session it does not know', () => {
    expect(fold([failed('nope')])).toBe(EMPTY_PERSONA_TABLE)
  })

  it('belongs to the agent whose run it was', () => {
    const table = fold([opened('s1', A), opened('s2', B), awaiting('s1'), awaiting('s2'), runEnd('run:failed', 's1')])

    expect(stateOf(table, A)).toBe('error')
    expect(stateOf(table, B)).toBe('idle')
  })
})

describe('note', () => {
  /** Both agents idle, the baseline taken: the room as it stands before anything changes. */
  const idle = (): PersonaTable =>
    seedRail(EMPTY_PERSONA_TABLE, {
      revision: 1,
      folder: '_bmad/',
      rows: [row('_bmad/prd.md', 'saved', B, 1), row('_bmad/epics.md', 'saved', undefined, 1)]
    })

  it('raises no note for a file the room wrote, and takes no agentless session for a persona (Story 4.1)', () => {
    const roomRow = (path: string, state: 'saved' | 'changing'): RailRow => ({ ...row(path, state), room: true })
    const after = foldAt(
      [
        opened('room', undefined),
        rail(2, row('_bmad/prd.md', 'saved', B, 1), roomRow('_bmad/party/note.md', 'changing')),
        rail(3, row('_bmad/prd.md', 'saved', B, 1), roomRow('_bmad/party/note.md', 'saved'))
      ],
      NOW,
      idle()
    )

    expect(after.shown.size).toBe(0)
    expect(stateOf(after, B)).toBe('idle')
    expect(after.rail?.has('_bmad/party/note.md')).toBe(false)
  })

  it('treats the first snapshot as a baseline and raises nothing', () => {
    const first = fold(
      [rail(1, row('_bmad/prd.md', 'changing', B))],
      fold([opened('s1', B), awaiting('s1')])
    )

    expect(stateOf(first, B)).toBe('idle')
    expect(first.rail?.get('_bmad/prd.md')?.agentId).toBe(B)
  })

  it('treats a seeded snapshot as the baseline, and a second seed as nothing', () => {
    const seeded = seedRail(EMPTY_PERSONA_TABLE, {
      revision: 1,
      folder: '_bmad/',
      rows: [row('_bmad/prd.md', 'saved', B, 1)]
    })

    expect(stateOf(seeded, B)).toBe('idle')
    expect(seedRail(seeded, { revision: 2, folder: '_bmad/', rows: [] })).toBe(seeded)
  })

  it('takes another folder’s rows as the baseline when the rail is re-pointed, and raises nothing for them (Story 5.4)', () => {
    // The files of the old folder are gone from the rail and those of the new one are there: no owned file changed.
    const repointed = rebaseRail(idle(), {
      revision: 2,
      folder: 'docs/out/',
      rows: [row('docs/out/prd.md', 'saved', B, 7), row('docs/out/architecture.md', 'saved', A, 8)]
    })

    expect(repointed.shown.size).toBe(0)
    expect(repointed.rail?.has('_bmad/prd.md')).toBe(false)
    expect(repointed.rail?.get('docs/out/prd.md')?.agentId).toBe(B)
    // And it is a baseline like any: the next change to an owned row of the new folder is news.
    expect(stateOf(fold([rail(3, row('docs/out/prd.md', 'saved', B, 9), row('docs/out/architecture.md', 'saved', A, 8))], repointed), B)).toBe('note')
  })

  it('leaves what the agents carry as it was when the rail is re-pointed', () => {
    const noted = fold([rail(2, row('_bmad/prd.md', 'changing', B), row('_bmad/epics.md', 'saved'))], idle())
    expect(stateOf(noted, B)).toBe('note')

    const repointed = rebaseRail(noted, { revision: 3, folder: 'docs/out/', rows: [] })

    expect(stateOf(repointed, B)).toBe('note')
    expect(repointed.agents).toBe(noted.agents)
    expect(repointed.sessions).toBe(noted.sessions)
  })

  it('is raised for the owner when an owned row changes between snapshots, at the injected time', () => {
    const table = fold([rail(2, row('_bmad/prd.md', 'changing', B), row('_bmad/epics.md', 'saved'))], idle())

    expect(stateOf(table, B)).toBe('note')
    expect(atOf(table, B)).toBe(NOW)
    expect(stateOf(table, A)).toBe('idle')
  })

  it('is raised by a new owned row and by a later save of the same row', () => {
    const added = fold([rail(2, row('_bmad/prd.md', 'saved', B, 1), row('_bmad/architecture.md', 'saved', A, 5))], idle())
    expect(stateOf(added, A)).toBe('note')
    expect(stateOf(added, B)).toBe('idle')

    const saved = fold([rail(2, row('_bmad/prd.md', 'saved', B, 99))], idle())
    expect(stateOf(saved, B)).toBe('note')
  })

  it('is raised for the owner when an owned row disappears, and not for a deleted row nobody owns', () => {
    const deleted = fold([rail(2, row('_bmad/epics.md', 'saved'))], idle())
    expect(stateOf(deleted, B)).toBe('note')
    expect(atOf(deleted, B)).toBe(NOW)

    const unowned = fold(
      [rail(2, row('_bmad/prd.md', 'saved', B, 1))],
      seedRail(EMPTY_PERSONA_TABLE, {
        revision: 1,
        folder: '_bmad/',
        rows: [row('_bmad/prd.md', 'saved', B, 1), row('_bmad/epics.md', 'saved')]
      })
    )
    expect(unowned.shown.size).toBe(0)
  })

  it('clears a deletion’s note at the owner’s next turn start, and raises none on the baseline', () => {
    const deleted = fold([rail(2)], idle())
    expect(stateOf(fold([opened('s2', B), awaiting('s2')], deleted), B)).toBe('idle')

    // The first snapshot a window sees is a baseline, however empty.
    expect(stateOf(fold([rail(1)]), B)).toBe('idle')
  })

  it('ignores a row nobody owns, and a snapshot that changes nothing', () => {
    const unchanged = fold(
      [rail(2, row('_bmad/prd.md', 'saved', B, 1), row('_bmad/epics.md', 'changing'))],
      idle()
    )

    expect(unchanged.shown.size).toBe(0)
  })

  it('does not show over work, and shows when the work is over', () => {
    let table = fold([opened('s2', B)], idle())
    table = fold([rail(2, row('_bmad/prd.md', 'changing', B))], table)
    expect(stateOf(table, B)).toBe('work')

    table = fold([awaiting('s2', 80)], table)
    expect(stateOf(table, B)).toBe('note')
    expect(atOf(table, B)).toBe(80)
  })

  it('is cleared by the agent’s next turn start and not by the session closing', () => {
    const noted = fold([rail(2, row('_bmad/prd.md', 'changing', B))], idle())
    expect(stateOf(fold([opened('s2', B), closed('s2', B)], noted), B)).toBe('idle')

    const kept = fold([opened('s3', B), awaiting('s3'), rail(3, row('_bmad/prd.md', 'saved', B, 7))], idle())
    expect(stateOf(kept, B)).toBe('note')
    expect(stateOf(fold([closed('s3', B)], kept), B)).toBe('note')
  })

  it('outranks live', () => {
    const table = fold(
      [opened('s2', B), awaiting('s2'), attached('s2'), rail(2, row('_bmad/prd.md', 'changing', B))],
      idle()
    )

    expect(stateOf(table, B)).toBe('note')
  })
})

describe('note and the persona’s own run', () => {
  const PRD = '_bmad/prd.md'
  const ARCH = '_bmad/architecture.md'
  /** The baseline: pm owns the PRD, analyst the architecture, both saved. */
  const baseline = (): PersonaTable =>
    seedRail(EMPTY_PERSONA_TABLE, {
      revision: 1,
      folder: '_bmad/',
      rows: [row(PRD, 'saved', B, 1), row(ARCH, 'saved', A, 1)]
    })
  /** pm's session, attached and awaiting, its run started at 40: the run in flight. */
  const inFlight = (): PersonaTable =>
    fold([opened('s1', B), awaiting('s1'), attached('s1'), runStarted('s1', 40)], baseline())
  /** The same run ended at 50, its turn over and the process attached again: only the window is open. */
  const ended = (end: 'run:failed' | 'run:stopped' | 'run:finished' = 'run:finished'): PersonaTable =>
    fold([runEnd(end, 's1', 50), awaiting('s1', 55), attached('s1')], inFlight())
  const changing = (revision: number, owner = B) => rail(revision, row(PRD, 'changing', owner), row(ARCH, 'saved', A, 1))
  const flipped = (revision: number, savedAt = 49) => rail(revision, row(PRD, 'saved', B, savedAt), row(ARCH, 'saved', A, 1))

  it('raises none for an owned write while its run is in flight, and the dot stays work', () => {
    const table = foldAt([changing(2)], 45, inFlight())

    expect(stateOf(table, B)).toBe('work')
    expect(table.agents.get(B)?.note).not.toBe(true)
    expect(foldAt([awaiting('s1', 60)], 60, table).shown.get(B)?.state).toBe('live')
  })

  it('raises none for the settle flip after the run ends, and the dot reads live', () => {
    let table = foldAt([changing(2)], 45, inFlight())
    table = fold([runEnd('run:finished', 's1', 50), awaiting('s1', 55), attached('s1')], table)
    table = foldAt([flipped(3)], 50 + SETTLE_MS, table)

    expect(stateOf(table, B)).toBe('live')
  })

  it('raises a note for a change one millisecond past the window, and none at its edge', () => {
    expect(stateOf(foldAt([flipped(2)], 50 + SETTLE_MS, ended()), B)).toBe('live')
    expect(stateOf(foldAt([flipped(2)], 50 + SETTLE_MS + 1, ended()), B)).toBe('note')
  })

  it('takes a suppressed change as the baseline, so the next unchanged snapshot raises nothing', () => {
    let table = foldAt([flipped(2)], 50 + SETTLE_MS, ended())
    expect(table.rail?.get(PRD)?.signature).toBe('saved:49')

    table = foldAt([flipped(3)], 50 + SETTLE_MS + 5_000, table)
    expect(stateOf(table, B)).toBe('live')
  })

  it('still raises a note for a file another persona owns', () => {
    const table = foldAt(
      [rail(2, row(PRD, 'saved', B, 1), row(ARCH, 'changing', A))],
      45,
      inFlight()
    )

    expect(stateOf(table, A)).toBe('note')
    expect(stateOf(table, B)).toBe('work')
  })

  it('does not hide a file the running persona does not own from the owner, even inside the window', () => {
    // Analyst's run in flight; the PRD is pm's.
    const table = foldAt(
      [opened('s9', A), awaiting('s9'), runStarted('s9', 40), changing(2)],
      45,
      baseline()
    )

    expect(stateOf(table, B)).toBe('note')
  })

  it('raises a note as today when no run is in flight and none ended lately', () => {
    const table = foldAt([changing(2)], 5_000, fold([opened('s1', B), awaiting('s1')], baseline()))

    expect(stateOf(table, B)).toBe('note')
  })

  it('clears a note raised outside a run at the agent’s next turn start', () => {
    const noted = foldAt([changing(2)], 5_000, fold([opened('s1', B), awaiting('s1')], baseline()))
    expect(stateOf(noted, B)).toBe('note')

    expect(stateOf(fold([started('s1')], noted), B)).toBe('work')
    expect(stateOf(fold([runStarted('s1'), awaiting('s1')], noted), B)).toBe('idle')
  })

  it('raises none for a flip after a failed or stopped run, and the dot reads error', () => {
    for (const end of ['run:failed', 'run:stopped'] as const) {
      const table = foldAt([flipped(2)], 50 + SETTLE_MS, ended(end))
      expect(stateOf(table, B), end).toBe('error')
      expect(table.agents.get(B)?.note, end).not.toBe(true)
    }
  })

  it('raises none for a flip after a failed run when the error was already raised', () => {
    // A turn failure first, then the run's own failure: the error flag does not change at the terminal event.
    const table = foldAt(
      [failed('s1'), runEnd('run:failed', 's1', 50), awaiting('s1', 55), flipped(2)],
      50 + SETTLE_MS,
      fold([opened('s1', B), awaiting('s1'), runStarted('s1', 40)], baseline())
    )

    expect(stateOf(table, B)).toBe('error')
    expect(table.agents.get(B)?.note).not.toBe(true)
  })

  it('treats a session that closes mid-run as the run ending, stamped at the close', () => {
    const closedMidRun = fold([closed('s1', B, 60)], inFlight())

    expect(stateOf(foldAt([flipped(2)], 60 + SETTLE_MS, closedMidRun), B)).toBe('idle')
    expect(stateOf(foldAt([flipped(2)], 60 + SETTLE_MS + 1, closedMidRun), B)).toBe('note')
  })

  it('does not open a window by a session that closes with no run in flight', () => {
    const table = foldAt([flipped(2)], 61, fold([opened('s1', B), awaiting('s1'), closed('s1', B, 60)], baseline()))

    expect(stateOf(table, B)).toBe('note')
  })

  it('counts an agent with one session running and another idle as in flight', () => {
    const table = foldAt(
      [flipped(2)],
      9_999,
      fold([opened('s2', B), awaiting('s2')], inFlight())
    )

    expect(table.agents.get(B)?.note).not.toBe(true)
    expect(stateOf(table, B)).toBe('work')
  })

  it('opens a fresh in-flight run after a prior window, whose changes are suppressed', () => {
    let table = ended()
    table = fold([runStarted('s1', 5_000)], table)
    table = foldAt([changing(2)], 5_100, table)

    expect(table.agents.get(B)?.note).not.toBe(true)
    expect(stateOf(table, B)).toBe('work')
  })

  it('closes the in-flight state at the terminal event, so only the window remains', () => {
    const table = fold([runEnd('run:finished', 's1', 50)], inFlight())

    expect(table.sessions.get('s1')?.running).toBe(false)
    expect(foldAt([flipped(2)], 50 + SETTLE_MS + 1, table).agents.get(B)?.note).toBe(true)
  })
})

describe('live', () => {
  it('is an attached process with no turn in flight, and ends when it detaches', () => {
    let table = fold([opened('s1', A), awaiting('s1'), attached('s1')])
    expect(stateOf(table)).toBe('live')
    expect(atOf(table)).toBe(NOW)

    table = fold([detached('s1')], table)
    expect(stateOf(table)).toBe('idle')
  })

  it('yields to work, and returns when the turn ends', () => {
    let table = fold([opened('s1', A), awaiting('s1'), attached('s1'), started('s1', 60)])
    expect(stateOf(table)).toBe('work')
    expect(atOf(table)).toBe(60)

    table = fold([awaiting('s1', 70)], table)
    expect(stateOf(table)).toBe('live')
  })

  it('is removed when its session closes', () => {
    expect(stateOf(fold([opened('s1', A), awaiting('s1'), attached('s1'), closed('s1', A)]))).toBe('idle')
  })

  it('is one persona across sessions: another session’s detach does not end it', () => {
    const table = fold([
      opened('s1', A),
      opened('s2', A),
      awaiting('s1'),
      awaiting('s2'),
      attached('s1'),
      attached('s2'),
      detached('s2')
    ])

    expect(stateOf(table)).toBe('live')
  })
})

describe('live seats (Story 7.4)', () => {
  it('is each persona’s own: two attached seats are both live, and one detaching or closing leaves the other live', () => {
    let table = fold([
      opened('s1', A),
      opened('s2', B),
      awaiting('s1'),
      awaiting('s2'),
      attached('s1'),
      attached('s2')
    ])
    expect(stateOf(table, A)).toBe('live')
    expect(stateOf(table, B)).toBe('live')

    table = fold([detached('s1')], table)
    expect(stateOf(table, A)).toBe('idle')
    expect(stateOf(table, B)).toBe('live')

    table = fold([closed('s2', B)], table)
    expect(stateOf(table, B)).toBe('idle')
  })

  it('lets one seat work while the other stays live, and neither disturbs the other’s instant', () => {
    let table = fold([opened('s1', A), opened('s2', B), awaiting('s1'), awaiting('s2'), attached('s1'), attached('s2')])
    const bAt = atOf(table, B)

    table = fold([started('s1', 60)], table)
    expect(stateOf(table, A)).toBe('work')
    expect(stateOf(table, B)).toBe('live')
    expect(atOf(table, B)).toBe(bAt)
  })

  it('starts empty after a relaunch: no persona is live', () => {
    expect(stateOf(EMPTY_PERSONA_TABLE, A)).toBe('idle')
    expect(stateOf(EMPTY_PERSONA_TABLE, B)).toBe('idle')
  })
})

describe('precedence', () => {
  it('is work, error, note, live, idle', () => {
    let table = fold([opened('s1', A), awaiting('s1'), attached('s1')])
    table = fold([rail(1), rail(2, row('_bmad/architecture.md', 'changing', A))], table)
    expect(stateOf(table)).toBe('note')

    table = fold([runEnd('run:failed', 's1')], table)
    expect(stateOf(table)).toBe('error')

    table = fold([runStarted('s1')], table)
    expect(stateOf(table)).toBe('work')
  })
})

describe('the fold', () => {
  it('returns the same table for an event that changes nothing, and leaves its input untouched', () => {
    const table = fold([opened('s1', A)])
    const before = JSON.stringify([...table.shown])

    expect(foldPersonaState(table, awaiting('nope'), NOW)).toBe(table)
    expect(foldPersonaState(table, runEnd('run:finished', 'nope'), NOW)).toBe(table)
    expect(foldPersonaState(table, { name: 'persona:said', payload: { sessionId: 's1', messageId: 'm', text: 't', at: 1 } }, NOW)).toBe(table)
    foldPersonaState(table, awaiting('s1'), NOW)
    expect(JSON.stringify([...table.shown])).toBe(before)
  })
})
