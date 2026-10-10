import { describe, expect, it } from 'vitest'

import type { BoardEpic, BoardOther, BoardSnapshot, BoardStory } from '../../../shared/board'
import { columnsOf } from './board-columns'

const FIVE = ['backlog', 'ready-for-dev', 'in-progress', 'review', 'done']

const story = (number: string, status: string): BoardStory => ({
  key: `${number.replace('.', '-')}-slug`,
  number,
  title: `Story ${number}`,
  status,
  known: FIVE.includes(status)
})

const epic = (number: number, status: string, stories: BoardStory[]): BoardEpic => ({
  key: `epic-${number}`,
  number,
  title: `Epic ${number}`,
  status,
  known: true,
  stories
})

const read = (epics: BoardEpic[], others: BoardOther[] = []): BoardSnapshot => ({
  revision: 1,
  kind: 'read',
  epics,
  others
})

const numbers = (snapshot: BoardSnapshot): Record<string, string[]> =>
  Object.fromEntries(columnsOf(snapshot).map((column) => [column.status, column.stories.map((s) => s.number)]))

describe('columnsOf', () => {
  it('draws the five columns in order, cards under their status in file order', () => {
    const snapshot = read([
      epic(1, 'in-progress', [story('1.1', 'review'), story('1.2', 'backlog'), story('1.3', 'review')]),
      epic(2, 'in-progress', [story('2.1', 'in-progress'), story('2.2', 'ready-for-dev'), story('2.3', 'done'), story('2.4', 'review')])
    ])

    expect(columnsOf(snapshot).map((column) => column.status)).toEqual(FIVE)
    expect(numbers(snapshot)).toEqual({
      backlog: ['1.2'],
      'ready-for-dev': ['2.2'],
      'in-progress': ['2.1'],
      review: ['1.1', '1.3', '2.4'],
      done: ['2.3']
    })
  })

  it('puts a status outside the five in an extra column after done, one per distinct status, in order of first appearance', () => {
    const snapshot = read([
      epic(1, 'in-progress', [story('1.1', 'optional'), story('1.2', 'blocked'), story('1.3', 'done'), story('1.4', 'optional')])
    ])

    expect(columnsOf(snapshot).map((column) => column.status)).toEqual([...FIVE, 'optional', 'blocked'])
    expect(numbers(snapshot)).toMatchObject({ done: ['1.3'], optional: ['1.1', '1.4'], blocked: ['1.2'] })
  })

  it('adds no extra column when every status is one of the five', () => {
    expect(columnsOf(read([epic(1, 'in-progress', [story('1.1', 'review')])]))).toHaveLength(5)
  })

  it('draws no card for the stories of a done epic', () => {
    const snapshot = read([epic(1, 'done', [story('1.1', 'done'), story('1.2', 'optional')]), epic(2, 'in-progress', [story('2.1', 'backlog')])])

    expect(numbers(snapshot)).toEqual({ backlog: ['2.1'], 'ready-for-dev': [], 'in-progress': [], review: [], done: [] })
  })

  it('draws a done story of an open epic in done', () => {
    expect(numbers(read([epic(6, 'in-progress', [story('6.1', 'done')])])).done).toEqual(['6.1'])
  })

  it('draws five empty columns for no epics, or only done ones', () => {
    for (const snapshot of [read([]), read([epic(1, 'done', [story('1.1', 'done')])])]) {
      const columns = columnsOf(snapshot)
      expect(columns.map((column) => column.status)).toEqual(FIVE)
      expect(columns.every((column) => column.stories.length === 0)).toBe(true)
    }
  })

  it('draws no card for a row with no epic', () => {
    const snapshot = read([], [{ key: '7-1-orphan', status: 'review', known: true }, { key: 'epic-9-retrospective', status: 'optional', known: true }])

    expect(columnsOf(snapshot).map((column) => column.status)).toEqual(FIVE)
    expect(columnsOf(snapshot).every((column) => column.stories.length === 0)).toBe(true)
  })

  it('draws the five empty columns for a snapshot that is none', () => {
    const none: BoardSnapshot = { revision: 1, kind: 'none', code: 'board/absent', message: 'm' }

    expect(columnsOf(none).map((column) => column.status)).toEqual(FIVE)
  })
})
