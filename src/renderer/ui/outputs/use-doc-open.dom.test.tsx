// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import '../testing/render-hook'
import { renderHook } from '../testing/render-hook'
import { useDocOpen } from './use-doc-open'

/**
 * Story 7.1: two surfaces open documents (the rail's rows and the Board's cards) and the window's close is
 * one event for both. The one that opened the path takes the focus back; the other does not.
 */

const SPEC = '_bmad/implementation-artifacts/spec-5-2-a.md'
const openDoc = vi.fn((path: string) => {
  void path
  return Promise.resolve()
})
let listeners: ((path: string) => void)[]
const close = (path: string): void => listeners.forEach((listener) => listener(path))

beforeEach(() => {
  openDoc.mockClear()
  listeners = []
  ;(window as unknown as { harness: unknown }).harness = {
    openDoc,
    onDocClosed: (listener: (path: string) => void) => {
      listeners.push(listener)
      return () => void (listeners = listeners.filter((held) => held !== listener))
    }
  }
})

afterEach(() => {
  delete (window as unknown as { harness?: unknown }).harness
})

describe('useDocOpen', () => {
  it('lets only the surface that opened a path hear it close, so a Board open pulls no focus to a rail row of the same path', async () => {
    const rail = vi.fn()
    const board = vi.fn()
    const first = renderHook(() => useDocOpen(rail))
    const second = renderHook(() => useDocOpen(board))

    second.current(SPEC)
    expect(openDoc).toHaveBeenCalledExactlyOnceWith(SPEC)
    close(SPEC)

    expect(board).toHaveBeenCalledExactlyOnceWith(SPEC)
    expect(rail).not.toHaveBeenCalled()

    // The close answered, the path is nobody's again once the turn is over; the other surface may open it next.
    await Promise.resolve()
    first.current(SPEC)
    close(SPEC)
    expect(rail).toHaveBeenCalledExactlyOnceWith(SPEC)
    expect(board).toHaveBeenCalledTimes(1)
    first.unmount()
    second.unmount()
  })

  it('tells every surface of a close whose opener it does not know, as before', () => {
    const rail = vi.fn()
    const board = vi.fn()
    const first = renderHook(() => useDocOpen(rail))
    const second = renderHook(() => useDocOpen(board))

    close(SPEC)

    expect(rail).toHaveBeenCalledTimes(1)
    expect(board).toHaveBeenCalledTimes(1)
    first.unmount()
    second.unmount()
  })

  it('forgets what a surface opened when it goes away, so the close is heard by whoever is left', () => {
    const rail = vi.fn()
    const first = renderHook(() => useDocOpen(rail))
    const second = renderHook(() => useDocOpen(() => {}))

    second.current(SPEC)
    second.unmount()
    close(SPEC)

    expect(rail).toHaveBeenCalledExactlyOnceWith(SPEC)
    first.unmount()
  })
})
