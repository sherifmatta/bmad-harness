// @vitest-environment jsdom
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { InstallSnapshot } from '../../../shared/install'
import { Shell } from '../shell/shell'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { INERT_LAYOUT, LayoutContext } from './layout-context'
import type { LayoutContextValue } from './layout-context'

/**
 * The rail split (Story 9.3) in the shell, over a rail whose height the test sets: jsdom does no
 * layout, so `.rail` reports `height` from `getBoundingClientRect`, and a fake `ResizeObserver`
 * delivers a resize when the test says. What the share is drawn as, what the keys do, what a drag
 * holds and gives back, and that a short rail clamps what is drawn without writing.
 */

const SNAPSHOT: InstallSnapshot = { revision: 1, agents: [], menus: {}, errors: [], preflight: [], skills: [] }
const UP = 'Arrow' + 'Up'
const DOWN = 'Arrow' + 'Down'

let height: number
let observers: Set<() => void>
let restore: () => void
let view: Mounted | null
let saved: (number | null)[]

beforeEach(() => {
  height = 800
  observers = new Set()
  saved = []
  view = null
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    if (this.classList.contains('rail')) {
      return { width: 300, height, top: 0, left: 0, right: 300, bottom: height, x: 0, y: 0, toJSON: () => ({}) }
    }
    return original.call(this)
  }
  const originalObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    private readonly callback: () => void
    constructor(callback: () => void) {
      this.callback = callback
      observers.add(callback)
    }
    observe(): void {}
    disconnect(): void {
      observers.delete(this.callback)
    }
  }
  restore = () => {
    Element.prototype.getBoundingClientRect = original
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalObserver
  }
})

afterEach(() => {
  view?.unmount()
  restore()
  document.body.className = ''
})

function show(railSplit: number | null = null): void {
  const value: LayoutContextValue = { ...INERT_LAYOUT, railSplit, saveRailSplit: (share) => void saved.push(share) }
  view = mount(createElement(LayoutContext.Provider, { value }, createElement(Shell, { projectPath: '/p', snapshot: SNAPSHOT })))
}

const split = (): HTMLElement => document.querySelector('.rail-split') as HTMLElement
const halves = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.rail .rail-half')]
const basis = (): string[] => halves().map((half) => half.style.getPropertyValue('--rail-half-basis'))
const resize = (): void => act(() => observers.forEach((callback) => callback()))

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => void split().dispatchEvent(event))
  return event
}
function down(clientY: number): void {
  act(() => void split().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientY })))
}
const moveTo = (clientY: number): void => act(() => void document.dispatchEvent(new MouseEvent('mousemove', { clientY })))
const release = (): void => act(() => void document.dispatchEvent(new MouseEvent('mouseup')))

describe('the rail split', () => {
  it('is a horizontal separator between the Changes half and the Outputs half, one tab stop, its value a whole percentage', () => {
    show()

    expect(split().getAttribute('role')).toBe('separator')
    expect(split().getAttribute('aria-orientation')).toBe('horizontal')
    expect(split().getAttribute('aria-label')).toBe('rail split')
    expect(split().tabIndex).toBe(0)
    expect(split().getAttribute('aria-valuenow')).toBe('50')
    expect(split().getAttribute('aria-valuemin')).toBe('15')
    expect(split().getAttribute('aria-valuemax')).toBe('85')
    expect(halves().map((half) => half.querySelector('h3')?.textContent)).toEqual(['Changes', 'Outputs'])
    expect(split().previousElementSibling).toBe(halves()[0])
    expect(split().nextElementSibling).toBe(halves()[1])
    expect(basis()).toEqual(['50%', '50%'])
  })

  it('draws a stored share, and a stored share out of range as half and half', () => {
    show(0.25)
    expect(basis()).toEqual(['25%', '75%'])
    expect(split().getAttribute('aria-valuenow')).toBe('25')
    view?.unmount()
    show(7)
    expect(basis()).toEqual(['50%', '50%'])
  })

  it('moves 16px on ↑ and ↓ and 64px with Shift, keeping each move, and claims the key', () => {
    show()

    const event = press(DOWN)
    expect(event.defaultPrevented).toBe(true)
    expect(saved).toEqual([0.52])
    press(UP, { shiftKey: true })
    expect(saved.at(-1)).toBe(0.44)
    expect(split().getAttribute('aria-valuenow')).toBe('44')
  })

  it('goes to the limits on Home and End, each half keeping 120px, and back to half and half on Enter or a double-click', () => {
    show(0.3)

    press('Home')
    expect(saved.at(-1)).toBe(0.15)
    press('End')
    expect(saved.at(-1)).toBe(0.85)
    press('Enter')
    expect(saved.at(-1)).toBeNull()
    expect(basis()).toEqual(['50%', '50%'])

    press('End')
    act(() => void split().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(saved.at(-1)).toBeNull()
  })

  it('claims no other key, and no chord', () => {
    show()
    for (const key of ['Arrow' + 'Left', 'Arrow' + 'Right', 'Tab', ' ', 'x']) {
      expect(press(key).defaultPrevented, key).toBe(false)
    }
    expect(press(DOWN, { metaKey: true }).defaultPrevented).toBe(false)
    expect(saved).toEqual([])
  })

  it('follows a drag and keeps where it was let go', () => {
    show()

    down(400)
    expect(document.body.classList.contains('is-resizing')).toBe(true)
    expect(split().classList.contains('is-dragging')).toBe(true)
    moveTo(480)
    expect(basis()).toEqual(['60%', '40%'])
    expect(saved).toEqual([])
    release()
    expect(saved).toEqual([0.6])
    expect(document.body.className).toBe('')
    expect(split().classList.contains('is-dragging')).toBe(false)
  })

  it('gives the share back, and keeps nothing, when a drag is cancelled with Escape', () => {
    show(0.4)

    down(400)
    moveTo(100)
    expect(basis()).toEqual(['15%', '85%'])
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))
    expect(basis()).toEqual(['40%', '60%'])
    expect(saved).toEqual([])
    expect(document.body.className).toBe('')
  })

  it('gives the share back, and keeps nothing, when the window loses focus mid-drag', () => {
    show(0.4)

    down(400)
    moveTo(560)
    expect(basis()).toEqual(['60%', '40%'])
    act(() => void window.dispatchEvent(new Event('blur')))

    expect(basis()).toEqual(['40%', '60%'])
    expect(saved).toEqual([])
    expect(document.body.classList.contains('is-resizing')).toBe(false)
    expect(document.body.classList.contains('is-resizing-rows')).toBe(false)
    expect(split().classList.contains('is-dragging')).toBe(false)
  })

  it('gives the body back when the rail goes mid-drag, and leaves no listener behind', () => {
    show()

    down(400)
    expect(document.body.classList.contains('is-resizing')).toBe(true)
    expect(document.body.classList.contains('is-resizing-rows')).toBe(true)
    view?.unmount()

    expect(document.body.classList.contains('is-resizing')).toBe(false)
    expect(document.body.classList.contains('is-resizing-rows')).toBe(false)
    moveTo(100)
    release()
    expect(saved).toEqual([])
  })

  it('clamps the share to a shorter rail when drawn, writing nothing, and draws the share again when the rail grows', () => {
    show(0.1)
    expect(basis()).toEqual(['15%', '85%'])

    height = 200
    resize()
    expect(basis()).toEqual(['50%', '50%'])
    height = 2400
    resize()
    expect(basis()).toEqual(['10%', '90%'])
    expect(saved).toEqual([])
  })
})
