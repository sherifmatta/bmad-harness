import { describe, expect, it } from 'vitest'

import type { BoardEpic, BoardOther, BoardSnapshot, BoardStory } from '../../../shared/board'
import type { AgentView } from '../../../shared/install'
import type { PersonaState } from '../status/persona-state'
import { epicRowsOf, overviewOf } from './board-figures'

const story = (number: string, status: string): BoardStory => ({
  key: `${number.replace('.', '-')}-slug`,
  number,
  title: `Story ${number}`,
  status,
  known: true
})

const epic = (number: number, status: string, stories: BoardStory[], extra: Partial<BoardEpic> = {}): BoardEpic => ({
  key: `epic-${number}`,
  number,
  title: `Title ${number}`,
  status,
  known: true,
  stories,
  ...extra
})

const read = (epics: BoardEpic[], others: BoardOther[] = []): BoardSnapshot => ({ revision: 1, kind: 'read', epics, others })
const none: BoardSnapshot = { revision: 1, kind: 'none', code: 'board/absent', message: 'm' }

const agent = (id: string): AgentView => ({ id, module: 'bmm', name: id, title: 'Role', icon: 'i', description: 'd' })
const roster = ['a', 'b', 'c', 'd', 'e'].map(agent)
const states = (entries: Record<string, PersonaState>): Map<string, PersonaState> => new Map(Object.entries(entries))

describe('overviewOf', () => {
  it('counts only roster personas in work, out of the roster', () => {
    const overview = overviewOf(read([]), roster, states({ a: 'work', b: 'work', c: 'live', d: 'note', e: 'error' }))

    expect(overview).toMatchObject({ running: 2, installedCount: 5 })
  })

  it('never counts an id outside the roster, and reads an absent id as idle', () => {
    const overview = overviewOf(read([]), roster, states({ a: 'work', ghost: 'work', orphan: 'work' }))

    expect(overview.running).toBe(1)
    expect(overviewOf(read([]), roster, new Map()).running).toBe(0)
  })

  it('counts in-progress stories out of the stories the columns draw', () => {
    const snapshot = read([
      epic(1, 'in-progress', [story('1.1', 'in-progress'), story('1.2', 'done'), story('1.3', 'blocked')]),
      epic(2, 'in-progress', [story('2.1', 'in-progress'), story('2.2', 'backlog')])
    ])

    expect(overviewOf(snapshot, roster, new Map())).toMatchObject({ inProgress: 2, shown: 5 })
  })

  it('leaves a done epic’s stories out of both numbers', () => {
    const snapshot = read([epic(1, 'done', [story('1.1', 'in-progress'), story('1.2', 'done')]), epic(2, 'in-progress', [story('2.1', 'review')])])

    expect(overviewOf(snapshot, roster, new Map())).toMatchObject({ inProgress: 0, shown: 1 })
  })

  it('counts an unknown status in the total and not in progress, and throws nothing', () => {
    expect(overviewOf(read([epic(1, 'in-progress', [story('1.1', 'blocked')])]), roster, new Map())).toMatchObject({
      inProgress: 0,
      shown: 1
    })
  })

  it('counts a retrospective and an orphan row in neither', () => {
    const snapshot = read(
      [epic(1, 'in-progress', [story('1.1', 'in-progress')], { retrospective: { key: 'epic-1-retrospective', status: 'optional', known: true } })],
      [{ key: '9-1-orphan', status: 'in-progress', known: true }]
    )

    expect(overviewOf(snapshot, roster, new Map())).toMatchObject({ inProgress: 1, shown: 1 })
  })

  it('reads zero for none and an empty roster', () => {
    expect(overviewOf(none, [], new Map())).toEqual({ running: 0, installedCount: 0, inProgress: 0, shown: 0 })
  })
})

describe('epicRowsOf', () => {
  it('reads n of m for mixed progress, in the file’s order', () => {
    const rows = epicRowsOf(
      read([
        epic(2, 'in-progress', [story('2.1', 'done')]),
        epic(1, 'in-progress', [story('1.1', 'done'), story('1.2', 'review'), story('1.3', 'done'), story('1.4', 'backlog')])
      ])
    )

    expect(rows).toEqual([
      { key: 'epic-2', id: 'Epic 2', title: 'Title 2', done: 1, total: 1 },
      { key: 'epic-1', id: 'Epic 1', title: 'Title 1', done: 2, total: 4 }
    ])
  })

  it('keeps a done epic’s row and counts over all its stories', () => {
    const rows = epicRowsOf(read([epic(1, 'done', [story('1.1', 'done'), story('1.2', 'done')])]))

    expect(rows).toEqual([{ key: 'epic-1', id: 'Epic 1', title: 'Title 1', done: 2, total: 2 }])
  })

  it('gives an epic with no stories a total of zero', () => {
    expect(epicRowsOf(read([epic(3, 'backlog', [])]))[0]).toMatchObject({ done: 0, total: 0 })
  })

  it('carries an empty title as it is', () => {
    expect(epicRowsOf(read([epic(7, 'backlog', [], { title: '' })]))[0]).toMatchObject({ id: 'Epic 7', title: '' })
  })

  it('counts a retrospective in neither n nor m', () => {
    const retro = { key: 'epic-1-retrospective', status: 'done', known: true }

    expect(epicRowsOf(read([epic(1, 'in-progress', [story('1.1', 'done')], { retrospective: retro })]))[0]).toMatchObject({ done: 1, total: 1 })
  })

  it('counts an unknown status in m and not in n', () => {
    expect(epicRowsOf(read([epic(1, 'in-progress', [story('1.1', 'blocked'), story('1.2', 'done')])]))[0]).toMatchObject({ done: 1, total: 2 })
  })

  it('draws no row for none', () => {
    expect(epicRowsOf(none)).toEqual([])
  })
})
