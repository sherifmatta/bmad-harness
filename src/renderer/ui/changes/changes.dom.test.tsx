// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChangeRow, ChangesSnapshot } from '../../../shared/changes'
import { INERT_LAYOUT, LayoutContext } from '../layout/layout-context'
import type { LayoutContextValue } from '../layout/layout-context'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { Changes, changesLine, changesTree, CHANGES_CAP } from './changes'

/**
 * The Changes half (Story 9.3), mounted: its one-line states, its rows, its cap, its own folded set,
 * its keys and its focus hand-off. The tree's pure parts are row-groups.test.ts's.
 */

const list = (...rows: ChangeRow[]): ChangesSnapshot => ({ kind: 'list', rows, revision: 2, root: 'bmad-harness' })

let view: Mounted | null
let push: (snapshot: ChangesSnapshot) => void
let keptChanges: ReadonlySet<string>[]
let keptOutputs: ReadonlySet<string>[]
let openDoc: ReturnType<typeof vi.fn>

beforeEach(() => {
  view = null
  keptChanges = []
  keptOutputs = []
  openDoc = vi.fn(() => Promise.resolve())
  ;(window as unknown as { harness: unknown }).harness = { openDoc, onDocClosed: () => () => {} }
})

afterEach(() => {
  view?.unmount()
  delete (window as unknown as { harness?: unknown }).harness
})

/** A window that holds the Changes folded set, as `App` does, and records each set it is asked to keep. */
function Holding({ snapshot, initial = [] }: { snapshot: ChangesSnapshot | null; initial?: string[] }): ReactElement {
  const [changesFolded, setChangesFolded] = useState<ReadonlySet<string>>(new Set(initial))
  const [shown, setShown] = useState(snapshot)
  useEffect(() => {
    push = setShown
  }, [setShown])
  const value: LayoutContextValue = {
    ...INERT_LAYOUT,
    saveFolded: (next) => void keptOutputs.push(new Set(next)),
    changesFolded,
    saveChangesFolded: (next) => {
      keptChanges.push(new Set(next))
      setChangesFolded(new Set(next))
    }
  }
  return createElement(LayoutContext.Provider, { value }, createElement(Changes, { snapshot: shown, failure: null }))
}

function show(snapshot: ChangesSnapshot | null, initial: string[] = []): { rerender(next: ChangesSnapshot): void } {
  view = mount(createElement(Holding, { snapshot, initial }))
  return { rerender: (next) => act(() => push(next)) }
}

const text = (): string => view?.container.textContent ?? ''
const headings = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('.folder-heading')]
const heading = (name: string): HTMLButtonElement => headings().find((button) => button.textContent === name) as HTMLButtonElement
const rows = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('.change-row-button')]
const row = (label: string): HTMLButtonElement => rows().find((button) => button.getAttribute('aria-label') === label) as HTMLButtonElement
const click = (target: HTMLElement): void => act(() => void target.click())
const LEFT = 'Arrow' + 'Left'
const DOWN = 'Arrow' + 'Down'

function press(target: HTMLElement, key: string): void {
  act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
}

describe('the one-line states', () => {
  it('draws nothing at all while reading, or before the first snapshot', () => {
    show({ kind: 'reading', revision: 1, root: 'p' })
    expect(view?.container.innerHTML).toBe('')
    view?.unmount()
    show(null)
    expect(view?.container.innerHTML).toBe('')
  })

  it.each([
    [list(), 'no uncommitted changes'],
    [{ kind: 'not-repo', revision: 2, root: 'p' }, 'not a git repository'],
    [{ kind: 'no-git', revision: 2, root: 'p' }, 'git not available'],
    [{ kind: 'failed', reason: 'git exit 128', revision: 2, root: 'p' }, 'changes not read · git exit 128'],
    [{ kind: 'failed', reason: 'too slow', revision: 2, root: 'p' }, 'changes not read · too slow']
  ] as [ChangesSnapshot, string][])('says exactly one line, and offers no action, for %o', (snapshot, line) => {
    show(snapshot)
    expect([...document.querySelectorAll('.changes-line')].map((node) => node.textContent)).toEqual([line])
    expect(document.querySelector('button')).toBeNull()
    expect(changesLine(snapshot)).toBe(line)
  })
})

describe('a bridge failure', () => {
  it('draws the envelope through the shared error line when there is no snapshot', () => {
    view = mount(
      createElement(Changes, {
        snapshot: null,
        failure: { code: 'changes/unexpected', message: 'changes · unexpected failure' }
      })
    )

    expect(document.querySelector('.changes-failure')?.textContent).toContain('changes · unexpected failure')
    expect(document.querySelector('.changes-line')).toBeNull()
  })
})

describe('the rows', () => {
  const SNAPSHOT = list(
    { path: 'src/a.ts', state: 'modified' },
    { path: 'src/gone.ts', state: 'deleted' },
    { path: 'docs/new.md', state: 'renamed', from: 'docs/old/name.md' },
    { path: 'README.md', state: 'added' },
    { path: 'scratch/', state: 'untracked', directory: true },
    { path: 'x.ts', state: 'conflicted' }
  )

  it('draws the tree rooted at the project folder’s name, with no state colour, badge or count', () => {
    show(SNAPSHOT)

    expect(headings().map((button) => button.textContent)).toEqual(['bmad-harness/', 'docs/', 'src/'])
    expect(headings()[0]?.title).toBe('bmad-harness/')
    expect(headings()[1]?.title).toBe('docs/')
    expect(rows().map((button) => button.querySelector('.change-row-name')?.textContent)).toEqual([
      'new.md',
      'a.ts',
      'gone.ts',
      'README.md',
      'scratch/',
      'x.ts'
    ])
    expect(rows().map((button) => button.querySelector('.change-row-state')?.textContent)).toEqual([
      'renamed · from name.md',
      'modified',
      'deleted',
      'added',
      'untracked',
      'conflicted'
    ])
    expect(document.querySelector('.status-dot, .folder-heading-live')).toBeNull()
    expect(text()).not.toMatch(/\b\d+ (?:files?|changes?)\b/)
  })

  it('names each row `<name>, <state>` and describes it by its path; a deleted row says it opens nothing', () => {
    show(SNAPSHOT)

    expect(row('a.ts, modified').title).toBe('src/a.ts')
    expect(row('new.md, renamed · from name.md').title).toBe('docs/new.md')
    expect(row('gone.ts, deleted').title).toBe('deleted · nothing to open')
    expect(row('gone.ts, deleted').closest('li')?.className).toContain('change-row--deleted')
  })

  it('opens a row’s path unchanged, and opens nothing for a deleted row or a directory row', () => {
    show(SNAPSHOT)

    click(row('a.ts, modified'))
    click(row('gone.ts, deleted'))
    click(row('scratch/, untracked'))
    press(row('README.md, added'), 'Enter')
    click(row('README.md, added'))

    expect(openDoc.mock.calls).toEqual([['src/a.ts'], ['README.md']])
  })

  it('announces nothing: no live region in the half', () => {
    show(SNAPSHOT)
    // Spelled in pieces: accessibility.test.ts counts the bare attribute across src/, and this file is no live region.
    expect(view?.container.innerHTML).not.toMatch(new RegExp(`aria-${'live'}|role="(?:status|${'al'}ert)"`))
  })
})

describe('the cap', () => {
  it('draws the first 500 rows in tree order, then a plain line for the rest, which is no control', () => {
    const many: ChangeRow[] = Array.from({ length: 620 }, (_, n) => ({
      path: `d${String(n % 5)}/f${String(n).padStart(3, '0')}.ts`,
      state: 'untracked'
    }))
    show(list(...many))

    expect(CHANGES_CAP).toBe(500)
    expect(rows()).toHaveLength(500)
    const more = document.querySelector('.changes > .changes-line')
    expect(more?.tagName).toBe('P')
    expect(more?.textContent).toBe('+120 more not listed')
    expect(changesTree(many, 'p').more).toBe(120)
    // Tree order: every row of d0/ before any of d1/.
    expect(rows()[0]?.title).toBe('d0/f000.ts')
    expect(rows()[123]?.title).toBe('d0/f615.ts')
    expect(rows()[124]?.title).toBe('d1/f001.ts')
  })
})

describe('folding, with a set of its own', () => {
  const SNAPSHOT = list({ path: 'src/a.ts', state: 'modified' }, { path: 'src/ui/b.tsx', state: 'added' }, { path: 'c.md', state: 'added' })

  it('folds a heading through the Changes set alone, hiding its subtree and keeping the folds inside it', () => {
    show(SNAPSHOT, ['src/ui/'])

    click(heading('src/'))
    expect(keptChanges.map((set) => [...set])).toEqual([['src/ui/', 'src/']])
    expect(keptOutputs).toEqual([])
    expect(rows().map((button) => button.title)).toEqual(['c.md'])

    click(heading('src/'))
    expect(heading('ui/').getAttribute('aria-expanded')).toBe('false')
    expect(rows().map((button) => button.title)).toEqual(['src/a.ts', 'c.md'])
  })

  it('folds the root heading by its own key, and a row arriving under a fold unfolds nothing', () => {
    const { rerender } = show(SNAPSHOT, [''])
    expect(rows()).toEqual([])
    rerender(list({ path: 'src/a.ts', state: 'modified' }, { path: 'new.ts', state: 'untracked' }))
    expect(rows()).toEqual([])
    expect(headings().map((button) => button.getAttribute('aria-expanded'))).toEqual(['false'])
  })
})

describe('the keys and the focus', () => {
  const SNAPSHOT = list({ path: 'src/a.ts', state: 'modified' }, { path: 'src/b.ts', state: 'modified' }, { path: 'c.md', state: 'added' })

  it('is one roving tab stop, the first heading, with ↓ travel and ← to the parent heading', () => {
    show(SNAPSHOT)
    const stops = (): string[] =>
      [...document.querySelectorAll<HTMLButtonElement>('.changes button')].filter((b) => b.tabIndex === 0).map((b) => b.textContent ?? '')
    expect(stops()).toEqual(['bmad-harness/'])

    act(() => heading('bmad-harness/').focus())
    press(heading('bmad-harness/'), DOWN)
    expect(document.activeElement).toBe(heading('src/'))
    press(heading('src/'), DOWN)
    expect(document.activeElement).toBe(row('a.ts, modified'))
    press(row('a.ts, modified'), LEFT)
    expect(document.activeElement).toBe(heading('src/'))
    press(heading('src/'), LEFT)
    expect(heading('src/').getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(heading('src/'))
  })

  it('hands a focused row that leaves to its parent heading, and never to the page', () => {
    const { rerender } = show(SNAPSHOT)
    act(() => row('a.ts, modified').focus())

    rerender(list({ path: 'src/b.ts', state: 'modified' }, { path: 'c.md', state: 'added' }))
    expect(document.activeElement).toBe(heading('src/'))

    rerender(list({ path: 'c.md', state: 'added' }))
    expect(document.activeElement).toBe(heading('bmad-harness/'))
  })

  it.each([
    ['everything committed', list(), 'no uncommitted changes'],
    ['a failed read', { kind: 'failed', reason: 'too slow', revision: 3, root: 'bmad-harness' } as ChangesSnapshot, 'changes not read · too slow'],
    ['no repository any more', { kind: 'not-repo', revision: 3, root: 'bmad-harness' } as ChangesSnapshot, 'not a git repository']
  ])('keeps the focus in the half, on its one line, when the whole list goes: %s', (_name, next, line) => {
    const { rerender } = show(SNAPSHOT)
    act(() => row('a.ts, modified').focus())

    rerender(next)

    const held = document.querySelector<HTMLElement>('.changes-line')
    expect(held?.textContent).toBe(line)
    expect(document.activeElement).toBe(held)
    expect(held?.tabIndex).toBe(-1)
  })

  it('leaves a focus the user took elsewhere where it is', () => {
    const { rerender } = show(SNAPSHOT)
    const outside = document.createElement('button')
    document.body.append(outside)
    act(() => row('c.md, added').focus())
    act(() => outside.focus())
    rerender(list({ path: 'src/a.ts', state: 'modified' }))
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })
})
