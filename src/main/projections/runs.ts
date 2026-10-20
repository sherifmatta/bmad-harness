import type { RunCardSnapshot } from '../../shared/conversation'
import type { ContractEvent } from '../../shared/events'
import { threadAgentOf } from '../../shared/thread'
import { foldRunCard, startCard } from '../fold/run-card'

/**
 * The run cards of one window, held in main so a window that reloads is handed
 * every card as it stands (`conversation:get`), and nothing it draws depends on
 * having seen an earlier event. Changed only by applying an event; memory only.
 */
export type RunProjection = {
  apply(event: ContractEvent): void
  /** One run's card as it stands, or `undefined` for a run this projection has not seen start. */
  card(runId: string): RunCardSnapshot | undefined
  /** Every card of this launch, in the order its run started. */
  snapshot(): RunCardSnapshot[]
  /** The conversation ended: its cards go with it. */
  clear(): void
  /** A skill-first session ended (Story 7.5): its cards go with it, and no other session's is touched. */
  removeSession(sessionId: string): void
  /** A persona's thread was deleted (Story 8.5): its cards go with it, and no other thread's is touched. */
  removeAgent(agentId: string): void
}

export function createRunProjection(): RunProjection {
  const cards = new Map<string, RunCardSnapshot>()

  return {
    apply(event) {
      if (event.name === 'run:started') {
        if (!cards.has(event.payload.runId)) cards.set(event.payload.runId, startCard(event.payload))
        return
      }
      if (!('runId' in event.payload)) return
      const card = cards.get(event.payload.runId)
      if (card !== undefined) cards.set(card.runId, foldRunCard(card, event))
    },

    card: (runId) => cards.get(runId),

    snapshot: () => [...cards.values()],

    clear() {
      cards.clear()
    },

    removeSession(sessionId) {
      for (const [runId, card] of cards) {
        if (card.sessionId === sessionId) cards.delete(runId)
      }
    },

    removeAgent(agentId) {
      for (const [runId, card] of cards) {
        if (threadAgentOf(card) === agentId) cards.delete(runId)
      }
    }
  }
}
