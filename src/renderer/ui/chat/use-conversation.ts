import { useCallback, useEffect, useRef, useState } from 'react'
import type { ContractEvent } from '../../../shared/events'
import type { AgentView, HarnessError } from '../../../shared/install'
import { asHarnessError } from '../install/install-state'
import {
  addUserTurn,
  clearPending,
  foldEvent,
  holdPending,
  initialConversation,
  sessionOf,
  withSession
} from './conversation-state'
import type { ConversationState } from './conversation-state'
import type { TranscriptEntry } from './transcript'

/** The three bridge methods the conversation needs, and nothing else of the bridge. */
export type ConversationBridge = {
  openSession(agentId: string): Promise<string>
  sendTurn(sessionId: string, text: string): Promise<void>
  onSessionEvent(listener: (event: ContractEvent) => void): () => void
}

export type Conversation = {
  /** Subscribe to main's events; returns the way to stop. */
  connect(): () => void
  /** A persona's tile was selected: make sure it has a session. */
  activate(agentId: string): void
  /** The user sent `text` to a persona. */
  send(agentId: string, text: string): void
}

type ConversationDeps = {
  bridge: ConversationBridge
  agentOf: (agentId: string) => AgentView | undefined
  now: () => number
  publish: (state: ConversationState) => void
  onFailure: (error: HarnessError | null) => void
}

/**
 * The conversation's whole sequence, apart from React so it can be run in node.
 *
 * A persona's session is opened when its tile is activated and, for a message
 * typed to a persona that has none, on that first send: the composer is never
 * disabled, and a window that opened on a default persona nobody activated must
 * still take a message. That message waits for the session's first turn to end
 * and is then sent. It is never an `@`, a skill, or a queue: a turn refused as
 * busy is shown as an error and is not retried (that is Story 2.5's).
 */
export function createConversation(deps: ConversationDeps): Conversation {
  const { bridge, agentOf, now, publish, onFailure } = deps
  let state = initialConversation
  let live = true
  const opening = new Map<string, Promise<void>>()

  function commit(next: ConversationState): void {
    state = next
    if (live) {
      publish(next)
    }
  }

  function fail(reason: unknown): void {
    if (live) {
      onFailure(asHarnessError(reason))
    }
  }

  function transmit(sessionId: string, text: string): void {
    bridge.sendTurn(sessionId, text).catch(fail)
  }

  /**
   * Send the text a persona was waiting to say to. A refusal as busy means the
   * session is mid-turn, and the text goes back to waiting for that turn to
   * end; any other refusal is shown.
   */
  function flushPending(agentId: string, sessionId: string): void {
    const text = state.pending.get(agentId)
    if (text === undefined) {
      return
    }
    commit(clearPending(state, agentId))
    bridge.sendTurn(sessionId, text).catch((reason: unknown) => {
      if (asHarnessError(reason).code === 'session/busy') {
        commit(holdPending(state, agentId, text))
      } else {
        fail(reason)
      }
    })
  }

  function ensureSession(agentId: string): void {
    if (sessionOf(state, agentId) !== undefined || opening.has(agentId)) {
      return
    }
    const attempt = bridge
      .openSession(agentId)
      .then((sessionId) => {
        commit(withSession(state, agentId, sessionId))
        flushPending(agentId, sessionId)
      })
      .catch((reason: unknown) => {
        // A message waiting on a session that could not open is not kept: the
        // next send tries the open again.
        commit(clearPending(state, agentId))
        fail(reason)
      })
      .finally(() => void opening.delete(agentId))
    opening.set(agentId, attempt)
  }

  return {
    connect() {
      const unsubscribe = bridge.onSessionEvent((event) => {
        const folded = foldEvent(state, event, agentOf)
        commit(folded.state)
        if (folded.deliver !== undefined) {
          transmit(folded.deliver.sessionId, folded.deliver.text)
        }
      })
      return () => {
        live = false
        unsubscribe()
      }
    },

    activate(agentId) {
      onFailure(null)
      ensureSession(agentId)
    },

    send(agentId, text) {
      onFailure(null)
      const sessionId = sessionOf(state, agentId)
      if (sessionId === undefined && state.pending.has(agentId)) {
        // One message waits for a session; a second is refused, not merged.
        fail({ code: 'session/waiting', message: 'session · a message is already waiting' })
        return
      }
      commit(addUserTurn(state, now(), text))
      if (sessionId !== undefined) {
        transmit(sessionId, text)
        return
      }
      commit(holdPending(state, agentId, text))
      ensureSession(agentId)
    }
  }
}

/**
 * The renderer's whole view of the conversation: the transcript main's events
 * and the user's sends have made, the last refusal if there is one, and the two
 * things the window can do. Nothing is shown before the first turn.
 */
export function useConversation(agents: readonly AgentView[]): {
  entries: readonly TranscriptEntry[]
  failure: HarnessError | null
  activate: (agentId: string) => void
  send: (agentId: string, text: string) => void
} {
  const [state, setState] = useState<ConversationState>(initialConversation)
  const [failure, setFailure] = useState<HarnessError | null>(null)
  const agentsRef = useRef(agents)
  const conversation = useRef<Conversation | null>(null)

  useEffect(() => {
    agentsRef.current = agents
  }, [agents])

  // A preload that failed to load leaves no bridge at all.
  const bridgeAvailable =
    typeof window.harness?.openSession === 'function' &&
    typeof window.harness?.sendTurn === 'function' &&
    typeof window.harness?.onSessionEvent === 'function'

  useEffect(() => {
    if (!bridgeAvailable) {
      return
    }
    const created = createConversation({
      bridge: window.harness,
      agentOf: (agentId) => agentsRef.current.find((agent) => agent.id === agentId),
      now: () => Date.now(),
      publish: setState,
      onFailure: setFailure
    })
    conversation.current = created
    const disconnect = created.connect()
    return () => {
      disconnect()
      conversation.current = null
    }
  }, [bridgeAvailable])

  const activate = useCallback((agentId: string) => conversation.current?.activate(agentId), [])
  const send = useCallback(
    (agentId: string, text: string) => conversation.current?.send(agentId, text),
    []
  )

  return { entries: state.entries, failure, activate, send }
}
