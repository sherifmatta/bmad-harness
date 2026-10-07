import { describe, expect, it } from 'vitest'
import type { ContractEvent } from '../shared/events'
import { foldRunCard, startCard } from './fold/run-card'
import { railAnnotatorFor } from './rail-annotations'

describe('railAnnotatorFor', () => {
  it('is one annotator per window object: the same for every ask, another for another window', () => {
    const one = {}
    const two = {}

    expect(railAnnotatorFor(one)).toBe(railAnnotatorFor(one))
    expect(railAnnotatorFor(two)).not.toBe(railAnnotatorFor(one))
  })

  it('is keyed by the object and never by an id: a window that comes back with the same id is a fresh one', () => {
    const first = { id: 1 }
    const second = { id: 1 }

    expect(railAnnotatorFor(second)).not.toBe(railAnnotatorFor(first))
  })

  it('holds what the session side folds for the rail side to tell, whichever asks first', () => {
    const window = {}
    const told: [string, unknown][] = []
    const started = { runId: 'r1', sessionId: 's1', agentId: 'bmad-agent-pm', code: 'CP', at: 1 }
    const piece: ContractEvent = {
      name: 'doc:prose',
      payload: { runId: 'r1', sessionId: 's1', callId: 'c1', path: '_bmad/prd.md', text: '## Vision\nA.\n', at: 2 }
    }
    // The session bridge folds a run's events; the rail bridge, later, binds its projection.
    railAnnotatorFor(window).apply({ name: 'run:started', payload: started }, startCard(started))
    railAnnotatorFor(window).apply(piece, foldRunCard(startCard(started), piece))
    railAnnotatorFor(window).bind({ annotate: (path, annotation) => void told.push([path, annotation]), markRoom: () => undefined, unmarkRoom: () => undefined, clearRoom: () => undefined })

    expect(told).toEqual([['_bmad/prd.md', { text: 'writing · §1 Vision', owner: { agentId: 'bmad-agent-pm' } }]])
  })
})
