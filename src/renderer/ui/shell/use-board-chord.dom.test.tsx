// @vitest-environment jsdom
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { useBoardChord } from './use-board-chord'

let view: Mounted | null = null
let shown = 0

function Probe(): null {
  useBoardChord(() => {
    shown += 1
  })
  return null
}

/** One key, as the browser delivers it: on the focused element, bubbling to the document. */
function press(key: string, target: Element = document.body, init: KeyboardEventInit = {}): void {
  act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init })))
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['performance'] })
  shown = 0
  view = mount(createElement(Probe))
})
afterEach(() => {
  view?.unmount()
  view = null
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('useBoardChord', () => {
  it('shows the Board on `g` then `b`, once', () => {
    press('g')
    press('b')

    expect(shown).toBe(1)
    press('b')
    expect(shown).toBe(1)
  })

  it('does nothing for another key between, or for a gap over a second', () => {
    press('g')
    press('x')
    press('b')
    expect(shown).toBe(0)

    press('g')
    vi.advanceTimersByTime(1001)
    press('b')
    expect(shown).toBe(0)

    press('g')
    vi.advanceTimersByTime(1000)
    press('b')
    expect(shown).toBe(1)
  })

  it.each(['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const)('does nothing while %s is held', (modifier) => {
    press('g', document.body, { [modifier]: true })
    press('b', document.body, { [modifier]: true })
    expect(shown).toBe(0)

    // A modifier on the second key cancels a chord begun without one.
    press('g')
    press('b', document.body, { [modifier]: true })
    press('b')
    expect(shown).toBe(0)
  })

  it.each([
    ['textarea', '<textarea></textarea>'],
    ['input', '<input type="text">'],
    ['select', '<select></select>'],
    ['contenteditable', '<div contenteditable="true"></div>']
  ])('does nothing typed in a %s', (_name, html) => {
    document.body.innerHTML = html
    const field = document.body.firstElementChild as Element

    press('g', field)
    press('b', field)
    expect(shown).toBe(0)

    // Begun outside and finished inside, or the reverse, is not a chord either.
    press('g')
    press('b', field)
    press('b')
    expect(shown).toBe(0)
    press('g', field)
    press('b')
    expect(shown).toBe(0)
  })

  it('stops listening on unmount', () => {
    view?.unmount()
    view = null

    press('g')
    press('b')
    expect(shown).toBe(0)
  })
})
