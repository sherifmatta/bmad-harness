import type { RunCardSnapshot } from '../../shared/conversation'
import type { ContractEvent } from '../../shared/events'
import { foldRunCard, startCard } from '../fold/run-card'

/**
 * The run cards of one window, held in main so a window that reloads is handed
 * every card as it stands (`conversation:get`), and nothing it draws depends on
 * having seen an earlier event. Changed only by applying an event; memory only.
 */
export type RunProjection = {
  apply(event: ContractEvent): void
  /** Every card of this launch, in the order its run started. */
  snapshot(): RunCardSnapshot[]
  /** The conversation ended: its cards go with it. */
  clear(): void
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

    snapshot: () => [...cards.values()],

    clear() {
      cards.clear()
    }
  }
}
