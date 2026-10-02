import { describe, expect, it } from 'vitest'

import type { PersonaState } from '../persona/portrait'
import { PERSONA_STATES, STATE_TEXT, skillsDisabled, stateOf } from './persona-state'

describe('the persona state vocabulary', () => {
  it('is the five states, in the order the dot table lists them', () => {
    expect(PERSONA_STATES).toEqual(['idle', 'work', 'live', 'note', 'error'])
  })

  it('has one lower-case word per state and no more', () => {
    expect(STATE_TEXT).toEqual({
      idle: 'idle',
      work: 'working',
      live: 'live',
      note: 'file changed',
      error: 'error'
    })
    expect(Object.keys(STATE_TEXT).sort()).toEqual([...PERSONA_STATES].sort())
    for (const text of Object.values(STATE_TEXT)) {
      expect(text).toBe(text.toLowerCase())
    }
  })
})

describe('stateOf', () => {
  it('reads the map, and answers idle for an id it does not hold', () => {
    const states = new Map<string, PersonaState>([['a', 'work']])

    expect(stateOf('a', states)).toBe('work')
    expect(stateOf('b', states)).toBe('idle')
    expect(stateOf('a', new Map())).toBe('idle')
  })
})

describe('skillsDisabled', () => {
  it.each<[PersonaState, boolean]>([
    ['work', true],
    ['live', false],
    ['idle', false],
    ['note', false],
    ['error', false]
  ])('is %s -> %s', (state, disabled) => {
    expect(skillsDisabled(state)).toBe(disabled)
  })
})
