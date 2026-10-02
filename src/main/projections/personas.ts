import type { ContractEvent, PersonaState } from '../../shared/events'
import type { AgentId, SessionId } from '../../shared/ids'
import type { RailSnapshot } from '../../shared/rail'
import { EMPTY_PERSONA_TABLE, foldPersonaState, seedRail } from '../fold/persona-state'
import type { PersonaInput, PersonaTable } from '../fold/persona-state'

/** The one event this projection raises. */
export type PersonaStateEvent = Extract<ContractEvent, { name: 'persona:state' }>

/**
 * The persona-state read model: every persona's aggregated state, folded from
 * the domain events a window's sessions and rail raise.
 *
 * It changes only by applying an event, and it raises `persona:state` once per
 * change of an agent's aggregated state: an event that leaves the aggregate as
 * it was says nothing, and two sessions of one agent are one persona, so the
 * second turn starting while the first is in flight says nothing either.
 * Nothing is raised for an agent that has only ever been `idle`.
 *
 * `attach` and `detach` are how a long-running process says it is, or is no
 * longer, tied to a session; nothing calls them until Epic 3.
 */
export type PersonaProjection = {
  apply(event: PersonaInput): void
  /** The first rail snapshot a window sees: the baseline, which raises no `note`. */
  seedRail(snapshot: RailSnapshot): void
  attach(sessionId: SessionId): void
  detach(sessionId: SessionId): void
  /** Every persona that is anything but `idle`, with when that state began: what a reloaded window is told. */
  snapshot(): PersonaStateEvent['payload'][]
}

export function createPersonaProjection({
  onChange,
  now = Date.now
}: {
  onChange: (event: PersonaStateEvent) => void
  now?: () => number
}): PersonaProjection {
  let table: PersonaTable = EMPTY_PERSONA_TABLE
  const raised = new Map<AgentId, PersonaState>()

  function flush(): void {
    for (const [agentId, shown] of table.shown) {
      if (shown.state !== (raised.get(agentId) ?? 'idle')) {
        raised.set(agentId, shown.state)
        onChange({
          name: 'persona:state',
          payload: { agentId, state: shown.state, at: shown.at }
        })
      }
    }
  }

  function apply(event: PersonaInput): void {
    table = foldPersonaState(table, event, now())
    flush()
  }

  return {
    apply,

    seedRail(snapshot) {
      table = seedRail(table, snapshot)
    },

    attach(sessionId) {
      apply({ name: 'process:attached', payload: { sessionId } })
    },

    detach(sessionId) {
      apply({ name: 'process:detached', payload: { sessionId } })
    },

    snapshot() {
      return [...table.shown]
        .filter(([, shown]) => shown.state !== 'idle')
        .map(([agentId, shown]) => ({ agentId, state: shown.state, at: shown.at }))
    }
  }
}
