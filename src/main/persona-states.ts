import type { ContractEvent } from '../shared/events'
import { createPersonaProjection } from './projections/personas'
import type { PersonaProjection } from './projections/personas'

/**
 * The channel every event travels on, as `{name, payload}`. It lives here, with
 * the one thing both bridges share, and `session-bridge` re-exports it for the
 * test that ties it to the preload's own literal.
 */
export const SESSION_EVENT_CHANNEL = 'session:event'

/** The parts of a `WebContents` the projection's holder touches. */
export type PersonaSender = {
  send(channel: string, event: ContractEvent): void
  isDestroyed(): boolean
}

const projections = new WeakMap<object, PersonaProjection>()

/**
 * The persona-state projection of one window, made on first ask and the same
 * one for every bridge that asks after, so the session bridge's turns and the
 * rail bridge's files fold into one table and one `persona:state` stream.
 *
 * Keyed by the window's own object, never its id: nothing outlives the window,
 * and an id that comes back after destruction finds a fresh projection.
 */
export function personaProjectionFor(
  sender: PersonaSender,
  now: () => number = () => Date.now()
): PersonaProjection {
  const existing = projections.get(sender)
  if (existing !== undefined) {
    return existing
  }
  const projection = createPersonaProjection({
    now,
    onChange: (event) => {
      if (!sender.isDestroyed()) {
        sender.send(SESSION_EVENT_CHANNEL, event)
      }
    }
  })
  projections.set(sender, projection)
  return projection
}
