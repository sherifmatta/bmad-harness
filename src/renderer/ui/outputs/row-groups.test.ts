import { describe, expect, it } from 'vitest'
import type { RailRow } from '../../../shared/rail'
import { baseName, groupRows } from './row-groups'

const row = (path: string): RailRow => ({ path, state: 'saved', savedAt: 1 })

describe('groupRows', () => {
  it('groups by directory with a trailing slash, root files under _bmad/', () => {
    const groups = groupRows([
      row('_bmad/epics.md'),
      row('_bmad/planning-artifacts/prd.md'),
      row('_bmad/config.toml')
    ])

    expect(groups.map((group) => group.dir)).toEqual(['_bmad/', '_bmad/planning-artifacts/'])
    expect(groups[0].rows.map((r) => r.path)).toEqual(['_bmad/config.toml', '_bmad/epics.md'])
  })

  it('orders groups and rows by code unit, never by locale', () => {
    const groups = groupRows([
      row('_bmad/b/x.md'),
      row('_bmad/B/x.md'),
      row('_bmad/a-b/x.md'),
      row('_bmad/a/Z.md'),
      row('_bmad/a/a.md'),
      row('_bmad/a/B.md')
    ])

    expect(groups.map((group) => group.dir)).toEqual([
      '_bmad/B/',
      '_bmad/a-b/',
      '_bmad/a/',
      '_bmad/b/'
    ])
    expect(groups[2].rows.map((r) => baseName(r.path))).toEqual(['B.md', 'Z.md', 'a.md'])
  })

  it('does not depend on the order it is given', () => {
    const rows = [row('_bmad/z/a.md'), row('_bmad/a/a.md'), row('_bmad/m.md')]

    expect(groupRows(rows)).toEqual(groupRows([...rows].reverse()))
  })

  it('makes a group only where there is a row, and none for no rows', () => {
    expect(groupRows([])).toEqual([])
  })

  it('does not mutate what it is given', () => {
    const rows = [row('_bmad/b.md'), row('_bmad/a.md')]
    groupRows(rows)

    expect(rows.map((r) => r.path)).toEqual(['_bmad/b.md', '_bmad/a.md'])
  })

  it('has no recency, relevance, pin or count on a group', () => {
    const [group] = groupRows([row('_bmad/a.md')])

    expect(Object.keys(group).sort()).toEqual(['dir', 'rows'])
  })
})

describe('baseName', () => {
  it('is the last segment', () => {
    expect(baseName('_bmad/a/b.md')).toBe('b.md')
    expect(baseName('b.md')).toBe('b.md')
    expect(baseName('_bmad/.memlog.md')).toBe('.memlog.md')
  })
})
