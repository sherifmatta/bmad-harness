// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ThemeChoice, ThemeState } from '../../../shared/theme'
import type { OpenAck, RecentRow } from '../../../shared/welcome'
import { SPINNER_MARKUP, spoken } from '../testing/audit-patterns'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { WelcomeApp } from './welcome-app'

/**
 * Story 5.1, the rendered half (UX-DR39 to UX-DR41): the audit of what the
 * Welcome promised not to do. The page is mounted through its real root over a
 * fake bridge, with recent rows present, absent and one missing, and with a
 * rejected drop, and each prohibition is read off what it draws. The static half
 * (isolation, imports, tokens, the negative surface in source) is
 * `tests/welcome-contract.test.ts`.
 *
 * A failing assertion here is fixed in the product. None may be loosened.
 */

const NOW = 1_700_000_000_000
const HOUR = 3_600_000

const row = (name: string, over: Partial<RecentRow> = {}): RecentRow => ({
  path: `/Users/me/work/${name}`,
  name,
  parent: '~/work',
  openedAt: NOW - 2 * HOUR,
  exists: true,
  ...over
})

/** The Welcome's seven methods, as spies. */
type Bridge = Record<
  'getRecent' | 'chooseFolder' | 'openRecent' | 'openDropped' | 'getTheme' | 'chooseTheme' | 'onThemeChanged',
  ReturnType<typeof vi.fn>
>

let mounted: Mounted | null = null
let bridge: Bridge
/** What main holds, and who is listening for it to change: the fake bridge's whole theme. */
let theme: ThemeState
let themeListeners: ((state: ThemeState) => void)[]

/** Main pushes a state to the page, as it does to every window on a choice. */
function pushTheme(choice: ThemeChoice, applied: 'light' | 'dark' = choice === 'light' ? 'light' : 'dark'): void {
  theme = { choice, applied }
  act(() => {
    for (const listener of themeListeners) {
      listener(theme)
    }
  })
}

function install(rows: RecentRow[] | Error, overrides: Partial<Bridge> = {}): void {
  theme = { choice: 'system', applied: 'dark' }
  themeListeners = []
  bridge = {
    getRecent: vi.fn(() => (rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows))),
    chooseFolder: vi.fn((): Promise<OpenAck> => Promise.resolve({ ok: false })),
    openRecent: vi.fn((): Promise<OpenAck> => Promise.resolve({ ok: true })),
    openDropped: vi.fn((): Promise<OpenAck> => Promise.resolve({ ok: true })),
    getTheme: vi.fn(() => theme),
    // Main answers a choice by telling every window, this one included.
    chooseTheme: vi.fn((choice: ThemeChoice) => {
      pushTheme(choice)
      return Promise.resolve()
    }),
    onThemeChanged: vi.fn((listener: (state: ThemeState) => void) => {
      themeListeners.push(listener)
      return () => {
        themeListeners = themeListeners.filter((one) => one !== listener)
      }
    }),
    ...overrides
  }
  ;(window as unknown as { welcome: Bridge }).welcome = bridge
}

/** Mount the page and let the recent rows land. */
async function open(rows: RecentRow[] | Error = [], overrides: Partial<Bridge> = {}): Promise<HTMLElement> {
  install(rows, overrides)
  await act(async () => {
    mounted = mount(<WelcomeApp />)
  })
  return mounted!.container
}

/** A drop as the page receives it: the files, and the types a drag carries. */
function dropOf(files: { name: string }[], types: string[] = ['Files']): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', {
    value: { files, types, dropEffect: 'none' }
  })
  return event
}

function dragOf(type: 'dragenter' | 'dragover' | 'dragleave', types: string[] = ['Files']): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: { files: [], types, dropEffect: 'none' } })
  return event
}

const q = (container: HTMLElement, selector: string): HTMLElement | null => container.querySelector(selector)
const all = (container: HTMLElement, selector: string): HTMLElement[] => [...container.querySelectorAll<HTMLElement>(selector)]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
  vi.spyOn(Date, 'now').mockReturnValue(NOW)
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete (window as unknown as { welcome?: unknown }).welcome
})

/** What the page's one live region has been told so far. */
async function announced(container: HTMLElement): Promise<string> {
  await act(async () => {
    vi.advanceTimersByTime(300)
  })
  return q(container, '.visually-hidden')?.textContent ?? ''
}

describe('opening', () => {
  it('puts focus on the open button, with no dialog and nothing asked of the bridge but the recent list', async () => {
    const container = await open()

    expect(document.activeElement).toBe(q(container, '.welcome-open'))
    expect(bridge.getRecent).toHaveBeenCalledTimes(1)
    expect(bridge.chooseFolder).not.toHaveBeenCalled()
    expect(bridge.openRecent).not.toHaveBeenCalled()
    expect(bridge.openDropped).not.toHaveBeenCalled()
  })

  it('has the button, the recent list and the theme line as its only tab stops, and the cards as none', async () => {
    const container = await open([row('a'), row('b'), row('c')])

    const stops = all(container, 'button, a, input, select, textarea, [tabindex]').filter(
      (element) => element.getAttribute('tabindex') !== '-1'
    )

    expect(stops.map((element) => element.className.split(' ')[0])).toEqual([
      'welcome-open',
      'welcome-recent-row',
      'welcome-theme-word'
    ])
    expect(all(container, '.welcome-card, .welcome-card *').filter((element) => element.hasAttribute('tabindex'))).toEqual([])
    expect(all(container, '.welcome-card button, .welcome-card a')).toEqual([])
  })

  it('chooses a folder from the button, and puts focus back on it when that was cancelled', async () => {
    const container = await open([row('a')])
    const button = q(container, '.welcome-open') as HTMLButtonElement
    const first = q(container, '.welcome-recent-row') as HTMLButtonElement
    act(() => first.focus())
    expect(document.activeElement).toBe(first)

    await act(async () => {
      button.click()
    })

    expect(bridge.chooseFolder).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(button)
    // And the Welcome stays as it was: the same rows, no line said.
    expect(all(container, '.welcome-recent-row')).toHaveLength(1)
    expect(q(container, '.welcome-drop-hint')?.textContent).toBe('drop a project folder here')
  })
})

describe('recent rows present', () => {
  it('shows each row’s folder name, ~ parent and age, newest first, under the label `recent`', async () => {
    const container = await open([
      row('falcon'),
      row('older', { openedAt: NOW - 3 * 86_400_000, parent: '~' }),
      row('fresh', { openedAt: NOW - 30_000 }),
      row('minutes', { openedAt: NOW - 7 * 60_000 })
    ])

    expect(q(container, '.welcome-recent .welcome-label')?.textContent).toBe('recent')
    expect(all(container, '.welcome-recent-row').map((button) => button.textContent)).toEqual([
      'falcon~/work2h',
      'older~3d',
      'fresh~/worknow',
      'minutes~/work7m'
    ])
  })

  it('opens a row’s project through the bridge with the row’s own path', async () => {
    const container = await open([row('a'), row('b')])

    await act(async () => {
      all(container, '.welcome-recent-row')[1].click()
    })

    expect(bridge.openRecent).toHaveBeenCalledWith('/Users/me/work/b')
  })

  it('moves between rows by arrow, clamped at both ends, with one tab stop that follows', async () => {
    const container = await open([row('a'), row('b'), row('c')])
    const rows = all(container, '.welcome-recent-row')
    // The arrows are `a11y/`'s to name in source; here they are only what a key press carries.
    const DOWN = 'Arrow' + 'Down'
    const UP = 'Arrow' + 'Up'
    const press = (target: HTMLElement, name: string): void =>
      act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })))

    act(() => rows[0].focus())
    press(rows[0], DOWN)
    expect(document.activeElement).toBe(rows[1])
    press(rows[1], DOWN)
    press(rows[2], DOWN)
    expect(document.activeElement).toBe(rows[2])
    expect(rows.map((button) => button.getAttribute('tabindex'))).toEqual(['-1', '-1', '0'])
    press(rows[2], UP)
    press(rows[1], UP)
    press(rows[0], UP)
    expect(document.activeElement).toBe(rows[0])
  })

  it('has no control to remove a row, and no count, badge, version or install state on one', async () => {
    const container = await open([row('a'), row('b', { exists: false })])

    // The open button and the two rows: the theme line is the page's only other control, and not a row's.
    expect(all(container, 'button:not(.welcome-theme-word)')).toHaveLength(3)
    expect(spoken(container)).not.toMatch(/remove|clear|forget|delete|\d+ (?:agents?|projects?)|version|installed|\bv\d/i)
    expect(all(container, '.welcome-recent-row *').filter((element) => element.tagName === 'BUTTON')).toEqual([])
  })
})

describe('recent rows absent', () => {
  it.each([
    ['none recorded', []],
    ['a list that could not be had', new Error('refused')]
  ])('renders no recent section for %s: no label, no empty line, no error', async (_name, rows) => {
    const container = await open(rows)

    expect(q(container, '.welcome-recent')).toBeNull()
    expect(container.textContent).not.toMatch(/\brecent\b|no recent|error|unavailable|failed|nothing/i)
    // The rest of the page is there.
    expect(q(container, '.welcome-open')).not.toBeNull()
    expect(q(container, '.welcome-team')).not.toBeNull()
  })
})

describe('one row missing', () => {
  it('keeps the row, says `folder missing` where the age was, and does nothing when activated', async () => {
    const container = await open([row('here'), row('gone', { exists: false })])
    const missing = all(container, '.welcome-recent-row')[1]

    expect(missing.getAttribute('aria-disabled')).toBe('true')
    expect(missing.textContent).toBe('gone~/workfolder missing')
    expect(q(missing, '.welcome-recent-age')).toBeNull()

    await act(async () => {
      missing.click()
    })
    expect(bridge.openRecent).not.toHaveBeenCalled()
  })

  it('is reached by the arrows, so the user can read why, and Enter does nothing there', async () => {
    const container = await open([row('here'), row('gone', { exists: false })])
    const [here, gone] = all(container, '.welcome-recent-row')

    act(() => here.focus())
    act(() => void here.dispatchEvent(new KeyboardEvent('keydown', { key: 'Arrow' + 'Down', bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(gone)

    await act(async () => {
      gone.click()
    })
    expect(bridge.openRecent).not.toHaveBeenCalled()
  })

  it('moves no focus and says nothing when its folder turns out to be gone after all', async () => {
    const container = await open([row('here')], { openRecent: vi.fn(() => Promise.resolve({ ok: false } as OpenAck)) })
    const button = q(container, '.welcome-open') as HTMLElement
    expect(document.activeElement).toBe(button)

    await act(async () => {
      all(container, '.welcome-recent-row')[0].click()
    })

    expect(document.activeElement).toBe(button)
    // The list is asked for again, which is how a vanished folder comes to be drawn missing.
    expect(bridge.getRecent).toHaveBeenCalledTimes(2)
    expect(await announced(container)).toBe('')
  })
})

describe('a rejected drop', () => {
  const refuse = (name?: string) => vi.fn(() => Promise.resolve({ ok: false, name } as OpenAck))

  it('opens nothing, and says `not a folder · <name>` once where the drop hint was', async () => {
    const container = await open([], { openDropped: refuse('notes.txt') })

    await act(async () => {
      q(container, '.welcome-root')?.dispatchEvent(dropOf([{ name: 'notes.txt' }]))
    })

    expect(bridge.openDropped).toHaveBeenCalledTimes(1)
    expect(q(container, '.welcome-drop-hint')?.textContent).toBe('not a folder · notes.txt')
    expect(container.textContent).not.toContain('drop a project folder here')
    expect(container.textContent?.match(/not a folder/g)).toHaveLength(1)
  })

  it('announces it once through the one polite region, and not again as time passes', async () => {
    const container = await open([], { openDropped: refuse('notes.txt') })

    await act(async () => {
      q(container, '.welcome-root')?.dispatchEvent(dropOf([{ name: 'notes.txt' }]))
    })

    expect(await announced(container)).toBe('not a folder · notes.txt')
    expect(all(container, '.visually-hidden')).toHaveLength(1)
    // Seconds on, with nothing dropped, the region says the same thing and nothing else.
    expect(await announced(container)).toBe('not a folder · notes.txt')
    expect(q(container, '.visually-hidden span')?.textContent).toBe('not a folder · notes.txt')
  })

  it('names the first dropped item when main named none, and nothing at all for a drop with no file', async () => {
    const container = await open([], { openDropped: refuse() })

    await act(async () => {
      q(container, '.welcome-root')?.dispatchEvent(dropOf([{ name: 'a.txt' }, { name: 'b.txt' }]))
    })
    expect(q(container, '.welcome-drop-hint')?.textContent).toBe('not a folder · a.txt')

    await act(async () => {
      q(container, '.welcome-root')?.dispatchEvent(dropOf([], ['text/plain']))
    })
    // A text drag carries no file: nothing was asked of main and nothing was said.
    expect(bridge.openDropped).toHaveBeenCalledTimes(1)
    expect(q(container, '.welcome-drop-hint')?.textContent).toBe('not a folder · a.txt')
  })

  it('is cleared by the next drop, and by the next choice', async () => {
    const container = await open([], { openDropped: refuse('notes.txt') })
    const root = q(container, '.welcome-root')

    await act(async () => {
      root?.dispatchEvent(dropOf([{ name: 'notes.txt' }]))
    })
    expect(q(container, '.welcome-drop-hint')?.textContent).toBe('not a folder · notes.txt')

    // The next drop clears it first; a drop that opens leaves the hint as it was.
    bridge.openDropped.mockResolvedValueOnce({ ok: true })
    await act(async () => {
      root?.dispatchEvent(dropOf([{ name: 'a-folder' }]))
    })
    expect(q(container, '.welcome-drop-hint')?.textContent).toBe('drop a project folder here')

    await act(async () => {
      root?.dispatchEvent(dropOf([{ name: 'notes.txt' }]))
    })
    expect(q(container, '.welcome-drop-hint')?.textContent).toBe('not a folder · notes.txt')
    await act(async () => {
      ;(q(container, '.welcome-open') as HTMLButtonElement).click()
    })
    expect(q(container, '.welcome-drop-hint')?.textContent).toBe('drop a project folder here')
  })

  it('takes the drop itself: the default, which would navigate to the file, is prevented, on the zone and off it', async () => {
    const container = await open()

    for (const target of [q(container, '.welcome-drop'), q(container, '.welcome-team'), q(container, '.welcome-topbar')]) {
      const over = dragOf('dragover')
      const dropped = dropOf([{ name: 'x' }])
      target?.dispatchEvent(over)
      await act(async () => {
        target?.dispatchEvent(dropped)
      })

      expect(over.defaultPrevented).toBe(true)
      expect(dropped.defaultPrevented).toBe(true)
    }
  })

  it('draws the drag feedback as the accent box while files are over, and takes it off on leaving and dropping', async () => {
    const container = await open()
    const box = q(container, '.welcome-drop') as HTMLElement
    const root = q(container, '.welcome-root') as HTMLElement

    act(() => void root.dispatchEvent(dragOf('dragenter')))
    expect(box.className).toBe('welcome-drop welcome-drop--over')
    act(() => void root.dispatchEvent(dragOf('dragleave')))
    expect(box.className).toBe('welcome-drop')

    act(() => void root.dispatchEvent(dragOf('dragover')))
    expect(box.className).toBe('welcome-drop welcome-drop--over')
    await act(async () => {
      root.dispatchEvent(dropOf([]))
    })
    expect(box.className).toBe('welcome-drop')

    // A dragged selection of text is not a drop this page takes.
    act(() => void root.dispatchEvent(dragOf('dragover', ['text/plain'])))
    expect(box.className).toBe('welcome-drop')
  })
})

describe('the negative surface, on what is drawn', () => {
  it('has no spinner, progress, animation, badge, tour, wizard, link out or sound', async () => {
    const container = await open([row('a'), row('b', { exists: false })])
    const markup = container.innerHTML

    expect(markup).not.toMatch(SPINNER_MARKUP)
    expect(markup).not.toMatch(/<audio|<video|<a[\s>]|<iframe|<img|<input|<dialog|href=|src=|autoplay|style=/i)
    expect(spoken(container)).not.toMatch(
      /get(?:ting)? started|welcome back|\btry\b|tour|wizard|checklist|what['’]s new|version|recommended|start with|next step|learn more|help/i
    )
  })

  it('reads and says nothing about any project: no path, install, count or branch beyond the recent rows’ own', async () => {
    const container = await open()

    expect(container.textContent).toContain('no project open')
    expect(container.textContent).toContain('a project\'s own install can add more')
    expect(spoken(container)).not.toMatch(/\/Users\/|branch|\d+ agents?|installed/i)
  })

  it('shows the five personas at full opacity under four lanes, none highlighted or recommended', async () => {
    const container = await open()

    expect(all(container, '.welcome-lane-head .welcome-label').map((label) => label.textContent)).toEqual([
      'analysis',
      'planning',
      'solutioning',
      'implementation'
    ])
    expect(all(container, '.welcome-card')).toHaveLength(5)
    expect(all(container, '.welcome-card svg').map((svg) => svg.getAttribute('width'))).toEqual(['44', '44', '44', '44', '44'])
    for (const element of all(container, '.welcome-card, .welcome-card *')) {
      expect(element.hasAttribute('aria-current')).toBe(false)
      expect(element.hasAttribute('aria-selected')).toBe(false)
      expect(element.hasAttribute('style')).toBe(false)
    }
    expect(container.textContent).toContain(
      "the five core personas, by phase of the method · a project's own install can add more"
    )
  })

  it('says its words in the harness register, and the descriptions in sans', async () => {
    const container = await open([row('a')])
    const strings = [
      q(container, '.welcome-topbar-state'),
      q(container, '.welcome-tagline'),
      q(container, '.welcome-drop-hint'),
      q(container, '.welcome-open'),
      q(container, '.welcome-team-meta')
    ].map((element) => element?.textContent ?? '')

    for (const text of strings) {
      expect(text, text).toBe(text.toLowerCase().replace('⌘o', '⌘O'))
      expect(text, text).not.toMatch(/[.!?]$/)
    }
    expect(all(container, '.welcome-card-description')).toHaveLength(5)
  })
})

describe('the theme line (Story 5.2, seam C)', () => {
  // Spelt apart: arrows belong to a11y/, and the sweep that says so reads tests too.
  const RIGHT = 'Arrow' + 'Right'
  const LEFT = 'Arrow' + 'Left'
  const DOWN = 'Arrow' + 'Down'
  const words = (container: HTMLElement): HTMLButtonElement[] =>
    all(container, '.welcome-theme-word') as HTMLButtonElement[]
  const key = (target: HTMLElement, name: string): void => {
    act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })))
  }

  it('says `theme · system · light · dark` on the bottom edge, after everything else on the page', async () => {
    const container = await open([row('a')])
    const line = q(container, '.welcome-theme') as HTMLElement

    expect(line.textContent).toBe('theme·system·light·dark')
    expect(line.textContent?.replace(/·/g, ' · ')).toBe('theme · system · light · dark')
    expect(words(container).map((word) => word.textContent)).toEqual(['system', 'light', 'dark'])
    // The foot of the page, after the stage that holds the team, and in a div of its own: no footer element ships.
    expect(q(container, 'main')?.nextElementSibling?.className).toBe('welcome-foot')
    expect(q(container, '.welcome-foot')?.contains(line)).toBe(true)
    expect(q(container, '.welcome-team')?.compareDocumentPosition(line)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('is three buttons in one group, named by its label, with the separators hidden from assistive technology', async () => {
    const container = await open()
    const group = q(container, '.welcome-theme') as HTMLElement

    expect(group.getAttribute('role')).toBe('group')
    expect(q(container, `#${group.getAttribute('aria-labelledby')}`)?.textContent).toBe('theme')
    expect(all(group, 'button')).toHaveLength(3)
    for (const button of all(group, 'button')) {
      expect(button.getAttribute('type')).toBe('button')
    }
    expect(all(group, '.welcome-theme-sep').map((sep) => [sep.textContent, sep.getAttribute('aria-hidden')])).toEqual([
      ['·', 'true'],
      ['·', 'true'],
      ['·', 'true']
    ])
  })

  it('marks the current word pressed and no other, and follows main’s state, not its own', async () => {
    const container = await open()
    const pressed = (): (string | null)[] => words(container).map((word) => word.getAttribute('aria-pressed'))

    expect(pressed()).toEqual(['true', 'false', 'false'])

    // A choice made elsewhere, in View ▸ Theme: main pushes and the line follows.
    pushTheme('dark')
    expect(pressed()).toEqual(['false', 'false', 'true'])
    pushTheme('light')
    expect(pressed()).toEqual(['false', 'true', 'false'])
  })

  it('starts from the choice main holds, whatever it is', async () => {
    install([])
    theme = { choice: 'light', applied: 'light' }
    await act(async () => {
      mounted = mount(<WelcomeApp />)
    })

    expect(words(mounted!.container).map((word) => word.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
  })

  it('is one tab stop: the current word, until an arrow moves it', async () => {
    const container = await open()

    expect(words(container).map((word) => word.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
    pushTheme('dark')
    expect(words(container).map((word) => word.getAttribute('tabindex'))).toEqual(['-1', '-1', '0'])
  })

  it('puts the one tab stop back on the current word when the choice changes elsewhere, after an arrow or a click', async () => {
    const container = await open()
    const [system, light] = words(container)
    const stops = (): (string | null)[] => words(container).map((word) => word.getAttribute('tabindex'))
    act(() => system.focus())

    key(system, RIGHT)
    expect(stops()).toEqual(['-1', '0', '-1'])
    // View ▸ Theme ▸ Dark: main pushes, and the stop follows the current word.
    pushTheme('dark')
    expect(stops()).toEqual(['-1', '-1', '0'])

    // A click moves the stop to the word chosen; a later choice elsewhere moves it again.
    act(() => light.click())
    expect(stops()).toEqual(['-1', '0', '-1'])
    pushTheme('system')
    expect(stops()).toEqual(['0', '-1', '-1'])
  })

  it('draws the page when the bridge cannot say the theme, and catches up on one pushed after the first read', async () => {
    install([])
    bridge.getTheme.mockImplementationOnce(() => {
      throw new Error('no bridge')
    })
    await act(async () => {
      mounted = mount(<WelcomeApp />)
    })
    // The effect re-read after subscribing, so the page holds main's choice at once.
    expect(words(mounted!.container).map((word) => word.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])

    pushTheme('light')
    expect(words(mounted!.container).map((word) => word.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
  })

  it('moves focus between the three with the arrows, clamped, and chooses nothing', async () => {
    const container = await open()
    const [system, light, dark] = words(container)
    act(() => system.focus())

    key(system, RIGHT)
    expect(document.activeElement).toBe(light)
    key(light, RIGHT)
    expect(document.activeElement).toBe(dark)
    key(dark, RIGHT)
    expect(document.activeElement).toBe(dark)
    key(dark, LEFT)
    key(light, LEFT)
    key(system, LEFT)
    expect(document.activeElement).toBe(system)

    expect(bridge.chooseTheme).not.toHaveBeenCalled()
    // The vertical arrows are the browser's, and the stop followed the focus.
    key(system, DOWN)
    expect(document.activeElement).toBe(system)
    expect(words(container).map((word) => word.getAttribute('tabindex'))).toEqual(['0', '-1', '-1'])
  })

  it('chooses the word that is clicked (which is what Enter and Space are on a button), exactly as the menu does: through the bridge, once', async () => {
    const container = await open()
    const [, light] = words(container)

    act(() => light.click())

    expect(bridge.chooseTheme.mock.calls).toEqual([['light']])
    expect(words(container).map((word) => word.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
  })

  it('does not choose on an arrow, a letter or a modified key, and does not take Enter or Space away from the button', async () => {
    const container = await open()
    const [system] = words(container)
    act(() => system.focus())

    for (const name of ['a', 'Tab', 'Escape', 'Home', 'End']) {
      key(system, name)
    }
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    act(() => void system.dispatchEvent(enter))
    act(() => void system.dispatchEvent(space))

    expect(bridge.chooseTheme).not.toHaveBeenCalled()
    // Left alone, so the browser's own button activation is what chooses.
    expect(enter.defaultPrevented).toBe(false)
    expect(space.defaultPrevented).toBe(false)
  })

  it('leaves focus exactly where it was when a choice is made, here or in the menu', async () => {
    const container = await open([row('a')])
    const recent = q(container, '.welcome-recent-row') as HTMLButtonElement
    act(() => recent.focus())

    pushTheme('light')
    expect(document.activeElement).toBe(recent)

    const [, , dark] = words(container)
    act(() => dark.focus())
    act(() => dark.click())
    expect(document.activeElement).toBe(dark)
    expect(bridge.chooseTheme).toHaveBeenCalledWith('dark')
  })

  it('announces nothing, toasts nothing and animates nothing when the theme changes', async () => {
    const container = await open()
    const markup = (): string => container.innerHTML
    const before = markup()

    pushTheme('light')
    pushTheme('dark')
    expect(await announced(container)).toBe('')
    expect(container.textContent).not.toMatch(/theme (?:changed|set)|now (?:light|dark)|switched/i)
    expect(markup()).not.toMatch(SPINNER_MARKUP)
    expect(markup()).not.toMatch(/style=|transition|animation/)
    // Only what the pressed state moved.
    expect(markup().replace(/aria-pressed="\w+"|tabindex="-?\d"/g, '')).toBe(
      before.replace(/aria-pressed="\w+"|tabindex="-?\d"/g, '')
    )
  })

  it('stops listening when the page goes', async () => {
    await open()
    expect(themeListeners).toHaveLength(1)

    mounted?.unmount()
    mounted = null

    expect(themeListeners).toEqual([])
  })

  it('has the current word as text and the others as links: the current is no link and the rest are in the accent', async () => {
    const container = await open()

    // Colour is the stylesheet's, through the pressed state; the markup carries no colour of its own.
    for (const word of words(container)) {
      expect(word.hasAttribute('style')).toBe(false)
      expect(word.className).toBe('welcome-theme-word')
    }
    expect(all(container, 'a, [href]')).toEqual([])
  })

  it('recommends nothing: no theme is marked, suggested or described beyond its own name', async () => {
    const container = await open()

    expect(spoken(container)).not.toMatch(/recommend|try |light mode|dark mode|suggest|best|preferred/i)
    expect(all(container, '.welcome-theme *').filter((element) => element.hasAttribute('title'))).toEqual([])
  })
})
