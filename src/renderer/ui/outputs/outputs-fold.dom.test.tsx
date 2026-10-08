// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RailRow, RailSnapshot } from '../../../shared/rail'
import { LayoutContext } from '../layout/layout-context'
import type { LayoutContextValue } from '../layout/layout-context'
import { useLayout } from '../layout/use-layout'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { Outputs } from './outputs'

/**
 * Folding the Outputs directories (Story 5.5), mounted: a heading is a button that folds its
 * own rows, headings and the rows showing are one roving tab stop, a fold is the window's layout
 * and is kept through the bridge, and a file arriving in a folded directory changes nothing the
 * user is holding. The pure parts are row-nav.test.ts's and outputs-focus.test.tsx's.
 */

const NOW = 1_000_000_000_000
const saved = (path: string, extra: Partial<RailRow> = {}): RailRow => ({ path, state: 'saved', savedAt: NOW, ...extra }) as RailRow
const changing = (path: string, extra: Partial<RailRow> = {}): RailRow => ({ path, state: 'changing', ...extra }) as RailRow

const TOP = '_bmad/'
const UX = '_bmad/ux/'
const PLAN = '_bmad/planning-artifacts/'
const EPICS = `${TOP}epics.md`
const PRD = `${PLAN}prd.md`
const ARCH = `${PLAN}architecture.md`
const DESIGN = `${UX}design.md`

const rail = (...rows: RailRow[]): RailSnapshot => ({ revision: 1, folder: TOP, rows })

let view: Mounted | null
let push: (snapshot: RailSnapshot) => void
let kept: ReadonlySet<string>[]
let openDoc: ReturnType<typeof vi.fn>

beforeEach(() => {
  view = null
  kept = []
  openDoc = vi.fn(() => Promise.resolve())
  ;(window as unknown as { harness: unknown }).harness = { openDoc, onDocClosed: () => () => {} }
})

afterEach(() => {
  view?.unmount()
  delete (window as unknown as { harness?: unknown }).harness
})

/** A window that holds the folded set, as `App` does, and records each set it is asked to keep. */
function Folding({ snapshot, initial = [] }: { snapshot: RailSnapshot; initial?: string[] }): ReactElement {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set(initial))
  const [shown, setShown] = useState(snapshot)
  useEffect(() => {
    push = setShown
  }, [setShown])
  const value: LayoutContextValue = {
    widths: { rail: null, room: null },
    folded,
    saveWidth: () => {},
    saveFolded: (next) => {
      kept.push(new Set(next))
      setFolded(new Set(next))
    }
  }
  return createElement(
    LayoutContext.Provider,
    { value },
    createElement(Outputs, { snapshot: shown, failure: null, agents: [], projectPath: '/work/falcon', now: NOW })
  )
}

function show(snapshot: RailSnapshot, initial: string[] = []): { rerender(next: RailSnapshot): void } {
  view = mount(createElement(Folding, { snapshot, initial }))
  // A push of the rail, as the window's own hook delivers one: the same list, the same state, new rows.
  return { rerender: (next) => act(() => push(next)) }
}

const SNAPSHOT = rail(saved(EPICS), saved(ARCH), saved(PRD), saved(DESIGN))

const headings = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('.folder-heading')]
const heading = (dir: string): HTMLButtonElement => headings().find((button) => button.textContent?.startsWith(dir)) as HTMLButtonElement
const names = (): string[] => [...document.querySelectorAll('.output-row-name')].map((node) => node.textContent ?? '')
/** What a heading or a row calls itself: the path of a heading, the file name of a row. */
const labelOf = (node: Element | null): string => node?.querySelector('.output-row-name')?.textContent ?? node?.textContent ?? ''
const click = (target: HTMLElement): void => act(() => void target.click())
const LEFT = 'Arrow' + 'Left'
const RIGHT = 'Arrow' + 'Right'
const DOWN = 'Arrow' + 'Down'
const UP = 'Arrow' + 'Up'

function press(target: HTMLElement, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  act(() => void target.dispatchEvent(event))
  return event
}

describe('a directory heading', () => {
  it('is a button with the path, aria-expanded and aria-controls naming its rows, and no role of its own', () => {
    show(SNAPSHOT)

    expect(headings().map((button) => button.textContent)).toEqual([TOP, PLAN, UX])
    for (const button of headings()) {
      expect(button.tagName).toBe('BUTTON')
      expect(button.type).toBe('button')
      expect(button.getAttribute('aria-expanded')).toBe('true')
      const list = document.getElementById(button.getAttribute('aria-controls') ?? '')
      expect(list?.tagName).toBe('UL')
      expect(button.nextElementSibling).toBe(list)
      expect(button.hasAttribute('role')).toBe(false)
    }
    // Each names its own list, and the rows are in it.
    expect(new Set(headings().map((button) => button.getAttribute('aria-controls'))).size).toBe(3)
    expect(document.getElementById(heading(PLAN).getAttribute('aria-controls') as string)?.textContent).toContain('architecture.md')
  })

  it('draws one stroked chevron, pointing right when folded and down when open, and nothing animated', () => {
    show(SNAPSHOT, [PLAN])

    const paths = headings().map((button) => button.querySelector('svg path')?.getAttribute('d'))
    expect(headings().map((button) => button.querySelectorAll('svg')).every((found) => found.length === 1)).toBe(true)
    // Open: down. Folded: right. Different shapes, one path each.
    expect(paths[0]).not.toBe(paths[1])
    expect(paths[0]).toBe(paths[2])
    expect(document.querySelector('.folder-heading svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(document.querySelector('.folder-heading animate, .folder-heading animateTransform, .folder-heading [style]')).toBeNull()
  })

  it('folds on a click, and unfolds on the next, its rows going and coming and nothing else changing', () => {
    show(SNAPSHOT)
    expect(names()).toEqual(['epics.md', 'architecture.md', 'prd.md', 'design.md'])

    click(heading(PLAN))

    expect(heading(PLAN).getAttribute('aria-expanded')).toBe('false')
    expect(names()).toEqual(['epics.md', 'design.md'])
    expect(heading(TOP).getAttribute('aria-expanded')).toBe('true')
    expect(heading(UX).getAttribute('aria-expanded')).toBe('true')
    expect(kept.map((set) => [...set])).toEqual([[PLAN]])

    click(heading(PLAN))

    expect(names()).toEqual(['epics.md', 'architecture.md', 'prd.md', 'design.md'])
    expect(kept.map((set) => [...set])).toEqual([[PLAN], []])
  })

  it('is flat: folding one directory folds none inside it', () => {
    show(rail(saved(EPICS), saved(DESIGN)))

    click(heading(TOP))

    expect(names()).toEqual(['design.md'])
    expect(heading(UX).getAttribute('aria-expanded')).toBe('true')
  })

  it('keeps the folded rows out of the document, not merely hidden', () => {
    show(SNAPSHOT, [PLAN])

    expect(document.body.textContent).not.toContain('architecture.md')
    expect(document.body.textContent).not.toContain('prd.md')
    expect(document.querySelectorAll('.output-row')).toHaveLength(2)
    // The list it controls is still there, empty and hidden, so aria-controls names something.
    const list = document.getElementById(heading(PLAN).getAttribute('aria-controls') as string) as HTMLElement
    expect(list.hidden).toBe(true)
    expect(list.children).toHaveLength(0)
  })

  it('shows no count, whatever it holds', () => {
    show(rail(saved('_bmad/a.md'), saved('_bmad/b.md'), saved('_bmad/c.md')), [TOP])

    expect(heading(TOP).textContent).toBe(TOP)
    expect(document.querySelector('.folder-heading-live')).toBeNull()
  })

  describe('the keys', () => {
    it('folds on the left arrow and unfolds on the right, keeping focus on the heading and consuming the key', () => {
      show(SNAPSHOT)
      heading(PLAN).focus()

      const folded = press(heading(PLAN), LEFT)
      expect(folded.defaultPrevented).toBe(true)
      expect(heading(PLAN).getAttribute('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(heading(PLAN))

      const unfolded = press(heading(PLAN), RIGHT)
      expect(unfolded.defaultPrevented).toBe(true)
      expect(heading(PLAN).getAttribute('aria-expanded')).toBe('true')
      expect(document.activeElement).toBe(heading(PLAN))
    })

    it('folds nothing already folded and unfolds nothing already open, and keeps nothing for it', () => {
      show(SNAPSHOT, [PLAN])

      press(heading(PLAN), LEFT)
      press(heading(UX), RIGHT)

      expect(kept).toEqual([])
    })

    it('leaves Enter and Space to the button, which clicks, and Home, End and Tab alone', () => {
      show(SNAPSHOT)

      for (const key of ['Enter', ' ', 'Tab', 'Home', 'End', 'x']) {
        expect(press(heading(PLAN), key).defaultPrevented, key).toBe(false)
      }
      expect(kept).toEqual([])
    })

    it('leaves a chord to the OS and the app', () => {
      show(SNAPSHOT)

      for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }]) {
        expect(press(heading(PLAN), LEFT, init).defaultPrevented).toBe(false)
      }
      expect(heading(PLAN).getAttribute('aria-expanded')).toBe('true')
    })
  })

  describe('as one roving list with the rows', () => {
    const stops = (): string[] =>
      [...document.querySelectorAll<HTMLElement>('.folder-heading, .output-row-button')]
        .filter((node) => node.tabIndex === 0)
        .map((node) => (node.classList.contains('folder-heading') ? `heading ${labelOf(node)}` : `row ${labelOf(node)}`))

    it('has one tab stop, the first heading, and travels through headings and the rows showing', () => {
      show(SNAPSHOT)
      expect(stops()).toEqual([`heading ${TOP}`])

      const order = [...document.querySelectorAll<HTMLElement>('.folder-heading, .output-row-button')]
      expect(order.map(labelOf)).toEqual([TOP, 'epics.md', PLAN, 'architecture.md', 'prd.md', UX, 'design.md'])

      const down = press(order[0], DOWN)
      expect(down.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(order[1])
      expect(stops()).toEqual(['row epics.md'])
      press(order[1], DOWN)
      expect(document.activeElement).toBe(heading(PLAN))
      press(heading(PLAN), UP)
      expect(document.activeElement).toBe(order[1])
    })

    it('skips the rows of a folded directory, and clamps at both ends of what is showing', () => {
      show(SNAPSHOT, [PLAN])

      press(heading(PLAN), DOWN)
      expect(document.activeElement).toBe(heading(UX))
      press(heading(UX), DOWN)
      press(document.activeElement as HTMLElement, DOWN)
      expect(labelOf(document.activeElement)).toBe('design.md')
      press(document.activeElement as HTMLElement, DOWN)
      expect(labelOf(document.activeElement)).toBe('design.md')

      press(heading(TOP), UP)
      expect(document.activeElement).toBe(heading(TOP))
    })

    it('hands the tab stop to the heading that was toggled, so a fold never strands the stop on a row that went', () => {
      show(SNAPSHOT)
      const row = document.querySelectorAll<HTMLElement>('.output-row-button')[1]
      press(row, UP)
      press(heading(PLAN), RIGHT)
      row.focus()

      click(heading(PLAN))

      expect(stops()).toEqual([`heading ${PLAN}`])
    })

    it('opens a row’s document on a click, as before', () => {
      show(SNAPSHOT)

      click(document.querySelector('.output-row-button') as HTMLElement)

      expect(openDoc).toHaveBeenCalledWith(EPICS)
    })
  })
})

describe('a folded directory with a file changing', () => {
  it('shows the amber dot and the word changing on its heading, and nothing else of the row', () => {
    show(rail(saved(EPICS), changing(PRD, { annotation: { text: 'writing · §2 Goals', owner: { agentId: 'bmad-agent-pm' } } })), [PLAN])

    const live = heading(PLAN).querySelector('.folder-heading-live') as HTMLElement
    expect(live.textContent).toBe('changing')
    expect(live.querySelector('.status-dot--work')).not.toBeNull()
    expect(heading(PLAN).textContent).toBe(`${PLAN}changing`)
    // Never a run's annotation, an owner or a state of its own.
    expect(heading(PLAN).textContent).not.toMatch(/writing|§|John|saved/)
    expect(document.querySelector('.output-row--changing')).toBeNull()
  })

  it('shows neither when nothing under it is changing, folded or not', () => {
    show(rail(saved(EPICS), saved(PRD)), [PLAN])
    expect(document.querySelector('.folder-heading-live')).toBeNull()
    expect(document.querySelector('.status-dot')).toBeNull()
  })

  it('shows neither while it is open: the row says it itself', () => {
    show(rail(saved(EPICS), changing(PRD)))

    expect(document.querySelector('.folder-heading-live')).toBeNull()
    expect(document.querySelectorAll('.status-dot--work')).toHaveLength(1)
    expect(document.querySelector('.output-row--changing')).not.toBeNull()
  })

  it('says it only on the directory it is in, and goes when the file settles', () => {
    const shown = show(rail(saved(EPICS), changing(PRD), saved(DESIGN)), [TOP, PLAN, UX])
    expect(document.querySelectorAll('.folder-heading-live')).toHaveLength(1)
    expect(heading(PLAN).querySelector('.folder-heading-live')).not.toBeNull()

    shown.rerender(rail(saved(EPICS), saved(PRD), saved(DESIGN)))
    expect(document.querySelector('.folder-heading-live')).toBeNull()
  })
})

describe('what arrives, changes and leaves while a directory is folded', () => {
  it('leaves it folded, and focus where it was, when a file arrives in it', () => {
    const scrolls = vi.fn()
    Element.prototype.scrollIntoView = scrolls
    const shown = show(rail(saved(EPICS), saved(PRD)), [PLAN])
    heading(PLAN).focus()

    shown.rerender(rail(saved(EPICS), saved(PRD), saved(ARCH), changing(`${PLAN}new.md`)))

    expect(heading(PLAN).getAttribute('aria-expanded')).toBe('false')
    expect(names()).toEqual(['epics.md'])
    expect(document.activeElement).toBe(heading(PLAN))
    expect(kept).toEqual([])
    expect(scrolls).not.toHaveBeenCalled()
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  it('leaves it folded when its last file leaves, and the directory goes with its heading', () => {
    const shown = show(rail(saved(EPICS), saved(PRD)), [PLAN])
    expect(heading(PLAN)).toBeDefined()

    shown.rerender(rail(saved(EPICS)))

    expect(headings().map((button) => button.textContent)).toEqual([TOP])
    expect(document.body.textContent).not.toContain(PLAN)
  })

  it('does not move the list’s focus when a heading comes and goes elsewhere', () => {
    const shown = show(rail(saved(EPICS), saved(PRD)))
    document.querySelector<HTMLElement>('.output-row-button')?.focus()
    const focused = document.activeElement

    shown.rerender(rail(saved(EPICS), saved(PRD), saved(DESIGN)))
    expect(headings()).toHaveLength(3)

    expect(document.activeElement).toBe(focused)
  })
})

describe('the folded set', () => {
  it('keeps an entry for a directory that is gone, ignores it while it is absent, and applies it again when it returns', () => {
    const shown = show(rail(saved(EPICS), saved(PRD)), ['gone/', PLAN])
    expect(names()).toEqual(['epics.md'])

    // Folding another directory keeps the entry for the one that is not there.
    click(heading(TOP))
    expect(new Set(kept.at(-1))).toEqual(new Set(['gone/', PLAN, TOP]))
    click(heading(TOP))
    expect(new Set(kept.at(-1))).toEqual(new Set(['gone/', PLAN]))

    // The directory returns, and is folded as it was.
    shown.rerender(rail(saved(EPICS), saved(PRD), saved('gone/x.md')))
    expect(headings().map((button) => button.textContent)).toEqual([TOP, PLAN, 'gone/'])
    expect(heading('gone/').getAttribute('aria-expanded')).toBe('false')
    expect(names()).toEqual(['epics.md'])
  })

  it('folds the directory a stored entry names when the window starts with it', () => {
    show(SNAPSHOT, [UX])

    expect(heading(UX).getAttribute('aria-expanded')).toBe('false')
    expect(names()).toEqual(['epics.md', 'architecture.md', 'prd.md'])
  })
})

describe('kept through the bridge', () => {
  it('asks the bridge to keep the whole set, as an array of project-relative directories, on each toggle', () => {
    const setFolded = vi.fn()
    ;(window as unknown as { harness: unknown }).harness = {
      openDoc,
      onDocClosed: () => () => {},
      getLayout: () => ({ rail: null, room: null, folded: ['gone/'] }),
      setFolded
    }
    function App(): ReactElement {
      const layout = useLayout()
      return createElement(
        LayoutContext.Provider,
        { value: layout },
        createElement(Outputs, { snapshot: SNAPSHOT, failure: null, agents: [], projectPath: '/work/falcon', now: NOW })
      )
    }
    view = mount(createElement(App))

    click(heading(PLAN))
    click(heading(UX))
    click(heading(PLAN))

    expect(setFolded.mock.calls).toEqual([[['gone/', PLAN]], [['gone/', PLAN, UX]], [['gone/', UX]]])
    expect(names()).toEqual(['epics.md', 'architecture.md', 'prd.md'])
  })
})
