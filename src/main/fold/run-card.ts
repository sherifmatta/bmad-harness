import type { RunCardSnapshot } from '../../shared/conversation'
import type { ContractEvent, RunStarted } from '../../shared/events'

/**
 * One run's card, folded from the run's own events. Pure and immutable: a card
 * and an event in, the next card out, no clock and no I/O.
 *
 * - `run:started` makes the card: running, no notes, no prose, no sections.
 * - `run:note` adds the line, in the order it came.
 * - `doc:prose` adds to the text of the call being written; a piece of a
 *   different call starts the text again, under that call's path.
 * - `doc:committed` that is `ok` adds the headings it names that the card does
 *   not already hold, so a revision naming a section already written adds
 *   none; a rejected write adds nothing.
 * - `run:finished`, `run:stopped` and `run:failed` end the card, once: a
 *   terminal card takes nothing more.
 *
 * An event of another run leaves the card as it was. The renderer folds the
 * same events into the same card (`src/renderer/ui/chat/conversation-state.ts`
 * and `prose-store.ts`); `tests/run-card-parity.test.ts` holds the two equal.
 */

export function startCard(started: RunStarted): RunCardSnapshot {
  return {
    runId: started.runId,
    sessionId: started.sessionId,
    ...(started.agentId === undefined ? {} : { agentId: started.agentId }),
    code: started.code,
    startedAt: started.at,
    status: 'running',
    notes: [],
    sections: [],
    prose: null
  }
}

export function foldRunCard(card: RunCardSnapshot, event: ContractEvent): RunCardSnapshot {
  if (!('runId' in event.payload) || event.payload.runId !== card.runId || card.status !== 'running') {
    return card
  }
  switch (event.name) {
    case 'run:note':
      return { ...card, notes: [...card.notes, { text: event.payload.text, at: event.payload.at }] }

    case 'doc:prose': {
      const { callId, path, text } = event.payload
      const prose =
        card.prose !== null && card.prose.callId === callId
          ? { ...card.prose, text: card.prose.text + text }
          : { callId, path, text }
      return { ...card, prose }
    }

    case 'doc:committed': {
      if (!event.payload.ok) return card
      const fresh = event.payload.sections.filter(
        (section, at, all) => !card.sections.includes(section) && all.indexOf(section) === at
      )
      return fresh.length === 0 ? card : { ...card, sections: [...card.sections, ...fresh] }
    }

    case 'run:finished':
      return { ...card, status: 'finished', endedAt: event.payload.at }

    case 'run:stopped':
      return { ...card, status: 'stopped', endedAt: event.payload.at }

    case 'run:failed':
      return { ...card, status: 'failed', endedAt: event.payload.at, error: event.payload.error }

    default:
      return card
  }
}
