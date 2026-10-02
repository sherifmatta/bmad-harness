import type { PersonaSaid } from '../../shared/events'
import type { TranscriptRecord } from '../../shared/conversation'

/**
 * The transcript main holds for a project — pure, immutable, with no I/O and
 * no clock: the instant of every record comes in with it.
 *
 * A persona record joins a following `persona:said` of the same `agentId` and
 * `messageId`: the text is appended as it came, never trimmed, joined with a
 * separator or edited. Anything else starts a record of its own. Ids are
 * `m-<n>`, assigned here, continuing past the highest a loaded transcript holds.
 * A `persona:said` without an `agentId` belongs to the room and is not recorded.
 * A sysline is the harness's own line and is always a record of its own: it ends
 * whatever persona message came before it, so later words open a new one.
 */
export type TranscriptState = {
  entries: readonly TranscriptRecord[]
  /** The number the next record's id carries. */
  nextId: number
}

export const EMPTY_TRANSCRIPT: TranscriptState = { entries: [], nextId: 0 }

const ID = /^m-(\d+)$/

/** A transcript read back from storage: its records as they were, ids continuing past its highest. */
export function transcriptFrom(entries: readonly TranscriptRecord[]): TranscriptState {
  let highest = -1
  for (const entry of entries) {
    const match = ID.exec(entry.id)
    if (match !== null) {
      highest = Math.max(highest, Number(match[1]))
    }
  }
  return { entries, nextId: highest + 1 }
}

function withRecord(state: TranscriptState, record: TranscriptRecord): TranscriptState {
  return { entries: [...state.entries, record], nextId: state.nextId + 1 }
}

export function foldPersonaSaid(state: TranscriptState, said: PersonaSaid): TranscriptState {
  const { agentId, messageId, text, at } = said
  if (agentId === undefined) {
    return state
  }
  const last = state.entries[state.entries.length - 1]
  if (last !== undefined && last.kind === 'persona' && last.agentId === agentId && last.messageId === messageId) {
    return {
      ...state,
      entries: [...state.entries.slice(0, -1), { ...last, text: last.text + text }]
    }
  }
  return withRecord(state, { kind: 'persona', id: `m-${state.nextId}`, at, agentId, messageId, text })
}

export function foldUserTurn(state: TranscriptState, text: string, at: number): TranscriptState {
  return withRecord(state, { kind: 'user', id: `m-${state.nextId}`, at, text })
}

/** The harness's own line, appended as a record that no persona message joins. */
export function foldSysline(state: TranscriptState, text: string, at: number): TranscriptState {
  return withRecord(state, { kind: 'sysline', id: `m-${state.nextId}`, at, text })
}
