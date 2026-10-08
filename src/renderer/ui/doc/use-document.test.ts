// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { DocSnapshot } from '../../../shared/document'
import { inAct, renderHook, settle } from '../testing/render-hook'
import type { MountedHook } from '../testing/render-hook'
import { useDocument } from './use-document'

/**
 * `useDocument` mounted against a stubbed `window.docWindow`. document-state.test.ts
 * holds `acceptDocument` and `connectDocument` as pure functions; this holds the
 * hook that has to use them.
 */

const snapshot = (revision: number, text = `text ${revision}`): DocSnapshot => ({
  revision,
  path: '_bmad/a.md',
  fullPath: '/project/_bmad/a.md',
  kind: 'markdown',
  folder: '_bmad/',
  state: 'present',
  text,
  truncated: false
})

type Bridge = {
  getDocument: () => Promise<DocSnapshot>
  onDocumentChanged: (listener: (snapshot: DocSnapshot) => void) => () => void
}

let listeners: Set<(snapshot: DocSnapshot) => void>
let resolveGet: (snapshot: DocSnapshot) => void
let rejectGet: (reason: unknown) => void
let hook: MountedHook<ReturnType<typeof useDocument>> | null

function install(bridge: Partial<Bridge> | undefined): void {
  Object.defineProperty(window, 'docWindow', { value: bridge, configurable: true, writable: true })
}

function push(next: DocSnapshot): void {
  inAct(() => {
    for (const listener of [...listeners]) {
      listener(next)
    }
  })
}

beforeEach(() => {
  listeners = new Set()
  install({
    getDocument: () =>
      new Promise<DocSnapshot>((resolve, reject) => {
        resolveGet = resolve
        rejectGet = reject
      }),
    onDocumentChanged: (listener) => {
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

describe('useDocument', () => {
  it('shows nothing before the first snapshot: no text and no failure while the ask is pending', async () => {
    hook = renderHook(useDocument)
    await settle()

    expect(hook.current).toEqual({ snapshot: null, failure: null, available: true })
  })

  it('renders once per push, so a document lands in one frame and not two', async () => {
    hook = renderHook(useDocument)
    await settle()
    const before = hook.renders

    push(snapshot(1))

    expect(hook.current.snapshot).toEqual(snapshot(1))
    expect(hook.renders).toBe(before + 1)
  })

  it('never lets an older revision replace a newer one, so a stale read cannot roll the text back', async () => {
    hook = renderHook(useDocument)
    push(snapshot(5, 'new'))

    inAct(() => resolveGet(snapshot(3, 'old')))
    await settle()
    expect(hook.current.snapshot?.text).toBe('new')

    push(snapshot(4, 'older'))
    expect(hook.current.snapshot?.text).toBe('new')

    push(snapshot(6, 'newest'))
    expect(hook.current.snapshot?.text).toBe('newest')
  })

  it('renders the message of a rejected ask and lets a later valid snapshot clear it', async () => {
    hook = renderHook(useDocument)
    inAct(() => rejectGet({ code: 'doc/unexpected', message: 'doc · unexpected failure' }))
    await settle()

    expect(hook.current.failure).toBe('doc · unexpected failure')
    expect(hook.current.snapshot).toBeNull()

    push(snapshot(1))

    expect(hook.current.failure).toBeNull()
    expect(hook.current.snapshot).toEqual(snapshot(1))
  })

  it('does not stringify a fault that is not an envelope', async () => {
    hook = renderHook(useDocument)
    inAct(() => rejectGet(new Error('/Users/someone/secret/path exploded')))
    await settle()

    expect(hook.current.failure).toBe('bridge · unexpected failure')
  })

  it('stops listening on unmount and ignores an answer that arrives afterwards', async () => {
    hook = renderHook(useDocument)
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
    ['a bridge without the document methods', {}]
  ])('reports available:false without throwing when the preload left %s', async (_name, bridge) => {
    install(bridge)

    hook = renderHook(useDocument)
    await settle()

    expect(hook.current).toEqual({ snapshot: null, failure: null, available: false })
  })
})
