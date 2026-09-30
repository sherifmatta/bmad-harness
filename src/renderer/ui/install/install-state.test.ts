import { describe, expect, it } from 'vitest'
import type { InstallSnapshot } from '../../../shared/install'
import {
  acceptSnapshot,
  announceable,
  asHarnessError,
  connectInstall,
  newAnnouncements,
  roomState
} from './install-state'

const snapshot = (revision: number): InstallSnapshot => ({
  revision,
  agents: [],
  menus: {},
  errors: [],
  preflight: []
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

describe('roomState', () => {
  const agent = {
    id: 'bmad-agent-analyst',
    module: 'bmm',
    name: 'Mary',
    title: 'Analyst',
    icon: 'i',
    description: 'd'
  }
  const line = { code: 'preflight/uv-missing', message: 'uv · not found · install uv' }
  const failure = { code: 'install/unexpected', message: 'install · unexpected failure' }
  const healthy: InstallSnapshot = { ...snapshot(1), agents: [agent], menus: { [agent.id]: [] } }

  it('is pending with nothing at all', () => {
    expect(roomState(null, null)).toBe('pending')
  })

  it('is blocked by a failure with no snapshot', () => {
    expect(roomState(null, failure)).toBe('blocked')
  })

  it('is blocked by any preflight line, even with agents', () => {
    expect(roomState({ ...healthy, preflight: [line] }, null)).toBe('blocked')
  })

  it('is blocked by an empty roster', () => {
    expect(roomState(snapshot(1), null)).toBe('blocked')
  })

  it('is blocked by a resolver error with an empty roster', () => {
    expect(roomState({ ...snapshot(1), errors: [failure] }, null)).toBe('blocked')
  })

  it('is open when healthy', () => {
    expect(roomState(healthy, null)).toBe('open')
  })

  it('is open when healthy beside a stale failure', () => {
    expect(roomState(healthy, failure)).toBe('open')
  })
})

describe('newAnnouncements', () => {
  const line = (code: string, message: string, detail?: string) =>
    detail === undefined ? { code, message } : { code, message, detail }

  it('announces every line on the first call, in order', () => {
    const lines = [line('a', 'first'), line('b', 'second'), line('c', 'third')]

    expect(newAnnouncements(new Set(), lines).messages).toEqual(['first', 'second', 'third'])
  })

  it('announces nothing for an identical second call', () => {
    const lines = [line('a', 'first'), line('b', 'second')]
    const { keys } = newAnnouncements(new Set(), lines)

    expect(newAnnouncements(keys, lines).messages).toEqual([])
  })

  it('announces only what is new beside what was already said', () => {
    const { keys } = newAnnouncements(new Set(), [line('a', 'first')])

    expect(newAnnouncements(keys, [line('a', 'first'), line('b', 'second')]).messages).toEqual([
      'second'
    ])
  })

  it('announces a line again when it clears and returns', () => {
    const a = line('a', 'first')
    const said = newAnnouncements(new Set(), [a])
    const cleared = newAnnouncements(said.keys, [])
    const returned = newAnnouncements(cleared.keys, [a])

    expect(cleared.messages).toEqual([])
    expect(cleared.keys.size).toBe(0)
    expect(returned.messages).toEqual(['first'])
  })

  it('never speaks detail, and treats a changed detail as a changed line', () => {
    const first = newAnnouncements(new Set(), [line('a', 'roster', 'exceeded 15000ms')])
    const second = newAnnouncements(first.keys, [line('a', 'roster', 'exceeded 30000ms')])

    expect(first.messages).toEqual(['roster'])
    expect(second.messages).toEqual(['roster'])
    expect(JSON.stringify([first.messages, second.messages])).not.toContain('exceeded')
  })

  it('announces a line repeated within one call once', () => {
    const a = line('a', 'first')

    expect(newAnnouncements(new Set(), [a, a, line('b', 'second'), a]).messages).toEqual([
      'first',
      'second'
    ])
  })

  it('announces nothing for no lines', () => {
    expect(newAnnouncements(new Set(), [])).toEqual({ messages: [], keys: new Set() })
  })
})

describe('announceable', () => {
  const at = (code: string) => ({ code, message: code })
  const snap = (over: Partial<InstallSnapshot>): InstallSnapshot => ({ ...snapshot(1), ...over })

  it('lists preflight, then errors, then the failure', () => {
    const lines = announceable(
      snap({ preflight: [at('p1'), at('p2')], errors: [at('e1')] }),
      at('f')
    )

    expect(lines.map(({ code }) => code)).toEqual(['p1', 'p2', 'e1', 'f'])
  })

  it('lets each source contribute alone', () => {
    expect(announceable(snap({ preflight: [at('p')] }), null)).toEqual([at('p')])
    expect(announceable(snap({ errors: [at('e')] }), null)).toEqual([at('e')])
    expect(announceable(null, at('f'))).toEqual([at('f')])
  })

  it('handles a null snapshot and a null failure', () => {
    expect(announceable(null, null)).toEqual([])
    expect(announceable(snap({}), null)).toEqual([])
  })
})
