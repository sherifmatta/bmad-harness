import { beforeEach, describe, expect, it } from 'vitest'
import type { ContractEvent } from '../../shared/events'
import type { RailRow } from '../../shared/rail'
import { SETTLE_MS } from '../fold/rail-rows'
import { createPersonaProjection } from './personas'
import type { PersonaProjection, PersonaStateEvent } from './personas'

const A = 'bmad-agent-analyst'
const B = 'bmad-agent-pm'

let raised: PersonaStateEvent[]
let clock: number
let projection: PersonaProjection

beforeEach(() => {
  raised = []
  clock = 5_000
  projection = createPersonaProjection({
    onChange: (event) => raised.push(event),
    now: () => (clock += 1)
  })
})

const opened = (sessionId: string, agentId: string, at: number): ContractEvent => ({
  name: 'session:opened',
  payload: { sessionId, agentId, at }
})
const awaiting = (sessionId: string, at: number): ContractEvent => ({
  name: 'session:awaiting-turn',
  payload: { sessionId, at }
})
const states = (): [string, string, number][] =>
  raised.map(({ payload }) => [payload.agentId, payload.state, payload.at])

const owned = (path: string, agentId: string, savedAt: number): RailRow => ({
  path,
  owner: { agentId },
  state: 'saved',
  savedAt
})

describe('the persona projection', () => {
  it('raises work when a session opens, and idle when its turn ends', () => {
    projection.apply(opened('s1', A, 10))
    projection.apply(awaiting('s1', 20))

    expect(states()).toEqual([
      [A, 'work', 10],
      [A, 'idle', 20]
    ])
    expect(raised.every((event) => event.name === 'persona:state')).toBe(true)
  })

  it('raises once per change of the aggregate, not once per session or per event', () => {
    projection.apply(opened('s1', A, 10))
    projection.apply(opened('s2', A, 12))
    projection.apply({ name: 'turn:started', payload: { sessionId: 's2' } })
    projection.apply(awaiting('s1', 20))
    projection.apply(awaiting('s1', 21))

    expect(states()).toEqual([[A, 'work', 10]])

    projection.apply(awaiting('s2', 30))

    expect(states()).toEqual([
      [A, 'work', 10],
      [A, 'idle', 30]
    ])
  })

  it('raises nothing for an event that leaves every state as it was', () => {
    projection.apply({ name: 'run:finished', payload: { runId: 'r', sessionId: 'nope', at: 1 } })
    projection.apply(awaiting('nope', 2))
    projection.apply({
      name: 'persona:said',
      payload: { sessionId: 's', messageId: 'm', text: 't', at: 3 }
    })

    expect(raised).toEqual([])
  })

  it('keeps each agent’s state apart', () => {
    projection.apply(opened('s1', A, 10))
    projection.apply(opened('s2', B, 11))
    projection.apply(awaiting('s1', 20))

    expect(states()).toEqual([
      [A, 'work', 10],
      [B, 'work', 11],
      [A, 'idle', 20]
    ])
  })

  it('stamps a turn start with the injected clock, which the fold never reads', () => {
    projection.apply(opened('s1', A, 10))
    projection.apply(awaiting('s1', 20))
    projection.apply({ name: 'turn:started', payload: { sessionId: 's1' } })

    expect(states()[2]).toEqual([A, 'work', 5_003])
  })

  it('raises live on attach while idle, and idle on detach', () => {
    projection.apply(opened('s1', A, 10))
    projection.apply(awaiting('s1', 20))
    projection.attach('s1')
    projection.detach('s1')

    expect(states().slice(2)).toEqual([
      [A, 'live', expect.any(Number)],
      [A, 'idle', expect.any(Number)]
    ])
  })

  it('raises error after a failed run ends its turn, and clears it on the next turn start', () => {
    projection.apply(opened('s1', A, 10))
    projection.apply({
      name: 'run:failed',
      payload: { runId: 'r', sessionId: 's1', error: { code: 'x', message: 'x' }, at: 15 }
    })
    projection.apply(awaiting('s1', 20))
    projection.apply({ name: 'turn:started', payload: { sessionId: 's1', at: 25 } })

    expect(states()).toEqual([
      [A, 'work', 10],
      [A, 'error', 20],
      [A, 'work', 25]
    ])
  })

  it('takes the seeded snapshot as the baseline, then raises note for an owned row that changes', () => {
    projection.seedRail({ revision: 1, folder: '_bmad/', rows: [owned('_bmad/prd.md', B, 1)] })
    projection.apply({ name: 'rail:changed', payload: { revision: 2, folder: '_bmad/', rows: [owned('_bmad/prd.md', B, 1)] } })

    expect(raised).toEqual([])

    projection.apply({ name: 'rail:changed', payload: { revision: 3, folder: '_bmad/', rows: [owned('_bmad/prd.md', B, 9)] } })

    expect(states()).toEqual([[B, 'note', 5_002]])
  })

  it('takes the rows of another folder as a new baseline when the rail is re-pointed, and raises no note for them (Story 5.4)', () => {
    projection.seedRail({ revision: 1, folder: '_bmad/', rows: [owned('_bmad/prd.md', B, 1)] })

    projection.rebaseRail({ revision: 2, folder: 'docs/out/', rows: [owned('docs/out/prd.md', B, 7)] })
    projection.apply({ name: 'rail:changed', payload: { revision: 2, folder: 'docs/out/', rows: [owned('docs/out/prd.md', B, 7)] } })

    expect(raised).toEqual([])

    projection.apply({ name: 'rail:changed', payload: { revision: 3, folder: 'docs/out/', rows: [owned('docs/out/prd.md', B, 9)] } })

    expect(states()).toEqual([[B, 'note', 5_002]])
  })

  it('treats a first rail push with no seed as the baseline', () => {
    projection.apply({ name: 'rail:changed', payload: { revision: 1, folder: '_bmad/', rows: [owned('_bmad/prd.md', B, 1)] } })

    expect(raised).toEqual([])
  })
})

describe('the persona projection and a persona’s own run', () => {
  const PRD = '_bmad/prd.md'
  const runStart: ContractEvent = { name: 'run:started', payload: { runId: 'r', sessionId: 's1', code: 'CP', at: 40 } }
  const runDone: ContractEvent = { name: 'run:finished', payload: { runId: 'r', sessionId: 's1', at: 50 } }
  const railAt = (revision: number, row: RailRow): ContractEvent => ({
    name: 'rail:changed',
    payload: { revision, folder: '_bmad/', rows: [row] }
  })
  const changing: RailRow = { path: PRD, owner: { agentId: B }, state: 'changing' }

  function runWithOwnWrite(): void {
    projection.seedRail({ revision: 1, folder: '_bmad/', rows: [owned(PRD, B, 1)] })
    projection.apply(opened('s1', B, 10))
    projection.apply(awaiting('s1', 20))
    projection.apply(runStart)
    clock = 44
    projection.apply(railAt(2, changing))
    projection.apply(runDone)
    projection.apply(awaiting('s1', 55))
    projection.attach('s1')
  }

  it('reads work, then live, when the run’s own write and its settle flip arrive between the two ends', () => {
    runWithOwnWrite()
    clock = 50 + SETTLE_MS - 1
    projection.apply(railAt(3, owned(PRD, B, 49)))

    expect(raised.map(({ payload }) => payload.state)).toEqual(['work', 'idle', 'work', 'idle', 'live'])
  })

  it('raises one note for the same flip outside the window', () => {
    runWithOwnWrite()
    clock = 50 + SETTLE_MS + 1
    projection.apply(railAt(3, owned(PRD, B, 49)))

    expect(raised.map(({ payload }) => payload.state)).toContain('note')
    expect(raised.filter(({ payload }) => payload.state === 'note')).toHaveLength(1)
  })
})

describe('the persona projection, an agent forgotten (Story 8.5)', () => {
  it('raises idle for a persona that read error, and its snapshot lists nothing for her', () => {
    projection.apply(opened('s1', A, 10))
    projection.apply({ name: 'turn:failed', payload: { sessionId: 's1', at: 15 } })
    projection.apply(awaiting('s1', 20))
    raised.length = 0
    expect(projection.snapshot()).toEqual([expect.objectContaining({ agentId: A, state: 'error' })])

    projection.forget(A)

    expect(states().map(([agentId, state]) => [agentId, state])).toEqual([[A, 'idle']])
    expect(projection.snapshot()).toEqual([])
  })

  it('says nothing for a persona that was idle, and leaves another persona’s state', () => {
    projection.apply(opened('s2', B, 10))
    raised.length = 0

    projection.forget(A)

    expect(raised).toEqual([])
    expect(projection.snapshot()).toEqual([expect.objectContaining({ agentId: B, state: 'work' })])
  })
})

describe('the persona projection’s snapshot', () => {
  it('is empty when nothing has happened, and holds no persona that is idle', () => {
    expect(projection.snapshot()).toEqual([])

    projection.apply(opened('s1', A, 10))
    projection.apply(awaiting('s1', 20))

    expect(projection.snapshot()).toEqual([])
  })

  it('holds each persona that is not idle with the instant its state began, as the raised events said', () => {
    projection.apply(opened('s1', A, 10))
    projection.apply(opened('s2', B, 12))
    projection.apply(awaiting('s2', 15))
    projection.apply({
      name: 'run:failed',
      payload: { runId: 'r', sessionId: 's2', error: { code: 'x', message: 'x' }, at: 16 }
    })

    expect(projection.snapshot()).toEqual([
      { agentId: A, state: 'work', at: 10 },
      { agentId: B, state: 'error', at: 16 }
    ])
  })

  it('changes nothing it raises and nothing it holds', () => {
    projection.apply(opened('s1', A, 10))
    const before = states()
    projection.snapshot()
    projection.snapshot()

    expect(states()).toEqual(before)
    expect(projection.snapshot()).toHaveLength(1)
  })
})
