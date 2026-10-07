import type { HarnessError } from './install'
import type { AgentId, ProjectId, RunId, SessionId } from './ids'

/**
 * The commands in — everything the renderer asks main to do, declared once.
 * Types only, like `events.ts`. The renderer sends these and never interprets
 * what the CLI emits; what comes back is a reply here and events there.
 *
 * Each command is declared as its argument list, how often it is meant to be
 * sent, and its reply. The argument list is the call signature: the labels are
 * the names to use.
 */

/** A command's reply: what it produced, or the envelope saying why not. */
export type CommandReply<Ok = unknown> = ({ ok: true } & Ok) | { ok: false; error: HarnessError }

/** One command's declaration. */
export type CommandSpec<Args extends unknown[], Cardinality extends string, Reply> = {
  args: Args
  cardinality: Cardinality
  reply: Reply
}

/**
 * What `session.open` opens: a persona's session, by its agent id, or the room
 * (Story 4.1), a party session of the cast named, in the order given. The room
 * has no agent id of its own.
 */
export type SessionTarget = AgentId | { room: readonly AgentId[] }

/** The seven commands in, by name. */
export type ContractCommands = {
  'session.open': CommandSpec<
    [target: SessionTarget],
    'at most once per active persona and once per room, not per run',
    CommandReply<{ sessionId: SessionId }>
  >
  'session.close': CommandSpec<
    [sessionId: SessionId],
    'once per session, on persona close or session end',
    CommandReply
  >
  'turn.send': CommandSpec<
    [sessionId: SessionId, text: string],
    'once per message, and one turn in flight per session',
    CommandReply
  >
  'menu.dispatch': CommandSpec<
    [sessionId: SessionId, code: string],
    'once per menu activation, and one turn in flight per session',
    CommandReply<{ runId: RunId }>
  >
  'run.stop': CommandSpec<[runId: RunId], 'once per stop request', CommandReply>
  'doc.open': CommandSpec<[path: string], 'once per open request', CommandReply>
  'conversation.end': CommandSpec<
    [projectId: ProjectId],
    'once per deliberate end, the only way a transcript is cleared',
    CommandReply
  >
}

/** Any command's name. */
export type CommandName = keyof ContractCommands
