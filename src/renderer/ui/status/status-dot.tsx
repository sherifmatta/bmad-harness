import type { JSX } from 'react'

import './status-dot.css'
import { useNow } from '../outputs/use-now'
import type { PersonaState } from './persona-state'
import { formatElapsed } from './format-elapsed'
import { ENDED_TEXT, STATE_TEXT } from './persona-state'

/** How often the counter re-reads the clock: the finest unit it writes is a second. */
export const COUNTER_TICK_MS = 1000

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

/**
 * The elapsed time of a persona at work, counted from when the state began.
 *
 * Its own component, so that its one-second interval exists only while it is
 * mounted and it is mounted only for `work`: with nobody working no timer runs.
 * It is what carries liveness when reduced motion turns the pulse off.
 */
function ElapsedCounter({ since }: { since: number }): JSX.Element {
  const now = useNow(COUNTER_TICK_MS)
  return <span className="state-elapsed">{` · ${formatElapsed(now - since)}`}</span>
}

/**
 * The dot and its word, in one row — the only way a state is ever drawn.
 * Beside the word of `work` alone, and only when its start is known, the
 * elapsed counter: it is never part of a label and never announced.
 */
export function StateLine({
  state,
  since
}: {
  /** A persona's state, or `ended`: a skill-first session whose process is gone, which has the word and no dot (Story 7.5). */
  state: PersonaState | 'ended'
  /** When the state began, in epoch milliseconds. */
  since?: number | undefined
}): JSX.Element {
  return (
    <span className={`state-line state-line--${state}`}>
      {state !== 'ended' && <StatusDot state={state} />}
      <span className="state-text">
        {state === 'ended' ? ENDED_TEXT : STATE_TEXT[state]}
        {state === 'work' && since !== undefined && <ElapsedCounter since={since} />}
      </span>
    </span>
  )
}
