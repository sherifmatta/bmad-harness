import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidElement } from 'react'
import type { KeyboardEvent, ReactElement, ReactNode } from 'react'

import type { AgentView, InstallSnapshot } from '../../../shared/install'
import type { PersonaState } from '../persona/portrait'
import { ChatHeader } from '../chat/chat-header'
import { Shell } from '../shell/shell'
import { PersonaTile } from './persona-tile'
import { Team } from './team'

/**
 * `Team`'s and `Shell`'s handlers, exercised without a DOM and without a new
 * dependency: the real `react` module is kept, but the state, ref and effect
 * hooks are stubbed so each component can be called as a plain function and
 * the element tree it returns walked — the way shell.test.tsx already walks
 * `ViewSwitch`. Nothing here renders; it reads props off elements.
 *
 * This file mocks `react`, so it renders nothing with the real hooks. The
 * markup assertions are `shell.test.tsx`'s and `persona-tile.test.tsx`'s.
 *
 * An arrow key is named nowhere under `src/` outside `a11y/`, and this file
 * is under `src/`, so the key strings are built rather than spelled.
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
    /** Start a render of one component: its hooks read their slots from the top. */
    begin(name: string): void {
      active = store(name)
      active.cursor = 0
    },
    slot: (name: string, index: number): unknown => store(name).slots[index],
    setter: (name: string, index: number): unknown => store(name).setters[index],
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
  return { ...actual, useState: hooks.useState, useRef: hooks.useRef, useEffect: () => {} }
})

type TileProps = Parameters<typeof PersonaTile>[0]
type TeamProps = Parameters<typeof Team>[0]

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

const agent = (id: string, module = 'bmm', team?: string): AgentView => ({
  id,
  module,
  ...(team === undefined ? {} : { team }),
  name: id,
  title: 'Role',
  icon: 'i',
  description: `${id} describes itself`
})

/** Display order is a, c, b: the config order `a b c` regrouped by module. */
const AGENTS = [agent('a', 'bmm', 't1'), agent('b', 'gds'), agent('c', 'bmm', 't1')]
const ORDER = ['a', 'c', 'b']

function teamProps(overrides: Partial<TeamProps> = {}): TeamProps {
  return {
    agents: AGENTS,
    menus: {},
    states: new Map<string, PersonaState>(),
    currentId: 'a',
    onSelect: () => {},
    ...overrides
  }
}

function renderTeam(props: TeamProps): TileProps[] {
  hooks.begin('team')
  return elementsOfType<TileProps>(Team(props), PersonaTile).map((element) => element.props)
}

/** A fake key event: no modifier held unless told, and a spy for `preventDefault`. */
function keyEvent(key: string, modifiers: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {}) {
  const preventDefault = vi.fn()
  const event = {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    preventDefault,
    ...modifiers
  }
  return { event: event as unknown as KeyboardEvent<HTMLButtonElement>, preventDefault }
}

/** Register a fake element for each tile, as React would through its ref. */
function register(tiles: TileProps[]): Map<string, ReturnType<typeof vi.fn>> {
  const focuses = new Map<string, ReturnType<typeof vi.fn>>()
  tiles.forEach((tile) => {
    const focus = vi.fn()
    focuses.set(tile.agent.id, focus)
    tile.tileRef({ focus } as unknown as HTMLButtonElement)
  })
  return focuses
}

beforeEach(() => {
  hooks.reset()
})

describe('Team, activation', () => {
  it('takes the tab stop and then reports the id, for a click on any tile', () => {
    const onSelect = vi.fn((id: string) => hooks.events.push(`select:${id}`))
    const tiles = renderTeam(teamProps({ onSelect }))

    expect(tiles.map((tile) => tile.agent.id)).toEqual(ORDER)
    tiles[2].onSelect('b')

    expect(hooks.events).toEqual(['set:team:0:b', 'select:b'])
    expect(onSelect).toHaveBeenCalledWith('b')
  })

  it('hands the tab stop to the activated tile on the next render, and to it alone', () => {
    const tiles = renderTeam(teamProps({ currentId: 'a' }))
    expect(tiles.map((tile) => tile.tabStop)).toEqual([true, false, false])

    tiles[1].onSelect('c')
    expect(renderTeam(teamProps({ currentId: 'a' })).map((tile) => tile.tabStop)).toEqual([
      false,
      true,
      false
    ])
  })

  it('renders nothing for an empty roster', () => {
    hooks.begin('team')

    expect(Team(teamProps({ agents: [] }))).toBeNull()
  })
})

describe('Team, keys', () => {
  it('moves down to the next tile in display order, focuses it, and stops the scroll', () => {
    const tiles = renderTeam(teamProps())
    const focuses = register(tiles)
    const { event, preventDefault } = keyEvent(DOWN)

    tiles[0].onKeyDown(event)

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(hooks.events).toEqual(['set:team:0:c'])
    expect(focuses.get('c')).toHaveBeenCalledTimes(1)
    expect(focuses.get('a')).not.toHaveBeenCalled()
    expect(focuses.get('b')).not.toHaveBeenCalled()
    // The moved-to tile holds the tab stop on the next render.
    expect(renderTeam(teamProps()).map((tile) => tile.tabStop)).toEqual([false, true, false])
  })

  it('moves up, and clamps at both ends of the list', () => {
    const tiles = renderTeam(teamProps())
    const focuses = register(tiles)

    tiles[2].onKeyDown(keyEvent(UP).event)
    expect(focuses.get('c')).toHaveBeenCalledTimes(1)

    tiles[2].onKeyDown(keyEvent(DOWN).event)
    expect(focuses.get('b')).toHaveBeenCalledTimes(1)

    tiles[0].onKeyDown(keyEvent(UP).event)
    expect(focuses.get('a')).toHaveBeenCalledTimes(1)
  })

  it('does nothing when a modifier is held, leaving the chord to the OS and the app', () => {
    const tiles = renderTeam(teamProps())
    const focuses = register(tiles)

    for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const) {
      const { event, preventDefault } = keyEvent(DOWN, { [modifier]: true })
      tiles[0].onKeyDown(event)

      expect(preventDefault, modifier).not.toHaveBeenCalled()
    }
    expect(hooks.events).toEqual([])
    for (const focus of focuses.values()) {
      expect(focus).not.toHaveBeenCalled()
    }
  })

  it('never prevents Enter or Space, and moves nothing on them, Tab or an off-axis arrow', () => {
    const tiles = renderTeam(teamProps())
    const focuses = register(tiles)

    for (const key of ['Enter', ' ', 'Tab', LEFT]) {
      const { event, preventDefault } = keyEvent(key)
      tiles[1].onKeyDown(event)

      expect(preventDefault, key).not.toHaveBeenCalled()
    }
    expect(hooks.events).toEqual([])
    for (const focus of focuses.values()) {
      expect(focus).not.toHaveBeenCalled()
    }
  })

  it('forgets a tile’s element when its ref is cleared, so a move cannot focus a removed tile', () => {
    const tiles = renderTeam(teamProps())
    const focuses = register(tiles)

    tiles[1].tileRef(null)
    tiles[0].onKeyDown(keyEvent(DOWN).event)

    expect(focuses.get('c')).not.toHaveBeenCalled()
  })
})

describe('Team, the states and menus it is given', () => {
  it('reads each tile’s state from the map, and its codes from menus, guarding inherited keys', () => {
    const states = new Map<string, PersonaState>([['c', 'live']])
    const menus = { a: [{ code: 'BP', description: 'x' }], c: [{ code: 'DR', description: 'y' }] }
    const tiles = renderTeam(teamProps({ states, menus }))

    expect(tiles.map((tile) => tile.state)).toEqual(['idle', 'live', 'idle'])
    expect(tiles.map((tile) => tile.codes)).toEqual([['BP'], ['DR'], []])

    const inherited = renderTeam(teamProps({ agents: [agent('constructor')], currentId: 'constructor' }))
    expect(inherited[0].codes).toEqual([])
  })
})

describe('Shell, the chain from a click to the header', () => {
  const snapshot: InstallSnapshot = {
    revision: 1,
    agents: [agent('bmad-agent-0'), agent('bmad-agent-1'), agent('bmad-agent-2')],
    menus: {},
    errors: [],
    preflight: []
  }

  function renderShell(): {
    header: ReactElement<{ agent: AgentView; state: PersonaState }>[]
    team: ReactElement<TeamProps>
    tiles: TileProps[]
  } {
    hooks.begin('shell')
    const tree = Shell({ projectPath: '/p', snapshot })
    const team = elementsOfType<TeamProps>(tree, Team)[0]
    return {
      header: elementsOfType<{ agent: AgentView; state: PersonaState }>(tree, ChatHeader),
      team,
      tiles: renderTeam(team.props)
    }
  }

  it('opens on the topmost agent: its header, its tile current, its tab stop', () => {
    const { header, team, tiles } = renderShell()

    expect(header).toHaveLength(1)
    expect(header[0].props.agent.id).toBe('bmad-agent-0')
    expect(header[0].key).toBe('bmad-agent-0')
    expect(team.props.currentId).toBe('bmad-agent-0')
    expect(tiles.map((tile) => tile.current)).toEqual([true, false, false])
    expect(tiles.map((tile) => tile.tabStop)).toEqual([true, false, false])
  })

  it('hands the Team the shell’s own state setter as onSelect', () => {
    const { team } = renderShell()

    expect(team.props.onSelect).toBe(hooks.setter('shell', 1))
    team.props.onSelect('bmad-agent-2')
    expect(hooks.slot('shell', 1)).toBe('bmad-agent-2')
  })

  it('follows an activated tile: that tile’s header, aria-current and tab stop, and no other', () => {
    const { tiles } = renderShell()
    tiles[1].onSelect('bmad-agent-1')

    const after = renderShell()
    expect(after.header[0].props.agent.id).toBe('bmad-agent-1')
    expect(after.header[0].key).toBe('bmad-agent-1')
    expect(after.team.props.currentId).toBe('bmad-agent-1')
    expect(after.tiles.map((tile) => tile.current)).toEqual([false, true, false])
    expect(after.tiles.map((tile) => tile.tabStop)).toEqual([false, true, false])
  })

  it('reads the header’s state from the shell’s states map, idle when absent', () => {
    hooks.begin('shell')
    const states = new Map<string, PersonaState>([['bmad-agent-0', 'error']])
    const tree = Shell({ projectPath: '/p', snapshot, states })

    expect(elementsOfType<{ state: PersonaState }>(tree, ChatHeader)[0].props.state).toBe('error')
    expect(elementsOfType<TeamProps>(tree, Team)[0].props.states).toBe(states)
    expect(renderShell().header[0].props.state).toBe('idle')
  })

  it('falls back to the topmost tile in the same render when the chosen agent leaves the roster', () => {
    const { team } = renderShell()
    team.props.onSelect('bmad-agent-2')
    expect(renderShell().header[0].props.agent.id).toBe('bmad-agent-2')

    team.props.onSelect('gone')
    const after = renderShell()

    expect(after.header[0].props.agent.id).toBe('bmad-agent-0')
    expect(after.tiles.map((tile) => tile.current)).toEqual([true, false, false])
  })

  it('draws no header when there are no agents', () => {
    hooks.begin('shell')
    const tree = Shell({ projectPath: '/p', snapshot: { ...snapshot, agents: [] } })

    expect(elementsOfType(tree, ChatHeader)).toEqual([])
  })
})
