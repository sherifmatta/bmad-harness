import type { RunCardDocument, RunCardSnapshot } from '../../shared/conversation'
import type { ContractEvent, RunStarted } from '../../shared/events'
import { withPulled } from '../../shared/section-plan'

/**
 * One run's card, folded from the run's own events. Pure and immutable: a card
 * and an event in, the next card out, no clock and no I/O.
 *
 * - `run:started` makes the card: running, no notes, no documents, and the
 *   section plan the event carried.
 * - `run:note` adds the line, in the order it came, and the plan names it
 *   pulled in, each once.
 * - `doc:prose` adds to its path's document: a piece of the call that set the
 *   text grows it, a piece of another call (a new `Write`) replaces it. The
 *   path's weight is the longest text any one `Write` gave it.
 * - `doc:committed` that is `ok` sets its path's sections, and its `text`, when
 *   it carries one (an `Edit` that applied), replaces the path's text; a path
 *   not yet seen becomes an empty document. A rejected write changes nothing.
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
    ...(started.plan === undefined ? {} : { plan: [...started.plan] }),
    startedAt: started.at,
    status: 'running',
    notes: [],
    documents: []
  }
}

/**
 * The document a card shows: the one with the greatest weight above zero, the
 * earlier on a tie, so another path takes it only by passing it. None until a
 * `Write` has streamed.
 */
export function subjectOf(documents: readonly RunCardDocument[]): RunCardDocument | undefined {
  let subject: RunCardDocument | undefined
  for (const document of documents) {
    if (document.written > (subject?.written ?? 0)) subject = document
  }
  return subject
}

/** `documents` with the one at `path` replaced by what `change` makes of it, or appended when there is none. */
function withDocument(
  documents: readonly RunCardDocument[],
  path: string,
  change: (held: RunCardDocument | undefined) => RunCardDocument
): RunCardDocument[] {
  const at = documents.findIndex((document) => document.path === path)
  if (at === -1) return [...documents, change(undefined)]
  const next = [...documents]
  next[at] = change(documents[at])
  return next
}

export function foldRunCard(card: RunCardSnapshot, event: ContractEvent): RunCardSnapshot {
  if (!('runId' in event.payload) || event.payload.runId !== card.runId || card.status !== 'running') {
    return card
  }
  switch (event.name) {
    case 'run:note': {
      const notes = [...card.notes, { text: event.payload.text, at: event.payload.at }]
      const { pulled } = event.payload
      return pulled === undefined || pulled.length === 0
        ? { ...card, notes }
        : { ...card, notes, plan: withPulled(card.plan, pulled) }
    }

    case 'doc:prose': {
      const { callId, path, text } = event.payload
      const documents = withDocument(card.documents, path, (held) => {
        const grown = held !== undefined && held.callId === callId ? held.text + text : text
        return {
          path,
          callId,
          text: grown,
          written: Math.max(held?.written ?? 0, grown.length),
          sections: held?.sections ?? []
        }
      })
      return { ...card, documents }
    }

    case 'doc:committed': {
      if (!event.payload.ok) return card
      const { callId, path, sections, text } = event.payload
      const documents = withDocument(card.documents, path, (held) => {
        const base = held ?? { path, callId, text: '', written: 0, sections: [] }
        return text === undefined ? { ...base, sections } : { ...base, callId, text, sections }
      })
      return { ...card, documents }
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
