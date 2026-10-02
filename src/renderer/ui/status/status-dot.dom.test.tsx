// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { inAct, mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { StateLine } from './status-dot'

/**
 * The elapsed counter is a timer in a component, so the only way to see it is
 * to mount it under fake time: that no interval runs unless a persona is
 * working, that it advances at one second, and that nothing about it depends
 * on motion.
 */

const START = Date.parse('2026-01-01T00:00:00Z')

let mounted: Mounted | null

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  mounted = null
})

afterEach(() => {
  mounted?.unmount()
  vi.useRealTimers()
})

const text = (): string => mounted?.container.textContent ?? ''

describe('the elapsed counter', () => {
  it('reads the word, a separator and the time since the state began', () => {
    mounted = mount(createElement(StateLine, { state: 'work', since: START - 65_000 }))

    expect(text()).toBe('working · 1m 05s')
  })

  it('advances once a second', () => {
    mounted = mount(createElement(StateLine, { state: 'work', since: START }))
    expect(text()).toBe('working · 0s')

    inAct(() => void vi.advanceTimersByTime(999))
    expect(text()).toBe('working · 0s')

    inAct(() => void vi.advanceTimersByTime(1))
    expect(text()).toBe('working · 1s')

    inAct(() => void vi.advanceTimersByTime(59_000))
    expect(text()).toBe('working · 1m 00s')

    inAct(() => void vi.advanceTimersByTime(3_540_000))
    expect(text()).toBe('working · 1h 00m')
  })

  it.each(['idle', 'live', 'note', 'error'] as const)(
    'runs no interval for %s, and writes no counter',
    (state) => {
      mounted = mount(createElement(StateLine, { state, since: START }))

      expect(vi.getTimerCount()).toBe(0)
      expect(mounted.container.querySelector('.state-elapsed')).toBeNull()
    }
  )

  it('runs no interval for work whose start is not known', () => {
    mounted = mount(createElement(StateLine, { state: 'work' }))

    expect(vi.getTimerCount()).toBe(0)
    expect(text()).toBe('working')
  })

  it('has one interval while work and none once unmounted', () => {
    mounted = mount(createElement(StateLine, { state: 'work', since: START }))
    expect(vi.getTimerCount()).toBe(1)

    mounted.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops when the same line turns from work to idle', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    act(() => root.render(createElement(StateLine, { state: 'work', since: START })))
    expect(vi.getTimerCount()).toBe(1)

    act(() => root.render(createElement(StateLine, { state: 'idle', since: START })))
    expect(vi.getTimerCount()).toBe(0)
    expect(container.textContent).toBe('idle')

    act(() => root.unmount())
    container.remove()
  })

  it('keeps the dot beside its word', () => {
    mounted = mount(createElement(StateLine, { state: 'work', since: START }))

    expect(mounted.container.querySelectorAll('.status-dot')).toHaveLength(1)
    expect(mounted.container.querySelector('.status-dot')?.getAttribute('aria-hidden')).toBe('true')
    expect(mounted.container.querySelector('.state-text')?.textContent?.startsWith('working')).toBe(true)
  })
})
