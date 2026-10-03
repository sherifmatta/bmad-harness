import type { ConversationSnapshot, SyslineRecord } from '../../../shared/conversation'
import type { ContractEvent, PersonaState } from '../../../shared/events'
import type { AgentView } from '../../../shared/install'
import type { TranscriptEntry, UserEntry } from './transcript-entry'

/** A message typed for a persona, waiting for its turn to come: the entry that shows it, and its words. */
export type QueuedMessage = { entryId: string; text: string }

/** What main last said of a persona's state, and when that state began. */
export type PersonaStateEntry = { state: PersonaState; at: number }

/**
 * The conversation as the window holds it: the transcript, which persona has a
 * live session, which sessions have a turn in flight, and the messages typed
 * while they did. Pure and apart from React, so a suite with no DOM can hold it.
 *
 * Everything here is a function of the events main pushed and the user's own
 * sends. The words of a persona are appended as they arrive and never edited:
 * no trimming, joining, summarising or framing. A queued message and its
 * transcript entry change together, in one state, so one is never shown
 * without the other.
 */
export type ConversationState = {
  entries: readonly TranscriptEntry[]
  /** Which session is live for a persona, by agent id. */
  sessions: ReadonlyMap<string, string>
  /** The sessions with a turn in flight, by session id. */
  busy: ReadonlySet<string>
  /** The messages waiting for a persona's turn to end, first in first, by agent id. */
  queue: ReadonlyMap<string, readonly QueuedMessage[]>
  /** The last state main reported for each persona, by agent id; an absent persona is idle. */
  personas: ReadonlyMap<string, PersonaStateEntry>
  /** The next entry's key. */
  nextId: number
}

export const initialConversation: ConversationState = {
  entries: [],
  sessions: new Map(),
  busy: new Set(),
  queue: new Map(),
  personas: new Map(),
  nextId: 0
}

/** Text that is to be sent into a session now. */
export type Delivery = {
  sessionId: string
  agentId: string
  entryId: string
  text: string
}

export function sessionOf(state: ConversationState, agentId: string): string | undefined {
  return state.sessions.get(agentId)
}

/**
 * Whether a persona can take a reply this moment: it has a live session and that
 * session has no turn in flight. The decision block is shown only while this holds.
 */
export function canAnswer(state: ConversationState, agentId: string): boolean {
  const sessionId = state.sessions.get(agentId)
  return sessionId !== undefined && !state.busy.has(sessionId)
}

function withEntry(state: ConversationState, entry: TranscriptEntry): ConversationState {
  return {
    ...state,
    entries: [...state.entries, entry],
    nextId: state.nextId + 1
  }
}

/** Record a live session for a persona, idle: used for a session first met by the open's reply. */
export function withSession(
  state: ConversationState,
  agentId: string,
  sessionId: string
): ConversationState {
  return {
    ...state,
    sessions: new Map(state.sessions).set(agentId, sessionId)
  }
}

function withBusy(state: ConversationState, sessionId: string, busy: boolean): ConversationState {
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

function withQueue(
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

function isQueued(entry: TranscriptEntry): boolean {
  return entry.kind === 'user' && entry.queuedFor !== undefined
}

function withoutQueued(entry: UserEntry): UserEntry {
  const plain: UserEntry = { ...entry }
  delete plain.queuedFor
  return plain
}

/**
 * Send the first message waiting for a persona if its session can take one:
 * the entry loses its queued marking in place, and the session is busy again.
 */
function drain(
  state: ConversationState,
  agentId: string
): { state: ConversationState; deliver?: Delivery } {
  const sessionId = state.sessions.get(agentId)
  const [first, ...rest] = state.queue.get(agentId) ?? []
  if (sessionId === undefined || state.busy.has(sessionId) || first === undefined) {
    return { state }
  }
  const entries = state.entries.map((entry) => {
    if (entry.kind === 'user' && entry.id === first.entryId) {
      return withoutQueued(entry)
    }
    return entry
  })
  return {
    state: withBusy(withQueue({ ...state, entries }, agentId, rest), sessionId, true),
    deliver: { sessionId, agentId, entryId: first.entryId, text: first.text }
  }
}

/**
 * The user's own words, as a turn, at the time they sent them. The turn is
 * queued, and shown so, when the persona's session is mid-turn, not yet up or
 * not yet opened; it is sent, and plain, when the session can take it now. The
 * entry and the queue change in this one state.
 */
export function sendMessage(
  state: ConversationState,
  agentId: string,
  at: number,
  text: string,
  personaName: string
): { state: ConversationState; deliver?: Delivery } {
  const entryId = `entry-${state.nextId}`
  const queued: QueuedMessage[] = [...(state.queue.get(agentId) ?? []), { entryId, text }]
  const entered = withQueue(
    withEntry(state, {
      kind: 'user',
      id: entryId,
      at,
      text,
      queuedFor: personaName
    }),
    agentId,
    queued
  )
  return drain(entered, agentId)
}

/** Take a queued message back: its entry and its queue item go, and nothing is sent. */
export function cancelQueued(state: ConversationState, entryId: string): ConversationState {
  for (const [agentId, messages] of state.queue) {
    if (messages.some((message) => message.entryId === entryId)) {
      return {
        ...withQueue(
          state,
          agentId,
          messages.filter((message) => message.entryId !== entryId)
        ),
        entries: state.entries.filter((entry) => entry.id !== entryId)
      }
    }
  }
  return state
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

/**
 * The reply to opening a persona's session. A session the events already
 * announced is as they left it; one the window meets only here (it was live
 * before this window loaded) is taken to be idle.
 */
export function sessionReady(
  state: ConversationState,
  agentId: string,
  sessionId: string
): { state: ConversationState; deliver?: Delivery } {
  if (state.sessions.get(agentId) === sessionId) {
    return { state }
  }
  return drain(withSession(state, agentId, sessionId), agentId)
}

/** A send into a session was refused for a reason other than busy: it has no turn in flight on that account. */
export function dispatchFailed(state: ConversationState, sessionId: string): ConversationState {
  return withBusy(state, sessionId, false)
}

/**
 * A send was refused as busy: main has a turn in flight that this window did
 * not see (it met the session only through the open's reply). The session stays
 * busy and the message goes back to the head of its persona's queue, queued
 * again in place, to be sent when that turn ends.
 */
export function dispatchRefusedBusy(
  state: ConversationState,
  delivery: Delivery,
  personaName: string
): ConversationState {
  if (state.sessions.get(delivery.agentId) !== delivery.sessionId) {
    return state
  }
  const entries = state.entries.map((entry) =>
    entry.kind === 'user' && entry.id === delivery.entryId
      ? { ...entry, queuedFor: personaName }
      : entry
  )
  return withBusy(
    withQueue({ ...state, entries }, delivery.agentId, [
      { entryId: delivery.entryId, text: delivery.text },
      ...(state.queue.get(delivery.agentId) ?? [])
    ]),
    delivery.sessionId,
    true
  )
}

/**
 * The conversation ended: the transcript, the queue, the live sessions and the
 * busy set are gone, so the window starts empty. The personas stay as main
 * reported them (the `session:closed` events it folded before the reply have
 * already settled them), and `nextId` is kept so an entry key is never reused
 * by something still holding an old one.
 */
export function ended(state: ConversationState): ConversationState {
  return {
    ...state,
    entries: [],
    sessions: new Map(),
    busy: new Set(),
    queue: new Map()
  }
}

/**
 * A line main wrote in the harness's own voice, a handoff returned on the open's
 * reply or a line pushed on its own: its sysline joins the transcript, once and
 * at the end, where the persona's later words will follow it as a message of
 * their own. A record already held (by its id) is not added again.
 */
export function withHandoff(state: ConversationState, record: SyslineRecord): ConversationState {
  if (state.entries.some((entry) => entry.id === record.id)) {
    return state
  }
  return withEntry(state, { kind: 'sysline', id: record.id, at: record.at, text: record.text })
}

/** A persona the roster no longer names still has its words shown, under its id. */
function unknownAgent(id: string): AgentView {
  return { id, module: '', name: id, title: '', icon: '', description: '' }
}

/**
 * The personas whose session is live although the roster no longer has them,
 * in session order. Derived, never stored: it is a function of the sessions and
 * the roster, so a persona that returns to the roster stops being one. Each is
 * the persona as the transcript last knew it, else the id standing as the name.
 */
export function orphansOf(
  state: ConversationState,
  agents: readonly AgentView[]
): readonly AgentView[] {
  const orphans: AgentView[] = []
  for (const agentId of state.sessions.keys()) {
    if (agents.some((agent) => agent.id === agentId)) {
      continue
    }
    let known: AgentView | undefined
    for (let at = state.entries.length - 1; at >= 0 && known === undefined; at -= 1) {
      const entry = state.entries[at]
      if (entry.kind === 'persona' && entry.agent.id === agentId) {
        known = entry.agent
      }
    }
    orphans.push(known ?? unknownAgent(agentId))
  }
  return orphans
}

/**
 * Take what main holds as the conversation: the transcript, which sessions are
 * live, which have a turn in flight and which personas are not idle replace
 * whatever the window knew. What the window itself holds stays: a message typed
 * before this arrived is still queued, after the transcript it continues, and is
 * sent now if its persona's session can take it. One delivery at most per persona.
 *
 * Persona records resolve their `AgentView` from the roster as it is now, and
 * fall back to the id as the name, so a window that connects before the install
 * is read still shows who spoke.
 */
export function hydrate(
  state: ConversationState,
  snapshot: ConversationSnapshot,
  agentOf: (agentId: string) => AgentView | undefined
): { state: ConversationState; deliveries: Delivery[] } {
  const stored: TranscriptEntry[] = snapshot.entries.map((record) =>
    record.kind === 'persona'
      ? {
          kind: 'persona',
          id: record.id,
          at: record.at,
          agent: agentOf(record.agentId) ?? unknownAgent(record.agentId),
          text: record.text,
          messageId: record.messageId
        }
      : record.kind === 'sysline'
        ? { kind: 'sysline', id: record.id, at: record.at, text: record.text }
        : { kind: 'user', id: record.id, at: record.at, text: record.text }
  )
  let next: ConversationState = {
    ...state,
    entries: [...stored, ...state.entries],
    sessions: new Map(snapshot.sessions.map(({ agentId, sessionId }) => [agentId, sessionId])),
    busy: new Set(snapshot.busy),
    personas: new Map(
      snapshot.personas.map(({ agentId, state: personaState, at }) => [
        agentId,
        { state: personaState, at }
      ])
    )
  }
  const deliveries: Delivery[] = []
  for (const agentId of [...next.queue.keys()]) {
    const drained = drain(next, agentId)
    next = drained.state
    if (drained.deliver !== undefined) {
      deliveries.push(drained.deliver)
    }
  }
  return { state: next, deliveries }
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
      // The activation turn is in flight until the session says it is awaiting.
      return agentId === undefined
        ? { state }
        : {
            state: withBusy(withSession(state, agentId, sessionId), sessionId, true)
          }
    }

    case 'session:closed': {
      const { sessionId, reason } = event.payload
      let next = withBusy(state, sessionId, false)
      for (const [agentId, live] of state.sessions) {
        if (live === sessionId) {
          const sessions = new Map(next.sessions)
          sessions.delete(agentId)
          // The user closed it, so what waited on it goes with it. A process that
          // exited on its own took nothing the user asked for: what they typed
          // stays queued, and goes to the persona's next session, first in first.
          next = reason === 'closed' ? dropQueued({ ...next, sessions }, agentId) : { ...next, sessions }
        }
      }
      return { state: next }
    }

    case 'harness:said': {
      // The harness's own line, once and at the end; one already held (by its id) is not added again.
      const { id, at, text } = event.payload
      return { state: withHandoff(state, { kind: 'sysline', id, at, text }) }
    }

    case 'session:awaiting-turn': {
      const { sessionId } = event.payload
      const idle = withBusy(state, sessionId, false)
      for (const [agentId, live] of idle.sessions) {
        if (live === sessionId) {
          return drain(idle, agentId)
        }
      }
      return { state: idle }
    }

    case 'persona:said': {
      const { agentId, messageId, text, at: time } = event.payload
      if (agentId === undefined) {
        return { state }
      }
      // Messages queued while this one streams sit below it in the list; they
      // do not end it.
      let at = state.entries.length - 1
      while (at >= 0 && isQueued(state.entries[at])) {
        at -= 1
      }
      const last = at >= 0 ? state.entries[at] : undefined
      if (
        last !== undefined &&
        last.kind === 'persona' &&
        last.agent.id === agentId &&
        last.messageId === messageId
      ) {
        const joined: TranscriptEntry = { ...last, text: last.text + text }
        const entries = [...state.entries]
        entries[at] = joined
        return { state: { ...state, entries } }
      }
      return {
        state: withEntry(state, {
          kind: 'persona',
          id: `entry-${state.nextId}`,
          at: time,
          agent: agentOf(agentId) ?? unknownAgent(agentId),
          text,
          messageId
        })
      }
    }

    case 'persona:state': {
      // Stored as main said it: nothing here decides a state or puts one in place.
      const { agentId, state: personaState, at } = event.payload
      const stored: ConversationState = {
        ...state,
        personas: new Map(state.personas).set(agentId, { state: personaState, at })
      }
      // A persona working has a turn in flight, one this window sent or one nobody
      // sent (a background task finishing wakes the session), so its session is busy
      // and nothing is sent into it, nor a decision offered over what it is still saying.
      const sessionId = state.sessions.get(agentId)
      return {
        state: personaState === 'work' && sessionId !== undefined ? withBusy(stored, sessionId, true) : stored
      }
    }

    default:
      return { state }
  }
}
