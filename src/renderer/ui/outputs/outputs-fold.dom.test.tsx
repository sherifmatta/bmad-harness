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
 * Folding the Outputs tree (Stories 5.5 and 9.2), mounted: a heading is a button that folds its
 * whole subtree, headings and the rows showing are one roving tab stop in visual order, a fold is
 * the window's layout and is kept through the bridge, and a file arriving in a folded directory
 * changes nothing the user is holding. The pure parts are row-nav.test.ts's, row-groups.test.ts's
 * and outputs-focus.test.tsx's.
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
    widths: { sidebar: null, rail: null, room: null },
    folded,
    saveWidth: () => {},
    saveFolded: (next) => {
      kept.push(new Set(next))
      setFolded(new Set(next))
    },
    skillRowOpen: false,
    saveSkillRowOpen: () => {}
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
/** A heading by its full path, which is its title (Story 9.2); it shows its own name. */
const heading = (dir: string): HTMLButtonElement => headings().find((button) => button.title === dir) as HTMLButtonElement
const names = (): string[] => [...document.querySelectorAll('.output-row-name')].map((node) => node.textContent ?? '')
/** What a heading or a row calls itself: the name of a heading, the file name of a row. */
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
  it('is a button with its own name, its full path as title, aria-expanded and aria-controls naming its branch, in a heading of its level', () => {
    show(SNAPSHOT)

    expect(headings().map((button) => button.textContent)).toEqual([TOP, 'planning-artifacts/', 'ux/'])
    expect(headings().map((button) => button.title)).toEqual([TOP, PLAN, UX])
    for (const button of headings()) {
      expect(button.tagName).toBe('BUTTON')
      expect(button.type).toBe('button')
      expect(button.getAttribute('aria-expanded')).toBe('true')
      const branch = document.getElementById(button.getAttribute('aria-controls') ?? '')
      expect(branch?.classList.contains('outputs-branch')).toBe(true)
      expect(button.parentElement?.nextElementSibling).toBe(branch)
      expect(button.hasAttribute('role')).toBe(false)
      expect(button.parentElement?.getAttribute('role')).toBe('heading')
    }
    expect(headings().map((button) => button.parentElement?.getAttribute('aria-level'))).toEqual(['4', '5', '5'])
    // Each names its own branch, the rows are in it, and the subdirectories' groups are in the root's.
    expect(new Set(headings().map((button) => button.getAttribute('aria-controls'))).size).toBe(3)
    expect(document.getElementById(heading(PLAN).getAttribute('aria-controls') as string)?.textContent).toContain('architecture.md')
    expect(document.getElementById(heading(TOP).getAttribute('aria-controls') as string)?.contains(heading(UX))).toBe(true)
  })

  it('nests in visual order: a heading, its subdirectories, then its own files', () => {
    show(SNAPSHOT)

    const order = [...document.querySelectorAll<HTMLElement>('.folder-heading, .output-row-button')]
    expect(order.map(labelOf)).toEqual([TOP, 'planning-artifacts/', 'architecture.md', 'prd.md', 'ux/', 'design.md', 'epics.md'])
    // Depth reaches the stylesheet as a counter on each group, and nothing is drawn for it.
    expect([...document.querySelectorAll<HTMLElement>('.outputs-group')].map((group) => group.style.getPropertyValue('--tree-depth'))).toEqual([
      '0',
      '1',
      '1'
    ])
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
    expect(names()).toEqual(['architecture.md', 'prd.md', 'design.md', 'epics.md'])

    click(heading(PLAN))

    expect(heading(PLAN).getAttribute('aria-expanded')).toBe('false')
    expect(names()).toEqual(['design.md', 'epics.md'])
    expect(heading(TOP).getAttribute('aria-expanded')).toBe('true')
    expect(heading(UX).getAttribute('aria-expanded')).toBe('true')
    expect(kept.map((set) => [...set])).toEqual([[PLAN]])

    click(heading(PLAN))

    expect(names()).toEqual(['architecture.md', 'prd.md', 'design.md', 'epics.md'])
    expect(kept.map((set) => [...set])).toEqual([[PLAN], []])
  })

  it('hides the whole subtree on a parent fold, and keeps the folds inside it as they were', () => {
    show(SNAPSHOT, [PLAN])

    click(heading(TOP))

    // Nothing beneath the root is drawn: no subdirectory heading, no row.
    expect(headings().map((button) => button.textContent)).toEqual([TOP])
    expect(names()).toEqual([])
    expect(kept.map((set) => [...set].sort())).toEqual([[TOP, PLAN].sort()])

    click(heading(TOP))

    // planning-artifacts/ is still folded, and its open sibling still open.
    expect(heading(PLAN).getAttribute('aria-expanded')).toBe('false')
    expect(heading(UX).getAttribute('aria-expanded')).toBe('true')
    expect(names()).toEqual(['design.md', 'epics.md'])
    expect(kept.map((set) => [...set])).toEqual([[PLAN, TOP], [PLAN]])
  })

  it('keeps the folded rows out of the document, not merely hidden', () => {
    show(SNAPSHOT, [PLAN])

    expect(document.body.textContent).not.toContain('architecture.md')
    expect(document.body.textContent).not.toContain('prd.md')
    expect(document.querySelectorAll('.output-row')).toHaveLength(2)
    // The branch it controls is still there, empty and hidden, so aria-controls names something.
    const branch = document.getElementById(heading(PLAN).getAttribute('aria-controls') as string) as HTMLElement
    expect(branch.hidden).toBe(true)
    expect(branch.children).toHaveLength(0)
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

    it('moves a folded heading’s left arrow to its parent heading, and does nothing at the root', () => {
      show(SNAPSHOT, [PLAN])
      heading(PLAN).focus()

      const up = press(heading(PLAN), LEFT)
      expect(up.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(heading(TOP))
      expect(heading(TOP).tabIndex).toBe(0)

      // Fold the root, then the left arrow again: nowhere to go, nothing kept for it.
      press(heading(TOP), LEFT)
      expect(heading(TOP).getAttribute('aria-expanded')).toBe('false')
      press(heading(TOP), LEFT)
      expect(document.activeElement).toBe(heading(TOP))
      expect(kept.map((set) => [...set])).toEqual([[PLAN, TOP]])
    })

    it('moves a row’s left arrow to its parent heading', () => {
      show(SNAPSHOT)
      const epics = [...document.querySelectorAll<HTMLElement>('.output-row-button')].find((row) => labelOf(row) === 'epics.md') as HTMLElement
      const prd = [...document.querySelectorAll<HTMLElement>('.output-row-button')].find((row) => labelOf(row) === 'prd.md') as HTMLElement

      expect(press(prd, LEFT).defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(heading(PLAN))
      press(epics, LEFT)
      expect(document.activeElement).toBe(heading(TOP))
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
      expect(order.map(labelOf)).toEqual([TOP, 'planning-artifacts/', 'architecture.md', 'prd.md', 'ux/', 'design.md', 'epics.md'])

      const down = press(order[0], DOWN)
      expect(down.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(heading(PLAN))
      expect(stops()).toEqual(['heading planning-artifacts/'])
      press(heading(PLAN), DOWN)
      expect(document.activeElement).toBe(order[2])
      expect(stops()).toEqual(['row architecture.md'])
      press(order[2], UP)
      expect(document.activeElement).toBe(heading(PLAN))
    })

    it('skips the rows of a folded directory, and clamps at both ends of what is showing', () => {
      show(SNAPSHOT, [PLAN])

      press(heading(PLAN), DOWN)
      expect(document.activeElement).toBe(heading(UX))
      press(heading(UX), DOWN)
      expect(labelOf(document.activeElement)).toBe('design.md')
      press(document.activeElement as HTMLElement, DOWN)
      press(document.activeElement as HTMLElement, DOWN)
      expect(labelOf(document.activeElement)).toBe('epics.md')

      press(heading(TOP), UP)
      expect(document.activeElement).toBe(heading(TOP))
    })

    it('hands the tab stop to the heading that was toggled, so a fold never strands the stop on a row that went', () => {
      show(SNAPSHOT)
      const row = document.querySelectorAll<HTMLElement>('.output-row-button')[1]
      press(row, UP)
      press(document.activeElement as HTMLElement, UP)
      press(heading(PLAN), RIGHT)
      row.focus()

      click(heading(PLAN))

      expect(stops()).toEqual(['heading planning-artifacts/'])
    })

    it('opens a row’s document on a click, as before', () => {
      show(SNAPSHOT)

      click(document.querySelector('.output-row-button') as HTMLElement)

      expect(openDoc).toHaveBeenCalledWith(ARCH)
    })
  })
})

describe('a folded directory with a file changing', () => {
  it('shows the amber dot and the word changing on its heading, and nothing else of the row', () => {
    show(rail(saved(EPICS), changing(PRD, { annotation: { text: 'writing · §2 Goals', owner: { agentId: 'bmad-agent-pm' } } })), [PLAN])

    const live = heading(PLAN).querySelector('.folder-heading-live') as HTMLElement
    expect(live.textContent).toBe('changing')
    expect(live.querySelector('.status-dot--work')).not.toBeNull()
    expect(heading(PLAN).textContent).toBe('planning-artifacts/changing')
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
    // The root is open, so its two folded subdirectories are both drawn.
    const shown = show(rail(saved(EPICS), changing(PRD), saved(DESIGN)), [PLAN, UX])
    expect(document.querySelectorAll('.folder-heading-live')).toHaveLength(1)
    expect(heading(PLAN).querySelector('.folder-heading-live')).not.toBeNull()

    shown.rerender(rail(saved(EPICS), saved(PRD), saved(DESIGN)))
    expect(document.querySelector('.folder-heading-live')).toBeNull()
  })

  it('says it on the outermost folded heading only, from a file at any depth beneath it', () => {
    const X = `${TOP}x/`
    const shown = show(rail(saved(EPICS), changing(`${X}y/z.md`)), [TOP, X])

    expect(headings().map((button) => button.textContent)).toEqual([`${TOP}changing`])
    expect(document.querySelectorAll('.status-dot--work')).toHaveLength(1)

    // Unfold the root: x/ is still folded, and now it is the outermost, so it says it.
    click(heading(TOP))
    expect(heading(TOP).querySelector('.folder-heading-live')).toBeNull()
    expect(heading(X).textContent).toBe('x/changing')

    shown.rerender(rail(saved(EPICS), saved(`${X}y/z.md`)))
    expect(document.querySelector('.folder-heading-live')).toBeNull()
  })
})

describe('what arrives, changes and leaves while a directory is folded', () => {
  it('leaves it folded, and focus where it was, when a file arrives in it', () => {
    const scrolls = vi.fn()
    Element.prototype.scrollIntoView = scrolls
    const shown = show(rail(saved(EPICS), saved(PRD)), [PLAN])
    heading(PLAN).focus()

    shown.rerender(rail(saved(EPICS), saved(PRD), saved(ARCH), changing(`${PLAN}new.md`), changing(`${PLAN}deep/er/n.md`)))

    expect(heading(PLAN).getAttribute('aria-expanded')).toBe('false')
    expect(names()).toEqual(['epics.md'])
    expect(heading(PLAN).textContent).toBe('planning-artifacts/changing')
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
    expect(document.body.textContent).not.toContain('planning-artifacts/')
  })

  it('hands focus to the nearest heading still showing when the focused row leaves, and its directory with it', () => {
    const X = `${TOP}x/`
    const shown = show(rail(saved(EPICS), saved(`${X}y.md`)))
    const row = [...document.querySelectorAll<HTMLElement>('.output-row-button')].find((node) => labelOf(node) === 'y.md') as HTMLElement
    act(() => row.focus())

    shown.rerender(rail(saved(EPICS)))

    expect(heading(X)).toBeUndefined()
    expect(document.activeElement).toBe(heading(TOP))
    expect(heading(TOP).tabIndex).toBe(0)
  })

  it('hands focus to the parent heading when the focused heading leaves', () => {
    const X = `${TOP}x/`
    const shown = show(rail(saved(EPICS), saved(`${X}a/y.md`)))
    act(() => heading(`${X}a/`).focus())

    shown.rerender(rail(saved(EPICS), saved(`${X}z.md`)))

    expect(document.activeElement).toBe(heading(X))
  })

  it('hands focus to the list’s tab stop when no ancestor is left, and never leaves it on the page', () => {
    const shown = show(rail(saved(EPICS)))
    act(() => (document.querySelector('.output-row-button') as HTMLElement).focus())

    // The rail re-points to another folder (Story 5.4): the row and every heading above it go.
    shown.rerender({ revision: 2, folder: 'docs/out/', rows: [saved('docs/out/q.md')] })

    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement).toBe(heading('docs/out/'))
    expect(heading('docs/out/').tabIndex).toBe(0)
  })

  it('keeps the focused row through the window losing focus, and hands focus to its parent heading when the row leaves meanwhile', () => {
    const X = `${TOP}x/`
    const shown = show(rail(saved(EPICS), saved(`${X}y.md`), saved(`${X}z.md`)))
    const row = [...document.querySelectorAll<HTMLElement>('.output-row-button')].find((node) => labelOf(node) === 'y.md') as HTMLElement
    act(() => row.focus())
    // The app window goes to the background (the document window in front): a blur with nowhere to go.
    const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    act(() => void row.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null })))

    shown.rerender(rail(saved(EPICS), saved(`${X}z.md`)))

    expect(document.activeElement).toBe(heading(X))
    hasFocus.mockRestore()
  })

  it('takes back no focus the user moved out of the list', () => {
    const shown = show(rail(saved(EPICS), saved(PRD)))
    const outside = document.createElement('button')
    document.body.append(outside)
    const prd = [...document.querySelectorAll<HTMLElement>('.output-row-button')].find((node) => labelOf(node) === 'prd.md') as HTMLElement
    act(() => prd.focus())
    act(() => outside.focus())

    shown.rerender(rail(saved(EPICS)))

    expect(document.activeElement).toBe(outside)
    outside.remove()
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
    const GONE = `${TOP}gone/`
    const shown = show(rail(saved(EPICS), saved(PRD)), [GONE, PLAN])
    expect(names()).toEqual(['epics.md'])

    // Folding another directory keeps the entry for the one that is not there.
    click(heading(TOP))
    expect(new Set(kept.at(-1))).toEqual(new Set([GONE, PLAN, TOP]))
    click(heading(TOP))
    expect(new Set(kept.at(-1))).toEqual(new Set([GONE, PLAN]))

    // The directory returns, and is folded as it was.
    shown.rerender(rail(saved(EPICS), saved(PRD), saved(`${GONE}x.md`)))
    expect(headings().map((button) => button.textContent)).toEqual([TOP, 'gone/', 'planning-artifacts/'])
    expect(heading(GONE).getAttribute('aria-expanded')).toBe('false')
    expect(names()).toEqual(['epics.md'])
  })

  it('folds the directory a stored entry names when the window starts with it', () => {
    show(SNAPSHOT, [UX])

    expect(heading(UX).getAttribute('aria-expanded')).toBe('false')
    expect(names()).toEqual(['architecture.md', 'prd.md', 'epics.md'])
  })

  it('reads a set stored before the tree as it is: that heading folded, the rest open, entries it does not know ignored, nothing written', () => {
    show(rail(saved(EPICS), saved(PRD), saved(`${PLAN}ux-designs/mockups/x.html`), saved(DESIGN)), [PLAN, 'unknown/'])

    expect(heading(PLAN).getAttribute('aria-expanded')).toBe('false')
    expect(heading(TOP).getAttribute('aria-expanded')).toBe('true')
    expect(heading(UX).getAttribute('aria-expanded')).toBe('true')
    expect(names()).toEqual(['design.md', 'epics.md'])
    expect(kept).toEqual([])
  })
})

describe('kept through the bridge', () => {
  it('asks the bridge to keep the whole set, as an array of project-relative directories, on each toggle', () => {
    const setFolded = vi.fn()
    ;(window as unknown as { harness: unknown }).harness = {
      openDoc,
      onDocClosed: () => () => {},
      getLayout: () => ({ sidebar: null, rail: null, room: null, folded: ['gone/'] }),
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
    expect(names()).toEqual(['architecture.md', 'prd.md', 'epics.md'])
  })
})
