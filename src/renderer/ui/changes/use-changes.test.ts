// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChangesSnapshot } from '../../../shared/changes'
import { inAct, renderHook, settle } from '../testing/render-hook'
import type { MountedHook } from '../testing/render-hook'
import { useChanges } from './use-changes'

/**
 * `useChanges` mounted against a stubbed `window.harness` (Story 9.3), as use-rail.test.ts holds
 * `useRail`: the pure pieces are changes-state.test.ts's, and this holds that the hook applies them.
 */

const snapshot = (revision: number, path = 'a.ts'): ChangesSnapshot => ({
  kind: 'list',
  rows: [{ path, state: 'modified' }],
  revision,
  root: 'p'
})

type Bridge = {
  getChanges: () => Promise<ChangesSnapshot>
  onChangesChanged: (listener: (snapshot: ChangesSnapshot) => void) => () => void
}

let listeners: Set<(snapshot: ChangesSnapshot) => void>
let resolveGet: (snapshot: ChangesSnapshot) => void
let rejectGet: (reason: unknown) => void
let hook: MountedHook<ReturnType<typeof useChanges>> | null

function install(bridge: Partial<Bridge> | undefined): void {
  Object.defineProperty(window, 'harness', { value: bridge, configurable: true, writable: true })
}

function push(next: ChangesSnapshot): void {
  inAct(() => {
    for (const listener of [...listeners]) {
      listener(next)
    }
  })
}

beforeEach(() => {
  listeners = new Set()
  hook = null
  install({
    getChanges: () =>
      new Promise<ChangesSnapshot>((resolve, reject) => {
        resolveGet = resolve
        rejectGet = reject
      }),
    onChangesChanged: (listener) => {
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

describe('useChanges', () => {
  it('shows nothing before the first snapshot', async () => {
    hook = renderHook(useChanges)
    await settle()

    expect(hook.current).toEqual({ snapshot: null, failure: null })
  })

  it('never lets a late answer with an older revision replace a newer push', async () => {
    hook = renderHook(useChanges)
    push(snapshot(5, 'new.ts'))

    inAct(() => resolveGet(snapshot(3, 'old.ts')))
    await settle()
    expect(hook.current.snapshot).toEqual(snapshot(5, 'new.ts'))

    push(snapshot(4, 'older.ts'))
    expect(hook.current.snapshot).toEqual(snapshot(5, 'new.ts'))

    push(snapshot(6, 'newest.ts'))
    expect(hook.current.snapshot).toEqual(snapshot(6, 'newest.ts'))
  })

  it('names a rejected ask, and lets a later push clear it', async () => {
    hook = renderHook(useChanges)
    inAct(() => rejectGet({ code: 'changes/no-project', message: 'changes · no project is open for this window' }))
    await settle()

    expect(hook.current.failure).toEqual({ code: 'changes/no-project', message: 'changes · no project is open for this window' })
    expect(hook.current.snapshot).toBeNull()

    push(snapshot(2))

    expect(hook.current.failure).toBeNull()
    expect(hook.current.snapshot).toEqual(snapshot(2))
  })

  it('stops listening on unmount and ignores an answer that arrives afterwards', async () => {
    hook = renderHook(useChanges)
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
    ['a bridge without the Changes methods', {}]
  ])('shows nothing, without throwing, when the preload left %s', async (_name, bridge) => {
    install(bridge)

    hook = renderHook(useChanges)
    await settle()

    expect(hook.current).toEqual({ snapshot: null, failure: null })
  })
})
