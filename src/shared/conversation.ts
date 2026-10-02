import type { PersonaStateChanged } from './events'
import type { HarnessError } from './install'
import type { AgentId, EpochMs, MessageId, SessionId } from './ids'

/**
 * The conversation read — what main knows of one project's conversation when a
 * window asks, and what is stored of it between launches. Types only, like the
 * rest of `shared/`.
 *
 * It is a read beside `rail:get`, not an event and not a command: the contract's
 * fourteen events and seven commands are as they were. Only the transcript is
 * ever stored; the sessions, the busy set and the persona states are main's own
 * memory of this launch and are never written (FR100, NFR2).
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
}

/** What the user sent into a session, at the moment main wrote it. */
export type UserRecord = {
  kind: 'user'
  id: string
  at: EpochMs
  text: string
}

export type TranscriptRecord = PersonaRecord | UserRecord

/** The transcript as it lies on disk, one file per project. */
export type TranscriptFile = {
  version: 1
  projectPath: string
  entries: TranscriptRecord[]
}

/** What `conversation:get` answers. */
export type ConversationSnapshot = {
  entries: TranscriptRecord[]
  /** The sessions live in this launch, one per persona. */
  sessions: { agentId: AgentId; sessionId: SessionId }[]
  /** The live sessions with a turn in flight. */
  busy: SessionId[]
  /** The personas that are anything but `idle`, with when that state began. */
  personas: PersonaStateChanged[]
}

/** The reply to `conversation:get`: the snapshot, or the envelope saying why not. */
export type ConversationReply =
  | { ok: true; snapshot: ConversationSnapshot }
  | { ok: false; error: HarnessError }
