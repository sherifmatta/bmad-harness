import type { AgentView } from '../../../shared/install'
import type { PersonaState } from '../persona/portrait'
import { pinnedRun } from '../chat/transcript'
import type { TranscriptEntry } from '../chat/transcript-entry'
import { stateOf } from '../status/persona-state'

/**
 * The run a persona is on, as its Agents row reads it (Story 6.6): the run's id
 * (the prose store's key for the document path), its menu code when the entry
 * has one, and when it began (what elapsed counts from).
 */
export type AgentRun = { runId: string; code?: string; startedAt: number }

/** One Agents row: the persona, the state the tile shows, and the run in flight while it works. */
export type AgentRow = { agent: AgentView; state: PersonaState; run?: AgentRun }

/**
 * One row per installed persona, in roster order and never sorted or grouped.
 * The state is the tile's (`stateOf`). A run is read only while the state is
 * `work`: a run entry still `running` under a persona that is `idle` is stale
 * and says nothing. With two runs in flight the later by `at` is the one.
 */
export function agentRowsOf(
  installed: readonly AgentView[],
  states: ReadonlyMap<string, PersonaState>,
  entries: readonly TranscriptEntry[]
): AgentRow[] {
  return installed.map((agent) => {
    const state = stateOf(agent.id, states)
    const run = state === 'work' ? pinnedRun(entries, agent.id) : null
    if (run === null) {
      return { agent, state }
    }
    return {
      agent,
      state,
      run: { runId: run.runId, startedAt: run.at, ...(run.code === undefined ? {} : { code: run.code }) }
    }
  })
}
