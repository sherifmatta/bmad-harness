import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunCardSnapshot } from '../../shared/conversation'
import type { ContractEvent } from '../../shared/events'
import type { ArtifactObservation, RailAnnotation, RailSnapshot } from '../../shared/rail'
import { SETTLE_MS } from '../fold/rail-rows'
import { foldRunCard, startCard } from '../fold/run-card'
import { createRailProjection } from './rail'
import { createRailAnnotator } from './rail-annotator'
import type { AnnotationTarget } from './rail-annotator'

const PRD = '_bmad/planning-artifacts/prd.md'
const JOHN = 'bmad-agent-pm'

const started: ContractEvent = { name: 'run:started', payload: { runId: 'r1', sessionId: 's1', agentId: JOHN, code: 'CP', at: 1 } }
const prose = (text: string, path = PRD, callId = 'c1'): ContractEvent => ({
  name: 'doc:prose',
  payload: { runId: 'r1', sessionId: 's1', callId, path, text, at: 2 }
})
const finished: ContractEvent = { name: 'run:finished', payload: { runId: 'r1', sessionId: 's1', at: 9 } }
const rejected: ContractEvent = {
  name: 'doc:committed',
  payload: { ok: false, runId: 'r1', sessionId: 's1', callId: 'c1', path: PRD, error: { code: 'doc/write-rejected', message: 'x' }, at: 5 }
}

/** The run's card and the annotator, driven as the session side drives them: the card folds first. */
function run() {
  const annotator = createRailAnnotator()
  let card: RunCardSnapshot | undefined
  return {
    annotator,
    send(...events: ContractEvent[]) {
      for (const event of events) {
        if (event.name === 'run:started') card = startCard(event.payload)
        else if (card !== undefined && 'runId' in event.payload) card = foldRunCard(card, event)
        annotator.apply(event, card)
      }
    }
  }
}

/** A target that records what it was told. */
function recorder() {
  const told: [string, RailAnnotation | null][] = []
  const target: AnnotationTarget = { annotate: (path, annotation) => void told.push([path, annotation]) }
  return { target, told }
}

describe('the rail annotator', () => {
  it('tells nothing while no projection is bound, and everything held when one is', () => {
    const { annotator, send } = run()
    send(started, prose('## Vision\nA.\n## Goals\nB.\n'))

    const { target, told } = recorder()
    expect(told).toEqual([])
    annotator.bind(target)

    expect(told).toEqual([[PRD, { text: 'writing · §2 Goals', owner: { agentId: JOHN } }]])
  })

  it('tells a path again only when what is said of it moves', () => {
    const { annotator, send } = run()
    const { target, told } = recorder()
    annotator.bind(target)

    send(started)
    expect(told).toEqual([])
    send(prose('## Vision\nA.\n'))
    send(prose('More words in the same section.\n'))
    send(prose('## Goals\nB.\n'))

    expect(told.map(([, annotation]) => annotation?.text)).toEqual(['writing · §1 Vision', 'writing · §2 Goals'])
  })

  it('tells nothing for a note or any other event', () => {
    const { annotator, send } = run()
    const { target, told } = recorder()
    annotator.bind(target)
    send(started, prose('## Vision\nA.\n'))
    told.length = 0

    send({ name: 'run:note', payload: { runId: 'r1', sessionId: 's1', text: '- n', at: 3 } })
    send({ name: 'rail:changed', payload: { revision: 1, rows: [] } })

    expect(told).toEqual([])
  })

  it('tells a path again when only its owner moves: two runs of different personas under one label', () => {
    const annotator = createRailAnnotator()
    const { target, told } = recorder()
    annotator.bind(target)
    const analyst = 'bmad-agent-analyst'
    const cards = new Map<string, RunCardSnapshot>()
    const send = (event: ContractEvent): void => {
      if (event.name === 'run:started') cards.set(event.payload.runId, startCard(event.payload))
      else if ('runId' in event.payload) {
        const card = cards.get(event.payload.runId)
        if (card !== undefined) cards.set(card.runId, foldRunCard(card, event))
      }
      annotator.apply(event, 'runId' in event.payload ? cards.get(event.payload.runId) : undefined)
    }
    const start = (runId: string, agentId: string): ContractEvent => ({
      name: 'run:started',
      payload: { runId, sessionId: `s-${runId}`, agentId, code: 'CP', at: 1 }
    })
    const piece = (runId: string): ContractEvent => ({
      name: 'doc:prose',
      payload: { runId, sessionId: `s-${runId}`, callId: `c-${runId}`, path: PRD, text: '## Vision\nA.\n', at: 2 }
    })

    send(start('r1', JOHN))
    send(start('r2', analyst))
    send(piece('r1'))
    send(piece('r2'))
    // The later-started run's annotation shows, in the same words but under its own persona.
    send({ name: 'run:finished', payload: { runId: 'r2', sessionId: 's-r2', at: 9 } })

    expect(told).toEqual([
      [PRD, { text: 'writing · §1 Vision', owner: { agentId: JOHN } }],
      [PRD, { text: 'writing · §1 Vision', owner: { agentId: analyst } }],
      [PRD, { text: 'writing · §1 Vision', owner: { agentId: JOHN } }]
    ])
  })

  it('tells `null` for the path of a rejected write, and only that path', () => {
    const { annotator, send } = run()
    const { target, told } = recorder()
    annotator.bind(target)
    send(started, prose('## Vision\nA.\n'), prose('## Notes\nB.\n', '_bmad/planning-artifacts/addendum.md', 'c2'))
    told.length = 0

    send(rejected)

    expect(told).toEqual([[PRD, null]])
  })

  it('tells `null` for every path of a run that ended, and only those', () => {
    const { annotator, send } = run()
    const { target, told } = recorder()
    annotator.bind(target)
    send(started, prose('## Vision\nA.\n'), prose('## Notes\nB.\n', '_bmad/planning-artifacts/addendum.md', 'c2'))
    told.length = 0

    send(finished)

    expect(told).toEqual([
      [PRD, null],
      ['_bmad/planning-artifacts/addendum.md', null]
    ])
  })

  it('says a path’s held annotation again when it is observed, and nothing for a path it holds none of', () => {
    const { annotator, send } = run()
    const { target, told } = recorder()
    annotator.bind(target)
    send(started, prose('## Vision\nA.\n'))
    told.length = 0

    annotator.observed(PRD)
    annotator.observed('_bmad/epics.md')

    expect(told).toEqual([[PRD, { text: 'writing · §1 Vision', owner: { agentId: JOHN } }]])
  })

  it('says nothing on an observation while unbound', () => {
    const { annotator, send } = run()
    send(started, prose('## Vision\nA.\n'))

    expect(() => annotator.observed(PRD)).not.toThrow()
  })

  it('tells a window’s projection afresh when it is bound again', () => {
    const { annotator, send } = run()
    send(started, prose('## Vision\nA.\n'))
    const first = recorder()
    const second = recorder()
    annotator.bind(first.target)
    annotator.bind(second.target)

    expect(first.told).toHaveLength(1)
    expect(second.told).toEqual(first.told)
  })
})

describe('the annotator and the rail projection, two channels', () => {
  let pushes: RailSnapshot[]

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    pushes = []
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const obs = (type: ArtifactObservation['type'], path = PRD, size = 10): ArtifactObservation => ({ type, path, size, mtimeMs: Date.now() })

  function railed() {
    const projection = createRailProjection({ onChange: (snapshot) => pushes.push(snapshot), now: () => Date.now() })
    projection.ready()
    const { annotator, send } = run()
    annotator.bind(projection)
    /** A watcher observation, as the rail bridge relays it. */
    const watch = (observation: ArtifactObservation): void => {
      projection.observe(observation)
      annotator.observed(observation.path)
    }
    return { projection, send, watch }
  }

  it('makes no row for a path the stream names before the watcher has seen it, and decorates it once the watcher has', () => {
    const { projection, send, watch } = railed()
    send(started, prose('## Vision\nA.\n## Goals\nB.\n'))

    expect(projection.snapshot().rows).toEqual([])
    expect(pushes).toEqual([])

    watch(obs('artifact:written'))

    expect(projection.snapshot().rows).toEqual([
      {
        path: PRD,
        owner: { agentId: JOHN },
        state: 'changing',
        annotation: { text: 'writing · §2 Goals', owner: { agentId: JOHN } }
      }
    ])
  })

  it('leaves a saved row `saved` and its age as the watcher gave it, with the annotation beside it', () => {
    const { projection, send, watch } = railed()
    watch(obs('artifact:found'))
    const before = projection.snapshot().rows[0]
    expect(before).toMatchObject({ state: 'saved', savedAt: 10_000 })

    send(started, prose('## Context\nA.\n'))

    const [row] = projection.snapshot().rows
    expect(row).toMatchObject({ path: PRD, state: 'saved', savedAt: 10_000, annotation: { text: 'writing · §1 Context' } })
    expect({ path: row.path, state: row.state, savedAt: (row as { savedAt: number }).savedAt, owner: row.owner }).toEqual({
      path: before.path,
      state: before.state,
      savedAt: (before as { savedAt: number }).savedAt,
      owner: before.owner
    })
  })

  it('never moves a row to saved, or removes one: the stream’s end and commits leave `changing` to the settle timer', () => {
    const { projection, send, watch } = railed()
    watch(obs('artifact:written'))
    send(started, prose('## Vision\nA.\n'))
    send({ name: 'doc:committed', payload: { ok: true, runId: 'r1', sessionId: 's1', callId: 'c1', path: PRD, sections: ['Vision'], at: 5 } })
    send(finished)

    // The annotation is gone with its run, and the row is exactly what the watcher says.
    expect(projection.snapshot().rows).toEqual([{ path: PRD, owner: { agentId: JOHN }, state: 'changing' }])

    vi.advanceTimersByTime(SETTLE_MS)
    expect(projection.snapshot().rows).toEqual([{ path: PRD, owner: { agentId: JOHN }, state: 'saved', savedAt: 10_000 }])
  })

  it('leaves the rows byte-identical to the watcher’s when the run ends, whatever the run said', () => {
    const { projection, send, watch } = railed()
    watch(obs('artifact:found'))
    watch(obs('artifact:found', '_bmad/epics.md'))
    const baseline = JSON.stringify(projection.snapshot().rows)

    send(started, prose('## Vision\nA.\n'))
    expect(JSON.stringify(projection.snapshot().rows)).not.toBe(baseline)
    send(finished)

    expect(JSON.stringify(projection.snapshot().rows)).toBe(baseline)
  })

  it('returns the annotation when the watcher makes a removed row again', () => {
    const { projection, send, watch } = railed()
    watch(obs('artifact:written'))
    send(started, prose('## Vision\nA.\n## Goals\nB.\n'))
    expect(projection.snapshot().rows[0].annotation?.text).toBe('writing · §2 Goals')

    watch(obs('artifact:removed'))
    expect(projection.snapshot().rows).toEqual([])
    // Another piece while there is no row makes none.
    send(prose('## Scope\nC.\n'))
    expect(projection.snapshot().rows).toEqual([])

    watch(obs('artifact:written'))
    expect(projection.snapshot().rows[0]).toMatchObject({ state: 'changing', annotation: { text: 'writing · §3 Scope' } })
  })

  it('pushes only when the rows differ: telling an unchanged annotation again pushes nothing', () => {
    const { send, watch } = railed()
    watch(obs('artifact:written'))
    send(started, prose('## Vision\nA.\n'))
    const count = pushes.length

    send(prose('Words, still in Vision.\n'))
    watch(obs('artifact:written'))

    expect(pushes).toHaveLength(count)
  })

  it('gives a row the watcher saw an annotation of only the stream’s making: a foreign writer’s row has none', () => {
    const { projection, send, watch } = railed()
    send(started, prose('## Vision\nA.\n'))
    watch(obs('artifact:written', '_bmad/planning-artifacts/architecture.md'))

    const [row] = projection.snapshot().rows
    expect(row.state).toBe('changing')
    expect(Object.keys(row)).not.toContain('annotation')
    vi.advanceTimersByTime(SETTLE_MS)
    expect(projection.snapshot().rows[0].state).toBe('saved')
    expect(Object.keys(projection.snapshot().rows[0])).not.toContain('annotation')
  })
})
