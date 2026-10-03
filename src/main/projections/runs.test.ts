import { describe, expect, it } from 'vitest'
import { createRunProjection } from './runs'

describe('the run projection', () => {
  it('holds a card per run in start order, each folded from its own events', () => {
    const runs = createRunProjection()
    runs.apply({ name: 'run:started', payload: { runId: 'r1', sessionId: 's1', code: 'A', at: 1 } })
    runs.apply({ name: 'run:started', payload: { runId: 'r2', sessionId: 's2', code: 'B', at: 2 } })
    runs.apply({ name: 'run:note', payload: { runId: 'r2', sessionId: 's2', text: '- n', at: 3 } })
    runs.apply({ name: 'run:finished', payload: { runId: 'r1', sessionId: 's1', at: 4 } })
    runs.apply({ name: 'session:awaiting-turn', payload: { sessionId: 's1', at: 5 } })

    expect(runs.snapshot().map(({ runId, status, notes }) => [runId, status, notes.length])).toEqual([
      ['r1', 'finished', 0],
      ['r2', 'running', 1]
    ])
  })

  it('ignores events of a run it never saw start, and a second start of the same run', () => {
    const runs = createRunProjection()
    runs.apply({ name: 'run:finished', payload: { runId: 'ghost', sessionId: 's1', at: 1 } })
    runs.apply({ name: 'run:started', payload: { runId: 'r1', sessionId: 's1', code: 'A', at: 1 } })
    runs.apply({ name: 'run:note', payload: { runId: 'r1', sessionId: 's1', text: '- n', at: 2 } })
    runs.apply({ name: 'run:started', payload: { runId: 'r1', sessionId: 's1', code: 'A', at: 3 } })

    expect(runs.snapshot()).toHaveLength(1)
    expect(runs.snapshot()[0].notes).toHaveLength(1)
  })

  it('forgets every card when cleared', () => {
    const runs = createRunProjection()
    runs.apply({ name: 'run:started', payload: { runId: 'r1', sessionId: 's1', code: 'A', at: 1 } })
    runs.clear()
    expect(runs.snapshot()).toEqual([])
  })
})
