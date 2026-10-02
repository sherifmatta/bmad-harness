import { useCallback, useEffect, useRef, useState } from 'react'
import type { ContractEvent } from '../../../shared/events'
import type { AgentView, HarnessError } from '../../../shared/install'
import { asHarnessError } from '../install/install-state'
import {
  cancelQueued,
  dispatchFailed,
  dispatchRefusedBusy,
  dropQueued,
  foldEvent,
  initialConversation,
  sendMessage,
  sessionOf,
  sessionReady
} from './conversation-state'
import type { ConversationState, Delivery, PersonaStateEntry } from './conversation-state'
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
  /** The user took a queued message back, by its transcript entry's id. */
  cancel(entryId: string): void
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
 * still take a message. A session has one turn in flight at a time, so a
 * message typed meanwhile — or before the session is up — is shown at once as
 * queued and is sent when the turn ends, first in first, one per turn. Nothing
 * is transmitted to be refused as busy.
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

  /** Write a turn to its session; a refusal means no turn is in flight on its account. */
  function transmit(delivery: Delivery | undefined): void {
    if (delivery === undefined) {
      return
    }
    bridge.sendTurn(delivery.sessionId, delivery.text).catch((reason: unknown) => {
      if (asHarnessError(reason).code === 'session/busy') {
        commit(
          dispatchRefusedBusy(state, delivery, agentOf(delivery.agentId)?.name || delivery.agentId)
        )
        return
      }
      commit(dispatchFailed(state, delivery.sessionId))
      fail(reason)
    })
  }

  function ensureSession(agentId: string): void {
    if (sessionOf(state, agentId) !== undefined || opening.has(agentId)) {
      return
    }
    const attempt = bridge
      .openSession(agentId)
      .then((sessionId) => {
        const ready = sessionReady(state, agentId, sessionId)
        commit(ready.state)
        transmit(ready.deliver)
      })
      .catch((reason: unknown) => {
        // Messages waiting on a session that could not open are not kept: the
        // next send tries the open again.
        commit(dropQueued(state, agentId))
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
        transmit(folded.deliver)
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
      const sent = sendMessage(state, agentId, now(), text, agentOf(agentId)?.name || agentId)
      commit(sent.state)
      transmit(sent.deliver)
      if (sessionOf(sent.state, agentId) === undefined) {
        ensureSession(agentId)
      }
    },

    cancel(entryId) {
      commit(cancelQueued(state, entryId))
    }
  }
}

/**
 * The renderer's whole view of the conversation: the transcript main's events
 * and the user's sends have made, the last refusal if there is one, and the
 * things the window can do. Nothing is shown before the first turn.
 */
export function useConversation(agents: readonly AgentView[]): {
  entries: readonly TranscriptEntry[]
  /** The state main last reported for each persona, with when it began. */
  personas: ReadonlyMap<string, PersonaStateEntry>
  failure: HarnessError | null
  activate: (agentId: string) => void
  send: (agentId: string, text: string) => void
  cancel: (entryId: string) => void
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
  const cancel = useCallback((entryId: string) => conversation.current?.cancel(entryId), [])

  return { entries: state.entries, personas: state.personas, failure, activate, send, cancel }
}
