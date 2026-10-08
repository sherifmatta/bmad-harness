// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import '../testing/render-hook'
import { PartyHeader } from './party-header'

let container: HTMLElement
let root: Root

function mount(props: Partial<Parameters<typeof PartyHeader>[0]> = {}): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(createElement(PartyHeader, { topic: undefined, participants: 5, openedAt: Date.now(), turns: 0, ...props })))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-08T14:31:00'))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

const chips = (): string[] => [...container.querySelectorAll('.party-chip')].map((chip) => chip.textContent ?? '')
const button = (): HTMLButtonElement => container.querySelector('button') as HTMLButtonElement

describe('PartyHeader', () => {
  it('reads a room just opened: no topic yet, the participants, turn 0 · 0s', () => {
    mount()

    expect(container.querySelector('.party-head-topic')?.textContent).toBe('no topic yet')
    expect(chips()).toEqual(['5 participants', 'turn 0 · 0s'])
  })

  it('says 1 participant for a cast of one', () => {
    mount({ participants: 1 })

    expect(chips()[0]).toBe('1 participant')
  })

  it('draws the topic as text', () => {
    mount({ topic: '<b>Payouts</b>' })

    expect(container.querySelector('.party-head-topic')?.textContent).toBe('<b>Payouts</b>')
    expect(container.querySelector('b')).toBeNull()
  })

  it('ticks the elapsed time each second, in one chip with the turn count', () => {
    mount({ turns: 3, openedAt: Date.now() - 65_000 })
    expect(chips()[1]).toBe('turn 3 · 1m 05s')

    act(() => void vi.advanceTimersByTime(1000))

    expect(chips()[1]).toBe('turn 3 · 1m 06s')
  })

  it('has a disabled *Write summary to _bmad/* button without a handler, and an enabled one with it', () => {
    mount()
    expect(button().textContent).toBe('Write summary to _bmad/')
    expect(button().disabled).toBe(true)
    expect(button().type).toBe('button')

    act(() => root.unmount())
    container.remove()
    const pressed = vi.fn()
    mount({ onWriteSummary: pressed })
    expect(button().disabled).toBe(false)
    act(() => button().click())
    expect(pressed).toHaveBeenCalledTimes(1)
  })

  it('has no pause control, no disagreement chip, no live region and no role', () => {
    mount({ topic: 'x', turns: 2 })

    expect(container.querySelectorAll('button')).toHaveLength(1)
    expect(container.innerHTML).not.toMatch(/pause|disagree|aria-liv[e]|role=/i)
  })
})
