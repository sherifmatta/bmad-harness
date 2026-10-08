import type { ConversationSnapshot, RunCardSnapshot, SyslineRecord } from '../../../shared/conversation'
import type { ContractEvent, PersonaState } from '../../../shared/events'
import type { AgentView } from '../../../shared/install'
import { roomDestination, roomTopicOf } from '../../../shared/room-destination'
import { isRoomSummaryTurn, roomSummaryTurn } from '../../../shared/room-summary'
import { withPulled } from '../../../shared/section-plan'
import type { RunCardEntry, TranscriptEntry, UserEntry } from './transcript-entry'

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
  /**
   * The window's room session, while one is live (Story 4.1): its session id. The room
   * has no agent id, so it is in none of the maps above and has no persona state.
   */
  room: string | undefined
  /**
   * The agent ids chosen for the room, in roster order (Story 4.2): set when the open's reply is
   * ok and cleared when the room closes or the conversation ends. The cast strip draws one card for each.
   */
  roomCast: readonly string[]
  /**
   * When the room opened (Story 4.3), epoch milliseconds: the room's `session:opened` `at`, or the
   * conversation's own clock when the open's reply came first; the first of the two stands. Set
   * only for a live room, and cleared where `roomCast` is.
   */
  roomOpenedAt: number | undefined
  /**
   * What the room is about (Story 4.3): the shape of the user's first message into it, set once
   * and never again for that room. `undefined` until then; the harness writes none of its own.
   */
  roomTopic: string | undefined
  /** The next entry's key. */
  nextId: number
}

export const initialConversation: ConversationState = {
  entries: [],
  sessions: new Map(),
  busy: new Set(),
  queue: new Map(),
  personas: new Map(),
  room: undefined,
  roomCast: [],
  roomOpenedAt: undefined,
  roomTopic: undefined,
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

/**
 * A menu entry was activated in a session: it has a turn in flight from now,
 * so its buttons and its queue wait, until main's events say otherwise or the
 * dispatch is refused.
 */
export function dispatchStarted(state: ConversationState, sessionId: string): ConversationState {
  return withBusy(state, sessionId, true)
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
    queue: new Map(),
    room: undefined,
    roomCast: [],
    roomOpenedAt: undefined,
    roomTopic: undefined
  }
}

/**
 * The reply to opening the room: the session it answered with is the room, whether the
 * events announced it already or it was live before this window loaded. The cast, when the
 * reply carries one (`cast`, which is main's own for the live room, never the chooser's ticks), is kept; a room met only through
 * an event keeps the cast it had. The room has no queue. `at` is the room's open time as the reply or
 * the event gave it: the first of the two stands (they are the one moment).
 */
export function roomReady(
  state: ConversationState,
  sessionId: string,
  cast?: readonly string[],
  at?: number
): ConversationState {
  const roomCast = cast === undefined ? state.roomCast : [...cast]
  const roomOpenedAt = state.roomOpenedAt ?? at
  return state.room === sessionId && roomCast === state.roomCast && roomOpenedAt === state.roomOpenedAt
    ? state
    : { ...state, room: sessionId, roomCast, roomOpenedAt }
}

/**
 * The user sent `text` into the room (Story 4.2): one room entry, never queued and never labelled,
 * and the room busy from now. There is no gate: the send is made whatever the room is doing, and main
 * interrupts the speaker. Without a live room there is nothing to send into.
 */
export function roomSent(
  state: ConversationState,
  at: number,
  text: string
): { state: ConversationState; sessionId?: string } {
  if (state.room === undefined) {
    return { state }
  }
  const sent = withRoomEntry(state, state.room, at, text)
  // The first message is the topic, once: a room with one keeps it, a message with no text in it is none,
  // and the summary ask is never one (`hydrate` derives the topic by this same rule).
  const topic = state.roomTopic !== undefined || isRoomSummaryTurn(text) ? '' : roomTopicOf(text)
  return {
    state: topic === '' ? sent : { ...sent, roomTopic: topic },
    sessionId: state.room
  }
}

/** One room user entry for `text` and the room busy from now: what a send into the room does to the state. */
function withRoomEntry(state: ConversationState, room: string, at: number, text: string): ConversationState {
  const entry: UserEntry = { kind: 'user', id: `entry-${state.nextId}`, at, text, room: true }
  return withBusy(withEntry(state, entry), room, true)
}

/**
 * The user pressed *Write summary to `_bmad/`* (Story 4.4): the room's own session is asked, as one turn,
 * to write its summary to the destination the header and the panel show. `text` is the ask for the
 * destination as it stands at the press; the entry shows what was sent and the room is busy, as with any
 * message into the room. The ask is never the topic, so the room's topic is left as it was. Without a live
 * room there is nothing to ask and nothing is sent.
 */
export function roomSummaryAsked(
  state: ConversationState,
  at: number
): { state: ConversationState; sessionId?: string; text?: string } {
  if (state.room === undefined) {
    return { state }
  }
  const text = roomSummaryTurn(roomDestination(state.roomOpenedAt, state.roomTopic))
  return { state: withRoomEntry(state, state.room, at, text), sessionId: state.room, text }
}

/**
 * Who is speaking in the room: the agent of the last room persona entry while the room has a turn in
 * flight, else no one. Only a persona entry after the last room user entry or room sysline counts: what
 * the user sent, or a line about a new room, ends whoever spoke before it. A pure function of the state;
 * nothing else lights a card.
 */
export function speakerOf(state: ConversationState): string | undefined {
  if (state.room === undefined || !state.busy.has(state.room)) {
    return undefined
  }
  for (let at = state.entries.length - 1; at >= 0; at -= 1) {
    const entry = state.entries[at]
    if (entry.kind === 'persona' && entry.room === true) {
      return entry.agent.id
    }
    if ((entry.kind === 'user' || entry.kind === 'sysline') && entry.room === true) {
      return undefined
    }
  }
  return undefined
}

/**
 * How many turns the room has had (Story 4.3): its persona entries from the room's opening on. A
 * message of the user's is not a turn, and neither is an entry of an earlier room, which is older
 * than this one's open time. Without an open time there are none.
 */
export function roomTurnsOf(state: ConversationState): number {
  const openedAt = state.roomOpenedAt
  if (state.room === undefined || openedAt === undefined) {
    return 0
  }
  return state.entries.filter((entry) => entry.kind === 'persona' && entry.room === true && entry.at >= openedAt).length
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
  return withEntry(state, {
    kind: 'sysline',
    id: record.id,
    at: record.at,
    text: record.text,
    ...(record.room === true ? { room: true as const } : {})
  })
}

/** The card main held for a run, as the window keeps it; its prose goes to the prose store. */
function runEntryOf(card: RunCardSnapshot): RunCardEntry {
  return {
    kind: 'run',
    id: card.runId,
    at: card.startedAt,
    runId: card.runId,
    sessionId: card.sessionId,
    ...(card.agentId === undefined ? {} : { agentId: card.agentId }),
    status: card.status,
    ...(card.endedAt === undefined ? {} : { endedAt: card.endedAt }),
    ...(card.error === undefined ? {} : { error: card.error }),
    notes: card.notes,
    ...(card.plan === undefined ? {} : { plan: card.plan }),
    documents: card.documents.map(({ path, sections }) => ({ path, sections }))
  }
}

/**
 * One run event folded into its card, as main folds it (`fold/run-card.ts`):
 * notes in order, the plan names a note pulled, a confirmed write's sections
 * set on its path, and one terminal event. A card that has ended takes nothing more. `doc:prose` and a
 * commit's text are not folded here: they are the prose store's.
 */
function foldRunEntry(entry: RunCardEntry, event: ContractEvent): RunCardEntry {
  if (entry.status !== 'running') {
    return entry
  }
  switch (event.name) {
    case 'run:note': {
      const notes = [...entry.notes, { text: event.payload.text, at: event.payload.at }]
      const { pulled } = event.payload
      return pulled === undefined || pulled.length === 0
        ? { ...entry, notes }
        : { ...entry, notes, plan: withPulled(entry.plan, pulled) }
    }
    case 'doc:committed': {
      if (!event.payload.ok) {
        return entry
      }
      const { path, sections } = event.payload
      const at = entry.documents.findIndex((document) => document.path === path)
      const documents = [...entry.documents]
      if (at === -1) {
        documents.push({ path, sections })
      } else {
        documents[at] = { path, sections }
      }
      return { ...entry, documents }
    }
    case 'run:finished':
      return { ...entry, status: 'finished', endedAt: event.payload.at }
    case 'run:stopped':
      return { ...entry, status: 'stopped', endedAt: event.payload.at }
    case 'run:failed':
      return { ...entry, status: 'failed', endedAt: event.payload.at, error: event.payload.error }
    default:
      return entry
  }
}

/** Apply a run's event to its card, wherever the card sits in the transcript. */
function withRunEvent(state: ConversationState, runId: string, event: ContractEvent): ConversationState {
  const at = state.entries.findIndex((entry) => entry.kind === 'run' && entry.runId === runId)
  const card = at === -1 ? undefined : state.entries[at]
  if (card === undefined || card.kind !== 'run') {
    return state
  }
  const next = foldRunEntry(card, event)
  if (next === card) {
    return state
  }
  const entries = [...state.entries]
  entries[at] = next
  return { ...state, entries }
}

/** The run card a transcript holds for a run, if any. */
export function runCardOf(state: ConversationState, runId: string): RunCardEntry | undefined {
  const card = state.entries.find((entry) => entry.kind === 'run' && entry.runId === runId)
  return card?.kind === 'run' ? card : undefined
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
 * The topic of the room opened at `openedAt`, read back from the stored entries by the rule `roomSent`
 * sets it live: the first user entry of the room (flagged `room`, at or after the open) that has text in
 * it and is not the summary ask, in its `roomTopicOf` shape. `undefined` when there is none.
 */
function storedTopicOf(entries: readonly TranscriptEntry[], openedAt: number): string | undefined {
  for (const entry of entries) {
    if (entry.kind === 'user' && entry.room === true && entry.at >= openedAt && !isRoomSummaryTurn(entry.text)) {
      const topic = roomTopicOf(entry.text)
      if (topic !== '') {
        return topic
      }
    }
  }
  return undefined
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
          messageId: record.messageId,
          ...(record.room === true ? { room: true as const } : {})
        }
      : record.kind === 'sysline'
        ? {
            kind: 'sysline',
            id: record.id,
            at: record.at,
            text: record.text,
            ...(record.room === true ? { room: true as const } : {})
          }
        : {
            kind: 'user',
            id: record.id,
            at: record.at,
            text: record.text,
            ...(record.room === true ? { room: true as const } : {})
          }
  )
  const cards = snapshot.runs.map(runEntryOf)
  const room = snapshot.room
  let next: ConversationState = {
    ...state,
    entries: [...stored, ...cards, ...state.entries],
    // The live room as main names it (Story 4.7): its cast and open time are main's, its topic is read back
    // from the stored entries. Without one there is no room, and nothing is made up.
    room: room?.sessionId,
    roomCast: room === undefined ? [] : [...room.cast],
    roomOpenedAt: room?.openedAt,
    roomTopic: room === undefined ? undefined : storedTopicOf(stored, room.openedAt),
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
      const { agentId, sessionId, at } = event.payload
      // The room has no agent id: it is the window's room, and only its cast and open time are kept (Stories 4.1, 4.3).
      // The activation turn of a persona is in flight until the session says it is awaiting.
      // The room's activation turn is in flight until the session says it is awaiting.
      return agentId === undefined
        ? { state: withBusy(roomReady(state, sessionId, undefined, at), sessionId, true) }
        : {
            state: withBusy(withSession(state, agentId, sessionId), sessionId, true)
          }
    }

    case 'session:closed': {
      const { sessionId, reason } = event.payload
      let next = withBusy(state, sessionId, false)
      if (next.room === sessionId) {
        next = { ...next, room: undefined, roomCast: [], roomOpenedAt: undefined, roomTopic: undefined }
      }
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
      const { id, at, text, room } = event.payload
      return { state: withHandoff(state, { kind: 'sysline', id, at, text, ...(room === true ? { room: true as const } : {}) }) }
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
      const { agentId, messageId, text, at: time, room } = event.payload
      if (agentId === undefined) {
        return { state }
      }
      // A turn in the room nobody sent still has the room mid-turn.
      const held =
        room === true && state.room === event.payload.sessionId
          ? withBusy(state, event.payload.sessionId, true)
          : state
      // Messages queued while this one streams sit below it in the list; they
      // do not end it.
      let at = held.entries.length - 1
      while (at >= 0 && isQueued(held.entries[at])) {
        at -= 1
      }
      const last = at >= 0 ? held.entries[at] : undefined
      if (
        last !== undefined &&
        last.kind === 'persona' &&
        last.agent.id === agentId &&
        last.messageId === messageId
      ) {
        const joined: TranscriptEntry = { ...last, text: last.text + text }
        const entries = [...held.entries]
        entries[at] = joined
        return { state: { ...held, entries } }
      }
      return {
        state: withEntry(held, {
          kind: 'persona',
          id: `entry-${held.nextId}`,
          at: time,
          agent: agentOf(agentId) ?? unknownAgent(agentId),
          text,
          messageId,
          ...(room === true ? { room: true as const } : {})
        })
      }
    }

    case 'run:started': {
      // The run's card, born in time order; its session has a turn in flight.
      const { runId, sessionId, agentId, plan, at } = event.payload
      if (runCardOf(state, runId) !== undefined) {
        return { state }
      }
      const card: RunCardEntry = {
        kind: 'run',
        id: runId,
        at,
        runId,
        sessionId,
        ...(agentId === undefined ? {} : { agentId }),
        status: 'running',
        notes: [],
        ...(plan === undefined ? {} : { plan: [...plan] }),
        documents: []
      }
      return { state: withBusy({ ...state, entries: [...state.entries, card] }, sessionId, true) }
    }

    case 'run:note':
    case 'doc:committed':
    case 'run:finished':
    case 'run:stopped':
    case 'run:failed':
      return { state: withRunEvent(state, event.payload.runId, event) }

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
