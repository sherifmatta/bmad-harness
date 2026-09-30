import type { JSX } from 'react'

import './status-dot.css'
import type { PersonaState } from '../persona/portrait'
import { STATE_TEXT } from './persona-state'

/**
 * The status dot — FR22, UX-DR17, DESIGN.md's `components.status-dot`.
 *
 * `aria-hidden` because a text string always sits beside it: the dot is never
 * the sole carrier of a state. Which colour, halo and pulse each state takes is
 * `status-dot.css`'s; this component only names the state.
 */
export function StatusDot({ state }: { state: PersonaState }): JSX.Element {
  return <span className={`status-dot status-dot--${state}`} aria-hidden="true" />
}

/** The dot and its word, in one row — the only way a state is ever drawn. */
export function StateLine({ state }: { state: PersonaState }): JSX.Element {
  return (
    <span className="state-line">
      <StatusDot state={state} />
      <span className="state-text">{STATE_TEXT[state]}</span>
    </span>
  )
}
