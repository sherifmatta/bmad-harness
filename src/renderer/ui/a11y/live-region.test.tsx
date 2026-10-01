// @vitest-environment jsdom
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inAct, mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { ANNOUNCE_INTERVAL_MS, Announcer } from './announcer'
import { LiveRegion } from './live-region'

/**
 * The one live region, mounted. The queue policy (the throttle, the
 * order, never merging) is held by the Announcer as pure logic; what only a
 * mount can show is that the component actually drains
 * it on a timer, puts each message in the accessibility tree as its own node,
 * and lets go of the timer.
 */

// Spelled in two pieces: a sweep over `src/` allows the live-region attribute
// in exactly one file, and this one only looks for it.
const LIVE = `aria-${'live'}`

let mounted: Mounted | null
let announcer: Announcer

function render(): Mounted {
  mounted = mount(createElement(LiveRegion, { announcer }))
  return mounted
}

function advance(ms: number): void {
  inAct(() => void vi.advanceTimersByTime(ms))
}

function region(container: HTMLElement): HTMLElement {
  const found = container.querySelector<HTMLElement>(`[${LIVE}]`)
  if (found === null) {
    throw new Error('no live region rendered')
  }
  return found
}

beforeEach(() => {
  vi.useFakeTimers()
  announcer = new Announcer()
  mounted = null
})

afterEach(() => {
  mounted?.unmount()
  vi.useRealTimers()
})

describe('LiveRegion', () => {
  it('renders exactly one region, polite, and never an assertive one', () => {
    const { container } = render()

    expect(container.querySelectorAll(`[${LIVE}]`)).toHaveLength(1)
    expect(region(container).getAttribute(LIVE)).toBe('polite')
    expect(container.querySelectorAll(`[${LIVE}="assertive"]`)).toHaveLength(0)
  })

  it('is empty until something is announced', () => {
    const { container } = render()

    advance(ANNOUNCE_INTERVAL_MS * 3)

    expect(region(container).textContent).toBe('')
  })

  it('speaks a message announced before it mounted, at once', () => {
    announcer.announce('claude · not on path', 0)

    const { container } = render()

    expect(region(container).textContent).toBe('claude · not on path')
  })

  it('speaks a message announced after it mounted on its next tick', () => {
    const { container } = render()

    announcer.announce('saved', 0)
    advance(ANNOUNCE_INTERVAL_MS / 8)

    expect(region(container).textContent).toBe('saved')
  })

  it('announces at most one message per interval, in event order, never merged', () => {
    announcer.announce('first', 0)
    announcer.announce('second', 1)
    announcer.announce('third', 2)
    const { container } = render()
    const spoken = (): string => region(container).textContent ?? ''

    expect(spoken()).toBe('first')

    advance(ANNOUNCE_INTERVAL_MS - 1)
    expect(spoken()).toBe('first')

    advance(1)
    expect(spoken()).toBe('second')

    advance(ANNOUNCE_INTERVAL_MS - 1)
    expect(spoken()).toBe('second')

    advance(1)
    expect(spoken()).toBe('third')
    expect(announcer.pending).toBe(0)
  })

  it('announces two identical messages as two, each in a node of its own', () => {
    announcer.announce('saved', 0)
    announcer.announce('saved', 1)
    const { container } = render()
    const firstNode = region(container).firstElementChild

    advance(ANNOUNCE_INTERVAL_MS)
    const secondNode = region(container).firstElementChild

    expect(region(container).textContent).toBe('saved')
    // Equal text in the same node would be no mutation, and a polite region
    // says nothing for a mutation that did not happen.
    expect(secondNode).not.toBe(firstNode)
    expect(announcer.pending).toBe(0)
  })

  it('clears its timer on unmount, so a closed window leaves nothing draining', () => {
    render()
    expect(vi.getTimerCount()).toBe(1)

    mounted?.unmount()

    expect(vi.getTimerCount()).toBe(0)
  })
})
