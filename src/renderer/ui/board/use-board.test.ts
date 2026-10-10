// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { BoardSnapshot } from '../../../shared/board'
import { inAct, renderHook, settle } from '../testing/render-hook'
import type { MountedHook } from '../testing/render-hook'
import { useBoard } from './use-board'

/**
 * `useBoard` mounted against a stubbed `window.harness`. The pure pieces are
 * held by board-state.test.ts; this holds the one thing they cannot, which is
 * that the hook applies them: a regression that handed React the incoming
 * snapshot instead of letting `acceptBoard` choose passes every pure test.
 */

const snapshot = (revision: number, key = 'epic-1'): BoardSnapshot => ({
  revision,
  kind: 'read',
  epics: [{ key, number: 1, title: '', status: 'in-progress', known: true, stories: [] }],
  others: []
})

type Bridge = {
  getBoard: () => Promise<BoardSnapshot>
  onBoardChanged: (listener: (snapshot: BoardSnapshot) => void) => () => void
}

let listeners: Set<(snapshot: BoardSnapshot) => void>
let resolveGet: (snapshot: BoardSnapshot) => void
let rejectGet: (reason: unknown) => void
let hook: MountedHook<ReturnType<typeof useBoard>> | null

function install(bridge: Partial<Bridge> | undefined): void {
  Object.defineProperty(window, 'harness', { value: bridge, configurable: true, writable: true })
}

function push(next: BoardSnapshot): void {
  inAct(() => {
    for (const listener of [...listeners]) {
      listener(next)
    }
  })
}

beforeEach(() => {
  listeners = new Set()
  install({
    getBoard: () =>
      new Promise<BoardSnapshot>((resolve, reject) => {
        resolveGet = resolve
        rejectGet = reject
      }),
    onBoardChanged: (listener) => {
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

describe('useBoard', () => {
  it('shows nothing before the first snapshot: no body and no failure while the ask is pending', async () => {
    hook = renderHook(useBoard)
    await settle()

    expect(hook.current).toEqual({ snapshot: null, failure: null })
  })

  it('renders once per push, so a snapshot lands in one frame and not two', async () => {
    hook = renderHook(useBoard)
    await settle()
    const before = hook.renders

    push(snapshot(1))

    expect(hook.current.snapshot).toEqual(snapshot(1))
    expect(hook.renders).toBe(before + 1)
  })

  it('never lets an older revision replace a newer one, whichever way the race falls', async () => {
    hook = renderHook(useBoard)
    push(snapshot(5, 'new'))

    // The initial ask answers late with a snapshot older than the push.
    inAct(() => resolveGet(snapshot(3, 'old')))
    await settle()
    expect(hook.current.snapshot).toEqual(snapshot(5, 'new'))

    push(snapshot(4, 'older'))
    expect(hook.current.snapshot).toEqual(snapshot(5, 'new'))

    push(snapshot(6, 'newest'))
    expect(hook.current.snapshot).toEqual(snapshot(6, 'newest'))
  })

  it('names a rejected ask and lets a later valid snapshot clear it', async () => {
    hook = renderHook(useBoard)
    inAct(() => rejectGet({ code: 'board/unexpected', message: 'board · unexpected failure' }))
    await settle()

    expect(hook.current.failure).toEqual({ code: 'board/unexpected', message: 'board · unexpected failure' })
    expect(hook.current.snapshot).toBeNull()

    push(snapshot(1))

    expect(hook.current.failure).toBeNull()
    expect(hook.current.snapshot).toEqual(snapshot(1))
  })

  it('does not stringify a fault that is not an envelope', async () => {
    hook = renderHook(useBoard)
    inAct(() => rejectGet(new Error('/Users/someone/secret/path exploded')))
    await settle()

    expect(hook.current.failure).toEqual({ code: 'bridge/unexpected', message: 'bridge · unexpected failure' })
  })

  it('stops listening on unmount and ignores an answer that arrives afterwards', async () => {
    hook = renderHook(useBoard)
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
    ['a bridge without the Board methods', {}]
  ])('renders null without throwing when the preload left %s', async (_name, bridge) => {
    install(bridge)

    hook = renderHook(useBoard)
    await settle()

    expect(hook.current).toEqual({ snapshot: null, failure: null })
  })
})
