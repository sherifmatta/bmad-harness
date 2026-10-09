import type { HarnessError } from './install'
import type { RailSnapshot } from './rail'
import type { AgentId, CallId, EpochMs, MessageId, RunId, SessionId } from './ids'

/**
 * The events out — everything main tells the renderer happened, declared once
 * so that no two consumers can assume different payload shapes. Types only,
 * plus the one literal below: the contract is the same on both sides of the
 * bridge precisely because it carries no behaviour that could differ.
 *
 * Names are `noun:verb-past`. Paths are project-relative POSIX and times are
 * epoch milliseconds. Every event originates in main: the renderer sends
 * commands and never raises an event of its own, so the origin slot admits
 * only `'main'`.
 *
 * Adding a payload field is additive and does not change the version. A field
 * is removed or re-typed only by changing `CONTRACT_VERSION`, which is stamped
 * on logs for forensics and never used to refuse anything.
 */
export const CONTRACT_VERSION = 1

/**
 * One event's declaration: where it comes from, how often it fires, and what
 * it carries. The cardinality is a sentence in the type so it is read where the
 * payload is read, and cannot drift into a comment nobody opens.
 */
export type EventSpec<Origin extends 'main', Cardinality extends string, Payload> = {
  origin: Origin
  cardinality: Cardinality
  payload: Payload
}

/** What a persona's tile shows. Every state is also written out as text. */
export type PersonaState = 'idle' | 'work' | 'live' | 'note' | 'error'

/** Why a session ended. */
export type SessionEnd = 'closed' | 'process-exited'

/** A session came up and can take its first turn. */
export type SessionOpened = { sessionId: SessionId; agentId?: AgentId; at: EpochMs }

/** The session is free for the next turn. Queued messages are sent on this. */
export type SessionAwaitingTurn = { sessionId: SessionId; at: EpochMs }

/** The session is gone and will take no more turns. */
export type SessionClosed = {
  sessionId: SessionId
  agentId?: AgentId
  reason: SessionEnd
  at: EpochMs
}

/**
 * A piece of what the persona said, in their own words. `text` is whole
 * characters only and never edited by the harness; `messageId` groups the
 * pieces of one message.
 */
export type PersonaSaid = {
  sessionId: SessionId
  agentId?: AgentId
  messageId: MessageId
  text: string
  at: EpochMs
  /**
   * Set on what a persona said in a room (Story 4.2), where `agentId` is the one the turn's marker
   * named: the words belong to the party thread and never to the persona's 1:1 thread.
   */
  room?: true
}

/**
 * A line the harness wrote into the conversation in its own voice: a failed
 * turn, a process that exited, a session that has gone quiet. It belongs to no
 * persona, has no portrait or name, and is kept with the transcript under `id`,
 * so a window that reloads finds it where it fell.
 */
export type HarnessSaid = {
  sessionId?: SessionId
  id: string
  text: string
  at: EpochMs
  /** Set on every harness line about a room: it belongs to the party thread (`SyslineRecord.room`). */
  room?: true
}

/** A persona's aggregated state changed. Keyed by `agentId`, never by name. */
export type PersonaStateChanged = { agentId: AgentId; state: PersonaState; at: EpochMs }

/**
 * A run began. `code` is the menu code that started it. `plan` is the section
 * names the skill's own template predicts for its document, leading numbering
 * stripped and in template order; absent when the skill has no readable
 * template, which is no failure. `skill` is the name of the skill the dispatched menu
 * entry resolved to: set by main only for a skill entry whose name is plain and bounded
 * (`shared/run-skill.ts`), never for a prompt entry, inherited by a carry-on run. A record
 * of what was invoked and never an input: nothing dispatches or resolves by it (AD-24).
 */
export type RunStarted = {
  runId: RunId
  sessionId: SessionId
  agentId?: AgentId
  code: string
  skill?: string
  plan?: string[]
  at: EpochMs
}

/**
 * A line the run left in its working notes rather than in a document: one new
 * entry of a `.memlog.md`, as the file holds it. It comes from the file, not
 * from a tool call, so it names no call; `at` is when main observed the append,
 * because the format carries no time of its own.
 */
export type RunNote = {
  runId: RunId
  sessionId: SessionId
  text: string
  /**
   * The Adapt-In sections of the skill's template that this note, a concern
   * scan, names, in the template's order and not already in the plan. Absent
   * when it names none. Main finds them; no window parses a memlog.
   */
  pulled?: string[]
  at: EpochMs
}

/**
 * One main-thread tool call of a run, as a step (AD-22). A union on `status`: `running`
 * once the call's input has finished streaming, carrying the label main derived from a
 * closed table (a verb and one allow-listed target, never the raw input), then `done` or
 * `failed` on the call's result (`failed` is the CLI's own `is_error`). A document write's
 * step shares its `callId` with its `doc:*` events.
 */
export type RunStep =
  | { runId: RunId; sessionId: SessionId; callId: CallId; status: 'running'; label: string; at: EpochMs }
  | { runId: RunId; sessionId: SessionId; callId: CallId; status: 'done' | 'failed'; at: EpochMs }

/** A tool call began writing a new section of a document. */
export type DocSectionOpened = {
  runId: RunId
  sessionId: SessionId
  callId: CallId
  path: string
  heading: string
  at: EpochMs
}

/**
 * A piece of the text a `Write` is writing to a document. Pieces of one call
 * concatenate in order, and a call's pieces replace that path's text. An
 * `Edit` streams none: what it did arrives whole on its `doc:committed`.
 */
export type DocProse = {
  runId: RunId
  sessionId: SessionId
  callId: CallId
  path: string
  text: string
  at: EpochMs
}

/**
 * The outcome of one document-writing tool call: the sections of the document
 * at `path` after it, or the envelope saying why it did not land.
 */
export type DocCommitted =
  | {
      ok: true
      runId: RunId
      sessionId: SessionId
      callId: CallId
      path: string
      /**
       * The level-2 headings of the document at `path` after the call, as main
       * holds it: a `Write`'s text, or the run's buffer of the path after an
       * `Edit`. None for an `Edit` of a path no `Write` of this run started.
       */
      sections: string[]
      /**
       * The whole document after an `Edit` that applied to the run's buffer of
       * `path` (its `old_string` replaced by its `new_string`). Absent for a
       * `Write`, whose text streamed as `doc:prose`, and for an `Edit` that
       * changed no buffer.
       */
      text?: string
      at: EpochMs
    }
  | {
      ok: false
      runId: RunId
      sessionId: SessionId
      callId: CallId
      path: string
      error: HarnessError
      at: EpochMs
    }

/** A run ended normally. */
export type RunFinished = { runId: RunId; sessionId: SessionId; at: EpochMs }

/** A run ended because the user stopped it. */
export type RunStopped = { runId: RunId; sessionId: SessionId; at: EpochMs }

/** A run ended because something went wrong. */
export type RunFailed = {
  runId: RunId
  sessionId: SessionId
  error: HarnessError
  at: EpochMs
}

/** The sixteen events out, by name. */
export type ContractEvents = {
  'session:opened': EventSpec<'main', 'once per session', SessionOpened>
  'session:awaiting-turn': EventSpec<
    'main',
    'once each time a session becomes free for a turn',
    SessionAwaitingTurn
  >
  'session:closed': EventSpec<'main', 'once per session, last', SessionClosed>
  'persona:said': EventSpec<'main', 'many per turn, in order', PersonaSaid>
  'harness:said': EventSpec<'main', 'once per line the harness writes, in order', HarnessSaid>
  'persona:state': EventSpec<
    'main',
    "once per change of a persona's aggregated state",
    PersonaStateChanged
  >
  'run:started': EventSpec<'main', 'exactly one per run, first', RunStarted>
  'run:note': EventSpec<'main', 'many per run', RunNote>
  'run:step': EventSpec<
    'main',
    'exactly one running per main-thread tool call of a run, then exactly one done or failed',
    RunStep
  >
  'doc:section-opened': EventSpec<'main', 'many per tool call', DocSectionOpened>
  'doc:prose': EventSpec<'main', 'many per tool call, in order', DocProse>
  'doc:committed': EventSpec<'main', 'exactly one per tool call', DocCommitted>
  'run:finished': EventSpec<'main', 'exactly one terminal run event per run, one of finished, stopped or failed', RunFinished>
  'run:stopped': EventSpec<'main', 'exactly one terminal run event per run, one of finished, stopped or failed', RunStopped>
  'run:failed': EventSpec<'main', 'exactly one terminal run event per run, one of finished, stopped or failed', RunFailed>
  'rail:changed': EventSpec<'main', 'once per rail revision', RailSnapshot>
}

/** Any event's name. */
export type EventName = keyof ContractEvents

/** The payload of the event called `Name`. */
export type EventPayload<Name extends EventName> = ContractEvents[Name]['payload']

/** An event as it travels: its name and its payload. */
export type ContractEvent = {
  [Name in EventName]: { name: Name; payload: EventPayload<Name> }
}[EventName]
