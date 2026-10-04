import { describe, expect, it } from 'vitest'
import type { ContractEvent } from '../../shared/events'
import { foldRunCard, startCard, subjectOf } from './run-card'

const started = { runId: 'r1', sessionId: 's1', agentId: 'bmad-agent-pm', code: 'CP', at: 100 }
const prose = (text: string, callId = 'c1', path = '_bmad/prd.md'): ContractEvent => ({
  name: 'doc:prose',
  payload: { runId: 'r1', sessionId: 's1', callId, path, text, at: 110 }
})
const committed = (sections: string[], callId = 'c1', ok = true, path = '_bmad/prd.md', text?: string): ContractEvent =>
  ok
    ? {
        name: 'doc:committed',
        payload: { ok, runId: 'r1', sessionId: 's1', callId, path, sections, ...(text === undefined ? {} : { text }), at: 120 }
      }
    : {
        name: 'doc:committed',
        payload: {
          ok,
          runId: 'r1',
          sessionId: 's1',
          callId,
          path: '_bmad/prd.md',
          error: { code: 'doc/write-rejected', message: 'x' },
          at: 120
        }
      }

const fold = (events: ContractEvent[]) => events.reduce(foldRunCard, startCard(started))

describe('the run card fold', () => {
  it('is born running, empty, with elapsed counted from run:started', () => {
    expect(startCard(started)).toEqual({
      runId: 'r1',
      sessionId: 's1',
      agentId: 'bmad-agent-pm',
      code: 'CP',
      startedAt: 100,
      status: 'running',
      notes: [],
      documents: []
    })
    expect(startCard({ ...started, agentId: undefined })).not.toHaveProperty('agentId')
  })

  it('keeps notes in order, with when they were observed', () => {
    const card = fold([
      { name: 'run:note', payload: { runId: 'r1', sessionId: 's1', text: '- (event) a', at: 101 } },
      { name: 'run:note', payload: { runId: 'r1', sessionId: 's1', text: '- b', at: 102 } }
    ])
    expect(card.notes).toEqual([
      { text: '- (event) a', at: 101 },
      { text: '- b', at: 102 }
    ])
  })

  it('joins the prose of one call, and a new Write to the path replaces it', () => {
    expect(fold([prose('ab'), prose('cd')]).documents).toEqual([
      { path: '_bmad/prd.md', callId: 'c1', text: 'abcd', written: 4, sections: [] }
    ])
    expect(fold([prose('abcd'), prose('xy', 'c2')]).documents).toEqual([
      { path: '_bmad/prd.md', callId: 'c2', text: 'xy', written: 4, sections: [] }
    ])
  })

  it('holds one document per path, in the order first seen', () => {
    const card = fold([prose('aaa', 'c1', 'addendum.md'), prose('bb', 'c2', 'prd.md'), prose('a', 'c3', 'addendum.md')])
    expect(card.documents.map(({ path, text, written }) => ({ path, text, written }))).toEqual([
      { path: 'addendum.md', text: 'a', written: 3 },
      { path: 'prd.md', text: 'bb', written: 2 }
    ])
  })

  it('shows as its subject the path with the largest single Write, the earlier on a tie, switching only when passed', () => {
    const addendum = prose('x'.repeat(3000), 'c1', 'addendum.md')
    expect(subjectOf(fold([addendum]).documents)?.path).toBe('addendum.md')
    expect(subjectOf(fold([addendum, prose('y'.repeat(3000), 'c2', 'prd.md')]).documents)?.path).toBe('addendum.md')
    const passed = fold([addendum, prose('y'.repeat(3000), 'c2', 'prd.md'), prose('y', 'c2', 'prd.md')])
    expect(subjectOf(passed.documents)?.path).toBe('prd.md')
    // A later, shorter rewrite of the subject keeps its weight, and so the subject.
    const rewritten = fold([addendum, prose('y'.repeat(3001), 'c2', 'prd.md'), prose('short', 'c3', 'prd.md')])
    expect(subjectOf(rewritten.documents)).toMatchObject({ path: 'prd.md', text: 'short', written: 3001 })
    expect(subjectOf([])).toBeUndefined()
  })

  it('sets a committed path’s sections, and nothing from a rejected write', () => {
    const card = fold([
      prose('## Goals'),
      committed(['Goals', 'Scope', 'Goals']),
      committed(['Scope', 'Risks'], 'c2'),
      committed(['Never'], 'c3', false)
    ])
    expect(card.documents).toEqual([{ path: '_bmad/prd.md', callId: 'c1', text: '## Goals', written: 8, sections: ['Scope', 'Risks'] }])
  })

  it('replaces a path’s text with the patched document an Edit commits, keeping its weight', () => {
    const card = fold([prose('## A\nold'), committed(['A']), committed(['A', 'B'], 'e1', true, '_bmad/prd.md', '## A\nnew\n## B')])
    expect(card.documents).toEqual([
      { path: '_bmad/prd.md', callId: 'e1', text: '## A\nnew\n## B', written: 8, sections: ['A', 'B'] }
    ])
  })

  it('adds a path first seen on a commit as an empty document, which is no subject', () => {
    const card = fold([committed([], 'e1', true, 'elsewhere.md')])
    expect(card.documents).toEqual([{ path: 'elsewhere.md', callId: 'e1', text: '', written: 0, sections: [] }])
    expect(subjectOf(card.documents)).toBeUndefined()
  })

  it('ends once, on the first terminal event, and takes nothing after', () => {
    const failed = fold([
      { name: 'run:failed', payload: { runId: 'r1', sessionId: 's1', error: { code: 'run/failed', message: 'm', detail: 'x' }, at: 200 } },
      { name: 'run:finished', payload: { runId: 'r1', sessionId: 's1', at: 300 } },
      prose('late')
    ])
    expect(failed).toMatchObject({ status: 'failed', endedAt: 200, error: { code: 'run/failed' }, documents: [] })
    expect(fold([{ name: 'run:finished', payload: { runId: 'r1', sessionId: 's1', at: 300 } }])).toMatchObject({
      status: 'finished',
      endedAt: 300
    })
    expect(fold([{ name: 'run:stopped', payload: { runId: 'r1', sessionId: 's1', at: 300 } }]).status).toBe('stopped')
  })

  it('ignores another run’s events and events with no run', () => {
    const card = startCard(started)
    expect(foldRunCard(card, { name: 'run:finished', payload: { runId: 'r2', sessionId: 's1', at: 1 } })).toBe(card)
    expect(foldRunCard(card, { name: 'session:awaiting-turn', payload: { sessionId: 's1', at: 1 } })).toBe(card)
  })
})
