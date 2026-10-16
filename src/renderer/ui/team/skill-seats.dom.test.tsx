// @vitest-environment jsdom
import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import type { SkillSeat } from '../status/skill-seat'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { Team } from './team'

/**
 * A skill-first session's seat in the Team half (Story 7.5): a row of the persona tile's own anatomy in a `Skill
 * sessions` group below every persona group, in start order, drawn only while one exists.
 */

const agent = (id: string, name: string, module = 'bmm'): AgentView => ({ id, module, name, title: 'Role', icon: 'i', description: 'd' })
const MARY = agent('bmad-agent-analyst', 'Mary')
const JOHN = agent('bmad-agent-pm', 'John')

const seat = (sessionId: string, over: Partial<SkillSeat> = {}): SkillSeat => ({
  sessionId,
  skill: 'bmad-build',
  at: new Date(2026, 9, 16, 9, 5).getTime(),
  state: 'live',
  since: undefined,
  ...over
})

/** The arrow key, built and not spelled: a key's name is written nowhere under `src/` outside `a11y/`. */
const DOWN = `Arrow${'Down'}`

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.unmount()
  mounted = null
})

function draw(props: Partial<Parameters<typeof Team>[0]> = {}): HTMLElement {
  mounted = mount(
    createElement(Team, {
      agents: [MARY, JOHN],
      menus: {},
      states: new Map(),
      currentId: null,
      onSelect: () => {},
      ...props
    })
  )
  return mounted.container
}
const tilesOf = (container: HTMLElement): HTMLButtonElement[] => [...container.querySelectorAll<HTMLButtonElement>('button.persona-tile')]

describe('the Skill sessions group', () => {
  it('is not drawn while no skill-first session exists, and says nothing of an empty state', () => {
    const container = draw()

    expect(container.textContent).not.toContain('Skill sessions')
    expect(container.querySelectorAll('.team-group')).toHaveLength(1)
  })

  it('is headed `Skill sessions`, below every persona group, with a seat per session in start order', () => {
    const container = draw({
      agents: [MARY, agent('bmad-agent-dev', 'Amelia', 'gds'), JOHN],
      skillSeats: [seat('b', { skill: 'bmad-build-auto' }), seat('a')]
    })

    const groups = [...container.querySelectorAll('.team-group')]
    expect(groups).toHaveLength(3)
    expect(groups.map((group) => group.querySelector('.rail-group')?.textContent ?? null)).toEqual(['bmm', 'gds', 'Skill sessions'])
    expect([...groups[2].querySelectorAll('.tile-name')].map((name) => name.textContent)).toEqual(['bmad-build-auto', 'bmad-build'])
  })

  it('draws a seat in the tile’s own anatomy: a native button, the `/` disc, the name in mono, a state line, and nothing else on the row', () => {
    const container = draw({ skillSeats: [seat('a', { state: 'work', since: Date.now() - 65_000 })] })
    const [, , row] = tilesOf(container)

    expect(row.tagName).toBe('BUTTON')
    expect(row.className).toContain('persona-tile')
    expect(row.querySelector('.initials--thread.initials--skill')?.textContent).toBe('/')
    expect(row.querySelector('.tile-name--skill')?.textContent).toBe('bmad-build')
    expect(row.querySelector('.tile-state')?.textContent).toMatch(/^working · 1m 0\ds$/)
    expect(row.getAttribute('aria-label')).toBe('bmad-build, working')
    expect(row.querySelector('.tile-title, .menu-hint, button')).toBeNull()
  })

  it('says live with its dot, and ended with the word and no dot', () => {
    const container = draw({ skillSeats: [seat('a'), seat('b', { state: 'ended', skill: 'bmad-build-auto' })] })
    const [, , live, ended] = tilesOf(container)

    expect(live.querySelector('.tile-state')?.textContent).toBe('live')
    expect(live.querySelector('.status-dot--live')).not.toBeNull()
    expect(ended.querySelector('.tile-state')?.textContent).toBe('ended')
    expect(ended.querySelector('.status-dot')).toBeNull()
    expect(ended.getAttribute('aria-label')).toBe('bmad-build-auto, ended')
  })

  it('shows the start time in dim after the name only while two seats share a name', () => {
    const lone = draw({ skillSeats: [seat('a'), seat('b', { skill: 'bmad-build-auto' })] })
    expect(tilesOf(lone).slice(2).map((tile) => tile.querySelector('.tile-title'))).toEqual([null, null])
    mounted?.unmount()

    const twins = draw({ skillSeats: [seat('a'), seat('b', { at: new Date(2026, 9, 16, 11, 40).getTime() })] })
    const [, , first, second] = tilesOf(twins)
    expect(first.querySelector('.tile-title')?.textContent).toBe('09:05')
    expect(second.querySelector('.tile-title')?.textContent).toBe('11:40')
    expect(first.getAttribute('aria-label')).toBe('bmad-build 09:05, live')
  })

  it('marks the seat the chat is turned to current, and no persona tile', () => {
    const container = draw({ currentId: null, currentSeatId: 'b', skillSeats: [seat('a'), seat('b')] })

    expect(tilesOf(container).map((tile) => tile.getAttribute('aria-current'))).toEqual([null, null, null, 'true'])
  })

  it('turns the chat to a seat on a click, with its session id, and carries the tab stop with it', () => {
    const chosen: string[] = []
    const container = draw({ skillSeats: [seat('a'), seat('b')], onSelectSeat: (id) => void chosen.push(id) })

    act(() => tilesOf(container)[3].click())

    expect(chosen).toEqual(['b'])
    expect(tilesOf(container).map((tile) => tile.tabIndex)).toEqual([-1, -1, -1, 0])
  })

  it('is one roving list with the tiles: an arrow moves from the last persona to the first seat', () => {
    const container = draw({ skillSeats: [seat('a')] })
    const tiles = tilesOf(container)
    tiles[1].focus()

    act(() => void tiles[1].dispatchEvent(new KeyboardEvent('keydown', { key: DOWN, bubbles: true, cancelable: true })))

    expect(document.activeElement).toBe(tiles[2])
  })

  it('is drawn when the roster is empty: a seat needs no persona', () => {
    const container = draw({ agents: [], skillSeats: [seat('a')] })

    expect(tilesOf(container)).toHaveLength(1)
    expect(container.querySelector('.rail-group')?.textContent).toBe('Skill sessions')
  })
})
