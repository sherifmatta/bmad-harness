import { describe, expect, it } from 'vitest'
import type { AgentView } from '../../../shared/install'
import { handoffTarget } from './handoff-target'

const agent = (id: string, name: string): AgentView => ({
  id,
  module: 'bmm',
  name,
  title: 'Role',
  icon: 'i',
  description: 'd'
})
const mary = agent('bmad-agent-analyst', 'Mary')
const bob = agent('bmad-agent-pm', 'Bob')
const amelia = agent('bmad-agent-dev', 'Amelia')
const agents = [mary, bob, amelia]

describe('handoffTarget', () => {
  it('resolves @<name> at the start to the one persona of that name, case-insensitively, with no text for a pure handoff', () => {
    expect(handoffTarget('@bob', agents, mary.id)).toEqual({ agent: bob, text: '' })
    expect(handoffTarget('@BOB', agents, mary.id)).toEqual({ agent: bob, text: '' })
    expect(handoffTarget('@aMeLiA', agents, mary.id)).toEqual({ agent: amelia, text: '' })
  })

  it('returns what follows the name as the user’s turn, without the token, trimmed', () => {
    expect(handoffTarget('@bob write the brief', agents, mary.id)).toEqual({
      agent: bob,
      text: 'write the brief'
    })
    expect(handoffTarget('@bob\n\n  two lines\nof text  ', agents, mary.id)?.text).toBe('two lines\nof text')
    expect(handoffTarget('  @bob  hi  ', agents, mary.id)).toEqual({ agent: bob, text: 'hi' })
  })

  it.each([
    ['no persona of that name', '@zed hello'],
    ['the current persona', '@mary hello'],
    ['mid-text', 'hi @bob'],
    ['after a line', 'hi\n@bob'],
    ['a bare @', '@'],
    ['an @ then a space', '@ bob'],
    ['a name with punctuation stuck to it', '@bob, hello'],
    ['an agent id', '@bmad-agent-pm'],
    ['a partial name', '@bo'],
    ['a longer token', '@bobby'],
    ['no @', 'bob']
  ])('is not a handoff for %s', (_why, message) => {
    expect(handoffTarget(message, agents, mary.id)).toBeNull()
  })

  it('is not a handoff when two personas other than the current one share the name', () => {
    const twoSams = [mary, agent('a-sam', 'Sam'), agent('b-sam', 'sam')]

    expect(handoffTarget('@sam hi', twoSams, mary.id)).toBeNull()
  })

  it('matches only a persona other than the current one, so a name it shares with the current persona is the other’s', () => {
    const twinned = [agent('x', 'Sam'), agent('y', 'Sam')]

    expect(handoffTarget('@sam hi', twinned, 'x')).toEqual({ agent: twinned[1], text: 'hi' })
  })

  it('never matches a skill, a menu code or an id: it reads nothing but the roster’s names', () => {
    const named = [mary, { ...bob, description: 'bmad-product-brief', title: 'bmad-prd' }]

    expect(handoffTarget('@bmad-product-brief', named, mary.id)).toBeNull()
    expect(handoffTarget('@bmad-prd', named, mary.id)).toBeNull()
    expect(handoffTarget('@product-brief', named, mary.id)).toBeNull()
  })

  it('never matches an empty name', () => {
    expect(handoffTarget('@', [mary, agent('e', '')], mary.id)).toBeNull()
  })
})
