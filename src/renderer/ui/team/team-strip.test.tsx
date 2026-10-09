import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AgentView, InstallSnapshot } from '../../../shared/install'
import type { PersonaState } from '../persona/portrait'
import { Shell } from '../shell/shell'
import { stripCounts, TeamStrip } from './team-strip'

const agent = (id: string): AgentView => ({
  id,
  module: 'bmm',
  team: 'software-development',
  name: id,
  title: 'Role',
  icon: 'i',
  description: 'd'
})

const roster = (...ids: string[]): AgentView[] => ids.map(agent)

const states = (entries: Record<string, PersonaState>): ReadonlyMap<string, PersonaState> => new Map(Object.entries(entries))

const render = (agents: readonly AgentView[], map: ReadonlyMap<string, PersonaState>): string =>
  renderToStaticMarkup(<TeamStrip agents={agents} states={map} />)

const figures = (markup: string): string[] => [...markup.matchAll(/team-strip-figure">(\d+)</g)].map(([, figure]) => figure as string)

describe('stripCounts', () => {
  it('counts the roster under four labels, in order: working, idle, error, changed', () => {
    expect(stripCounts(roster('a'), states({})).map((cell) => cell.label)).toEqual(['working', 'idle', 'error', 'changed'])
  })

  it('counts `live` under idle, with `idle` and the persona the map holds nothing for', () => {
    const counts = stripCounts(
      roster('a', 'b', 'c', 'd', 'e', 'f'),
      states({ a: 'work', b: 'live', c: 'idle', d: 'error', e: 'note' })
    )

    // `f` has no entry: it reads `idle`, as its tile does.
    expect(counts.map((cell) => cell.count)).toEqual([1, 3, 1, 1])
  })

  it('counts every persona once: the four figures add up to the roster', () => {
    const all = roster('a', 'b', 'c', 'd', 'e')
    const counts = stripCounts(all, states({ a: 'work', b: 'work', c: 'live', d: 'note', e: 'error' }))

    expect(counts.reduce((sum, cell) => sum + cell.count, 0)).toBe(all.length)
  })

  it('ignores a state held for a persona the roster does not name', () => {
    expect(stripCounts(roster('a'), states({ gone: 'work', a: 'error' })).map((cell) => cell.count)).toEqual([0, 0, 1, 0])
  })

  it('reads zeros for an empty roster', () => {
    expect(stripCounts([], states({ gone: 'work' })).map((cell) => cell.count)).toEqual([0, 0, 0, 0])
  })
})

describe('TeamStrip', () => {
  it('is four cells, each a figure over a label, and nothing else', () => {
    const markup = render(roster('a', 'b'), states({ a: 'work' }))

    expect(markup.match(/class="team-strip-cell"/g)).toHaveLength(4)
    expect(figures(markup)).toEqual(['1', '1', '0', '0'])
    expect([...markup.matchAll(/team-strip-label">([^<]+)</g)].map(([, label]) => label)).toEqual([
      'working',
      'idle',
      'error',
      'changed'
    ])
    expect(markup).not.toMatch(/<button|<a |<input|tabindex/i)
  })

  it('takes no accent, fill, badge or announcement: plain text with classes and nothing else', () => {
    const markup = render(roster('a'), states({ a: 'error' }))

    // Spelled in two halves: accessibility.test.ts counts the bare attribute across src/.
    expect(markup).not.toContain(`aria-${'live'}`)
    expect(markup).not.toMatch(/role="(?:status|alert)"|style=|badge|accent/i)
  })

  it('follows the states as they change, and is a function of them alone', () => {
    const agents = roster('a', 'b')

    expect(figures(render(agents, states({})))).toEqual(['0', '2', '0', '0'])
    expect(figures(render(agents, states({ a: 'work', b: 'work' })))).toEqual(['2', '0', '0', '0'])
    expect(figures(render(agents, states({ a: 'live', b: 'note' })))).toEqual(['0', '1', '0', '1'])
    expect(render(agents, states({ a: 'work' }))).toBe(render(agents, states({ a: 'work' })))
  })
})

describe('the strip in the Shell’s sidebar', () => {
  const snapshot = (count: number): InstallSnapshot => ({
    revision: 1,
    agents: Array.from({ length: count }, (_, index) => agent(`bmad-agent-${index}`)),
    menus: {},
    errors: [],
    preflight: []
  })
  const markup = (map: ReadonlyMap<string, PersonaState>, count = 4): string =>
    renderToStaticMarkup(<Shell projectPath="/work/falcon" snapshot={snapshot(count)} states={map} />)
  const sidebarOf = (html: string): string => html.slice(html.indexOf('<div class="sidebar"'), html.indexOf('<div class="chat">'))

  it('sits between the Team head and the tiles, in the sidebar and nowhere else', () => {
    const html = markup(states({ 'bmad-agent-1': 'work' }))
    const sidebar = sidebarOf(html)

    expect(sidebar.indexOf('>Team</h3>')).toBeLessThan(sidebar.indexOf('class="team-strip"'))
    expect(sidebar.indexOf('class="team-strip"')).toBeLessThan(sidebar.indexOf('class="team-list"'))
    expect(html.match(/class="team-strip"/g)).toHaveLength(1)
    expect(figures(sidebar)).toEqual(['1', '3', '0', '0'])
  })

  it('leaves the tiles in config order whatever their states, and groups none by state', () => {
    const order = (html: string): string[] => [...html.matchAll(/persona-tile[^>]*>.*?tile-name">([^<]+)</g)].map(([, name]) => name as string)
    const idle = order(sidebarOf(markup(states({}))))
    const busy = order(sidebarOf(markup(states({ 'bmad-agent-0': 'idle', 'bmad-agent-1': 'error', 'bmad-agent-2': 'work', 'bmad-agent-3': 'note' }))))

    expect(idle).toEqual(['bmad-agent-0', 'bmad-agent-1', 'bmad-agent-2', 'bmad-agent-3'])
    expect(busy).toEqual(idle)
  })

  it('reads zeros, and no tile list, for an empty roster', () => {
    const sidebar = sidebarOf(markup(states({}), 0))

    expect(figures(sidebar)).toEqual(['0', '0', '0', '0'])
    expect(sidebar).not.toContain('team-list')
  })
})
