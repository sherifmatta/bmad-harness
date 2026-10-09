import type { JSX } from 'react'

import type { AgentView } from '../../../shared/install'
import type { PersonaState } from '../persona/portrait'
import { STATE_TEXT, stateOf } from '../status/persona-state'
import './team.css'

/**
 * The four cells, in order: what each counts and the word it carries, in lower case as the
 * state words are (the stylesheet sets it in capitals). Three are the tiles' own state words,
 * so a state has one spelling. `live` is idle with a session open, so it is counted with `idle`.
 */
const CELLS: readonly { label: string; states: readonly PersonaState[] }[] = [
  { label: STATE_TEXT.work, states: ['work'] },
  { label: STATE_TEXT.idle, states: ['idle', 'live'] },
  { label: STATE_TEXT.error, states: ['error'] },
  { label: 'changed', states: ['note'] }
]

/**
 * How many of the roster's personas are in each of the strip's four states: a pure
 * function of the roster and the same `states` map the tiles read, so a figure and
 * the tiles it counts cannot disagree. An empty roster counts zero in every cell.
 */
export function stripCounts(
  agents: readonly AgentView[],
  states: ReadonlyMap<string, PersonaState>
): readonly { label: string; count: number }[] {
  return CELLS.map(({ label, states: counted }) => ({
    label,
    count: agents.filter((agent) => counted.includes(stateOf(agent.id, states))).length
  }))
}

/**
 * The Team sidebar's state strip: four plain counts above the tiles. It is text
 * and nothing else: no accent, fill or badge on a cell, and no live region, so a
 * change in a count is never announced. It reorders and regroups nothing.
 */
export function TeamStrip({
  agents,
  states
}: {
  agents: readonly AgentView[]
  states: ReadonlyMap<string, PersonaState>
}): JSX.Element {
  return (
    <div className="team-strip" role="group" aria-label="Team states">
      {stripCounts(agents, states).map(({ label, count }) => (
        <div key={label} className="team-strip-cell">
          <span className="team-strip-figure">{count}</span>
          <span className="team-strip-label">{label}</span>
        </div>
      ))}
    </div>
  )
}
