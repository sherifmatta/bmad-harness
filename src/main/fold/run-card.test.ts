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
      steps: [],
      documents: []
    })
    expect(startCard({ ...started, agentId: undefined })).not.toHaveProperty('agentId')
  })

  it('is born with the skill run:started carried, and with no key when it carried none (Story 3.18)', () => {
    expect(startCard({ ...started, skill: 'bmad-build' }).skill).toBe('bmad-build')
    expect(startCard(started)).not.toHaveProperty('skill')
    expect(startCard({ ...started, skill: undefined })).not.toHaveProperty('skill')
  })

  it('keeps the skill through every later event, to the run’s end', () => {
    const card = [prose('x'), committed(['A']), { name: 'run:finished', payload: { runId: 'r1', sessionId: 's1', at: 200 } } as ContractEvent].reduce(
      foldRunCard,
      startCard({ ...started, skill: 'bmad-build' })
    )
    expect(card).toMatchObject({ status: 'finished', skill: 'bmad-build' })
  })

  it('is born with the plan its run:started carried, as a copy, and with none when it carried none', () => {
    const plan = ['Vision', 'Scope']
    const card = startCard({ ...started, plan })
    expect(card.plan).toEqual(['Vision', 'Scope'])
    plan.push('Mutated')
    expect(card.plan).toEqual(['Vision', 'Scope'])
    expect(startCard(started)).not.toHaveProperty('plan')
  })

  it('adds the names a note pulled to the plan, each once and without regard to case, and leaves the plan alone for other notes', () => {
    const note = (text: string, pulled?: string[]): ContractEvent => ({
      name: 'run:note',
      payload: { runId: 'r1', sessionId: 's1', text, ...(pulled === undefined ? {} : { pulled }), at: 101 }
    })
    const card = [note('- a'), note('- concern scan: B, vision', ['B', 'vision']), note('- concern scan: B', ['b']), note('- c', [])].reduce(
      foldRunCard,
      startCard({ ...started, plan: ['Vision', 'Scope'] })
    )
    expect(card.plan).toEqual(['Vision', 'Scope', 'B'])
    expect(card.notes).toHaveLength(4)
    // A run with no template that is told of pulled names has them as its plan.
    expect([note('- x', ['Why Now'])].reduce(foldRunCard, startCard(started)).plan).toEqual(['Why Now'])
    expect([note('- x')].reduce(foldRunCard, startCard(started))).not.toHaveProperty('plan')
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

  describe('steps', () => {
    const running = (callId: string, at: number, label = `read ${callId}.md`): ContractEvent => ({
      name: 'run:step',
      payload: { runId: 'r1', sessionId: 's1', callId, status: 'running', label, at }
    })
    const closed = (callId: string, status: 'done' | 'failed', at: number): ContractEvent => ({
      name: 'run:step',
      payload: { runId: 'r1', sessionId: 's1', callId, status, at }
    })
    const note = (text: string): ContractEvent => ({ name: 'run:note', payload: { runId: 'r1', sessionId: 's1', text, at: 105 } })

    it('opens a step running with the notes held then, and closes it on its result at that event’s instant', () => {
      const card = fold([running('a', 101), note('- one'), running('b', 102), closed('a', 'done', 103), closed('b', 'failed', 104)])
      expect(card.steps).toEqual([
        { callId: 'a', label: 'read a.md', status: 'done', startedAt: 101, endedAt: 103, notesBefore: 0 },
        { callId: 'b', label: 'read b.md', status: 'failed', startedAt: 102, endedAt: 104, notesBefore: 1 }
      ])
    })

    it('changes nothing for a repeated running, or a close of an unknown or an already closed call', () => {
      const card = fold([running('a', 101), closed('a', 'done', 103)])
      for (const event of [running('a', 200, 'other'), closed('a', 'failed', 201), closed('nobody', 'done', 202)]) {
        expect(foldRunCard(card, event)).toBe(card)
      }
    })

    it('closes every step still running as failed at the terminal event’s instant, with no event of its own', () => {
      for (const [name, end] of [
        ['run:finished', { runId: 'r1', sessionId: 's1', at: 300 }],
        ['run:stopped', { runId: 'r1', sessionId: 's1', at: 300 }],
        ['run:failed', { runId: 'r1', sessionId: 's1', error: { code: 'run/failed', message: 'm' }, at: 300 }]
      ] as const) {
        const card = fold([running('a', 101), running('b', 102), closed('a', 'done', 103), { name, payload: end } as ContractEvent])
        expect(card.steps, name).toEqual([
          { callId: 'a', label: 'read a.md', status: 'done', startedAt: 101, endedAt: 103, notesBefore: 0 },
          { callId: 'b', label: 'read b.md', status: 'failed', startedAt: 102, endedAt: 300, notesBefore: 0 }
        ])
      }
    })

    it('takes no more steps once the card has ended', () => {
      const ended = fold([running('a', 101), { name: 'run:stopped', payload: { runId: 'r1', sessionId: 's1', at: 300 } }])
      expect(foldRunCard(ended, running('late', 301))).toBe(ended)
      expect(foldRunCard(ended, closed('a', 'done', 302))).toBe(ended)
    })

    it('keeps at most 300, dropping the oldest finished one and never a running one', () => {
      const events: ContractEvent[] = [running('keep', 1)]
      for (let n = 0; n < 305; n += 1) events.push(running(`c${n}`, 10 + n), closed(`c${n}`, 'done', 400 + n))
      const card = fold(events)
      expect(card.steps).toHaveLength(300)
      expect(card.steps[0]).toMatchObject({ callId: 'keep', status: 'running' })
      expect(card.steps.at(-1)?.callId).toBe('c304')
      expect(card.steps.some((step) => step.callId === 'c0')).toBe(false)
    })

    it('is not touched by other runs’ steps, and leaves the card alone for them', () => {
      const card = startCard(started)
      expect(foldRunCard(card, { name: 'run:step', payload: { runId: 'r2', sessionId: 's2', callId: 'a', status: 'running', label: 'x', at: 1 } })).toBe(card)
    })
  })

  it('ignores another run’s events and events with no run', () => {
    const card = startCard(started)
    expect(foldRunCard(card, { name: 'run:finished', payload: { runId: 'r2', sessionId: 's1', at: 1 } })).toBe(card)
    expect(foldRunCard(card, { name: 'session:awaiting-turn', payload: { sessionId: 's1', at: 1 } })).toBe(card)
  })
})
