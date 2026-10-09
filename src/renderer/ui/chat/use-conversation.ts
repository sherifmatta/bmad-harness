import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessionTarget } from '../../../shared/commands'
import type { ConversationSnapshot, OpenedSession, SyslineRecord } from '../../../shared/conversation'
import type { ContractEvent } from '../../../shared/events'
import type { AgentView, HarnessError } from '../../../shared/install'
import { asHarnessError } from '../install/install-state'
import {
  cancelQueued,
  canAnswer,
  dispatchFailed,
  dispatchRefusedBusy,
  dispatchStarted,
  dropQueued,
  ended,
  foldEvent,
  hydrate,
  initialConversation,
  orphansOf,
  personaTurnsInFlight,
  roomReady,
  roomRefused,
  roomSent,
  roomSummaryAsked,
  roomTurnInFlight,
  roomTurnsOf,
  roomUnsent,
  runCardOf,
  sendMessage,
  sessionOf,
  sessionReady,
  speakerOf,
  withHandoff
} from './conversation-state'
import type { ConversationState, Delivery, PersonaStateEntry, TurnInFlight } from './conversation-state'
import { createProseStore } from './prose-store'
import type { ProseStore } from './prose-store'
import { runLifecycleLine, subjectWritten } from './run-status'
import type { TranscriptEntry } from './transcript-entry'

/** The eight bridge methods the conversation needs, and nothing else of the bridge. */
export type ConversationBridge = {
  openSession(target: SessionTarget): Promise<OpenedSession>
  closeSession(sessionId: string): Promise<void>
  sendTurn(sessionId: string, text: string, mention?: string): Promise<void>
  dispatchMenu(sessionId: string, code: string): Promise<string>
  stopRun(runId: string): Promise<void>
  getConversation(): Promise<ConversationSnapshot>
  endConversation(projectId: string): Promise<void>
  onSessionEvent(listener: (event: ContractEvent) => void): () => void
}

export type Conversation = {
  /** Subscribe to main's events; returns the way to stop. */
  connect(): () => void
  /**
   * A persona was chosen, by tile or by `@<name>`: open its session, which main
   * answers with the sysline when this is a handoff. Always asks main, so a
   * switch back to a persona that is already live is seen by it. Resolves when
   * the open has settled and its handoff, if any, is in the transcript; never
   * rejects.
   */
  activate(agentId: string): Promise<void>
  /**
   * The user chose a cast and asked for the room (Story 4.1): main opens it, or answers with
   * the one already live, and the reply makes it the window's room. Resolves when the open has
   * settled; never rejects, and a refusal is the failure line. One open at a time.
   */
  openRoom(cast: readonly string[]): Promise<void>
  /**
   * The user sent `text` into the room (Story 4.2): one room entry, the room busy, and the text sent
   * with no gate. Main interrupts a speaker. A refusal as busy (Story 4.8) means the room did not receive it:
   * the entry goes, one harness line says so, the room stays busy and the text is handed back for the composer.
   * A refusal for a room the user stopped, or one already gone, takes the entry and says nothing. Any other
   * refusal clears the busy mark, keeps the entry and is the failure line.
   */
  sendToRoom(text: string): void
  /**
   * The user pressed *Write summary to `<F>`* (Story 4.4): the room's session is asked, as one turn
   * and with no gate, to write its summary to the destination the panel shows. Handled as `sendToRoom`
   * is; nothing is written here, and with no live room nothing is sent.
   */
  writeSummary(folder: string): void
  /** The user sent `text` to a persona; `mention` is the `@name` they typed to hand off to it, shown beside the text (AD-25). */
  send(agentId: string, text: string, mention?: string): void
  /** The user took a queued message back, by its transcript entry's id. */
  cancel(entryId: string): void
  /**
   * The user activated a menu entry of a persona: its code goes to main for the
   * persona's live session, and nothing else does. Ignored while the session
   * has a turn in flight, or when the persona has none; a refusal is the
   * failure line.
   */
  runSkill(agentId: string, code: string): void
  /**
   * The user pressed stop on a run, by its id: main finds the run's session and
   * asks its turn to end. Nothing is changed here: the card ends on the run's own
   * terminal event. A run that is no longer in flight (`run/not-found`) is said
   * nothing of, since the control it was pressed on is already gone; any other
   * refusal is the failure line. Never rejects.
   */
  stopRun(runId: string): Promise<void>
  /**
   * The user closes a persona's session: main ends that one session, and its
   * `session:closed` is what removes it here. Resolves true when it was closed;
   * false when the persona has no session or main refused, the refusal shown as
   * the failure line. The transcript is untouched either way.
   */
  close(agentId: string): Promise<boolean>
  /**
   * The user stops the room (Story 4.5): the room's own session is closed as a
   * persona's is, and its `session:closed` is what removes the room here; the
   * entries stay. Resolves true when it was closed (or was already gone); false
   * with no live room, or when main refused, the refusal shown as the failure
   * line. Nothing is cleared.
   */
  stopRoom(): Promise<boolean>
  /**
   * End the conversation of `projectId`: main clears its transcript and closes
   * its sessions, and on its reply the window starts empty. Resolves true when
   * it ended; false when main refused, with the refusal shown as the failure
   * line and everything the window holds as it was.
   */
  end(projectId: string): Promise<boolean>
}

type ConversationDeps = {
  bridge: ConversationBridge
  agentOf: (agentId: string) => AgentView | undefined
  now: () => number
  publish: (state: ConversationState) => void
  onFailure: (error: HarnessError | null) => void
  /** A handoff's sysline has just joined the transcript, live: not one the snapshot brought. */
  onHandoff?: (record: SyslineRecord) => void
  /**
   * Where each run's document text is held; pieces of prose go here and never
   * into the state. Left out, a store that tells its readers at once.
   */
  prose?: ProseStore
  /** A run began or ended, live: the one line to announce for it. */
  onLifecycle?: (line: string) => void
}

/**
 * The conversation's whole sequence, apart from React so it can be run in node.
 *
 * It starts from what main holds, not from nothing: on connecting it subscribes
 * first, drops what arrives until main's snapshot has, then takes the snapshot
 * (the transcript, the live and busy sessions, the personas not idle) and folds
 * what follows. Until then a message typed is shown, queued, and a session is
 * not opened; both wait for the snapshot, so a send into a session that is busy
 * is queued and one into a session that is idle is sent, in the order typed.
 *
 * A persona's session is opened whenever its tile is activated, the current
 * persona's too, and for a message typed to a persona that has none, on that
 * first send: the composer is never disabled, and a window that opened on a
 * default persona nobody activated must still take a message. An activation the
 * session is already live for is still an open, which main answers with the same
 * session and, when another persona was the last, with the handoff sysline that
 * joins the transcript here in the order the replies arrive. A session has one turn in flight at a time, so a
 * message typed meanwhile — or before the session is up — is shown at once as
 * queued and is sent when the turn ends, first in first, one per turn. Nothing
 * is transmitted to be refused as busy.
 */
export function createConversation(deps: ConversationDeps): Conversation {
  const { bridge, agentOf, now, publish, onFailure, onHandoff, onLifecycle } = deps
  const prose = deps.prose ?? createProseStore({ raf: (callback) => callback() })
  let state = initialConversation
  let live = true
  const opening = new Map<string, Promise<void>>()
  /** False from connecting until main's snapshot has been taken (or has failed). */
  let hydrated = false
  /** The personas a session was asked for before the snapshot arrived, in order. */
  const awaitingSnapshot: { agentId: string; always: boolean; settled: () => void }[] = []
  /** The room open in flight, if any: a second ask while it runs is that one. */
  let openingRoom: Promise<void> | undefined
  /** What waits for main's snapshot besides a persona's open: a room's. */
  const afterSnapshot: (() => void)[] = []
  /** The room sessions the user pressed stop on: a refusal for one is the stop's doing, not a failure (Story 4.8). */
  const stopped = new Set<string>()
  /** How many times the conversation has ended: an open begun before an end belongs to the one before it. */
  let endings = 0

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

  /**
   * Send `text` into the room's session, with no gate; `entryId` is the entry that shows it and `typed`
   * whether it is the user's own words (not the summary ask). Busy (Story 4.8): main could not interrupt in
   * time and the turn goes on, so the message was not received: its entry goes, one line says so and the room
   * stays busy. A room the user stopped, or one already gone, answering busy or not found: the entry goes and
   * nothing is said. Any other refusal clears the busy mark, keeps the entry and is the failure line.
   */
  function transmitToRoom(sessionId: string, entryId: string, text: string, typed: boolean): void {
    bridge.sendTurn(sessionId, text).catch((reason: unknown) => {
      const code = asHarnessError(reason).code
      if (code === 'session/busy' || code === 'session/not-found') {
        if (stopped.has(sessionId) || state.room !== sessionId) {
          commit(roomUnsent(state, entryId))
          return
        }
        if (code === 'session/busy') {
          const refused = roomRefused(state, entryId, now(), typed)
          commit(refused.state)
          if (refused.said !== undefined && live) {
            onHandoff?.(refused.said)
          }
          return
        }
      }
      commit(dispatchFailed(state, sessionId))
      fail(reason)
    })
  }

  /** Write a turn to its session; a refusal means no turn is in flight on its account. */
  function transmit(delivery: Delivery | undefined): void {
    if (delivery === undefined) {
      return
    }
    // The mention goes on only when there is one: a plain turn crosses as it always did.
    const mention = delivery.mention === undefined ? [] : [delivery.mention]
    bridge.sendTurn(delivery.sessionId, delivery.text, ...mention).catch((reason: unknown) => {
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

  /**
   * Open a persona's session. A send only needs one when the persona has none;
   * an activation (`always`) asks main whether or not the window already holds
   * one. Either way one open per persona is in flight at a time, and the promise
   * is that open's, settled when its reply has been folded.
   */
  function ensureSession(agentId: string, always: boolean): Promise<void> {
    if (!hydrated) {
      return new Promise<void>((settled) => {
        awaitingSnapshot.push({ agentId, always, settled })
      })
    }
    const pending = opening.get(agentId)
    if (pending !== undefined) {
      return pending
    }
    if (!always && sessionOf(state, agentId) !== undefined) {
      return Promise.resolve()
    }
    const generation = endings
    const attempt: Promise<void> = bridge
      .openSession(agentId)
      .then(({ sessionId, handoff }) => {
        // An open that outlived the conversation it began in found it ended.
        if (generation !== endings) {
          return
        }
        const ready = sessionReady(state, agentId, sessionId)
        commit(handoff === undefined ? ready.state : withHandoff(ready.state, handoff))
        if (handoff !== undefined && live) {
          onHandoff?.(handoff)
        }
        transmit(ready.deliver)
      })
      .catch((reason: unknown) => {
        // An open still starting when the conversation ended was closed by
        // main, and that is not a failure: what was waiting on it went with the end.
        if (generation !== endings) {
          return
        }
        // Messages waiting on a session that could not open are not kept: the
        // next send tries the open again.
        commit(dropQueued(state, agentId))
        fail(reason)
      })
      .finally(() => {
        if (opening.get(agentId) === attempt) {
          opening.delete(agentId)
        }
      })
    opening.set(agentId, attempt)
    return attempt
  }

  /** A run's start or end, told once as the card now reads it. */
  function announceLifecycle(event: ContractEvent): void {
    if (
      !live ||
      onLifecycle === undefined ||
      (event.name !== 'run:started' &&
        event.name !== 'run:finished' &&
        event.name !== 'run:stopped' &&
        event.name !== 'run:failed')
    ) {
      return
    }
    const card = runCardOf(state, event.payload.runId)
    if (card === undefined) {
      return
    }
    const agentId = card.agentId ?? ''
    const written = subjectWritten(card, prose.get(card.runId)?.path)
    onLifecycle(runLifecycleLine(card, agentOf(agentId)?.name || agentId, written))
  }

  function openTheRoom(cast: readonly string[]): Promise<void> {
    onFailure(null)
    if (!hydrated) {
      return new Promise<void>((settled) => {
        afterSnapshot.push(() => void openTheRoom(cast).then(settled))
      })
    }
    if (openingRoom !== undefined) {
      return openingRoom
    }
    const generation = endings
    const attempt: Promise<void> = bridge
      .openSession({ room: [...cast] })
      .then(({ sessionId, room }) => {
        // An open that outlived the conversation it began in found it ended.
        if (generation !== endings) {
          return
        }
        // The cast and the time are the room's own, as main answered: not the chooser's ticks (Story 4.7).
        commit(roomReady(state, sessionId, room?.cast, room?.openedAt))
      })
      .catch((reason: unknown) => {
        if (generation !== endings) {
          return
        }
        fail(reason)
      })
      .finally(() => {
        if (openingRoom === attempt) {
          openingRoom = undefined
        }
      })
    openingRoom = attempt
    return attempt
  }

  return {
    connect() {
      // Subscribed first, so nothing is missed; what comes before the snapshot is in it.
      const unsubscribe = bridge.onSessionEvent((event) => {
        if (!hydrated) {
          return
        }
        // A piece of a document is the prose store's, written to the page once a
        // frame: it never becomes a state change of its own.
        if (event.name === 'doc:prose') {
          const { runId, callId, path, text } = event.payload
          prose.append(runId, callId, path, text)
          return
        }
        // A confirmed write is the card's as well: its text, when it carries one, is the store's.
        if (event.name === 'doc:committed' && event.payload.ok) {
          const { runId, path, callId, text } = event.payload
          prose.commit(runId, path, callId, text)
        }
        const folded = foldEvent(state, event, agentOf)
        commit(folded.state)
        transmit(folded.deliver)
        announceLifecycle(event)
      })
      const begin = (): void => {
        hydrated = true
        for (const { agentId, always, settled } of awaitingSnapshot.splice(0)) {
          void ensureSession(agentId, always).then(settled)
        }
        for (const run of afterSnapshot.splice(0)) {
          run()
        }
      }
      bridge
        .getConversation()
        .then((snapshot) => {
          if (!live) {
            return
          }
          const taken = hydrate(state, snapshot, agentOf)
          for (const run of snapshot.runs) {
            prose.seed(run.runId, run.documents)
          }
          commit(taken.state)
          hydrated = true
          for (const delivery of taken.deliveries) {
            transmit(delivery)
          }
          begin()
        })
        .catch((reason: unknown) => {
          if (!live) {
            return
          }
          // No snapshot: carry on from nothing, as a window with no history would.
          begin()
          fail(reason)
        })
      return () => {
        live = false
        unsubscribe()
      }
    },

    activate(agentId) {
      onFailure(null)
      return ensureSession(agentId, true)
    },

    openRoom: openTheRoom,

    sendToRoom(text) {
      onFailure(null)
      const sent = roomSent(state, now(), text)
      if (sent.sessionId === undefined || sent.entryId === undefined) {
        return
      }
      commit(sent.state)
      transmitToRoom(sent.sessionId, sent.entryId, text, true)
    },

    writeSummary(folder) {
      onFailure(null)
      const asked = roomSummaryAsked(state, now(), folder)
      if (asked.sessionId === undefined || asked.text === undefined || asked.entryId === undefined) {
        return
      }
      commit(asked.state)
      transmitToRoom(asked.sessionId, asked.entryId, asked.text, false)
    },

    send(agentId, text, mention) {
      onFailure(null)
      const sent = sendMessage(state, agentId, now(), text, agentOf(agentId)?.name || agentId, mention)
      commit(sent.state)
      transmit(sent.deliver)
      if (sessionOf(sent.state, agentId) === undefined) {
        void ensureSession(agentId, false)
      }
    },

    cancel(entryId) {
      commit(cancelQueued(state, entryId))
    },

    runSkill(agentId, code) {
      onFailure(null)
      const sessionId = sessionOf(state, agentId)
      if (sessionId === undefined || !canAnswer(state, agentId)) {
        return
      }
      commit(dispatchStarted(state, sessionId))
      bridge.dispatchMenu(sessionId, code).catch((reason: unknown) => {
        // Busy: main has a turn in flight this window had not seen; its end frees the row.
        if (asHarnessError(reason).code === 'session/busy') {
          return
        }
        commit(dispatchFailed(state, sessionId))
        fail(reason)
      })
    },

    async stopRun(runId) {
      try {
        await bridge.stopRun(runId)
      } catch (reason) {
        if (asHarnessError(reason).code !== 'run/not-found') {
          fail(reason)
        }
      }
    },

    async close(agentId) {
      onFailure(null)
      const sessionId = sessionOf(state, agentId)
      if (sessionId === undefined) {
        return false
      }
      try {
        await bridge.closeSession(sessionId)
      } catch (reason) {
        // Already gone: main's `session:closed` was folded before this refusal,
        // so the session did close and there is nothing to report.
        if (sessionOf(state, agentId) !== sessionId) {
          return true
        }
        fail(reason)
        return false
      }
      return true
    },

    async stopRoom() {
      onFailure(null)
      const room = state.room
      if (room === undefined) {
        return false
      }
      // Marked before main is asked: a send still waiting answers as the stop's doing (Story 4.8).
      stopped.add(room)
      try {
        await bridge.closeSession(room)
      } catch (reason) {
        // Already gone: main's `session:closed` was folded before this refusal.
        if (state.room !== room) {
          return true
        }
        // Main refused the stop: the room is as it was, and a later refusal is a refusal.
        stopped.delete(room)
        fail(reason)
        return false
      }
      return true
    },

    async end(projectId) {
      onFailure(null)
      try {
        await bridge.endConversation(projectId)
      } catch (reason) {
        fail(reason)
        return false
      }
      if (!live) {
        return true
      }
      endings += 1
      // An open still pending belongs to the conversation that ended; the next
      // send starts a new one rather than waiting on it.
      opening.clear()
      openingRoom = undefined
      awaitingSnapshot.length = 0
      afterSnapshot.length = 0
      prose.clear()
      commit(ended(state))
      return true
    }
  }
}

/**
 * The renderer's whole view of the conversation: the transcript main's events
 * and the user's sends have made, the last refusal if there is one, and the
 * things the window can do. Nothing is shown before the first turn.
 */
export function useConversation(
  agents: readonly AgentView[],
  onHandoff?: (record: SyslineRecord) => void,
  onLifecycle?: (line: string) => void
): {
  entries: readonly TranscriptEntry[]
  /** The state main last reported for each persona, with when it began. */
  personas: ReadonlyMap<string, PersonaStateEntry>
  failure: HarnessError | null
  activate: (agentId: string) => Promise<void>
  /** Open the room of a cast, by agent ids (Story 4.1); one already live is the same room. */
  openRoom: (cast: readonly string[]) => Promise<void>
  /** The window's room session, while one is live; the room is no persona's session. */
  room: string | undefined
  /** The agent ids chosen for the room, in roster order, while it is live (Story 4.2). */
  roomCast: readonly string[]
  /** When the room opened, in epoch milliseconds, while it is live (Story 4.3). */
  roomOpenedAt: number | undefined
  /** What the room is about: the shape of the user's first message into it, or none yet (Story 4.3). */
  roomTopic: string | undefined
  /** How many turns the room has had (Story 4.3). */
  roomTurns: number
  /** The user's words a busy room refused, to go back into the room's composer; a new key for each (Story 4.8). */
  roomReturned: { key: number; text: string } | undefined
  /** The agent id of the room's current speaker, or none (Story 4.2). */
  speaker: string | undefined
  /** The personas with a turn in flight by main's state, by agent id, in the order their turns began. */
  turnsInFlight: ReadonlyMap<string, TurnInFlight & { since: number }>
  /** The room's turn in flight while its session is busy, else none. */
  roomInFlight: TurnInFlight | undefined
  /** Send text into the room, with no gate; main interrupts the speaker. */
  sendToRoom: (text: string) => void
  /** Ask the room's session to write its summary under `folder`, the project's output folder, at the destination the panel shows. */
  writeSummary: (folder: string) => void
  send: (agentId: string, text: string, mention?: string) => void
  cancel: (entryId: string) => void
  end: (projectId: string) => Promise<boolean>
  /** Close a persona's session; true when main did. */
  close: (agentId: string) => Promise<boolean>
  /** Stop the room: close its session and leave its entries (Story 4.5); true when it closed. */
  stopRoom: () => Promise<boolean>
  /** Personas with a live session the roster no longer has, in session order. */
  orphans: readonly AgentView[]
  /** The agent ids that have a live session, current or not. */
  live: ReadonlySet<string>
  /** Whether a persona has a live session with no turn in flight. */
  canAnswer: (agentId: string) => boolean
  /** The persona's live session, if it has one. */
  sessionOf: (agentId: string) => string | undefined
  /** Run one of a persona's menu entries, by its code, in its live session. */
  runSkill: (agentId: string, code: string) => void
  /** Stop a run by its id; one that is no longer in flight is left alone, without a word. */
  stopRun: (runId: string) => Promise<void>
  /** Each run's document text, which the run cards write from. */
  prose: ProseStore
} {
  const [state, setState] = useState<ConversationState>(initialConversation)
  const [failure, setFailure] = useState<HarnessError | null>(null)
  const agentsRef = useRef(agents)
  const onHandoffRef = useRef(onHandoff)
  const onLifecycleRef = useRef(onLifecycle)
  const conversation = useRef<Conversation | null>(null)
  // The one frame the window paints on is injected here, and only here.
  const [prose] = useState(() => createProseStore({ raf: (callback) => requestAnimationFrame(callback) }))

  useEffect(() => {
    agentsRef.current = agents
    onHandoffRef.current = onHandoff
    onLifecycleRef.current = onLifecycle
  }, [agents, onHandoff, onLifecycle])

  // A preload that failed to load leaves no bridge at all.
  const bridgeAvailable =
    typeof window.harness?.openSession === 'function' &&
    typeof window.harness?.sendTurn === 'function' &&
    typeof window.harness?.getConversation === 'function' &&
    typeof window.harness?.endConversation === 'function' &&
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
      onFailure: setFailure,
      onHandoff: (record) => onHandoffRef.current?.(record),
      prose,
      onLifecycle: (line) => onLifecycleRef.current?.(line)
    })
    conversation.current = created
    const disconnect = created.connect()
    return () => {
      disconnect()
      conversation.current = null
    }
  }, [bridgeAvailable, prose])

  const activate = useCallback(
    async (agentId: string) => void (await conversation.current?.activate(agentId)),
    []
  )
  const openRoom = useCallback(
    async (cast: readonly string[]) => void (await conversation.current?.openRoom(cast)),
    []
  )
  const sendToRoom = useCallback((text: string) => conversation.current?.sendToRoom(text), [])
  const writeSummary = useCallback((folder: string) => conversation.current?.writeSummary(folder), [])
  const send = useCallback(
    (agentId: string, text: string, mention?: string) => conversation.current?.send(agentId, text, mention),
    []
  )
  const cancel = useCallback((entryId: string) => conversation.current?.cancel(entryId), [])
  const runSkill = useCallback(
    (agentId: string, code: string) => conversation.current?.runSkill(agentId, code),
    []
  )
  const stopRun = useCallback(async (runId: string) => void (await conversation.current?.stopRun(runId)), [])
  const end = useCallback(
    async (projectId: string) => (await conversation.current?.end(projectId)) ?? false,
    []
  )

  const close = useCallback(
    async (agentId: string) => (await conversation.current?.close(agentId)) ?? false,
    []
  )
  const stopRoom = useCallback(async () => (await conversation.current?.stopRoom()) ?? false, [])
  const orphans = useMemo(() => orphansOf(state, agents), [state, agents])
  const live = useMemo(() => new Set(state.sessions.keys()), [state.sessions])
  const turnsInFlight = useMemo(() => personaTurnsInFlight(state), [state])

  // Who spoke is read from the roster as it is now, so a window that met the
  // transcript before the install was read names them once it is.
  const entries = useMemo(
    () =>
      state.entries.map((entry) =>
        entry.kind === 'persona'
          ? { ...entry, agent: agents.find((agent) => agent.id === entry.agent.id) ?? entry.agent }
          : entry
      ),
    [state.entries, agents]
  )

  const answerable = useCallback((agentId: string) => canAnswer(state, agentId), [state])
  const liveSessionOf = useCallback((agentId: string) => sessionOf(state, agentId), [state])

  return {
    entries,
    personas: state.personas,
    failure,
    activate,
    openRoom,
    room: state.room,
    roomCast: state.roomCast,
    roomOpenedAt: state.roomOpenedAt,
    roomTopic: state.roomTopic,
    roomTurns: roomTurnsOf(state),
    roomReturned: state.roomReturned,
    speaker: speakerOf(state),
    turnsInFlight,
    roomInFlight: roomTurnInFlight(state),
    sendToRoom,
    writeSummary,
    send,
    cancel,
    end,
    close,
    stopRoom,
    orphans,
    live,
    canAnswer: answerable,
    sessionOf: liveSessionOf,
    runSkill,
    stopRun,
    prose
  }
}
