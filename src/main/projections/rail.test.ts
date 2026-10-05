import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArtifactObservation, RailSnapshot } from '../../shared/rail'
import { SETTLE_MS } from '../fold/rail-rows'
import { createRailProjection } from './rail'
import type { RailProjection } from './rail'

const PRD = '_bmad/planning-artifacts/prd.md'

const obs = (
  type: ArtifactObservation['type'],
  path: string,
  size = 10,
  mtimeMs = 1000
): ArtifactObservation => ({ type, path, size, mtimeMs })

let pushes: RailSnapshot[]
let projection: RailProjection

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(10_000)
  pushes = []
  projection = createRailProjection({ onChange: (snapshot) => pushes.push(snapshot) })
})

afterEach(() => {
  projection.dispose()
  vi.useRealTimers()
})

describe('the rail projection', () => {
  it('pushes nothing before ready, and hands the initial rows out through snapshot()', () => {
    projection.observe(obs('artifact:found', PRD))
    projection.observe(obs('artifact:found', '_bmad/epics.md'))

    expect(pushes).toEqual([])

    projection.ready()

    expect(pushes).toEqual([])
    expect(projection.snapshot().rows.map((row) => row.path)).toEqual(['_bmad/epics.md', PRD])
    expect(projection.snapshot().revision).toBeGreaterThan(0)
  })

  it('is an empty snapshot for a project with nothing under _bmad', () => {
    projection.ready()

    expect(projection.snapshot()).toEqual({ revision: 0, rows: [] })
  })

  it('attaches the owner from the class and leaves an unrecognised file without one', () => {
    projection.observe(obs('artifact:found', PRD))
    projection.observe(obs('artifact:found', '_bmad/epics.md'))
    projection.ready()

    const [epics, prd] = projection.snapshot().rows
    expect(epics.owner).toBeUndefined()
    expect(Object.keys(epics)).not.toContain('owner')
    expect(prd.owner).toEqual({ agentId: 'bmad-agent-pm' })
  })

  it('is at most two pushes for a burst of three writes: changing, then saved', () => {
    projection.ready()

    projection.observe(obs('artifact:written', PRD, 5, 10_000))
    vi.advanceTimersByTime(100)
    projection.observe(obs('artifact:written', PRD, 9, 10_100))
    vi.advanceTimersByTime(100)
    projection.observe(obs('artifact:written', PRD, 12, 10_200))

    expect(pushes).toHaveLength(1)
    expect(pushes[0].rows[0].state).toBe('changing')

    vi.advanceTimersByTime(SETTLE_MS - 1)
    expect(pushes).toHaveLength(1)
    vi.advanceTimersByTime(1)

    expect(pushes).toHaveLength(2)
    expect(pushes[1].rows).toEqual([
      { path: PRD, owner: { agentId: 'bmad-agent-pm' }, state: 'saved', savedAt: 10_200 }
    ])
    expect(pushes[1].revision).toBeGreaterThan(pushes[0].revision)
  })

  it('settles by its own timer, with nothing else to prompt it', () => {
    projection.ready()
    projection.observe(obs('artifact:written', '_bmad/x.md'))

    vi.advanceTimersByTime(SETTLE_MS)

    expect(projection.snapshot().rows[0].state).toBe('saved')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not push when an observation changes nothing it would send', () => {
    projection.observe(obs('artifact:found', PRD, 10, 500))
    projection.ready()

    projection.observe(obs('artifact:removed', '_bmad/ghost.md', 0, 0))
    projection.observe(obs('artifact:found', PRD, 10, 500))

    expect(pushes).toEqual([])
  })

  it('removes a row on removal and pushes it', () => {
    projection.observe(obs('artifact:found', PRD))
    projection.ready()

    projection.observe(obs('artifact:removed', PRD, 0, 0))

    expect(pushes).toHaveLength(1)
    expect(pushes[0].rows).toEqual([])
  })

  describe('the annotation stub', () => {
    beforeEach(() => {
      projection.observe(obs('artifact:found', PRD, 10, 500))
      projection.ready()
    })

    it('decorates an existing row and leaves every disk field and the owner as they were', () => {
      const before = projection.snapshot().rows[0]

      projection.annotate(PRD, { text: 'section 2' })

      const after = projection.snapshot().rows[0]
      expect(after).toEqual({ ...before, annotation: { text: 'section 2' } })
      expect(pushes).toHaveLength(1)
    })

    it('creates nothing and pushes nothing for a path with no row', () => {
      const before = projection.snapshot()

      projection.annotate('_bmad/ghost.md', { text: 'x' })

      expect(projection.snapshot()).toEqual(before)
      expect(pushes).toEqual([])
    })

    it('clears with null, leaving the row complete', () => {
      const before = projection.snapshot().rows[0]
      projection.annotate(PRD, { text: 'x' })
      projection.annotate(PRD, null)

      expect(projection.snapshot().rows[0]).toEqual(before)
      expect(pushes).toHaveLength(2)
    })

    it('never makes a changing row saved', () => {
      projection.observe(obs('artifact:written', PRD, 11, 600))
      projection.annotate(PRD, { text: 'done' })

      expect(projection.snapshot().rows[0].state).toBe('changing')
    })
  })

  describe('the stream’s annotation with an owner', () => {
    const ANALYST = { agentId: 'bmad-agent-analyst' }

    beforeEach(() => {
      projection.observe(obs('artifact:found', PRD, 10, 500))
      projection.ready()
    })

    it('rides in the annotation beside the class’s owner, which stays what the class says', () => {
      projection.annotate(PRD, { text: 'writing · §1 Context', owner: ANALYST })

      expect(projection.snapshot().rows[0]).toEqual({
        path: PRD,
        owner: { agentId: 'bmad-agent-pm' },
        state: 'saved',
        savedAt: 500,
        annotation: { text: 'writing · §1 Context', owner: ANALYST }
      })
      expect(pushes).toHaveLength(1)
      expect(pushes[0].rows[0].annotation?.owner).toEqual(ANALYST)
    })

    it('pushes nothing when the same annotation is handed again, and one push when only its owner moves', () => {
      projection.annotate(PRD, { text: 'writing', owner: ANALYST })
      projection.annotate(PRD, { text: 'writing', owner: { ...ANALYST } })
      expect(pushes).toHaveLength(1)

      projection.annotate(PRD, { text: 'writing', owner: { agentId: 'bmad-agent-pm' } })
      expect(pushes).toHaveLength(2)
    })

    it('keeps the annotation across the watcher making the row again, only by being told again', () => {
      projection.annotate(PRD, { text: 'writing', owner: ANALYST })
      projection.observe(obs('artifact:removed', PRD, 0, 0))
      projection.observe(obs('artifact:written', PRD, 11, 600))

      expect(projection.snapshot().rows[0].state).toBe('changing')
      expect(projection.snapshot().rows[0].annotation).toBeUndefined()

      projection.annotate(PRD, { text: 'writing', owner: ANALYST })
      expect(projection.snapshot().rows[0].annotation).toEqual({ text: 'writing', owner: ANALYST })
    })

    it('leaves a changing row to the settle timer, whatever the annotation says', () => {
      projection.observe(obs('artifact:written', PRD, 11, 600))
      projection.annotate(PRD, { text: 'writing', owner: ANALYST })
      projection.annotate(PRD, null)
      projection.annotate(PRD, { text: 'revising', owner: ANALYST })

      expect(projection.snapshot().rows[0].state).toBe('changing')
      vi.advanceTimersByTime(SETTLE_MS)
      expect(projection.snapshot().rows[0]).toMatchObject({ state: 'saved', savedAt: 600, annotation: { text: 'revising' } })
    })
  })

  it('clears its timer on dispose and pushes no more', () => {
    projection.ready()
    projection.observe(obs('artifact:written', PRD))
    expect(vi.getTimerCount()).toBe(1)

    projection.dispose()

    expect(vi.getTimerCount()).toBe(0)
    projection.observe(obs('artifact:written', '_bmad/y.md'))
    vi.advanceTimersByTime(SETTLE_MS * 2)
    expect(pushes).toHaveLength(1)
  })

  it('takes its quiet window from the option', () => {
    const fast: RailSnapshot[] = []
    const quick = createRailProjection({ onChange: (snapshot) => fast.push(snapshot), quietMs: 50 })
    quick.ready()
    quick.observe(obs('artifact:written', PRD))

    vi.advanceTimersByTime(50)

    expect(fast.map((snapshot) => snapshot.rows[0].state)).toEqual(['changing', 'saved'])
    quick.dispose()
  })
})
