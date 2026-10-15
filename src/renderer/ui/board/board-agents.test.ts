import { describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import type { RunCardEntry } from '../chat/transcript-entry'
import type { PersonaState } from '../status/persona-state'
import { agentRowsOf } from './board-agents'

const agent = (id: string): AgentView => ({ id, module: 'bmm', name: id, title: 'Role', icon: 'i', description: 'd' })
const ROSTER = ['a', 'b', 'c'].map(agent)
const run = (id: string, agentId: string, at: number, over: Partial<RunCardEntry> = {}): RunCardEntry => ({
  kind: 'run',
  id,
  at,
  runId: id,
  sessionId: `s-${id}`,
  agentId,
  code: 'CP',
  status: 'running',
  notes: [],
  steps: [],
  documents: [],
  ...over
})
const states = (...pairs: [string, PersonaState][]): Map<string, PersonaState> => new Map(pairs)

describe('agentRowsOf (Story 6.6)', () => {
  it('is one row per installed persona, in roster order, whatever the states', () => {
    const rows = agentRowsOf(ROSTER, states(['c', 'work'], ['a', 'idle'], ['b', 'live']), [])

    expect(rows.map((row) => row.agent.id)).toEqual(['a', 'b', 'c'])
    expect(rows.map((row) => row.state)).toEqual(['idle', 'live', 'work'])
  })

  it('is empty for an empty roster, and reads an absent state as idle', () => {
    expect(agentRowsOf([], states(), [])).toEqual([])
    expect(agentRowsOf(ROSTER, states(), []).map((row) => row.state)).toEqual(['idle', 'idle', 'idle'])
  })

  it('gives a working persona its run in flight: id, code and the run’s own start', () => {
    const [row] = agentRowsOf([agent('a')], states(['a', 'work']), [run('r1', 'a', 100)])

    expect(row.run).toEqual({ runId: 'r1', code: 'CP', startedAt: 100 })
  })

  it('leaves the code out for a run entry that has none', () => {
    const [row] = agentRowsOf([agent('a')], states(['a', 'work']), [run('r1', 'a', 100, { code: undefined })])

    expect(row.run).toEqual({ runId: 'r1', startedAt: 100 })
    expect(row.run).not.toHaveProperty('code')
  })

  it('gives a working persona with no run in flight no run, so the row says `in a turn`', () => {
    const ended = run('r1', 'a', 100, { status: 'finished', endedAt: 120 })

    expect(agentRowsOf([agent('a')], states(['a', 'work']), [])[0]).not.toHaveProperty('run')
    expect(agentRowsOf([agent('a')], states(['a', 'work']), [ended])[0]).not.toHaveProperty('run')
    expect(agentRowsOf([agent('a')], states(['a', 'work']), [run('r1', 'b', 100)])[0]).not.toHaveProperty('run')
  })

  it('gives a stale running entry nothing under any state but work', () => {
    for (const state of ['idle', 'live', 'note', 'error'] as const) {
      expect(agentRowsOf([agent('a')], states(['a', state]), [run('r1', 'a', 100)])[0]).not.toHaveProperty('run')
    }
  })

  it('takes the later of two runs in flight by `at`', () => {
    const [row] = agentRowsOf([agent('a')], states(['a', 'work']), [run('r2', 'a', 200), run('r1', 'a', 100)])

    expect(row.run?.runId).toBe('r2')
  })
})
