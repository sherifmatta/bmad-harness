import { describe, expect, it } from 'vitest'
import type { ContractEvent } from '../../shared/events'
import { foldRunCard, startCard } from './run-card'

const started = { runId: 'r1', sessionId: 's1', agentId: 'bmad-agent-pm', code: 'CP', at: 100 }
const prose = (text: string, callId = 'c1', path = '_bmad/prd.md'): ContractEvent => ({
  name: 'doc:prose',
  payload: { runId: 'r1', sessionId: 's1', callId, path, text, at: 110 }
})
const committed = (sections: string[], callId = 'c1', ok = true): ContractEvent =>
  ok
    ? { name: 'doc:committed', payload: { ok, runId: 'r1', sessionId: 's1', callId, path: '_bmad/prd.md', sections, at: 120 } }
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
      sections: [],
      prose: null
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

  it('joins the prose of one call and starts again on another', () => {
    expect(fold([prose('ab'), prose('cd')]).prose).toEqual({ callId: 'c1', path: '_bmad/prd.md', text: 'abcd' })
    expect(fold([prose('ab'), prose('new', 'c2', 'x.md')]).prose).toEqual({ callId: 'c2', path: 'x.md', text: 'new' })
  })

  it('counts each committed heading once, and nothing from a rejected write', () => {
    const card = fold([
      committed(['Goals', 'Scope', 'Goals']),
      committed(['Scope', 'Risks'], 'c2'),
      committed(['Never'], 'c3', false)
    ])
    expect(card.sections).toEqual(['Goals', 'Scope', 'Risks'])
  })

  it('ends once, on the first terminal event, and takes nothing after', () => {
    const failed = fold([
      { name: 'run:failed', payload: { runId: 'r1', sessionId: 's1', error: { code: 'run/failed', message: 'm', detail: 'x' }, at: 200 } },
      { name: 'run:finished', payload: { runId: 'r1', sessionId: 's1', at: 300 } },
      prose('late')
    ])
    expect(failed).toMatchObject({ status: 'failed', endedAt: 200, error: { code: 'run/failed' }, prose: null })
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
