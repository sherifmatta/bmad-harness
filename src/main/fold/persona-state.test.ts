import { describe, expect, it } from 'vitest'
import type { ContractEvent, PersonaState } from '../../shared/events'
import type { RailRow, RailSnapshot } from '../../shared/rail'
import {
  EMPTY_PERSONA_TABLE,
  foldPersonaState,
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
  payload: { revision, rows } satisfies RailSnapshot
})

function fold(inputs: PersonaInput[], from: PersonaTable = EMPTY_PERSONA_TABLE): PersonaTable {
  return inputs.reduce((table, input) => foldPersonaState(table, input, NOW), from)
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

  it('is not raised by a session that exits mid-turn, since no run event says so', () => {
    expect(stateOf(fold([opened('s1', A), closed('s1', A)]))).toBe('idle')
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
      rows: [row('_bmad/prd.md', 'saved', B, 1), row('_bmad/epics.md', 'saved', undefined, 1)]
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
      rows: [row('_bmad/prd.md', 'saved', B, 1)]
    })

    expect(stateOf(seeded, B)).toBe('idle')
    expect(seedRail(seeded, { revision: 2, rows: [] })).toBe(seeded)
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
    expect(foldPersonaState(table, runEnd('run:finished', 's1'), NOW)).toBe(table)
    expect(foldPersonaState(table, { name: 'persona:said', payload: { sessionId: 's1', messageId: 'm', text: 't', at: 1 } }, NOW)).toBe(table)
    foldPersonaState(table, awaiting('s1'), NOW)
    expect(JSON.stringify([...table.shown])).toBe(before)
  })
})
