import { describe, expect, it } from 'vitest'

import { CORE_AGENT_IDS, LANES, PERSONAS, TEAM_META, personasIn } from './personas'

describe('the five core personas', () => {
  it('are Mary, John, Sally, Winston and Amelia, with the titles DESIGN.md gives them', () => {
    expect(PERSONAS.map(({ name, title }) => `${name} · ${title}`)).toEqual([
      'Mary · Business Analyst',
      'John · Product Manager',
      'Sally · UX Designer',
      'Winston · System Architect',
      'Amelia · Senior Software Engineer'
    ])
  })

  it('are the five core agents, whose ids the cast chooser ticks by default', () => {
    expect(CORE_AGENT_IDS).toEqual([
      'bmad-agent-analyst',
      'bmad-agent-pm',
      'bmad-agent-ux-designer',
      'bmad-agent-architect',
      'bmad-agent-dev'
    ])
    expect(PERSONAS.map(({ id }) => id)).toEqual([...CORE_AGENT_IDS])
  })

  it('carry the descriptions of DESIGN.md’s table, verbatim', () => {
    expect(PERSONAS.map(({ description }) => description)).toEqual([
      'Market and competitive research and requirements — the thinking done before a project is committed to.',
      'Turns the product vision into a validated PRD, then epics and stories development can execute.',
      'Turns user needs and the PRD into design and experience specifications that inform the architecture.',
      'Converts the PRD and UX into the technical decisions that keep implementation on track.',
      'Implements approved stories test-first and ships code that has been run and verified.'
    ])
  })

  it('say nothing in the first person, in quotation or as an invitation', () => {
    for (const { description } of PERSONAS) {
      expect(description).not.toMatch(/\b(?:I|I'm|I'll|me|my|we|our|you|your|let's|try|start|begin)\b/i)
      expect(description).not.toMatch(/["“”?!]/)
    }
  })
})

describe('the four lanes', () => {
  it('are the method’s, in order', () => {
    expect(LANES).toEqual(['analysis', 'planning', 'solutioning', 'implementation'])
  })

  it('hold one persona each but planning, which holds John and Sally in that order', () => {
    expect(LANES.map((lane) => personasIn(lane).map(({ name }) => name))).toEqual([
      ['Mary'],
      ['John', 'Sally'],
      ['Winston'],
      ['Amelia']
    ])
  })

  it('leave no persona out of every lane', () => {
    expect(LANES.flatMap((lane) => personasIn(lane))).toHaveLength(PERSONAS.length)
  })
})

describe('the line over the lanes', () => {
  it('says what they are and that an install can add more, and nothing about a project', () => {
    expect(TEAM_META).toBe(
      "the five core personas, by phase of the method · a project's own install can add more"
    )
  })
})
