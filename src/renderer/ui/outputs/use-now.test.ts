// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inAct, renderHook } from '../testing/render-hook'
import type { MountedHook } from '../testing/render-hook'
import { NOW_TICK_MS, useNow } from './use-now'

/**
 * The clock the age text reads. It is a timer in a hook, so the only way to
 * see it is to mount it under fake time.
 */

let hook: MountedHook<number> | null

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
})

afterEach(() => {
  hook?.unmount()
  hook = null
  vi.useRealTimers()
})

describe('useNow', () => {
  it('reads the clock once at mount and does not tick inside its interval', () => {
    hook = renderHook(() => useNow())
    const first = hook.current
    const renders = hook.renders

    inAct(() => void vi.advanceTimersByTime(NOW_TICK_MS - 1))

    expect(first).toBe(Date.parse('2026-01-01T00:00:00Z'))
    expect(hook.current).toBe(first)
    expect(hook.renders).toBe(renders)
  })

  it('ticks on its interval, so an age that crosses a minute is re-read', () => {
    hook = renderHook(() => useNow())

    inAct(() => void vi.advanceTimersByTime(NOW_TICK_MS))
    expect(hook.current).toBe(Date.parse('2026-01-01T00:00:00Z') + NOW_TICK_MS)

    inAct(() => void vi.advanceTimersByTime(NOW_TICK_MS))
    expect(hook.current).toBe(Date.parse('2026-01-01T00:00:00Z') + 2 * NOW_TICK_MS)
  })

  it('honours the interval it is given', () => {
    hook = renderHook(() => useNow(1000))

    inAct(() => void vi.advanceTimersByTime(1000))

    expect(hook.current).toBe(Date.parse('2026-01-01T00:00:00Z') + 1000)
  })

  it('clears its interval on unmount, so a closed window leaves no timer running', () => {
    hook = renderHook(() => useNow())
    expect(vi.getTimerCount()).toBe(1)

    hook.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
