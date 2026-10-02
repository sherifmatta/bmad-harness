import { describe, expect, it } from 'vitest'
import type { InstallSnapshot } from '../shared/install'
import { agentNameFor, forgetInstall, rememberInstall } from './install-model'
import type { InstallProjection } from './projections/install'

const projection = (names: Record<string, string>): InstallProjection => ({
  snapshot: () =>
    ({
      revision: 1,
      agents: Object.entries(names).map(([id, name]) => ({
        id,
        module: 'bmm',
        name,
        title: 't',
        icon: 'i',
        description: 'd'
      })),
      menus: {},
      errors: [],
      preflight: []
    }) satisfies InstallSnapshot,
  refresh: async () => {},
  menuEntry: () => undefined,
  dispose: () => {}
})

describe('the install model main shares between bridges', () => {
  it('answers a persona’s display name for the window it was remembered for, and no other', () => {
    rememberInstall(901, projection({ 'bmad-agent-pm': 'John' }))

    expect(agentNameFor(901, 'bmad-agent-pm')).toBe('John')
    expect(agentNameFor(901, 'bmad-agent-analyst')).toBeUndefined()
    expect(agentNameFor(902, 'bmad-agent-pm')).toBeUndefined()
    forgetInstall(901, projection({}))
    expect(agentNameFor(901, 'bmad-agent-pm')).toBe('John')
  })

  it('reads the roster as it is now, and answers nothing for an empty name', () => {
    const names: Record<string, string> = { a: 'Ann', b: '' }
    const current = projection(names)
    rememberInstall(903, current)

    expect(agentNameFor(903, 'a')).toBe('Ann')
    expect(agentNameFor(903, 'b')).toBeUndefined()
    names.a = 'Anne'
    expect(agentNameFor(903, 'a')).toBe('Anne')
  })

  it('forgets a window’s projection only when it is the one remembered', () => {
    const current = projection({ a: 'Ann' })
    rememberInstall(904, current)
    forgetInstall(904, current)

    expect(agentNameFor(904, 'a')).toBeUndefined()
  })
})
