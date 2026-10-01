import type { ContractEvent } from '../../../shared/events'
import type { AgentView } from '../../../shared/install'
import type { TranscriptEntry } from './transcript'

/**
 * The conversation as the window holds it: the transcript, which persona has a
 * live session, and the one message typed for a persona that had none. Pure
 * and apart from React, so a suite with no DOM can hold it.
 *
 * Everything here is a function of the events main pushed and the user's own
 * sends. The words of a persona are appended as they arrive and never edited:
 * no trimming, joining, summarising or framing.
 */
export type ConversationState = {
  entries: readonly TranscriptEntry[]
  /** Which session is live for a persona, by agent id. */
  sessions: ReadonlyMap<string, string>
  /** The text typed for a persona with no session yet, sent when its first turn ends. */
  pending: ReadonlyMap<string, string>
  /** The next entry's key. */
  nextId: number
}

export const initialConversation: ConversationState = {
  entries: [],
  sessions: new Map(),
  pending: new Map(),
  nextId: 0
}

/** Text that is to be sent into a session now. */
export type Delivery = { sessionId: string; text: string }

export function sessionOf(state: ConversationState, agentId: string): string | undefined {
  return state.sessions.get(agentId)
}

function withEntry(state: ConversationState, entry: TranscriptEntry): ConversationState {
  return { ...state, entries: [...state.entries, entry], nextId: state.nextId + 1 }
}

/** The user's own words, as a turn, at the time they sent them. */
export function addUserTurn(state: ConversationState, at: number, text: string): ConversationState {
  return withEntry(state, { kind: 'user', id: `entry-${state.nextId}`, at, text })
}

/** Record a live session for a persona. */
export function withSession(
  state: ConversationState,
  agentId: string,
  sessionId: string
): ConversationState {
  return { ...state, sessions: new Map(state.sessions).set(agentId, sessionId) }
}

/** Hold text for a persona until its session can take it. */
export function holdPending(
  state: ConversationState,
  agentId: string,
  text: string
): ConversationState {
  return { ...state, pending: new Map(state.pending).set(agentId, text) }
}

export function clearPending(state: ConversationState, agentId: string): ConversationState {
  const pending = new Map(state.pending)
  pending.delete(agentId)
  return { ...state, pending }
}

/** A persona the roster no longer names still has its words shown, under its id. */
function unknownAgent(id: string): AgentView {
  return { id, module: '', name: id, title: '', icon: '', description: '' }
}

/**
 * Fold one pushed event into the next state, and say what, if anything, is now
 * to be sent. Events the conversation has no use for yield the state as it was.
 */
export function foldEvent(
  state: ConversationState,
  event: ContractEvent,
  agentOf: (agentId: string) => AgentView | undefined
): { state: ConversationState; deliver?: Delivery } {
  switch (event.name) {
    case 'session:opened': {
      const { agentId, sessionId } = event.payload
      return agentId === undefined ? { state } : { state: withSession(state, agentId, sessionId) }
    }

    case 'session:closed': {
      const { sessionId } = event.payload
      const sessions = new Map(state.sessions)
      const pending = new Map(state.pending)
      for (const [agentId, live] of sessions) {
        if (live === sessionId) {
          sessions.delete(agentId)
          // Text waiting for a session that is gone is not sent to the next one.
          pending.delete(agentId)
        }
      }
      return { state: { ...state, sessions, pending } }
    }

    case 'session:awaiting-turn': {
      const { sessionId } = event.payload
      for (const [agentId, live] of state.sessions) {
        const text = state.pending.get(agentId)
        if (live === sessionId && text !== undefined) {
          return { state: clearPending(state, agentId), deliver: { sessionId, text } }
        }
      }
      return { state }
    }

    case 'persona:said': {
      const { agentId, messageId, text, at } = event.payload
      if (agentId === undefined) {
        return { state }
      }
      const last = state.entries[state.entries.length - 1]
      if (
        last !== undefined &&
        last.kind === 'persona' &&
        last.agent.id === agentId &&
        last.messageId === messageId
      ) {
        const joined: TranscriptEntry = { ...last, text: last.text + text }
        return { state: { ...state, entries: [...state.entries.slice(0, -1), joined] } }
      }
      return {
        state: withEntry(state, {
          kind: 'persona',
          id: `entry-${state.nextId}`,
          at,
          agent: agentOf(agentId) ?? unknownAgent(agentId),
          text,
          messageId
        })
      }
    }

    default:
      return { state }
  }
}
