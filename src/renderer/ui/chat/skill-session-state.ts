import type { ConversationSnapshot, SkillRecord, SyslineRecord } from '../../../shared/conversation'
import type { SessionClosed, SessionOpened } from '../../../shared/events'
import { dropQueued, isQueued, withBusy, withEntry } from './conversation-core'
import type { ConversationState } from './conversation-state'
import { skillKey } from '../status/skill-seat'
import type { SkillSeat } from '../status/skill-seat'
import type { SkillEntry, TranscriptEntry } from './transcript-entry'

/**
 * The skill-first sessions of the window (Story 7.5), folded apart from the persona sessions and the room, which
 * they are neither of: their seats, their threads and the lines the window draws for them. Everything here is a
 * function of the events main pushed, the open's reply and the user's own sends, like the rest of the conversation.
 */

/**
 * One skill-first session as the window holds it: its skill's name, when it started (the first record of its
 * thread, or main's own `session:opened`) and whether this launch still holds it. A session listed and not live
 * is one that ended: its thread is kept and it takes no turn.
 */
export type SkillSessionState = { sessionId: string; skill: string; at: number; live: boolean }

/** A session first met as `session:opened` or the open's reply met it: live, its turn in flight until it says it is awaiting. */
export function withSkillSession(state: ConversationState, sessionId: string, skill: string, at: number): ConversationState {
  const known = state.skillSessions.get(sessionId)
  const next: SkillSessionState = { sessionId, skill, at: known?.at ?? at, live: true }
  if (known !== undefined && known.live && known.skill === skill) {
    return state
  }
  return { ...state, skillSessions: new Map(state.skillSessions).set(sessionId, next) }
}

/** `session:opened` for a skill-first session, which is not a persona's session or the room: its seat is held, live and busy. `undefined` when the event is for neither. */
export function skillOpened(state: ConversationState, opened: SessionOpened): ConversationState | undefined {
  return opened.skill === undefined
    ? undefined
    : withBusy(withSkillSession(state, opened.sessionId, opened.skill, opened.at), opened.sessionId, true)
}

/**
 * A skill-first session ended, by the user or by its process: it is no longer live and has no turn in flight, and
 * what was typed for it is dropped. `session:closed` for one; `undefined` for any other session.
 */
export function skillClosed(state: ConversationState, closed: SessionClosed): ConversationState | undefined {
  if (closed.skill === undefined) {
    return undefined
  }
  const held = state.skillSessions.get(closed.sessionId)
  if (held === undefined) {
    return state
  }
  const ended = withBusy(
    { ...state, skillSessions: new Map(state.skillSessions).set(closed.sessionId, { ...held, live: false }) },
    closed.sessionId,
    false
  )
  return dropQueued(ended, skillKey(closed.sessionId))
}

/**
 * A first message started a skill-first session (Story 7.5): the open's reply named it. The session is held
 * live and busy, and the user's words are the first turn of its own thread, at the instant they were sent;
 * a reply that comes after the events that already made the session adds nothing twice.
 */
export function skillStarted(
  state: ConversationState,
  sessionId: string,
  skill: string,
  at: number,
  text: string
): ConversationState {
  const entryId = `entry-${state.nextId}`
  const held = withSkillSession(state, sessionId, skill, at)
  const has = held.entries.some((entry) => entry.kind === 'user' && entry.skillSession === sessionId)
  const sent = has ? held : withEntry(held, { kind: 'user', id: entryId, at, text, skillSession: sessionId })
  return withBusy(sent, sessionId, true)
}

/**
 * The user ended a skill-first session: its thread, its run cards and its list item are gone from the window, as
 * they are from main, and nothing else is touched. Lines the window drew for it go with them.
 */
export function skillRemoved(state: ConversationState, sessionId: string): ConversationState {
  if (!state.skillSessions.has(sessionId)) {
    return state
  }
  const skillSessions = new Map(state.skillSessions)
  skillSessions.delete(sessionId)
  const dropped = dropQueued(withBusy(state, sessionId, false), skillKey(sessionId))
  return { ...dropped, skillSessions, entries: dropped.entries.filter((entry) => entry.skillSession !== sessionId) }
}

/** What the harness says to a message sent to a skill-first session main no longer holds: a fact, in its own register. */
export const SESSION_ENDED_LINE = 'session ended'

/**
 * A send to a skill-first session was refused as ended: one harness line in that session's own thread, made like the
 * room's refusal, and no user turn. Main wrote none; this is the window's own. Without the session held (it was
 * closed meanwhile) nothing is said.
 */
export function skillRefused(
  state: ConversationState,
  sessionId: string,
  at: number
): { state: ConversationState; said?: SyslineRecord } {
  if (!state.skillSessions.has(sessionId)) {
    return { state }
  }
  const said: SyslineRecord = { kind: 'sysline', id: `entry-${state.nextId}`, at, text: SESSION_ENDED_LINE, skillSession: sessionId }
  return { state: withEntry(state, { kind: 'sysline', id: said.id, at, text: said.text, skillSession: sessionId }), said }
}

/**
 * The skill-first sessions as seats, in start order: `ended` when this launch does not hold it, `work` while a turn is
 * in flight (counted from the later of the session's start, its last message of the user's and the card of a run
 * still in flight), else `live`. Derived from the state alone, so a reload draws the same.
 */
export function skillSeatsOf(state: ConversationState): SkillSeat[] {
  return [...state.skillSessions.values()].map(({ sessionId, skill, at, live }) => {
    if (!live) {
      return { sessionId, skill, at, state: 'ended', since: undefined }
    }
    if (!state.busy.has(sessionId)) {
      return { sessionId, skill, at, state: 'live', since: undefined }
    }
    let since = at
    for (const entry of state.entries) {
      // A message still queued is typed for a turn that has not begun: it does not move the start of the one in flight.
      if (entry.skillSession === sessionId && ((entry.kind === 'user' && entry.queuedFor === undefined) || (entry.kind === 'run' && entry.status === 'running'))) {
        since = Math.max(since, entry.at)
      }
    }
    return { sessionId, skill, at, state: 'work', since }
  })
}

/**
 * A skill-first session's turn in flight, while its session is busy: when it began (as `skillSeatsOf` counts it) and
 * the skill's entry its words are being written into so far. `undefined` when no turn is in flight, and before any
 * word while a run of the session is in flight, which that card already shows.
 */
export function skillTurnInFlight(
  state: ConversationState,
  sessionId: string
): { since: number; entryId: string | undefined } | undefined {
  const seat = skillSeatsOf(state).find((held) => held.sessionId === sessionId)
  if (seat === undefined || seat.state !== 'work' || seat.since === undefined) {
    return undefined
  }
  const since = seat.since
  let entryId: string | undefined
  for (let at = state.entries.length - 1; at >= 0; at -= 1) {
    const entry = state.entries[at]
    if (entry.kind === 'skill' && entry.skillSession === sessionId) {
      entryId = entry.at >= since ? entry.id : undefined
      break
    }
  }
  if (entryId === undefined && state.entries.some((entry) => entry.kind === 'run' && entry.skillSession === sessionId && entry.status === 'running')) {
    return undefined
  }
  return { since, entryId }
}

/**
 * Words a skill said: joined into its session's entry for the same message, else a new entry of that session's own
 * thread. Queued messages sit below an entry still streaming and do not end it.
 */
export function withSkillWords(
  state: ConversationState,
  sessionId: string,
  messageId: string,
  text: string,
  at: number
): ConversationState {
  let held = state.entries.length - 1
  while (held >= 0 && (isQueued(state.entries[held]) || state.entries[held].skillSession !== sessionId || state.entries[held].kind === 'run')) {
    held -= 1
  }
  const last = held >= 0 ? state.entries[held] : undefined
  if (last !== undefined && last.kind === 'skill' && last.messageId === messageId) {
    const entries = [...state.entries]
    entries[held] = { ...last, text: last.text + text }
    return { ...state, entries }
  }
  return withEntry(state, { kind: 'skill', id: `entry-${state.nextId}`, at, text, messageId, skillSession: sessionId })
}

/** A stored record of what a skill said, as the window draws it. */
export function skillEntryOf(record: SkillRecord): SkillEntry {
  return {
    kind: 'skill',
    id: record.id,
    at: record.at,
    text: record.text,
    messageId: record.messageId,
    skillSession: record.skillSession
  }
}

/**
 * The skill-first sessions main lists, in start order: each began when the first record of its thread was made (none
 * is not known, and is read as the epoch, which no seat shows unless another bears its name).
 */
export function skillSessionsOf(
  snapshot: ConversationSnapshot,
  stored: readonly TranscriptEntry[]
): Map<string, SkillSessionState> {
  return new Map(
    (snapshot.skillSessions ?? []).map(({ sessionId, skill, live }) => [
      sessionId,
      { sessionId, skill, live, at: stored.find((entry) => entry.skillSession === sessionId)?.at ?? 0 }
    ])
  )
}
