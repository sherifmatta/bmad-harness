import type { CommandReply } from './commands'
import type { PersonaStateChanged } from './events'
import type { HarnessError } from './install'
import type { AgentId, CallId, EpochMs, MessageId, RunId, SessionId } from './ids'

/**
 * The conversation read — what main knows of one project's conversation when a
 * window asks, and what is stored of it between launches. Types only, like the
 * rest of `shared/`.
 *
 * It is a read beside `rail:get`, not an event and not a command: the contract's
 * seven commands are as they were. Only the transcript, and the run cards that
 * stand beside it, are ever stored; the sessions, the busy set and the persona
 * states are main's own memory of this launch and are never written (FR100,
 * NFR2).
 */

/** What a persona said: one message, its pieces joined in the order they came. */
export type PersonaRecord = {
  kind: 'persona'
  /** Main-assigned, `m-<n>`. */
  id: string
  at: EpochMs
  agentId: AgentId
  messageId: MessageId
  text: string
  /** Set on what a persona said in a room (Story 4.2): it belongs to the party thread. Absent otherwise. */
  room?: true
}

/** What the user sent into a session, at the moment main wrote it. */
export type UserRecord = {
  kind: 'user'
  id: string
  at: EpochMs
  text: string
  /** Set on what the user sent into the room (Story 4.2): it belongs to the party thread. Absent otherwise. */
  room?: true
}

/**
 * A line the harness wrote into the transcript in its own voice: a handoff
 * notice today. It has no agent, portrait, name or timestamp of its own and is
 * never joined into what a persona said.
 */
export type SyslineRecord = {
  kind: 'sysline'
  id: string
  at: EpochMs
  text: string
  /**
   * Set on every harness line about a room (Story 4.1): the one that says it opened,
   * and the ones about its turns or its process. Such a line belongs to the party
   * thread and never to a persona's 1:1 thread. Absent on every other line.
   */
  room?: true
}

export type TranscriptRecord = PersonaRecord | UserRecord | SyslineRecord

/**
 * What `session.open` answers: the session, and, when the open was a handoff,
 * the sysline main wrote for it. `session.open` keeps its declaration in the
 * contract; the reply only gains this one optional field.
 */
export type SessionOpenReply = CommandReply<{
  sessionId: SessionId
  handoff?: SyslineRecord
  /**
   * Set on the answer to opening the room (Story 4.7), on a first open and on an open against a room
   * already live alike: that room's own cast, in open order, and when it opened. Absent on a persona's.
   */
  room?: { cast: AgentId[]; openedAt: EpochMs }
}>

/** What opening a session resolves with in the renderer, once the envelope is unwrapped. */
export type OpenedSession = {
  sessionId: SessionId
  handoff?: SyslineRecord
  /** The room's own cast and open time, as the open's reply carried them (Story 4.7). */
  room?: { cast: AgentId[]; openedAt: EpochMs }
}

/**
 * One run card as the transcript file keeps it, with the moment main last
 * heard of the run: a card whose status is still `running` when it is read
 * back is a run that was cut off, and it ends at that moment.
 */
export type StoredRun = { card: RunCardSnapshot; lastAt: EpochMs }

/**
 * The transcript as it lies on disk, one file per project. `runs` is additive:
 * a file written before it was there loads with none.
 */
export type TranscriptFile = {
  version: 1
  projectPath: string
  entries: TranscriptRecord[]
  runs?: StoredRun[]
}

/** Where a run stands: in flight, or the terminal event it ended on. */
export type RunStatus = 'running' | 'finished' | 'stopped' | 'failed'

/** One run note as a card holds it: the memlog line and when main observed it. */
export type RunCardNote = { text: string; at: EpochMs }

/**
 * The document a card shows, its subject: the call that last set its text,
 * its path and the text itself.
 */
export type RunCardProse = { callId: CallId; path: string; text: string }

/**
 * One document a run wrote, as its card holds it. A `Write` replaces `text` as
 * it streams; an `Edit` that applied replaces it whole on its commit. `written`
 * is the length of the longest single `Write` to the path so far, the weight
 * that chooses the card's subject: the document with the greatest `written`
 * above zero, the earlier on a tie. `sections` are those of the path's last
 * confirmed write.
 */
export type RunCardDocument = {
  path: string
  callId: CallId
  text: string
  written: number
  sections: string[]
}

/**
 * One run's card as main holds it, folded from the run's own events, so a
 * window that reloads mid-run is handed the card whole and no part of it
 * depends on having seen an earlier event. Held in memory; the transcript file
 * keeps a copy of each (`StoredRun`) for a window after a relaunch to draw.
 */
export type RunCardSnapshot = {
  runId: RunId
  sessionId: SessionId
  agentId?: AgentId
  /** The menu code that started the run. */
  code: string
  /**
   * The section names the run is predicted to write: `run:started.plan`, then
   * the Adapt-In names its notes pulled in, each once. Absent with no template.
   */
  plan?: string[]
  /** `run:started.at`: what elapsed counts from. */
  startedAt: EpochMs
  status: RunStatus
  /** The terminal event's `at`, once there is one. */
  endedAt?: EpochMs
  /** A failed run's envelope. */
  error?: HarnessError
  notes: RunCardNote[]
  /** Every document the run wrote, in the order first seen (first piece, or first confirmed write). */
  documents: RunCardDocument[]
}

/** What `conversation:get` answers. */
export type ConversationSnapshot = {
  entries: TranscriptRecord[]
  /** The sessions live in this launch, one per persona. */
  sessions: { agentId: AgentId; sessionId: SessionId }[]
  /**
   * The window's room while it is live (Story 4.7): its session, its cast in open order and when it
   * opened. Main's memory of this launch, never stored. Absent when the room is still starting, stopped,
   * exited or from before a relaunch. The room is never among `sessions`.
   */
  room?: { sessionId: SessionId; cast: AgentId[]; openedAt: EpochMs }
  /** The live sessions with a turn in flight, the room's included. */
  busy: SessionId[]
  /** The personas that are anything but `idle`, with when that state began. */
  personas: PersonaStateChanged[]
  /**
   * The runs of the stored conversation, each as it ended or as it stood when
   * it was cut off, then this launch's, in the order they started, each as its
   * card stands.
   */
  runs: RunCardSnapshot[]
}

/** What `menu.dispatch` answers: the run it started, or the envelope saying why not. */
export type MenuDispatchReply = CommandReply<{ runId: RunId }>

/** The reply to `conversation:get`: the snapshot, or the envelope saying why not. */
export type ConversationReply =
  | { ok: true; snapshot: ConversationSnapshot }
  | { ok: false; error: HarnessError }
