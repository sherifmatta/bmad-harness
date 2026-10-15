/** One of the five states of a persona; see `PERSONA_STATES`. */
export type PersonaState = 'idle' | 'work' | 'live' | 'note' | 'error'

/**
 * The five states a persona can be in, in the order DESIGN.md's dot table
 * lists them (FR22, UX-DR17). The status dot and the state line say it, and
 * nothing else about a person changes with it. Five states over four colours: `note` and `live`
 * are told apart by colour, `idle` and `work` by colour and pulse, and `error`
 * by colour alone — and every one of them is also a word, because a dot is
 * never the sole carrier of a fact.
 */
export const PERSONA_STATES: readonly PersonaState[] = ['idle', 'work', 'live', 'note', 'error']

/**
 * The words beside the dot. One closed map, lower case, and a fact about state
 * rather than guidance: nothing here advises, and nothing here is error text —
 * a tile never says what went wrong. Epic 3 will bring richer strings from a
 * real stream through the same `states` seam.
 */
export const STATE_TEXT: Record<PersonaState, string> = {
  idle: 'idle',
  work: 'working',
  live: 'live',
  note: 'file changed',
  error: 'error'
}

/**
 * The state of one agent, read from the map the shell was given. State is read
 * and never placed: an id the map does not hold is `idle`, so with no sessions
 * every tile answers from the same lookup Epic 2 will feed.
 */
export function stateOf(id: string, states: ReadonlyMap<string, PersonaState>): PersonaState {
  return states.get(id) ?? 'idle'
}

/**
 * Whether skill buttons are disabled in a state: a turn in flight and nothing
 * else, so `live`, with no turn in flight, never disables them.
 */
export function skillsDisabled(state: PersonaState): boolean {
  return state === 'work'
}
