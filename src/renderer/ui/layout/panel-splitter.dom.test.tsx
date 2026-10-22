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

const SNAPSHOT: InstallSnapshot = { revision: 1, agents: [], menus: {}, errors: [], preflight: [], skills: [] }

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
    widths: { sidebar: null, rail: null, room: null, ...widths },
    folded: new Set(),
    saveWidth: (panel, width) => saved.push([panel, width]),
    saveFolded: () => {},
    skillRowOpen: false,
    saveSkillRowOpen: () => {},
    railSplit: null,
    saveRailSplit: () => {},
    changesFolded: new Set(),
    saveChangesFolded: () => {}
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
const sidebar = (): HTMLElement => document.querySelector('.sidebar') as HTMLElement
const side = (): HTMLElement => document.querySelector('.party-side') as HTMLElement
const splitter = (name: 'sidebar' | 'rail' | 'room'): HTMLElement => document.querySelector(`.panel-splitter--${name}`) as HTMLElement

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
    expect(bar.getAttribute('aria-valuemin')).toBe('260')
    expect(bar.getAttribute('aria-valuemax')).toBe('480')
    expect(bar.getAttribute('aria-valuenow')).toBe('300')
    expect(bar.tabIndex).toBe(0)
    // On the rail's inner edge: after the chat column, before the rail.
    expect(bar.previousElementSibling?.className).toBe('chat')
    expect(bar.nextElementSibling).toBe(rail())
    // The sidebar's, the rail's and, inside the rail, the rail split between its two halves (Story 9.3).
    expect(document.querySelectorAll('[role="separator"]')).toHaveLength(3)
    const split = rail().querySelector('.rail-split')
    expect(split?.getAttribute('aria-orientation')).toBe('horizontal')
    expect(split?.previousElementSibling?.querySelector('h3')?.textContent).toBe('Changes')
    expect(split?.nextElementSibling?.querySelector('h3')?.textContent).toBe('Outputs')
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
      expect(splitter('rail').getAttribute('aria-valuenow')).toBe('300')
      view?.unmount()
    }
  })

  describe('the keys', () => {
    it('grows by 16 on the left arrow, shrinks by 16 on the right, and by 64 with Shift', () => {
      show(shell())
      const bar = splitter('rail')

      press(bar, ARROW_LEFT)
      expect(rail().style.getPropertyValue('--rail')).toBe('316px')
      press(bar, ARROW_LEFT, { shiftKey: true })
      expect(rail().style.getPropertyValue('--rail')).toBe('380px')
      press(bar, ARROW_RIGHT)
      expect(rail().style.getPropertyValue('--rail')).toBe('364px')
      press(bar, ARROW_RIGHT, { shiftKey: true })
      expect(rail().style.getPropertyValue('--rail')).toBe('300px')
      expect(bar.getAttribute('aria-valuenow')).toBe('300')
      expect(saved).toEqual([['rail', 316], ['rail', 380], ['rail', 364], ['rail', 300]])
    })

    it('goes to the minimum on Home and the maximum on End', () => {
      show(shell())

      press(splitter('rail'), 'Home')
      expect(splitter('rail').getAttribute('aria-valuenow')).toBe('260')
      press(splitter('rail'), 'End')
      expect(splitter('rail').getAttribute('aria-valuenow')).toBe('480')
      expect(saved).toEqual([['rail', 260], ['rail', 480]])
    })

    it('changes nothing and keeps nothing where a key meets a limit', () => {
      show(shell(), layout({ rail: 480 }))
      press(splitter('rail'), ARROW_LEFT)
      press(splitter('rail'), ARROW_LEFT, { shiftKey: true })
      press(splitter('rail'), 'End')
      expect(rail().style.getPropertyValue('--rail')).toBe('480px')

      press(splitter('rail'), 'Home')
      press(splitter('rail'), ARROW_RIGHT)
      press(splitter('rail'), 'Home')
      expect(rail().style.getPropertyValue('--rail')).toBe('260px')
      // The step to the limit and nothing after it.
      expect(saved).toEqual([['rail', 260]])
    })

    it('returns to the default on Enter, forgetting the stored value', () => {
      show(shell(), layout({ rail: 400 }))

      press(splitter('rail'), 'Enter')

      expect(rail().style.length).toBe(0)
      expect(splitter('rail').getAttribute('aria-valuenow')).toBe('300')
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
    show(shell(), layout({ rail: 400 }))

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
      expect(rail().style.getPropertyValue('--rail')).toBe('350px')
      expect(splitter('rail').getAttribute('aria-valuenow')).toBe('350')
      moveTo(950)
      expect(rail().style.getPropertyValue('--rail')).toBe('260px')
      moveTo(800)
      expect(rail().style.getPropertyValue('--rail')).toBe('400px')
      // Nothing is kept while the pointer moves.
      expect(saved).toEqual([])

      release()

      expect(rail().style.getPropertyValue('--rail')).toBe('400px')
      expect(saved).toEqual([['rail', 400]])
      // A later move is nobody's.
      moveTo(100)
      expect(rail().style.getPropertyValue('--rail')).toBe('400px')
    })

    it('holds at the limits when the pointer goes past them', () => {
      show(shell())

      down(splitter('rail'), 900)
      moveTo(-5000)
      expect(rail().style.getPropertyValue('--rail')).toBe('480px')
      moveTo(9000)
      expect(rail().style.getPropertyValue('--rail')).toBe('260px')
      release()
      expect(saved).toEqual([['rail', 260]])
    })

    it('never leaves the chat column under 420px: the maximum is what the container leaves it', () => {
      // 1000 - the sidebar's 244 - the chat column's 420.
      panels.widths['view-conversation'] = 1000
      show(shell())

      expect(splitter('rail').getAttribute('aria-valuemax')).toBe('336')
      down(splitter('rail'), 900)
      moveTo(0)
      expect(rail().style.getPropertyValue('--rail')).toBe('336px')
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
      expect(rail().style.getPropertyValue('--rail')).toBe('480px')
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
      expect(rail().style.getPropertyValue('--rail')).toBe('400px')
      release()
      expect(rail().style.getPropertyValue('--rail')).toBe('400px')
      expect(saved).toEqual([['rail', 400]])
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
      expect(saved).toEqual([['rail', 400]])
    })
  })

  describe('a narrowed window', () => {
    it('draws the sidebar at the width it shows, and leaves the chat column its 420px, when the rail was chosen wide', () => {
      show(shell(), layout({ rail: 480 }))
      panels.widths['view-conversation'] = 1001
      act(() => panels.resize())

      // The unchosen sidebar is pulled in below its default and is drawn there, not at the token's 244.
      expect(sidebar().style.getPropertyValue('--sidebar')).toBe('200px')
      expect(splitter('sidebar').getAttribute('aria-valuenow')).toBe('200')
      expect(rail().style.getPropertyValue('--rail')).toBe('381px')
      expect(200 + 381 + 420).toBeLessThanOrEqual(1001)
      expect(saved).toEqual([])

      panels.widths['view-conversation'] = 1400
      act(() => panels.resize())
      expect(sidebar().style.length).toBe(0)
    })

    it('pulls the panel in without touching what was chosen, and gives it back when the window widens', () => {
      show(shell(), layout({ rail: 450 }))
      expect(rail().style.getPropertyValue('--rail')).toBe('450px')

      // The sidebar, at its default, gives way to its own minimum, 200, before the rail does: 1000 - 200 - 420.
      panels.widths['view-conversation'] = 1000
      act(() => panels.resize())
      expect(rail().style.getPropertyValue('--rail')).toBe('380px')
      expect(splitter('sidebar').getAttribute('aria-valuenow')).toBe('200')
      expect(splitter('rail').getAttribute('aria-valuenow')).toBe('380')
      expect(splitter('rail').getAttribute('aria-valuemax')).toBe('380')

      panels.widths['view-conversation'] = 1400
      act(() => panels.resize())
      expect(rail().style.getPropertyValue('--rail')).toBe('450px')
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

describe('the sidebar’s splitter', () => {
  it('is a separator between the sidebar and the chat column: labelled, 200 to 400, default 244, one tab stop', () => {
    show(shell())

    const bar = splitter('sidebar')
    expect(bar.getAttribute('role')).toBe('separator')
    expect(bar.getAttribute('aria-orientation')).toBe('vertical')
    expect(bar.getAttribute('aria-label')).toBe('sidebar width')
    expect(bar.getAttribute('aria-valuemin')).toBe('200')
    expect(bar.getAttribute('aria-valuemax')).toBe('400')
    expect(bar.getAttribute('aria-valuenow')).toBe('244')
    expect(bar.tabIndex).toBe(0)
    expect(bar.previousElementSibling).toBe(sidebar())
    expect(bar.nextElementSibling?.className).toBe('chat')
    expect(sidebar().style.length).toBe(0)
  })

  it('applies a chosen width as --sidebar on the sidebar, and reads a value out of range as the default', () => {
    show(shell(), layout({ sidebar: 320 }))
    expect(sidebar().getAttribute('style')).toBe('--sidebar: 320px;')
    view?.unmount()

    for (const stored of [199, 401, 12, 9999, 250.5, null]) {
      show(shell(), layout({ sidebar: stored as number }))
      expect(sidebar().style.length, String(stored)).toBe(0)
      expect(splitter('sidebar').getAttribute('aria-valuenow')).toBe('244')
      view?.unmount()
    }
  })

  it('grows on the right arrow and shrinks on the left, by 16 and by 64 with Shift: the rail’s keys, swapped', () => {
    show(shell())
    const bar = splitter('sidebar')

    press(bar, ARROW_RIGHT)
    expect(sidebar().style.getPropertyValue('--sidebar')).toBe('260px')
    press(bar, ARROW_RIGHT, { shiftKey: true })
    expect(sidebar().style.getPropertyValue('--sidebar')).toBe('324px')
    press(bar, ARROW_LEFT)
    expect(sidebar().style.getPropertyValue('--sidebar')).toBe('308px')
    press(bar, ARROW_LEFT, { shiftKey: true })
    expect(sidebar().style.getPropertyValue('--sidebar')).toBe('244px')
    expect(saved).toEqual([['sidebar', 260], ['sidebar', 324], ['sidebar', 308], ['sidebar', 244]])
  })

  it('goes to 200 on Home and 400 on End, and back to the default on Enter or a double-click', () => {
    show(shell())

    press(splitter('sidebar'), 'Home')
    expect(splitter('sidebar').getAttribute('aria-valuenow')).toBe('200')
    press(splitter('sidebar'), 'End')
    expect(splitter('sidebar').getAttribute('aria-valuenow')).toBe('400')
    press(splitter('sidebar'), 'Enter')
    expect(sidebar().style.length).toBe(0)
    press(splitter('sidebar'), 'End')
    act(() => void splitter('sidebar').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(sidebar().style.length).toBe(0)
    expect(saved).toEqual([['sidebar', 200], ['sidebar', 400], ['sidebar', null], ['sidebar', 400], ['sidebar', null]])
  })

  it('follows the pointer to the right, grows there, holds at its limits and keeps the width on release', () => {
    show(shell())

    down(splitter('sidebar'), 244)
    moveTo(294)
    expect(sidebar().style.getPropertyValue('--sidebar')).toBe('294px')
    moveTo(100)
    expect(sidebar().style.getPropertyValue('--sidebar')).toBe('200px')
    moveTo(9000)
    expect(sidebar().style.getPropertyValue('--sidebar')).toBe('400px')
    expect(saved).toEqual([])
    moveTo(344)
    release()

    expect(sidebar().style.getPropertyValue('--sidebar')).toBe('344px')
    expect(saved).toEqual([['sidebar', 344]])
  })

  it('is cancelled by Escape: the width it started at is back and nothing is kept', () => {
    show(shell(), layout({ sidebar: 300 }))

    down(splitter('sidebar'), 300)
    moveTo(380)
    expect(sidebar().style.getPropertyValue('--sidebar')).toBe('380px')
    act(() => void document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })))

    expect(sidebar().style.getPropertyValue('--sidebar')).toBe('300px')
    expect(saved).toEqual([])
  })
})

describe('the two panels beside the chat column', () => {
  it('leave the chat column 420px whichever is dragged to its maximum, the other at its default', () => {
    panels.widths['view-conversation'] = 1000
    show(shell())

    // Sidebar: 1000 - the rail's default 300 - 420 = 280. Rail: 1000 - the sidebar's default 244 - 420 = 336.
    expect(splitter('sidebar').getAttribute('aria-valuemax')).toBe('280')
    expect(splitter('rail').getAttribute('aria-valuemax')).toBe('336')
    press(splitter('sidebar'), 'End')
    expect(sidebar().style.getPropertyValue('--sidebar')).toBe('280px')
  })

  it('reserve one another’s width: the sidebar leaves the rail’s chosen width, and the rail the sidebar’s width as shown', () => {
    panels.widths['view-conversation'] = 1100
    show(shell(), layout({ sidebar: 300, rail: 380 }))

    // 1100 - 380 - 420 = 300 for the sidebar; 1100 - 300 - 420 = 380 for the rail: both fit as chosen.
    expect(sidebar().style.getPropertyValue('--sidebar')).toBe('300px')
    expect(rail().style.getPropertyValue('--rail')).toBe('380px')
    expect(splitter('sidebar').getAttribute('aria-valuemax')).toBe('300')
    expect(splitter('rail').getAttribute('aria-valuemax')).toBe('380')

    // Narrowed, each shows less and the chat column keeps its 420px; nothing was stored.
    panels.widths['view-conversation'] = 1000
    act(() => panels.resize())
    expect(splitter('sidebar').getAttribute('aria-valuenow')).toBe('200')
    expect(splitter('rail').getAttribute('aria-valuenow')).toBe('380')
    expect(saved).toEqual([])
  })

  it('give the rail less when the sidebar grows, and the sidebar less when the rail does', () => {
    panels.widths['view-conversation'] = 1000
    show(shell())

    // The rail's room is 1000 - 420 - the sidebar's width: 336 at the sidebar's default.
    expect(splitter('rail').getAttribute('aria-valuemax')).toBe('336')
    press(splitter('sidebar'), 'End')
    expect(splitter('rail').getAttribute('aria-valuemax')).toBe('300')
    view?.unmount()

    // The sidebar's room is 1000 - 420 - the rail's chosen or default width: 280 at the rail's default.
    show(shell())
    expect(splitter('sidebar').getAttribute('aria-valuemax')).toBe('280')
    press(splitter('rail'), 'End')
    expect(splitter('sidebar').getAttribute('aria-valuemax')).toBe('244')
  })

  it('keep their widths apart: each is stored under its own panel', () => {
    show(shell())

    press(splitter('sidebar'), ARROW_RIGHT)
    press(splitter('rail'), ARROW_LEFT)

    expect(saved).toEqual([['sidebar', 260], ['rail', 316]])
  })

  it('hold the sidebar left of the chat column, and the rail right of it', () => {
    show(shell())

    const row = document.querySelector('.view-conversation') as HTMLElement
    expect([...row.children].map((child) => child.className.split(' ')[0])).toEqual([
      'sidebar',
      'panel-splitter',
      'chat',
      'panel-splitter',
      'rail'
    ])
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
    show(party(), layout({ rail: 400, room: 260 }))

    press(splitter('room'), ARROW_RIGHT)

    expect(saved).toEqual([['room', 244]])
  })
})
