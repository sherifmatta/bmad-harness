import { describe, expect, it } from 'vitest'
import type { InstallSnapshot } from '../../../shared/install'
import { acceptSnapshot, asHarnessError, connectInstall } from './install-state'

const snapshot = (revision: number): InstallSnapshot => ({
  revision,
  agents: [],
  menus: {},
  errors: []
})

describe('acceptSnapshot', () => {
  it('takes the first snapshot whatever its revision', () => {
    expect(acceptSnapshot(null, snapshot(0))).toEqual(snapshot(0))
  })

  it('takes a newer one', () => {
    expect(acceptSnapshot(snapshot(4), snapshot(5)).revision).toBe(5)
  })

  it('keeps the one it holds against an equal or older one', () => {
    const held = snapshot(5)

    expect(acceptSnapshot(held, snapshot(5))).toBe(held)
    expect(acceptSnapshot(held, snapshot(4))).toBe(held)
  })
})

describe('asHarnessError', () => {
  it('passes an envelope through', () => {
    const envelope = { code: 'install/no-project', message: 'install · no project', detail: 'x' }

    expect(asHarnessError(envelope)).toEqual(envelope)
    expect(asHarnessError({ code: 'a/b', message: 'm' })).toEqual({ code: 'a/b', message: 'm' })
  })

  it.each([
    ['an Error', new Error('/secret/file exploded')],
    ['a string', 'boom'],
    ['null', null],
    ['an object with no message', { code: 'a/b' }]
  ])('names %s as a bridge fault and never stringifies it', (_name, reason) => {
    const error = asHarnessError(reason)

    expect(error).toEqual({ code: 'bridge/unexpected', message: 'bridge · unexpected failure' })
    expect(JSON.stringify(error)).not.toContain('secret')
  })
})

describe('connectInstall', () => {
  /** A bridge whose ask is answered by hand, recording the order of calls. */
  function fakeBridge() {
    const calls: string[] = []
    let push: (snapshot: InstallSnapshot) => void = () => {}
    let answer: { resolve: (s: InstallSnapshot) => void; reject: (e: unknown) => void } = {
      resolve: () => {},
      reject: () => {}
    }
    const bridge = {
      onInstallChanged(listener: (snapshot: InstallSnapshot) => void) {
        calls.push('subscribe')
        push = listener
        return () => void calls.push('unsubscribe')
      },
      getInstall() {
        calls.push('ask')
        return new Promise<InstallSnapshot>((resolve, reject) => {
          answer = { resolve, reject }
        })
      }
    }
    return { bridge, calls, push: (s: InstallSnapshot) => push(s), answer: () => answer }
  }

  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('subscribes before it asks', () => {
    const { bridge, calls } = fakeBridge()

    connectInstall(bridge, { onSnapshot: () => {}, onFailure: () => {} })

    expect(calls).toEqual(['subscribe', 'ask'])
  })

  it('leaves the newer snapshot held when an older ask result lands after a newer push', async () => {
    const { bridge, push, answer } = fakeBridge()
    let held: InstallSnapshot | null = null
    connectInstall(bridge, {
      onSnapshot: (incoming) => {
        held = acceptSnapshot(held, incoming)
      },
      onFailure: () => {}
    })

    push(snapshot(5))
    answer().resolve(snapshot(4))
    await settle()

    expect((held as InstallSnapshot | null)?.revision).toBe(5)
  })

  it('reaches onFailure as an envelope, and as a bridge fault for anything else', async () => {
    const first = fakeBridge()
    const failures: unknown[] = []
    connectInstall(first.bridge, { onSnapshot: () => {}, onFailure: (e) => failures.push(e) })
    const envelope = { code: 'install/no-project', message: 'install · no project' }
    first.answer().reject(envelope)
    await settle()

    const second = fakeBridge()
    connectInstall(second.bridge, { onSnapshot: () => {}, onFailure: (e) => failures.push(e) })
    second.answer().reject(new Error('/secret/file exploded'))
    await settle()

    expect(failures).toEqual([
      envelope,
      { code: 'bridge/unexpected', message: 'bridge · unexpected failure' }
    ])
  })

  it('unsubscribes on disconnect and drops everything that arrives after', async () => {
    const { bridge, calls, push, answer } = fakeBridge()
    const seen: string[] = []
    const disconnect = connectInstall(bridge, {
      onSnapshot: () => seen.push('snapshot'),
      onFailure: () => seen.push('failure')
    })

    disconnect()
    push(snapshot(1))
    answer().resolve(snapshot(2))
    await settle()
    answer().reject(new Error('late'))
    await settle()

    expect(calls).toEqual(['subscribe', 'ask', 'unsubscribe'])
    expect(seen).toEqual([])
  })
})
