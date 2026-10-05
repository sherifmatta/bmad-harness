import { describe, expect, it } from 'vitest'
import type { RunCardSnapshot, StoredRun } from '../../shared/conversation'
import { deadOf, withRun } from './stored-runs'

const card = (runId: string, over: Partial<RunCardSnapshot> = {}): RunCardSnapshot => ({
  runId,
  sessionId: 's1',
  agentId: 'bmad-agent-pm',
  code: 'CP',
  startedAt: 10,
  status: 'running',
  notes: [{ text: '- (decision) Fast path', at: 12 }],
  documents: [{ path: '_bmad/prd.md', callId: 'c1', text: 'so far', written: 6, sections: ['Vision'] }],
  ...over
})

describe('withRun', () => {
  it('appends a run it has not kept, in the order they started', () => {
    const one = withRun([], card('r1'), 11)
    const two = withRun(one, card('r2'), 12)

    expect(two).toEqual([
      { card: card('r1'), lastAt: 11 },
      { card: card('r2'), lastAt: 12 }
    ])
  })

  it('replaces the run it has kept, in its place, with the card as it stands and the moment of the event', () => {
    const kept = withRun(withRun([], card('r1'), 11), card('r2'), 12)
    const next = withRun(kept, card('r1', { notes: [] }), 30)

    expect(next.map((run) => run.card.runId)).toEqual(['r1', 'r2'])
    expect(next[0]).toEqual({ card: card('r1', { notes: [] }), lastAt: 30 })
    expect(next[1]).toBe(kept[1])
  })

  it('leaves the list it was given as it was', () => {
    const kept: StoredRun[] = [{ card: card('r1'), lastAt: 11 }]
    withRun(kept, card('r1'), 99)
    withRun(kept, card('r2'), 99)

    expect(kept).toEqual([{ card: card('r1'), lastAt: 11 }])
  })
})

describe('deadOf', () => {
  it('reads a card that was still running as the run its session ended, at the moment it was last heard of', () => {
    const dead = deadOf({ card: card('r1'), lastAt: 47 })

    expect(dead.lastAt).toBe(47)
    expect(dead.card).toEqual({
      ...card('r1'),
      status: 'failed',
      endedAt: 47,
      error: { code: 'run/session-ended', message: 'run · the session ended' }
    })
  })

  it('keeps everything else about the card: its notes, documents and plan', () => {
    const dead = deadOf({ card: card('r1', { plan: ['Vision', 'Scope'] }), lastAt: 47 }).card

    expect(dead.notes).toEqual(card('r1').notes)
    expect(dead.documents).toEqual(card('r1').documents)
    expect(dead.plan).toEqual(['Vision', 'Scope'])
    expect(dead.startedAt).toBe(10)
  })

  it.each(['finished', 'stopped', 'failed'] as const)('keeps a card that had ended %s exactly as it ended', (status) => {
    const ended: StoredRun = {
      card: card('r1', { status, endedAt: 33, ...(status === 'failed' ? { error: { code: 'run/failed', message: 'run · the run failed' } } : {}) }),
      lastAt: 33
    }

    expect(deadOf(ended)).toBe(ended)
  })

  it('adds no status: a cut-off run is `failed`, with the envelope a run ended by its session already carries', () => {
    expect(deadOf({ card: card('r1'), lastAt: 1 }).card.status).toBe('failed')
  })

  it('leaves the card it was given as it was', () => {
    const stored: StoredRun = { card: card('r1'), lastAt: 47 }
    deadOf(stored)

    expect(stored.card.status).toBe('running')
    expect(stored.card.endedAt).toBeUndefined()
  })
})
