/**
 * The five core personas the Welcome shows, in the order of the method, and the
 * one place a roster exists before any install has been read (FR78, FR109).
 *
 * The descriptions are the harness's own words about a role, written from each
 * agent's role and shortened (DESIGN.md → Welcome). They are said, not stated,
 * so they are the one prose on the page: no first person, no quotation, no
 * suggestion of where to start. They are not read from any project and are
 * attributed to no persona. `id` is the agent id the install gives the persona,
 * so the disc and the name are the same as everywhere else.
 */

/** The method's phases, in order. Each is a lane. */
export const LANES = ['analysis', 'planning', 'solutioning', 'implementation'] as const

export type Lane = (typeof LANES)[number]

export type WelcomePersona = {
  id: string
  name: string
  title: string
  lane: Lane
  description: string
}

export const PERSONAS: readonly WelcomePersona[] = [
  {
    id: 'bmad-agent-analyst',
    name: 'Mary',
    title: 'Business Analyst',
    lane: 'analysis',
    description:
      'Market and competitive research and requirements — the thinking done before a project is committed to.'
  },
  {
    id: 'bmad-agent-pm',
    name: 'John',
    title: 'Product Manager',
    lane: 'planning',
    description:
      'Turns the product vision into a validated PRD, then epics and stories development can execute.'
  },
  {
    id: 'bmad-agent-ux-designer',
    name: 'Sally',
    title: 'UX Designer',
    lane: 'planning',
    description:
      'Turns user needs and the PRD into design and experience specifications that inform the architecture.'
  },
  {
    id: 'bmad-agent-architect',
    name: 'Winston',
    title: 'System Architect',
    lane: 'solutioning',
    description:
      'Converts the PRD and UX into the technical decisions that keep implementation on track.'
  },
  {
    id: 'bmad-agent-dev',
    name: 'Amelia',
    title: 'Senior Software Engineer',
    lane: 'implementation',
    description:
      'Implements approved stories test-first and ships code that has been run and verified.'
  }
]

/** The agent ids of the five core personas, in the order of the method: the cast the chooser ticks by default. */
export const CORE_AGENT_IDS: readonly string[] = PERSONAS.map(({ id }) => id)

/** The personas of one lane, in the table's order. */
export function personasIn(lane: Lane): WelcomePersona[] {
  return PERSONAS.filter((persona) => persona.lane === lane)
}

/** The line over the lanes: what they are, and that an install can add to them. */
export const TEAM_META =
  "the five core personas, by phase of the method · a project's own install can add more"
