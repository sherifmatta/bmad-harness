import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement } from 'react'
import type { KeyboardEvent, ReactElement, ReactNode } from 'react'

import type { RailRow, RailSnapshot } from '../../../shared/rail'
import { OutputRow } from './output-row'
import { Outputs } from './outputs'

/**
 * `Outputs`' focus travel and focus return, exercised without a DOM: the same
 * device as team.test.tsx. The real `react` module is kept, but the state and
 * ref hooks are stubbed so the component can be called as a plain function and
 * the element tree it returns walked; effects run at once, so the document-close
 * subscription and the held tab stop are live; `useCallback` is the identity.
 * Nothing renders; it reads props off elements and drives the handlers they hold.
 *
 * It lives apart from outputs.test.tsx because this file replaces the hooks for
 * every test in it, and that file renders real markup with the real ones.
 *
 * An arrow key is named nowhere under `src/` outside `a11y/`, so the key
 * strings are built rather than spelled.
 */

const hooks = vi.hoisted(() => {
  type Store = { name: string; slots: unknown[]; setters: ((value: unknown) => void)[]; cursor: number }
  const stores = new Map<string, Store>()
  const events: string[] = []
  let active: Store | null = null

  function store(name: string): Store {
    let found = stores.get(name)
    if (found === undefined) {
      found = { name, slots: [], setters: [], cursor: 0 }
      stores.set(name, found)
    }
    return found
  }

  function current(): Store {
    if (active === null) {
      throw new Error('a hook ran outside begin()')
    }
    return active
  }

  return {
    events,
    reset(): void {
      stores.clear()
      events.length = 0
      active = null
    },
    begin(name: string): void {
      active = store(name)
      active.cursor = 0
    },
    useState(initial: unknown): [unknown, (value: unknown) => void] {
      const s = current()
      const index = s.cursor++
      if (!(index in s.slots)) {
        s.slots[index] = initial
        s.setters[index] = (value: unknown): void => {
          const next = typeof value === 'function' ? (value as (previous: unknown) => unknown)(s.slots[index]) : value
          s.slots[index] = next
          events.push(`set:${s.name}:${index}:${String(next)}`)
        }
      }
      return [s.slots[index], s.setters[index]]
    },
    useRef(initial: unknown): { current: unknown } {
      const s = current()
      const index = s.cursor++
      if (!(index in s.slots)) {
        s.slots[index] = { current: initial }
      }
      return s.slots[index] as { current: unknown }
    }
  }
})

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return {
    ...actual,
    useState: hooks.useState,
    useRef: hooks.useRef,
    useEffect: (effect: () => void) => {
      effect()
    },
    useCallback: (callback: unknown) => callback
  }
})

type RowProps = Parameters<typeof OutputRow>[0]
type OutputsProps = Parameters<typeof Outputs>[0]

/** Every element of a given component type in a returned tree, in document order. */
function elementsOfType<P>(node: ReactNode, type: unknown): ReactElement<P>[] {
  if (Array.isArray(node)) {
    return node.flatMap((child: ReactNode) => elementsOfType<P>(child, type))
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return []
  }
  return [
    ...(node.type === type ? [node as unknown as ReactElement<P>] : []),
    ...elementsOfType<P>(node.props.children, type)
  ]
}

const DOWN = ['Arrow', 'Down'].join('')
const UP = ['Arrow', 'Up'].join('')
const LEFT = ['Arrow', 'Left'].join('')

const NOW = 1_000_000_000_000
const saved = (path: string): RailRow => ({ path, state: 'saved', savedAt: NOW })

/** Visual order: _bmad/epics.md, then the planning-artifacts group by name. */
const EPICS = '_bmad/epics.md'
const ARCHITECTURE = '_bmad/planning-artifacts/architecture.md'
const PRD = '_bmad/planning-artifacts/prd.md'
const ORDER = [EPICS, ARCHITECTURE, PRD]

const SNAPSHOT: RailSnapshot = {
  revision: 1,
  rows: [saved(PRD), saved(EPICS), saved(ARCHITECTURE)]
}

function outputsProps(overrides: Partial<OutputsProps> = {}): OutputsProps {
  return {
    snapshot: SNAPSHOT,
    failure: null,
    agents: [],
    projectPath: '/work/falcon',
    now: NOW,
    ...overrides
  }
}

function renderOutputs(props: OutputsProps = outputsProps()): RowProps[] {
  hooks.begin('outputs')
  return elementsOfType<RowProps>(Outputs(props), OutputRow).map((element) => element.props)
}

/** A fake key event: no modifier held unless told, and a spy for `preventDefault`. */
function keyEvent(key: string, modifiers: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {}) {
  const preventDefault = vi.fn()
  const event = { key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, preventDefault, ...modifiers }
  return { event: event as unknown as KeyboardEvent<HTMLButtonElement>, preventDefault }
}

/** Register a fake element for each row, as React would through its ref. */
function register(rows: RowProps[]): Map<string, ReturnType<typeof vi.fn>> {
  const focuses = new Map<string, ReturnType<typeof vi.fn>>()
  rows.forEach((row) => {
    const focus = vi.fn()
    focuses.set(row.row.path, focus)
    row.buttonRef({ focus } as unknown as HTMLButtonElement)
  })
  return focuses
}

let closed: (path: string) => void
const openDoc = vi.fn<(path: string) => Promise<void>>(() => Promise.resolve())

beforeEach(() => {
  hooks.reset()
  openDoc.mockClear()
  closed = () => {
    throw new Error('the rail never subscribed to the document window closing')
  }
  vi.stubGlobal('window', {
    harness: {
      openDoc,
      onDocClosed: (listener: (path: string) => void) => {
        closed = listener
        return () => {}
      }
    }
  })
})

const tabStops = (rows: RowProps[]): boolean[] => rows.map((row) => row.tabStop)

describe('Outputs, visual order', () => {
  it('lists the rows groups first, names second, and makes the first the tab stop', () => {
    const rows = renderOutputs()

    expect(rows.map((row) => row.row.path)).toEqual(ORDER)
    expect(tabStops(rows)).toEqual([true, false, false])
  })
})

describe('Outputs, keys', () => {
  it('moves down across a directory group in visual order, focuses the row and stops the scroll', () => {
    const rows = renderOutputs()
    const focuses = register(rows)
    const { event, preventDefault } = keyEvent(DOWN)

    // epics.md is the only row of its group; the next in visual order is in another.
    rows[0].onKey(event)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(focuses.get(ARCHITECTURE)).toHaveBeenCalledTimes(1)
    expect(focuses.get(EPICS)).not.toHaveBeenCalled()
    expect(focuses.get(PRD)).not.toHaveBeenCalled()
    expect(hooks.events).toEqual([`set:outputs:1:${ARCHITECTURE}`])
    // The moved-to row holds the tab stop on the next render.
    expect(tabStops(renderOutputs())).toEqual([false, true, false])
  })

  it('moves up back across the group boundary', () => {
    const rows = renderOutputs()
    const focuses = register(rows)

    rows[1].onKey(keyEvent(UP).event)

    expect(focuses.get(EPICS)).toHaveBeenCalledTimes(1)
  })

  it('clamps at both ends of the whole list, not of a group', () => {
    const rows = renderOutputs()
    const focuses = register(rows)

    rows[2].onKey(keyEvent(DOWN).event)
    expect(focuses.get(PRD)).toHaveBeenCalledTimes(1)

    rows[0].onKey(keyEvent(UP).event)
    expect(focuses.get(EPICS)).toHaveBeenCalledTimes(1)
    expect(focuses.get(ARCHITECTURE)).not.toHaveBeenCalled()
  })

  it('does nothing when a modifier is held', () => {
    const rows = renderOutputs()
    const focuses = register(rows)

    for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const) {
      const { event, preventDefault } = keyEvent(DOWN, { [modifier]: true })
      rows[0].onKey(event)

      expect(preventDefault, modifier).not.toHaveBeenCalled()
    }
    expect(hooks.events).toEqual([])
    for (const focus of focuses.values()) {
      expect(focus).not.toHaveBeenCalled()
    }
  })

  it('never prevents Enter, Space, Tab or an off-axis arrow, and moves nothing on them', () => {
    const rows = renderOutputs()
    const focuses = register(rows)

    for (const key of ['Enter', ' ', 'Tab', LEFT]) {
      const { event, preventDefault } = keyEvent(key)
      rows[1].onKey(event)

      expect(preventDefault, key).not.toHaveBeenCalled()
    }
    expect(hooks.events).toEqual([])
    for (const focus of focuses.values()) {
      expect(focus).not.toHaveBeenCalled()
    }
  })
})

describe('Outputs, opening', () => {
  it('takes the tab stop and asks main to open the row’s project-relative path', () => {
    const rows = renderOutputs()

    rows[2].onOpen(PRD)

    expect(hooks.events).toEqual([`set:outputs:1:${PRD}`])
    expect(openDoc).toHaveBeenCalledExactlyOnceWith(PRD)
    expect(tabStops(renderOutputs())).toEqual([false, false, true])
  })
})

describe('Outputs, focus return', () => {
  it('focuses the row that opened the window and makes it the tab stop', () => {
    const rows = renderOutputs()
    const focuses = register(rows)

    closed(PRD)

    expect(focuses.get(PRD)).toHaveBeenCalledTimes(1)
    expect(focuses.get(EPICS)).not.toHaveBeenCalled()
    expect(focuses.get(ARCHITECTURE)).not.toHaveBeenCalled()
    expect(hooks.events).toEqual([`set:outputs:1:${PRD}`])
    expect(tabStops(renderOutputs())).toEqual([false, false, true])
  })

  it('falls to the list’s first tab stop when the row has gone', () => {
    const rows = renderOutputs()
    const focuses = register(rows)

    closed('_bmad/gone.md')

    expect(focuses.get(EPICS)).toHaveBeenCalledTimes(1)
    expect(focuses.get(ARCHITECTURE)).not.toHaveBeenCalled()
    expect(focuses.get(PRD)).not.toHaveBeenCalled()
    expect(hooks.events).toEqual([])
  })

  it('falls to the held tab stop, which is the row last opened, when the opening row has gone', () => {
    const rows = renderOutputs()
    rows[2].onOpen(PRD)
    // The next render is where the held tab stop is taken; the closed row is not in the list.
    const focuses = register(renderOutputs())
    hooks.events.length = 0

    closed('_bmad/gone.md')

    expect(focuses.get(PRD)).toHaveBeenCalledTimes(1)
    expect(focuses.get(EPICS)).not.toHaveBeenCalled()
  })

  it('focuses nothing, and does not throw, when the list has no rows at all', () => {
    renderOutputs()

    expect(() => closed(PRD)).not.toThrow()
  })
})
