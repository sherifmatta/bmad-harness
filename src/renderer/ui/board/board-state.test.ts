import { describe, expect, it } from 'vitest'
import type { BoardSnapshot } from '../../../shared/board'
import { acceptBoard, connectBoard } from './board-state'

const snapshot = (revision: number): BoardSnapshot => ({ revision, kind: 'read', epics: [], others: [] })

describe('acceptBoard', () => {
  it('takes the first snapshot whatever its revision', () => {
    expect(acceptBoard(null, snapshot(0))).toEqual(snapshot(0))
  })

  it('takes a newer one and keeps the held one against an equal or older one', () => {
    const held = snapshot(5)

    expect(acceptBoard(held, snapshot(6)).revision).toBe(6)
    expect(acceptBoard(held, snapshot(5))).toBe(held)
    expect(acceptBoard(held, snapshot(4))).toBe(held)
  })
})

describe('connectBoard', () => {
  function fakeBridge() {
    const calls: string[] = []
    let push: (snapshot: BoardSnapshot) => void = () => {}
    let answer: { resolve: (s: BoardSnapshot) => void; reject: (e: unknown) => void } = {
      resolve: () => {},
      reject: () => {}
    }
    return {
      calls,
      push: (s: BoardSnapshot) => push(s),
      answer: () => answer,
      bridge: {
        onBoardChanged(listener: (s: BoardSnapshot) => void) {
          calls.push('subscribe')
          push = listener
          return () => void calls.push('unsubscribe')
        },
        getBoard() {
          calls.push('ask')
          return new Promise<BoardSnapshot>((resolve, reject) => (answer = { resolve, reject }))
        }
      }
    }
  }

  it('subscribes before it asks, so a push between the two is not lost', async () => {
    const fake = fakeBridge()
    const got: number[] = []
    connectBoard(fake.bridge, { onSnapshot: (s) => got.push(s.revision), onFailure: () => {} })

    expect(fake.calls).toEqual(['subscribe', 'ask'])
    fake.push(snapshot(2))
    fake.answer().resolve(snapshot(1))
    await Promise.resolve()
    await Promise.resolve()

    expect(got).toEqual([2, 1])
  })

  it('routes a rejection through the envelope reader, never stringifying a fault', async () => {
    const fake = fakeBridge()
    const failures: unknown[] = []
    connectBoard(fake.bridge, { onSnapshot: () => {}, onFailure: (e) => failures.push(e) })

    fake.answer().reject({ code: 'board/no-project', message: 'board · no project' })
    await Promise.resolve()
    await Promise.resolve()
    expect(failures).toEqual([{ code: 'board/no-project', message: 'board · no project' }])

    const other = fakeBridge()
    connectBoard(other.bridge, { onSnapshot: () => {}, onFailure: (e) => failures.push(e) })
    other.answer().reject(new Error('/secret exploded'))
    await Promise.resolve()
    await Promise.resolve()
    expect(failures[1]).toEqual({ code: 'bridge/unexpected', message: 'bridge · unexpected failure' })
  })

  it('unsubscribes on disconnect and drops anything still in flight', async () => {
    const fake = fakeBridge()
    const got: number[] = []
    const failures: unknown[] = []
    const disconnect = connectBoard(fake.bridge, {
      onSnapshot: (s) => got.push(s.revision),
      onFailure: (e) => failures.push(e)
    })

    disconnect()
    fake.push(snapshot(3))
    fake.answer().resolve(snapshot(4))
    await Promise.resolve()
    await Promise.resolve()

    expect(fake.calls).toContain('unsubscribe')
    expect(got).toEqual([])
    expect(failures).toEqual([])
  })
})
