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
 * seven commands are as they were. Only the transcript is
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
}

export type TranscriptRecord = PersonaRecord | UserRecord | SyslineRecord

/**
 * What `session.open` answers: the session, and, when the open was a handoff,
 * the sysline main wrote for it. `session.open` keeps its declaration in the
 * contract; the reply only gains this one optional field.
 */
export type SessionOpenReply = CommandReply<{ sessionId: SessionId; handoff?: SyslineRecord }>

/** What opening a session resolves with in the renderer, once the envelope is unwrapped. */
export type OpenedSession = { sessionId: SessionId; handoff?: SyslineRecord }

/** The transcript as it lies on disk, one file per project. */
export type TranscriptFile = {
  version: 1
  projectPath: string
  entries: TranscriptRecord[]
}

/** Where a run stands: in flight, or the terminal event it ended on. */
export type RunStatus = 'running' | 'finished' | 'stopped' | 'failed'

/** One run note as a card holds it: the memlog line and when main observed it. */
export type RunCardNote = { text: string; at: EpochMs }

/**
 * The document text a card holds: the call being written now, its path and
 * every piece of it so far, joined in order. A new call starts it again.
 */
export type RunCardProse = { callId: CallId; path: string; text: string }

/**
 * One run's card as main holds it, folded from the run's own events, so a
 * window that reloads mid-run is handed the card whole and no part of it
 * depends on having seen an earlier event. Memory only: never stored.
 */
export type RunCardSnapshot = {
  runId: RunId
  sessionId: SessionId
  agentId?: AgentId
  /** The menu code that started the run. */
  code: string
  /** `run:started.at`: what elapsed counts from. */
  startedAt: EpochMs
  status: RunStatus
  /** The terminal event's `at`, once there is one. */
  endedAt?: EpochMs
  /** A failed run's envelope. */
  error?: HarnessError
  notes: RunCardNote[]
  /** The distinct level-2 headings of the run's confirmed writes, in the order first committed. */
  sections: string[]
  prose: RunCardProse | null
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
  /** This launch's runs, in the order they started, each as its card stands. */
  runs: RunCardSnapshot[]
}

/** What `menu.dispatch` answers: the run it started, or the envelope saying why not. */
export type MenuDispatchReply = CommandReply<{ runId: RunId }>

/** The reply to `conversation:get`: the snapshot, or the envelope saying why not. */
export type ConversationReply =
  | { ok: true; snapshot: ConversationSnapshot }
  | { ok: false; error: HarnessError }
