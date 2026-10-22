import { describe, expect, it } from 'vitest'
import type { ChangesSnapshot } from '../../../shared/changes'
import { acceptChanges, connectChanges } from './changes-state'

const snapshot = (revision: number): ChangesSnapshot => ({ kind: 'list', rows: [], revision, root: 'p' })

describe('acceptChanges', () => {
  it('takes the first snapshot, a newer one, and keeps the held one against an equal or older one', () => {
    const held = snapshot(5)
    expect(acceptChanges(null, snapshot(1))).toEqual(snapshot(1))
    expect(acceptChanges(held, snapshot(6)).revision).toBe(6)
    expect(acceptChanges(held, snapshot(5))).toBe(held)
    expect(acceptChanges(held, snapshot(4))).toBe(held)
  })
})

describe('connectChanges', () => {
  function fakeBridge() {
    const calls: string[] = []
    let push: (s: ChangesSnapshot) => void = () => {}
    let answer: { resolve: (s: ChangesSnapshot) => void; reject: (e: unknown) => void } = {
      resolve: () => {},
      reject: () => {}
    }
    return {
      calls,
      push: (s: ChangesSnapshot) => push(s),
      answer: () => answer,
      bridge: {
        onChangesChanged(listener: (s: ChangesSnapshot) => void) {
          calls.push('subscribe')
          push = listener
          return () => void calls.push('unsubscribe')
        },
        getChanges() {
          calls.push('ask')
          return new Promise<ChangesSnapshot>((resolve, reject) => (answer = { resolve, reject }))
        }
      }
    }
  }

  it('subscribes before it asks, and hands on both the push and the answer', async () => {
    const fake = fakeBridge()
    const got: number[] = []
    connectChanges(fake.bridge, { onSnapshot: (s) => got.push(s.revision), onFailure: () => {} })
    expect(fake.calls).toEqual(['subscribe', 'ask'])
    fake.push(snapshot(2))
    fake.answer().resolve(snapshot(1))
    await Promise.resolve()
    expect(got).toEqual([2, 1])
  })

  it('routes a rejection through the envelope, and hears nothing after the disconnect', async () => {
    const fake = fakeBridge()
    const failures: unknown[] = []
    const got: number[] = []
    const stop = connectChanges(fake.bridge, { onSnapshot: (s) => got.push(s.revision), onFailure: (e) => failures.push(e) })
    fake.answer().reject({ code: 'changes/no-project', message: 'changes · no project is open for this window' })
    await Promise.resolve()
    await Promise.resolve()
    expect(failures).toEqual([{ code: 'changes/no-project', message: 'changes · no project is open for this window' }])
    stop()
    fake.push(snapshot(3))
    expect(got).toEqual([])
    expect(fake.calls).toEqual(['subscribe', 'ask', 'unsubscribe'])
  })
})
