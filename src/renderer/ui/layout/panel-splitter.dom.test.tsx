// @vitest-environment jsdom
import { act, createElement } from 'react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { InstallSnapshot } from '../../../shared/install'
import { PartyView } from '../party/party-view'
import { Shell } from '../shell/shell'
import { LIVE_REGIONS } from '../testing/audit-patterns'
import { installFakePanels } from '../testing/fake-panels'
import type { FakePanels } from '../testing/fake-panels'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { LayoutContext } from './layout-context'
import type { LayoutContextValue } from './layout-context'

/**
 * The two splitters over a fake panel whose geometry the test sets (Story 5.5): jsdom does no
 * layout, so the container's width is `installFakePanels`'s, and a drag is the mouse events a
 * browser sends. What a width is applied as, what the keys do, what a drag holds and gives back, and
 * that a resize changes nothing but the width.
 */

const SNAPSHOT: InstallSnapshot = { revision: 1, agents: [], menus: {}, errors: [], preflight: [] }

let panels: FakePanels
let view: Mounted | null
let saved: [string, number | null][]

beforeEach(() => {
  panels = installFakePanels()
  view = null
  saved = []
})

afterEach(() => {
  view?.unmount()
  panels.restore()
  document.body.className = ''
})

function layout(widths: Partial<LayoutContextValue['widths']> = {}): LayoutContextValue {
  return {
    widths: { rail: null, room: null, ...widths },
    folded: new Set(),
    saveWidth: (panel, width) => saved.push([panel, width]),
    saveFolded: () => {}
  }
}

function show(element: ReactElement, value = layout()): void {
  view = mount(createElement(LayoutContext.Provider, { value }, element))
}

const shell = (): ReactElement => createElement(Shell, { projectPath: '/p', snapshot: SNAPSHOT })

const party = (): ReactElement =>
  createElement(PartyView, {
    agents: [],
    room: 'room-1',
    roomCast: [],
    speaker: undefined,
    entries: [],
    topic: undefined,
    openedAt: 1,
    turns: 0,
    rows: [],
    folder: '_bmad/',
    onOpen: () => {},
    onSend: () => {}
  })

const rail = (): HTMLElement => document.querySelector('.rail') as HTMLElement
const side = (): HTMLElement => document.querySelector('.party-side') as HTMLElement
const splitter = (name: 'rail' | 'room'): HTMLElement => document.querySelector(`.panel-splitter--${name}`) as HTMLElement

function press(target: HTMLElement, key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers })
  act(() => void target.dispatchEvent(event))
  return event
}

function down(target: HTMLElement, clientX: number, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX, ...init })
  act(() => void target.dispatchEvent(event))
  return event
}
const moveTo = (clientX: number): void => act(() => void document.dispatchEvent(new MouseEvent('mousemove', { clientX })))
const release = (): void => act(() => void document.dispatchEvent(new MouseEvent('mouseup')))

const ARROW_LEFT = 'Arrow' + 'Left'
const ARROW_RIGHT = 'Arrow' + 'Right'
const ARROW_UP = 'Arrow' + 'Up'
const ARROW_DOWN = 'Arrow' + 'Down'

describe('the rail’s splitter', () => {
  it('is a separator between the chat column and the rail: vertical, labelled, with its value, minimum and maximum, and one tab stop', () => {
    show(shell())

    const bar = splitter('rail')
    expect(bar.getAttribute('role')).toBe('separator')
    expect(bar.getAttribute('aria-orientation')).toBe('vertical')
    expect(bar.getAttribute('aria-label')).toBe('rail width')
    expect(bar.getAttribute('aria-valuemin')).toBe('280')
    expect(bar.getAttribute('aria-valuemax')).toBe('560')
    expect(bar.getAttribute('aria-valuenow')).toBe('348')
    expect(bar.tabIndex).toBe(0)
    // On the rail's inner edge: after the chat column, before the rail.
    expect(bar.previousElementSibling?.className).toBe('chat')
    expect(bar.nextElementSibling).toBe(rail())
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(1)
  })

  it('leaves the rail at the token’s own width until a width is chosen: no inline value', () => {
    show(shell())

    expect(rail().style.length).toBe(0)
  })

  it('applies a chosen width by overriding the property the stylesheet already reads, and nothing else', () => {
    show(shell(), layout({ rail: 420 }))

    expect(rail().style.getPropertyValue('--rail')).toBe('420px')
    expect(rail().getAttribute('style')).toBe('--rail: 420px;')
    expect(splitter('rail').getAttribute('aria-valuenow')).toBe('420')
  })

  it('reads a stored width the panel would not read as the default, silently', () => {
    for (const stored of [12, 9999, 300.5, null]) {
      show(shell(), layout({ rail: stored as number }))
      expect(rail().style.length, String(stored)).toBe(0)
      expect(splitter('rail').getAttribute('aria-valuenow')).toBe('348')
      view?.unmount()
    }
  })

  describe('the keys', () => {
    it('grows by 16 on the left arrow, shrinks by 16 on the right, and by 64 with Shift', () => {
      show(shell())
      const bar = splitter('rail')

      press(bar, ARROW_LEFT)
      expect(rail().style.getPropertyValue('--rail')).toBe('364px')
      press(bar, ARROW_LEFT, { shiftKey: true })
      expect(rail().style.getPropertyValue('--rail')).toBe('428px')
      press(bar, ARROW_RIGHT)
      expect(rail().style.getPropertyValue('--rail')).toBe('412px')
      press(bar, ARROW_RIGHT, { shiftKey: true })
      expect(rail().style.getPropertyValue('--rail')).toBe('348px')
      expect(bar.getAttribute('aria-valuenow')).toBe('348')
      expect(saved).toEqual([['rail', 364], ['rail', 428], ['rail', 412], ['rail', 348]])
    })

    it('goes to the minimum on Home and the maximum on End', () => {
      show(shell())

      press(splitter('rail'), 'Home')
      expect(splitter('rail').getAttribute('aria-valuenow')).toBe('280')
      press(splitter('rail'), 'End')
      expect(splitter('rail').getAttribute('aria-valuenow')).toBe('560')
      expect(saved).toEqual([['rail', 280], ['rail', 560]])
    })

    it('changes nothing and keeps nothing where a key meets a limit', () => {
      show(shell(), layout({ rail: 560 }))
      press(splitter('rail'), ARROW_LEFT)
      press(splitter('rail'), ARROW_LEFT, { shiftKey: true })
      press(splitter('rail'), 'End')
      expect(rail().style.getPropertyValue('--rail')).toBe('560px')

      press(splitter('rail'), 'Home')
      press(splitter('rail'), ARROW_RIGHT)
      press(splitter('rail'), 'Home')
      expect(rail().style.getPropertyValue('--rail')).toBe('280px')
      // The step to the limit and nothing after it.
      expect(saved).toEqual([['rail', 280]])
    })

    it('returns to the default on Enter, forgetting the stored value', () => {
      show(shell(), layout({ rail: 500 }))

      press(splitter('rail'), 'Enter')

      expect(rail().style.length).toBe(0)
      expect(splitter('rail').getAttribute('aria-valuenow')).toBe('348')
      expect(saved).toEqual([['rail', null]])
    })

    it('consumes the keys it claims, so the page does not scroll, and none it does not', () => {
      show(shell())

      for (const key of [ARROW_LEFT, ARROW_RIGHT, 'Home', 'End', 'Enter']) {
        expect(press(splitter('rail'), key).defaultPrevented, key).toBe(true)
      }
      for (const key of [ARROW_UP, ARROW_DOWN, ' ', 'Tab', 'PageDown']) {
        expect(press(splitter('rail'), key).defaultPrevented, key).toBe(false)
      }
    })

    it('leaves a chord to the OS and the app', () => {
      show(shell())

      for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
        expect(press(splitter('rail'), ARROW_LEFT, modifiers).defaultPrevented).toBe(false)
      }
      expect(saved).toEqual([])
      expect(rail().style.length).toBe(0)
    })
  })

  it('returns to the default on a double-click, as Enter does', () => {
    show(shell(), layout({ rail: 500 }))

    act(() => void splitter('rail').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))

    expect(rail().style.length).toBe(0)
    expect(saved).toEqual([['rail', null]])
  })

  describe('a drag', () => {
    it('follows the pointer as it goes, the rail growing as the pointer goes left, and keeps the width on release', () => {
      show(shell())

      down(splitter('rail'), 900)
      expect(rail().style.length).toBe(0)
      moveTo(850)
      expect(rail().style.getPropertyValue('--rail')).toBe('398px')
      expect(splitter('rail').getAttribute('aria-valuenow')).toBe('398')
      moveTo(950)
      expect(rail().style.getPropertyValue('--rail')).toBe('298px')
      moveTo(800)
      expect(rail().style.getPropertyValue('--rail')).toBe('448px')
      // Nothing is kept while the pointer moves.
      expect(saved).toEqual([])

      release()

      expect(rail().style.getPropertyValue('--rail')).toBe('448px')
      expect(saved).toEqual([['rail', 448]])
      // A later move is nobody's.
      moveTo(100)
      expect(rail().style.getPropertyValue('--rail')).toBe('448px')
    })

    it('holds at the limits when the pointer goes past them', () => {
      show(shell())

      down(splitter('rail'), 900)
      moveTo(-5000)
      expect(rail().style.getPropertyValue('--rail')).toBe('560px')
      moveTo(9000)
      expect(rail().style.getPropertyValue('--rail')).toBe('280px')
      release()
      expect(saved).toEqual([['rail', 280]])
    })

    it('never leaves the chat column under 420px: the maximum is what the container leaves it', () => {
      panels.widths['view-conversation'] = 900
      show(shell())

      expect(splitter('rail').getAttribute('aria-valuemax')).toBe('480')
      down(splitter('rail'), 900)
      moveTo(0)
      expect(rail().style.getPropertyValue('--rail')).toBe('480px')
    })

    it('shows the resize cursor and selects no text for the drag, and gives both back on release', () => {
      show(shell())

      expect(document.body.classList.contains('is-resizing')).toBe(false)
      const event = down(splitter('rail'), 900)
      expect(event.defaultPrevented).toBe(true)
      expect(document.body.classList.contains('is-resizing')).toBe(true)
      expect(splitter('rail').classList.contains('is-dragging')).toBe(true)
      expect(document.activeElement).toBe(splitter('rail'))

      release()

      expect(document.body.classList.contains('is-resizing')).toBe(false)
      expect(splitter('rail').classList.contains('is-dragging')).toBe(false)
    })

    it('is cancelled by Escape: the width it started at is back, nothing is kept, and the body is given back', () => {
      show(shell(), layout({ rail: 400 }))

      down(splitter('rail'), 900)
      moveTo(700)
      expect(rail().style.getPropertyValue('--rail')).toBe('560px')
      const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      act(() => void document.dispatchEvent(escape))

      expect(rail().style.getPropertyValue('--rail')).toBe('400px')
      expect(document.body.classList.contains('is-resizing')).toBe(false)
      moveTo(100)
      release()
      expect(rail().style.getPropertyValue('--rail')).toBe('400px')
      expect(saved).toEqual([])
    })

    it('is cancelled by Escape back to the default when no width was chosen', () => {
      show(shell())

      down(splitter('rail'), 900)
      moveTo(800)
      act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))

      expect(rail().style.length).toBe(0)
      expect(saved).toEqual([])
    })

    it('is cancelled by the window losing focus', () => {
      show(shell(), layout({ rail: 400 }))

      down(splitter('rail'), 900)
      moveTo(800)
      act(() => void window.dispatchEvent(new Event('blur')))

      expect(rail().style.getPropertyValue('--rail')).toBe('400px')
      expect(document.body.classList.contains('is-resizing')).toBe(false)
      expect(saved).toEqual([])
    })

    it('gives the body back when the panel goes mid-drag, and leaves no listener behind', () => {
      show(shell())

      down(splitter('rail'), 900)
      expect(document.body.classList.contains('is-resizing')).toBe(true)
      view?.unmount()

      expect(document.body.classList.contains('is-resizing')).toBe(false)
      moveTo(100)
      release()
      expect(saved).toEqual([])
    })

    it('keeps nothing for a press and a release where it was, nor for one dragged back to its start', () => {
      show(shell())

      down(splitter('rail'), 900)
      release()
      down(splitter('rail'), 900)
      moveTo(800)
      moveTo(900)
      release()

      expect(saved).toEqual([])
      expect(rail().style.length).toBe(0)
    })

    it('does not start on a ctrl-click, which is the context menu on macOS', () => {
      show(shell())

      expect(down(splitter('rail'), 900, { ctrlKey: true }).defaultPrevented).toBe(false)
      expect(document.body.classList.contains('is-resizing')).toBe(false)
      moveTo(800)
      expect(rail().style.length).toBe(0)
    })

    it('leaves a key unconsumed and unapplied while a drag is in flight, so display and store agree', () => {
      show(shell())

      down(splitter('rail'), 900)
      moveTo(800)
      for (const key of [ARROW_LEFT, 'Home', 'Enter']) {
        expect(press(splitter('rail'), key).defaultPrevented, key).toBe(false)
      }
      expect(rail().style.getPropertyValue('--rail')).toBe('448px')
      release()
      expect(rail().style.getPropertyValue('--rail')).toBe('448px')
      expect(saved).toEqual([['rail', 448]])
      // And once it has ended, the keys are the splitter's again.
      expect(press(splitter('rail'), ARROW_LEFT).defaultPrevented).toBe(true)
    })

    it('starts only on the primary button, and one drag at a time', () => {
      show(shell())

      expect(down(splitter('rail'), 900, { button: 2 }).defaultPrevented).toBe(false)
      expect(document.body.classList.contains('is-resizing')).toBe(false)
      down(splitter('rail'), 900)
      down(splitter('rail'), 100)
      moveTo(800)
      release()
      expect(saved).toEqual([['rail', 448]])
    })
  })

  describe('a narrowed window', () => {
    it('pulls the panel in without touching what was chosen, and gives it back when the window widens', () => {
      show(shell(), layout({ rail: 500 }))
      expect(rail().style.getPropertyValue('--rail')).toBe('500px')

      panels.widths['view-conversation'] = 900
      act(() => panels.resize())
      expect(rail().style.getPropertyValue('--rail')).toBe('480px')
      expect(splitter('rail').getAttribute('aria-valuenow')).toBe('480')
      expect(splitter('rail').getAttribute('aria-valuemax')).toBe('480')

      panels.widths['view-conversation'] = 1400
      act(() => panels.resize())
      expect(rail().style.getPropertyValue('--rail')).toBe('500px')
      // Nothing was written for either.
      expect(saved).toEqual([])
    })
  })

  describe('nothing else', () => {
    it('keeps the chat column, the thread and the rail’s halves the very nodes they were, and announces nothing', () => {
      show(shell())
      const nodes = ['.chat', '.scroll', '.thread', '.rail-half', '.topbar'].map((selector) => document.querySelector(selector))
      expect(nodes.every((node) => node !== null)).toBe(true)

      press(splitter('rail'), ARROW_LEFT, { shiftKey: true })
      down(splitter('rail'), 900)
      moveTo(700)
      release()
      press(splitter('rail'), 'Enter')

      expect(['.chat', '.scroll', '.thread', '.rail-half', '.topbar'].map((selector) => document.querySelector(selector))).toEqual(nodes)
      expect(document.querySelectorAll(LIVE_REGIONS)).toHaveLength(0)
      expect(document.querySelectorAll('.follow-latest')).toHaveLength(0)
    })

    it('changes no view: both stay mounted and the hidden one is still hidden', () => {
      show(shell())

      press(splitter('rail'), 'Home')

      expect((document.querySelector('.view-party') as HTMLElement).hidden).toBe(true)
      expect((document.querySelector('.view-conversation') as HTMLElement).hidden).toBe(false)
    })
  })
})

describe('the Room panel’s splitter', () => {
  it('is a separator before the panel: labelled for it, 200 to 400, default 240', () => {
    show(party())

    const bar = splitter('room')
    expect(bar.getAttribute('role')).toBe('separator')
    expect(bar.getAttribute('aria-orientation')).toBe('vertical')
    expect(bar.getAttribute('aria-label')).toBe('room panel width')
    expect(bar.getAttribute('aria-valuemin')).toBe('200')
    expect(bar.getAttribute('aria-valuemax')).toBe('400')
    expect(bar.getAttribute('aria-valuenow')).toBe('240')
    expect(bar.tabIndex).toBe(0)
    expect(bar.previousElementSibling?.className).toBe('party-main')
    expect(bar.nextElementSibling).toBe(side())
    expect(side().style.length).toBe(0)
  })

  it('has no splitter where the room has no panel: no live room, no splitter', () => {
    show(createElement(PartyView, { ...(party().props as object), room: undefined } as never))

    expect(document.querySelector('.panel-splitter')).toBeNull()
  })

  it('applies a width by overriding --party-side on the panel, and keeps it on the keys, within 200 to 400', () => {
    show(party(), layout({ room: 300 }))
    expect(side().getAttribute('style')).toBe('--party-side: 300px;')

    press(splitter('room'), ARROW_LEFT, { shiftKey: true })
    expect(side().style.getPropertyValue('--party-side')).toBe('364px')
    press(splitter('room'), 'End')
    expect(side().style.getPropertyValue('--party-side')).toBe('400px')
    press(splitter('room'), ARROW_LEFT)
    press(splitter('room'), 'Home')
    expect(side().style.getPropertyValue('--party-side')).toBe('200px')
    press(splitter('room'), 'Enter')
    expect(side().style.length).toBe(0)
    expect(saved).toEqual([['room', 364], ['room', 400], ['room', 200], ['room', null]])
  })

  it('drags, holds at its limits and never leaves the party column under 480px', () => {
    panels.widths['party-body'] = 780
    show(party())

    expect(splitter('room').getAttribute('aria-valuemax')).toBe('300')
    down(splitter('room'), 700)
    moveTo(600)
    expect(side().style.getPropertyValue('--party-side')).toBe('300px')
    moveTo(-1000)
    expect(side().style.getPropertyValue('--party-side')).toBe('300px')
    moveTo(5000)
    expect(side().style.getPropertyValue('--party-side')).toBe('200px')
    release()
    expect(saved).toEqual([['room', 200]])
  })

  it('is independent of the rail: the two widths are stored apart', () => {
    show(party(), layout({ rail: 500, room: 260 }))

    press(splitter('room'), ARROW_RIGHT)

    expect(saved).toEqual([['room', 244]])
  })
})
