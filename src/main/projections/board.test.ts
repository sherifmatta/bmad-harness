import { describe, expect, it } from 'vitest'
import type { BoardBody, BoardSnapshot } from '../../shared/board'
import { createBoardProjection } from './board'

const none = (code: string): BoardBody => ({ kind: 'none', code, message: `board · ${code}` })
const read = (status: string): BoardBody => ({
  kind: 'read',
  epics: [{ key: 'epic-1', number: 1, title: '', status, known: true, stories: [] }],
  others: []
})

function projection() {
  const pushed: BoardSnapshot[] = []
  return { board: createBoardProjection({ onChange: (snapshot) => pushed.push(snapshot) }), pushed }
}

describe('createBoardProjection', () => {
  it('has no snapshot before a body', () => {
    expect(projection().board.snapshot()).toBeUndefined()
  })

  it('takes the first body as the baseline: revision one, nothing pushed', () => {
    const { board, pushed } = projection()
    expect(board.apply(none('absent'))).toBe(false)
    expect(board.snapshot()).toMatchObject({ revision: 1, kind: 'none' })
    expect(pushed).toEqual([])
  })

  it('pushes each differing body once, with the next revision', () => {
    const { board, pushed } = projection()
    board.apply(none('absent'))
    expect(board.apply(read('backlog'))).toBe(true)
    expect(board.apply(read('done'))).toBe(true)
    expect(pushed.map((snapshot) => snapshot.revision)).toEqual([2, 3])
    expect(board.snapshot()).toBe(pushed[1])
  })

  it('pushes nothing for a body the last one already was', () => {
    const { board, pushed } = projection()
    board.apply(read('backlog'))
    expect(board.apply(read('backlog'))).toBe(false)
    expect(pushed).toEqual([])
    expect(board.snapshot()?.revision).toBe(1)
  })
})
