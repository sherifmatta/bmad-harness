import { describe, expect, it } from 'vitest'
import type { RailSnapshot } from '../../../shared/rail'
import { acceptRail, connectRail } from './rail-state'

const snapshot = (revision: number): RailSnapshot => ({ revision, folder: '_bmad/', rows: [] })

describe('acceptRail', () => {
  it('takes the first snapshot whatever its revision', () => {
    expect(acceptRail(null, snapshot(0))).toEqual(snapshot(0))
  })

  it('takes a newer one and keeps the held one against an equal or older one', () => {
    const held = snapshot(5)

    expect(acceptRail(held, snapshot(6)).revision).toBe(6)
    expect(acceptRail(held, snapshot(5))).toBe(held)
    expect(acceptRail(held, snapshot(4))).toBe(held)
  })
})

describe('connectRail', () => {
  function fakeBridge() {
    const calls: string[] = []
    let push: (snapshot: RailSnapshot) => void = () => {}
    let answer: { resolve: (s: RailSnapshot) => void; reject: (e: unknown) => void } = {
      resolve: () => {},
      reject: () => {}
    }
    return {
      calls,
      push: (s: RailSnapshot) => push(s),
      answer: () => answer,
      bridge: {
        onRailChanged(listener: (s: RailSnapshot) => void) {
          calls.push('subscribe')
          push = listener
          return () => void calls.push('unsubscribe')
        },
        getRail() {
          calls.push('ask')
          return new Promise<RailSnapshot>((resolve, reject) => (answer = { resolve, reject }))
        }
      }
    }
  }

  it('subscribes before it asks, so a push between the two is not lost', async () => {
    const fake = fakeBridge()
    const got: number[] = []
    connectRail(fake.bridge, { onSnapshot: (s) => got.push(s.revision), onFailure: () => {} })

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
    connectRail(fake.bridge, { onSnapshot: () => {}, onFailure: (e) => failures.push(e) })

    fake.answer().reject({ code: 'rail/no-project', message: 'rail · no project' })
    await Promise.resolve()
    await Promise.resolve()
    expect(failures).toEqual([{ code: 'rail/no-project', message: 'rail · no project' }])

    const other = fakeBridge()
    connectRail(other.bridge, { onSnapshot: () => {}, onFailure: (e) => failures.push(e) })
    other.answer().reject(new Error('/secret exploded'))
    await Promise.resolve()
    await Promise.resolve()
    expect(failures[1]).toEqual({ code: 'bridge/unexpected', message: 'bridge · unexpected failure' })
  })

  it('unsubscribes on disconnect and drops anything still in flight', async () => {
    const fake = fakeBridge()
    const got: number[] = []
    const failures: unknown[] = []
    const disconnect = connectRail(fake.bridge, {
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
