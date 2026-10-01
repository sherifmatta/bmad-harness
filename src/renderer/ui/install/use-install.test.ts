// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { InstallSnapshot } from '../../../shared/install'
import { inAct, renderHook, settle } from '../testing/render-hook'
import type { MountedHook } from '../testing/render-hook'
import { useInstall } from './use-install'

/**
 * `useInstall` mounted against a stubbed `window.harness`. install-state.test.ts
 * holds `acceptSnapshot` and `connectInstall` as pure functions; this holds the
 * hook that has to use them, since a regression that handed React the incoming
 * snapshot would pass every one of those.
 */

const snapshot = (revision: number, errors: InstallSnapshot['errors'] = []): InstallSnapshot => ({
  revision,
  agents: [],
  menus: {},
  errors,
  preflight: []
})

type Bridge = {
  getInstall: () => Promise<InstallSnapshot>
  onInstallChanged: (listener: (snapshot: InstallSnapshot) => void) => () => void
}

let listeners: Set<(snapshot: InstallSnapshot) => void>
let resolveGet: (snapshot: InstallSnapshot) => void
let rejectGet: (reason: unknown) => void
let hook: MountedHook<ReturnType<typeof useInstall>> | null

function install(bridge: Partial<Bridge> | undefined): void {
  Object.defineProperty(window, 'harness', { value: bridge, configurable: true, writable: true })
}

function push(next: InstallSnapshot): void {
  inAct(() => {
    for (const listener of [...listeners]) {
      listener(next)
    }
  })
}

beforeEach(() => {
  listeners = new Set()
  install({
    getInstall: () =>
      new Promise<InstallSnapshot>((resolve, reject) => {
        resolveGet = resolve
        rejectGet = reject
      }),
    onInstallChanged: (listener) => {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    }
  })
})

afterEach(() => {
  hook?.unmount()
  hook = null
  install(undefined)
})

describe('useInstall', () => {
  it('shows nothing before the first snapshot: no room and no failure while the ask is pending', async () => {
    hook = renderHook(useInstall)
    await settle()

    expect(hook.current).toEqual({ snapshot: null, failure: null })
  })

  it('renders once per push, so a snapshot lands in one frame and not two', async () => {
    hook = renderHook(useInstall)
    await settle()
    const before = hook.renders

    push(snapshot(1))

    expect(hook.current.snapshot).toEqual(snapshot(1))
    expect(hook.renders).toBe(before + 1)
  })

  it('never lets an older revision replace a newer one, whichever way the race falls', async () => {
    const newer = snapshot(5, [{ code: 'x/new', message: 'new' }])
    hook = renderHook(useInstall)
    push(newer)

    inAct(() => resolveGet(snapshot(3, [{ code: 'x/old', message: 'old' }])))
    await settle()
    expect(hook.current.snapshot).toEqual(newer)

    push(snapshot(4))
    expect(hook.current.snapshot).toEqual(newer)

    push(snapshot(6))
    expect(hook.current.snapshot).toEqual(snapshot(6))
  })

  it('names a rejected ask and lets a later valid snapshot clear it, so a blocked window can recover', async () => {
    hook = renderHook(useInstall)
    inAct(() => rejectGet({ code: 'install/unexpected', message: 'install · unexpected failure' }))
    await settle()

    expect(hook.current.failure).toEqual({ code: 'install/unexpected', message: 'install · unexpected failure' })
    expect(hook.current.snapshot).toBeNull()

    push(snapshot(1))

    expect(hook.current.failure).toBeNull()
    expect(hook.current.snapshot).toEqual(snapshot(1))
  })

  it('does not stringify a fault that is not an envelope', async () => {
    hook = renderHook(useInstall)
    inAct(() => rejectGet(new Error('/Users/someone/secret/path exploded')))
    await settle()

    expect(hook.current.failure).toEqual({ code: 'bridge/unexpected', message: 'bridge · unexpected failure' })
  })

  it('stops listening on unmount and ignores an answer that arrives afterwards', async () => {
    hook = renderHook(useInstall)
    await settle()
    expect(listeners.size).toBe(1)
    const before = hook.renders

    hook.unmount()
    expect(listeners.size).toBe(0)

    resolveGet(snapshot(9))
    await settle()
    expect(hook.renders).toBe(before)
  })

  it.each([
    ['no bridge at all', undefined],
    ['a bridge without the install methods', {}]
  ])('renders null without throwing when the preload left %s', async (_name, bridge) => {
    install(bridge)

    hook = renderHook(useInstall)
    await settle()

    expect(hook.current).toEqual({ snapshot: null, failure: null })
  })
})
