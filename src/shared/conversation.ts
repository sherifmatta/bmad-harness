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

/**
 * What a skill said in a skill-first session (Story 7.5): the speaker is the skill's name, which the
 * session's `skillSession` finds, never a persona. It belongs to that session's own thread alone.
 */
export type SkillRecord = {
  kind: 'skill'
  /** Main-assigned, `m-<n>`. */
  id: string
  at: EpochMs
  messageId: MessageId
  text: string
  /** The skill-first session this was said in. */
  skillSession: SessionId
}

/** What the user sent into a session, at the moment main wrote it. */
export type UserRecord = {
  kind: 'user'
  id: string
  at: EpochMs
  text: string
  /**
   * The literal `@name` token the user typed to hand the work to this persona (AD-25), case kept. Display only:
   * the persona received `text` alone. Absent on every other turn, and on a turn recorded before this field.
   */
  mention?: string
  /** Set on what the user sent into the room (Story 4.2): it belongs to the party thread. Absent otherwise. */
  room?: true
  /** Set on what the user sent into a skill-first session (Story 7.5): it belongs to that session's thread alone. */
  skillSession?: SessionId
}

/**
 * A line the harness wrote into the transcript in its own voice: the room's
 * opening and ending, a seat's ending, a turn's failure. (Older transcripts also
 * hold `handed to <Name>` lines, which main no longer writes.) It has no agent, portrait, name or timestamp of its own and is
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
  /** Set on every harness line about a skill-first session (Story 7.5): it belongs to that session's thread alone. */
  skillSession?: SessionId
}

export type TranscriptRecord = PersonaRecord | UserRecord | SyslineRecord | SkillRecord

/**
 * What `session.open` answers: the session. `handoff` stays declared as an
 * optional field a reply may carry, but main no longer sets it (Story 7.4):
 * turning to a persona writes nothing. Deferred cleanup: drop the field and the
 * renderer's fold of it. `session.open` keeps its declaration in the contract.
 */
export type SessionOpenReply = CommandReply<{
  sessionId: SessionId
  handoff?: SyslineRecord
  /**
   * Set on the answer to opening the room (Story 4.7), on a first open and on an open against a room
   * already live alike: that room's own cast, in open order, and when it opened. Absent on a persona's.
   */
  room?: { cast: AgentId[]; openedAt: EpochMs }
  /** Set on the answer to a first message that started a skill-first session (Story 7.5): its skill's name. */
  skill?: string
  /** Set on the answer to a first message that named a persona (Story 7.5): the seat to turn to. */
  seat?: AgentId
  /** Set on the answer to a first message that was routed to a seat or the room, when words followed the name. */
  rest?: string
}>

/** What opening a session resolves with in the renderer, once the envelope is unwrapped. */
export type OpenedSession = {
  sessionId: SessionId
  handoff?: SyslineRecord
  /** The room's own cast and open time, as the open's reply carried them (Story 4.7). */
  room?: { cast: AgentId[]; openedAt: EpochMs }
  /** The skill a first message started a skill-first session for (Story 7.5). */
  skill?: string
  /** The persona's seat a first message turned to (Story 7.5). */
  seat?: AgentId
  /** The words after the skill's name in a first message routed to a seat or the room (Story 7.5). */
  rest?: string
}

/**
 * One run card as the transcript file keeps it, with the moment main last
 * heard of the run: a card whose status is still `running` when it is read
 * back is a run that was cut off, and it ends at that moment.
 */
export type StoredRun = { card: RunCardSnapshot; lastAt: EpochMs }

/** One skill-first session the transcript lists (Story 7.5): its id, its skill and when it started. */
export type StoredSkillSession = { sessionId: SessionId; skill: string; at: EpochMs }

/**
 * The transcript as it lies on disk, one file per project. `runs` is additive:
 * a file written before it was there loads with none.
 */
export type TranscriptFile = {
  version: 1
  projectPath: string
  entries: TranscriptRecord[]
  runs?: StoredRun[]
  /** Additive (Story 7.5): the skill-first sessions, in start order. A file from before them loads with none. */
  skillSessions?: StoredSkillSession[]
}

/** Where a run stands: in flight, or the terminal event it ended on. */
export type RunStatus = 'running' | 'finished' | 'stopped' | 'failed'

/** One run note as a card holds it: the memlog line and when main observed it. */
export type RunCardNote = { text: string; at: EpochMs }

/**
 * One main-thread tool call of the run, as the card holds it (AD-22). `notesBefore` is how many
 * notes the card held when the step began: steps and notes interleave by fold order, never by time.
 */
export type RunCardStep = {
  callId: CallId
  label: string
  status: 'running' | 'done' | 'failed'
  startedAt: EpochMs
  endedAt?: EpochMs
  notesBefore: number
}

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
  /** `run:started.skill`: the skill the entry invoked, a recorded fact (AD-24). Absent for a prompt entry. */
  skill?: string
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
  /** The run's tool steps in fold order, at most 300 (`shared/run-steps.ts`). */
  steps: readonly RunCardStep[]
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
  /**
   * The skill-first sessions this project lists (Story 7.5), in start order: `live` is true only for one
   * main holds this launch. Never among `sessions` and never the room.
   */
  skillSessions?: { sessionId: SessionId; skill: string; live: boolean }[]
}

/** What `menu.dispatch` answers: the run it started, or the envelope saying why not. */
export type MenuDispatchReply = CommandReply<{ runId: RunId }>

/** The reply to `conversation:get`: the snapshot, or the envelope saying why not. */
export type ConversationReply =
  | { ok: true; snapshot: ConversationSnapshot }
  | { ok: false; error: HarnessError }
