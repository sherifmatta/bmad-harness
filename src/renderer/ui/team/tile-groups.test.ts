import { describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import { currentAgent, displayOrder, groupAgents, showsHeadings } from './tile-groups'

const agent = (id: string, module: string, team?: string, name = id): AgentView => ({
  id,
  module,
  ...(team === undefined ? {} : { team }),
  name,
  title: 'Role',
  icon: 'i',
  description: 'd'
})

const ids = (agents: readonly AgentView[]): string[] => agents.map(({ id }) => id)

describe('groupAgents', () => {
  it('is one group with no heading rule triggered when every agent shares module and team', () => {
    const agents = ['a', 'b', 'c', 'd', 'e'].map((id) => agent(id, 'bmm', 'software-development'))
    const groups = groupAgents(agents)

    expect(groups).toHaveLength(1)
    expect(groups[0].heading).toBe('bmm · software-development')
    expect(ids(displayOrder(groups))).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(showsHeadings(groups)).toBe(false)
  })

  it('groups by (module, team) in first-appearance order, config order inside each group', () => {
    const groups = groupAgents([
      agent('a', 'bmm', 't1'),
      agent('b', 'gds'),
      agent('c', 'bmm', 't1'),
      agent('d', 'bmm', 't2')
    ])

    expect(groups.map(({ heading }) => heading)).toEqual(['bmm · t1', 'gds', 'bmm · t2'])
    expect(groups.map(({ agents }) => ids(agents))).toEqual([['a', 'c'], ['b'], ['d']])
    expect(ids(displayOrder(groups))).toEqual(['a', 'c', 'b', 'd'])
    expect(showsHeadings(groups)).toBe(true)
  })

  it('headings read module alone when team is absent, or empty', () => {
    expect(groupAgents([agent('a', 'gds')])[0].heading).toBe('gds')
    expect(groupAgents([agent('a', 'gds', '')])[0].heading).toBe('gds')
    // An empty team is an absent one: the two share a group.
    expect(groupAgents([agent('a', 'gds'), agent('b', 'gds', '')])).toHaveLength(1)
  })

  it('treats a whitespace-only team as absent, and heads a padded team by its trimmed text', () => {
    expect(groupAgents([agent('a', 'gds', '   ')])[0].heading).toBe('gds')
    expect(groupAgents([agent('a', 'gds'), agent('b', 'gds', ' \t ')])).toHaveLength(1)

    const groups = groupAgents([agent('a', 'bmm', ' t1 '), agent('b', 'bmm', 't1')])
    expect(groups).toHaveLength(1)
    expect(groups[0].heading).toBe('bmm · t1')
  })

  it('keeps a module apart from the same module with a team', () => {
    const groups = groupAgents([agent('a', 'bmm'), agent('b', 'bmm', 'x')])

    expect(groups.map(({ heading }) => heading)).toEqual(['bmm', 'bmm · x'])
  })

  it('never sorts by name, id or module: reverse-alphabetical input stays reverse-alphabetical', () => {
    const agents = ['zed', 'yan', 'xia', 'wu'].map((name) => agent(`id-${name}`, 'bmm', 't', name))

    expect(ids(displayOrder(groupAgents(agents)))).toEqual(['id-zed', 'id-yan', 'id-xia', 'id-wu'])

    const modules = [agent('a', 'zzz'), agent('b', 'aaa')]
    expect(groupAgents(modules).map(({ heading }) => heading)).toEqual(['zzz', 'aaa'])
  })

  it('does not mutate its input and is stable across calls', () => {
    const agents = [agent('a', 'bmm'), agent('b', 'gds'), agent('c', 'bmm')]
    const before = JSON.stringify(agents)
    const first = groupAgents(agents)

    expect(JSON.stringify(agents)).toBe(before)
    expect(groupAgents(agents)).toEqual(first)
  })

  it('is empty for no agents, with no headings to show', () => {
    expect(groupAgents([])).toEqual([])
    expect(displayOrder([])).toEqual([])
    expect(showsHeadings([])).toBe(false)
  })

  it('shows headings only from two groups', () => {
    expect(showsHeadings(groupAgents([agent('a', 'x')]))).toBe(false)
    expect(showsHeadings(groupAgents([agent('a', 'x'), agent('b', 'y')]))).toBe(true)
  })
})

describe('currentAgent', () => {
  const order = ['a', 'b', 'c'].map((id) => agent(id, 'bmm'))

  it('is nobody when nobody has been chosen (Story 7.5)', () => {
    expect(currentAgent(order, null)).toBeNull()
  })

  it('is the chosen agent while the roster still holds it, and changes when another is chosen', () => {
    expect(currentAgent(order, 'b')?.id).toBe('b')
    expect(currentAgent(order, 'c')?.id).toBe('c')
  })

  it('is nobody when a roster change drops the chosen agent, and falls back to no tile', () => {
    const after = order.filter(({ id }) => id !== 'b')

    expect(currentAgent(after, 'b')).toBeNull()
    expect(currentAgent(order, 'gone')).toBeNull()
  })

  it('is nobody when there are no agents', () => {
    expect(currentAgent([], 'a')).toBeNull()
    expect(currentAgent([], null)).toBeNull()
  })
})
