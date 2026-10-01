// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RailSnapshot } from '../../../shared/rail'
import { inAct, renderHook, settle } from '../testing/render-hook'
import type { MountedHook } from '../testing/render-hook'
import { useRail } from './use-rail'

/**
 * `useRail` mounted against a stubbed `window.harness`. The pure pieces are
 * held by rail-state.test.ts; this holds the one thing they cannot, which is
 * that the hook applies them: a regression that handed React the incoming
 * snapshot instead of letting `acceptRail` choose passes every pure test.
 */

const snapshot = (revision: number, path = 'a.md'): RailSnapshot => ({
  revision,
  rows: [{ path, state: 'saved', savedAt: revision }]
})

type Bridge = {
  getRail: () => Promise<RailSnapshot>
  onRailChanged: (listener: (snapshot: RailSnapshot) => void) => () => void
}

let listeners: Set<(snapshot: RailSnapshot) => void>
let resolveGet: (snapshot: RailSnapshot) => void
let rejectGet: (reason: unknown) => void
let hook: MountedHook<ReturnType<typeof useRail>> | null

function install(bridge: Partial<Bridge> | undefined): void {
  Object.defineProperty(window, 'harness', { value: bridge, configurable: true, writable: true })
}

function push(next: RailSnapshot): void {
  inAct(() => {
    for (const listener of [...listeners]) {
      listener(next)
    }
  })
}

beforeEach(() => {
  listeners = new Set()
  install({
    getRail: () =>
      new Promise<RailSnapshot>((resolve, reject) => {
        resolveGet = resolve
        rejectGet = reject
      }),
    onRailChanged: (listener) => {
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

describe('useRail', () => {
  it('shows nothing before the first snapshot: no rows and no failure while the ask is pending', async () => {
    hook = renderHook(useRail)
    await settle()

    expect(hook.current).toEqual({ snapshot: null, failure: null })
  })

  it('renders once per push, so a snapshot lands in one frame and not two', async () => {
    hook = renderHook(useRail)
    await settle()
    const before = hook.renders

    push(snapshot(1))

    expect(hook.current.snapshot).toEqual(snapshot(1))
    expect(hook.renders).toBe(before + 1)
  })

  it('never lets an older revision replace a newer one, whichever way the race falls', async () => {
    hook = renderHook(useRail)
    push(snapshot(5, 'new.md'))

    // The initial ask answers late with a snapshot older than the push.
    inAct(() => resolveGet(snapshot(3, 'old.md')))
    await settle()
    expect(hook.current.snapshot).toEqual(snapshot(5, 'new.md'))

    push(snapshot(4, 'older.md'))
    expect(hook.current.snapshot).toEqual(snapshot(5, 'new.md'))

    push(snapshot(6, 'newest.md'))
    expect(hook.current.snapshot).toEqual(snapshot(6, 'newest.md'))
  })

  it('names a rejected ask and lets a later valid snapshot clear it', async () => {
    hook = renderHook(useRail)
    inAct(() => rejectGet({ code: 'rail/unexpected', message: 'rail · unexpected failure' }))
    await settle()

    expect(hook.current.failure).toEqual({ code: 'rail/unexpected', message: 'rail · unexpected failure' })
    expect(hook.current.snapshot).toBeNull()

    push(snapshot(1))

    expect(hook.current.failure).toBeNull()
    expect(hook.current.snapshot).toEqual(snapshot(1))
  })

  it('does not stringify a fault that is not an envelope', async () => {
    hook = renderHook(useRail)
    inAct(() => rejectGet(new Error('/Users/someone/secret/path exploded')))
    await settle()

    expect(hook.current.failure).toEqual({ code: 'bridge/unexpected', message: 'bridge · unexpected failure' })
  })

  it('stops listening on unmount and ignores an answer that arrives afterwards', async () => {
    hook = renderHook(useRail)
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
    ['a bridge without the rail methods', {}]
  ])('renders null without throwing when the preload left %s', async (_name, bridge) => {
    install(bridge)

    hook = renderHook(useRail)
    await settle()

    expect(hook.current).toEqual({ snapshot: null, failure: null })
  })
})
