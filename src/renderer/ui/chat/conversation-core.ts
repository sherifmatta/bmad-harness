import type { ConversationState, QueuedMessage } from './conversation-state'
import type { TranscriptEntry } from './transcript-entry'

/**
 * The small changes every part of the conversation's fold makes to its state: one entry added, one session marked
 * busy or idle, one queue set, and the queue of one seat dropped with the entries that showed it. Pure, and apart
 * from `conversation-state` and `skill-session-state` so neither reaches into the other for them.
 */

export function withEntry(state: ConversationState, entry: TranscriptEntry): ConversationState {
  return {
    ...state,
    entries: [...state.entries, entry],
    nextId: state.nextId + 1
  }
}

export function withBusy(state: ConversationState, sessionId: string, busy: boolean): ConversationState {
  if (state.busy.has(sessionId) === busy) {
    return state
  }
  const next = new Set(state.busy)
  if (busy) {
    next.add(sessionId)
  } else {
    next.delete(sessionId)
  }
  return { ...state, busy: next }
}

export function withQueue(
  state: ConversationState,
  agentId: string,
  messages: readonly QueuedMessage[]
): ConversationState {
  const queue = new Map(state.queue)
  if (messages.length === 0) {
    queue.delete(agentId)
  } else {
    queue.set(agentId, messages)
  }
  return { ...state, queue }
}

/** Whether an entry is a message of the user's still queued. */
export function isQueued(entry: TranscriptEntry): boolean {
  return entry.kind === 'user' && entry.queuedFor !== undefined
}

/** Drop everything queued for a persona, with its entries: the user closed its session. */
export function dropQueued(state: ConversationState, agentId: string): ConversationState {
  const dropped = new Set((state.queue.get(agentId) ?? []).map((message) => message.entryId))
  if (dropped.size === 0) {
    return state
  }
  return {
    ...withQueue(state, agentId, []),
    entries: state.entries.filter((entry) => !dropped.has(entry.id))
  }
}
