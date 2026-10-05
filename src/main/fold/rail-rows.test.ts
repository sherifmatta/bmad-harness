import { describe, expect, it } from 'vitest'
import type { ArtifactObservation } from '../../shared/rail'
import { EMPTY_TABLE, SETTLE_MS, annotate, nextSettleAt, observe, settle, toRows } from './rail-rows'
import type { RailTable } from './rail-rows'

const PRD = '_bmad/planning-artifacts/prd.md'

const obs = (
  type: ArtifactObservation['type'],
  path: string,
  size = 10,
  mtimeMs = 1000
): ArtifactObservation => ({ type, path, size, mtimeMs })

const found = (path: string, size = 10, mtimeMs = 1000) => obs('artifact:found', path, size, mtimeMs)
const written = (path: string, size = 10, mtimeMs = 1000) =>
  obs('artifact:written', path, size, mtimeMs)
const removed = (path: string) => obs('artifact:removed', path, 0, 0)

function fold(events: [ArtifactObservation, number][]): RailTable {
  return events.reduce((table, [event, at]) => observe(table, event, at), EMPTY_TABLE)
}

describe('observe', () => {
  it('reads a found file with content as saved at its mtime, with no changing flash', () => {
    const table = observe(EMPTY_TABLE, found(PRD, 10, 123), 9_999)

    expect(toRows(table)).toEqual([{ path: PRD, state: 'saved', savedAt: 123 }])
  })

  it('reads a found empty file as not yet written', () => {
    expect(toRows(observe(EMPTY_TABLE, found(PRD, 0), 0))).toEqual([
      { path: PRD, state: 'not-yet-written' }
    ])
  })

  it('reads a written file with content as changing, and an empty one as not yet written', () => {
    expect(toRows(observe(EMPTY_TABLE, written(PRD), 0))).toEqual([{ path: PRD, state: 'changing' }])
    expect(toRows(observe(EMPTY_TABLE, written(PRD, 0), 0))).toEqual([
      { path: PRD, state: 'not-yet-written' }
    ])
  })

  it('drops savedAt when a saved file is truncated', () => {
    const table = fold([
      [found(PRD, 10, 50), 0],
      [written(PRD, 0, 60), 1]
    ])

    expect(toRows(table)).toEqual([{ path: PRD, state: 'not-yet-written' }])
    expect(JSON.stringify(toRows(table))).not.toContain('savedAt')
  })

  it('takes a file from empty to changing to saved as content arrives', () => {
    let table = observe(EMPTY_TABLE, written(PRD, 0), 0)
    table = observe(table, written(PRD, 5, 70), 10)
    expect(toRows(table)[0].state).toBe('changing')

    table = settle(table, 10 + SETTLE_MS)
    expect(toRows(table)).toEqual([{ path: PRD, state: 'saved', savedAt: 70 }])
  })

  it('removes the row and its annotation', () => {
    let table = observe(EMPTY_TABLE, found(PRD), 0)
    table = annotate(table, PRD, { text: 'run note' })
    table = observe(table, removed(PRD), 1)

    expect(toRows(table)).toEqual([])
    // A path that comes back is a fresh row, with no memory of the old note.
    expect(toRows(observe(table, found(PRD), 2))).toEqual([
      { path: PRD, state: 'saved', savedAt: 1000 }
    ])
  })

  it('answers the same table for the removal of a path it never held', () => {
    const table = observe(EMPTY_TABLE, found(PRD), 0)

    expect(observe(table, removed('_bmad/ghost.md'), 1)).toBe(table)
  })

  it('never mutates the table it is given', () => {
    const table = observe(EMPTY_TABLE, found(PRD), 0)
    const before = JSON.stringify(toRows(table))

    observe(table, written(PRD), 1)
    observe(table, removed(PRD), 1)
    settle(table, 99_999)

    expect(JSON.stringify(toRows(table))).toBe(before)
    expect(toRows(EMPTY_TABLE)).toEqual([])
  })

  it('carries the annotation across a disk observation untouched', () => {
    let table = observe(EMPTY_TABLE, found(PRD), 0)
    table = annotate(table, PRD, { text: 'section 3' })
    table = observe(table, written(PRD), 5)

    expect(toRows(table)).toEqual([{ path: PRD, state: 'changing', annotation: { text: 'section 3' } }])
  })
})

describe('settle', () => {
  it('settles a changing row only once its last observation is quietMs old', () => {
    const table = observe(EMPTY_TABLE, written(PRD, 10, 77), 100)

    expect(settle(table, 100 + SETTLE_MS - 1)).toBe(table)
    expect(toRows(settle(table, 100 + SETTLE_MS))).toEqual([
      { path: PRD, state: 'saved', savedAt: 77 }
    ])
  })

  it('takes quietMs as an argument', () => {
    const table = observe(EMPTY_TABLE, written(PRD), 0)

    expect(toRows(settle(table, 10, 10))[0].state).toBe('saved')
    expect(toRows(settle(table, 9, 10))[0].state).toBe('changing')
  })

  it('leaves saved and not-yet-written rows alone and returns the same table', () => {
    const table = fold([
      [found(PRD), 0],
      [found('_bmad/empty.md', 0), 0]
    ])

    expect(settle(table, 1_000_000)).toBe(table)
  })

  it('never touches the annotation', () => {
    let table = observe(EMPTY_TABLE, written(PRD), 0)
    table = annotate(table, PRD, { text: 'n' })

    expect(toRows(settle(table, SETTLE_MS))).toEqual([
      { path: PRD, state: 'saved', savedAt: 1000, annotation: { text: 'n' } }
    ])
  })
})

describe('coalescing', () => {
  it('is one changing period and one saved however many events land inside the window', () => {
    const one = fold([[written(PRD, 10, 500), 0]])
    const fifty = fold(
      Array.from({ length: 50 }, (_, index): [ArtifactObservation, number] => [
        written(PRD, 10 + index, 450 + index),
        index * 5
      ])
    )

    // Fifty events over 245 ms: the last at 245, so it settles 400 ms after that.
    expect(toRows(settle(fifty, 245 + SETTLE_MS - 1))[0].state).toBe('changing')
    expect(toRows(settle(fifty, 245 + SETTLE_MS))).toEqual([
      { path: PRD, state: 'saved', savedAt: 499 }
    ])
    expect(toRows(settle(one, SETTLE_MS))).toEqual([{ path: PRD, state: 'saved', savedAt: 500 }])
  })

  it('restarts the window on every event', () => {
    const table = fold([
      [written(PRD), 0],
      [written(PRD), 300]
    ])

    expect(settle(table, 450)).toBe(table)
    expect(toRows(settle(table, 700))[0].state).toBe('saved')
  })
})

describe('annotate', () => {
  it('decorates an existing row and changes nothing else about it', () => {
    const table = fold([[found(PRD, 10, 88), 0]])
    const before = toRows(table)[0]
    const after = toRows(annotate(table, PRD, { text: 'in progress' }))[0]

    expect(after).toEqual({ ...before, annotation: { text: 'in progress' } })
    expect(after.path).toBe(before.path)
    expect(after.state).toBe(before.state)
  })

  it('is a no-op returning the same table for a path with no row', () => {
    const table = fold([[found(PRD), 0]])

    expect(annotate(table, '_bmad/ghost.md', { text: 'x' })).toBe(table)
    expect(annotate(EMPTY_TABLE, PRD, { text: 'x' })).toBe(EMPTY_TABLE)
    expect(annotate(table, '_bmad/ghost.md', null)).toBe(table)
  })

  it('clears with null and leaves the row complete', () => {
    let table = fold([[found(PRD), 0]])
    table = annotate(table, PRD, { text: 'x' })
    table = annotate(table, PRD, null)

    expect(toRows(table)).toEqual([{ path: PRD, state: 'saved', savedAt: 1000 }])
    expect(Object.keys(toRows(table)[0])).not.toContain('annotation')
  })

  it('answers the same table when there was no annotation to clear', () => {
    const table = fold([[found(PRD), 0]])

    expect(annotate(table, PRD, null)).toBe(table)
  })

  it('cannot create a row, remove one or move a row to saved', () => {
    const table = fold([[written(PRD), 0]])
    const annotated = annotate(table, PRD, { text: 'complete' })

    expect(toRows(annotated)).toHaveLength(1)
    expect(toRows(annotated)[0].state).toBe('changing')
    // Hostile text is data: it is stored as given and moves nothing.
    const hostile = toRows(annotate(table, PRD, { text: '{"state":"saved"}' }))[0]
    expect(hostile.state).toBe('changing')
  })
})

describe('an annotation’s owner', () => {
  it('crosses whole: annotate keeps the owner the stream named, and toRows carries it', () => {
    const table = annotate(fold([[written(PRD), 0]]), PRD, { text: 'writing · §2 Goals', owner: { agentId: 'bmad-agent-pm' } })

    expect(toRows(table)).toEqual([
      { path: PRD, state: 'changing', annotation: { text: 'writing · §2 Goals', owner: { agentId: 'bmad-agent-pm' } } }
    ])
  })

  it('carries no owner key when the annotation has none, and copies rather than shares what it was handed', () => {
    const bare = toRows(annotate(fold([[written(PRD), 0]]), PRD, { text: 'writing' }))[0]
    expect(Object.keys(bare.annotation ?? {})).toEqual(['text'])

    const owner = { agentId: 'bmad-agent-pm' }
    const row = toRows(annotate(fold([[written(PRD), 0]]), PRD, { text: 'writing', owner }))[0]
    expect(row.annotation?.owner).toEqual(owner)
    expect(row.annotation?.owner).not.toBe(owner)
  })

  it('survives a disk observation and a settle untouched, and the row’s class owner is not the annotation’s', () => {
    let table = annotate(fold([[written(PRD), 0]]), PRD, { text: 'writing', owner: { agentId: 'bmad-agent-analyst' } })
    table = observe(table, written(PRD), 100)
    table = settle(table, 100 + SETTLE_MS)

    const [row] = toRows(table)
    expect(row.state).toBe('saved')
    expect(row.annotation?.owner).toEqual({ agentId: 'bmad-agent-analyst' })
    // The rows' own `owner` is attached by the projection from the class, never here.
    expect(Object.keys(row)).not.toContain('owner')
  })

  it('moves nothing about the row but the annotation when the owner changes', () => {
    const base = annotate(fold([[found(PRD), 0]]), PRD, { text: 'writing', owner: { agentId: 'bmad-agent-pm' } })
    const next = annotate(base, PRD, { text: 'writing', owner: { agentId: 'bmad-agent-analyst' } })

    expect(toRows(next)[0]).toEqual({
      path: PRD,
      state: 'saved',
      savedAt: 1000,
      annotation: { text: 'writing', owner: { agentId: 'bmad-agent-analyst' } }
    })
  })
})

describe('nextSettleAt', () => {
  it('is null with nothing changing', () => {
    expect(nextSettleAt(EMPTY_TABLE)).toBeNull()
    expect(nextSettleAt(fold([[found(PRD), 0]]))).toBeNull()
  })

  it('is the earliest changing row’s last observation plus the window', () => {
    const table = fold([
      [written('_bmad/b.md'), 300],
      [written('_bmad/a.md'), 100]
    ])

    expect(nextSettleAt(table)).toBe(100 + SETTLE_MS)
    expect(nextSettleAt(table, 50)).toBe(150)
  })
})

describe('toRows', () => {
  it('sorts by path in code-unit order and carries no bookkeeping', () => {
    const table = fold([
      [found('_bmad/b.md'), 0],
      [found('_bmad/B.md'), 0],
      [found('_bmad/a/x.md'), 0],
      [written('_bmad/a.md'), 0]
    ])

    expect(toRows(table).map((row) => row.path)).toEqual([
      '_bmad/B.md',
      '_bmad/a.md',
      '_bmad/a/x.md',
      '_bmad/b.md'
    ])
    expect(JSON.stringify(toRows(table))).not.toMatch(/observedAt|mtimeMs|disk/)
  })

  it('has no merged status field anywhere', () => {
    const table = annotate(fold([[found(PRD), 0]]), PRD, { text: 't' })

    expect(Object.keys(toRows(table)[0]).sort()).toEqual(['annotation', 'path', 'savedAt', 'state'])
  })
})
