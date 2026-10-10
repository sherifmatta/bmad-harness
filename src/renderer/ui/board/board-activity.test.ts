import { describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import type { RunCardEntry, TranscriptEntry } from '../chat/transcript-entry'
import { ACTIVITY_LIMIT, activityRowsOf } from './board-activity'

const agent = (id: string, name: string): AgentView => ({ id, module: 'bmm', name, title: 'Role', icon: 'i', description: 'd' })
const ROSTER = [agent('a', 'Ada'), agent('b', 'Ben')]
const run = (id: string, over: Partial<RunCardEntry> = {}): RunCardEntry => ({
  kind: 'run',
  id,
  at: 1000,
  runId: id,
  sessionId: `s-${id}`,
  agentId: 'a',
  code: 'CP',
  status: 'running',
  notes: [],
  steps: [],
  documents: [],
  ...over
})
const rowsOf = (...entries: TranscriptEntry[]) => activityRowsOf(ROSTER, entries)
const said = (...entries: TranscriptEntry[]): string[] => rowsOf(...entries).map((row) => `${row.name} ${row.did} ${row.at}`)

describe('activityRowsOf (Story 6.7)', () => {
  it('gives a run in flight one start row, work dot, pulsing', () => {
    expect(rowsOf(run('r1'))).toEqual([{ key: 'r1:start', name: 'Ada', did: 'started CP', at: 1000, state: 'work', pulse: true }])
  })

  it('gives a finished run an end row above its still start row', () => {
    expect(rowsOf(run('r1', { status: 'finished', endedAt: 2000 }))).toEqual([
      { key: 'r1:end', name: 'Ada', did: 'finished CP', at: 2000, state: 'idle', pulse: false },
      { key: 'r1:start', name: 'Ada', did: 'started CP', at: 1000, state: 'work', pulse: false }
    ])
  })

  it('draws an end row for stopped and failed with the error dot', () => {
    const rows = rowsOf(run('r1', { status: 'stopped', endedAt: 2000 }), run('r2', { status: 'failed', endedAt: 3000, at: 2500 }))

    expect(rows.filter((row) => row.state === 'error').map((row) => row.did)).toEqual(['failed CP', 'stopped CP'])
    expect(rows.every((row) => !row.pulse)).toBe(true)
  })

  it('raises no row for an entry with no agent, and ignores entries that are not runs', () => {
    const party = run('p1')
    delete party.agentId
    const turn: TranscriptEntry = { kind: 'sysline', id: 'x', at: 5, text: 'hi' }

    expect(rowsOf(party, turn)).toEqual([])
  })

  it('reads the verb alone when the entry has no code', () => {
    const bare = run('r1', { status: 'finished', endedAt: 2000 })
    delete bare.code

    expect(rowsOf(bare).map((row) => row.did)).toEqual(['finished', 'started'])
  })

  it('raises no end row for a terminal entry with no endedAt', () => {
    expect(said(run('r1', { status: 'failed' }))).toEqual(['Ada started CP 1000'])
  })

  it('names an unknown persona by its id as written', () => {
    expect(rowsOf(run('r1', { agentId: 'Zed' }))[0]?.name).toBe('Zed')
  })

  it('orders by the event’s own time, newest first, across runs', () => {
    expect(
      said(
        run('r1', { at: 1000, status: 'finished', endedAt: 5000 }),
        run('r2', { at: 2000, agentId: 'b', status: 'finished', endedAt: 3000 })
      )
    ).toEqual(['Ada finished CP 5000', 'Ben finished CP 3000', 'Ben started CP 2000', 'Ada started CP 1000'])
  })

  it('breaks a tie newest run first, and puts an end row above its own start row', () => {
    const rows = rowsOf(
      run('r1', { at: 1000, status: 'finished', endedAt: 2000 }),
      run('r2', { at: 2000, agentId: 'b' }),
      run('r3', { at: 2000, agentId: 'b', status: 'finished', endedAt: 2000 })
    )

    expect(rows.map((row) => row.key)).toEqual(['r3:end', 'r3:start', 'r2:start', 'r1:end', 'r1:start'])
  })

  it('breaks an exact tie between runs by the later entry first', () => {
    expect(rowsOf(run('r1'), run('r2')).map((row) => row.key)).toEqual(['r2:start', 'r1:start'])
  })

  it('takes the newest 20 rows of fifteen finished runs, and never fewer than it has', () => {
    const entries = Array.from({ length: 15 }, (_, index) =>
      run(`r${index}`, { at: index * 100, status: 'finished', endedAt: index * 100 + 50 })
    )
    const rows = rowsOf(...entries)

    expect(ACTIVITY_LIMIT).toBe(20)
    expect(rows).toHaveLength(20)
    expect(rows[0]?.key).toBe('r14:end')
    expect(rows.at(-1)?.key).toBe('r5:start')
    expect(rowsOf(run('r1'), run('r2'))).toHaveLength(2)
  })

  it('reads a relaunched card (running read back failed at its last-heard time) as its end row', () => {
    expect(rowsOf(run('r1', { status: 'failed', endedAt: 1700 })).map((row) => row.did)).toEqual(['failed CP', 'started CP'])
  })

  it('draws nothing for no runs', () => {
    expect(rowsOf()).toEqual([])
  })
})
