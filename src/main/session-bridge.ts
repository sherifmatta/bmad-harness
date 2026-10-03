import { randomUUID } from 'node:crypto'
import { app, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import {
  CONVERSATION_END_CHANNEL,
  CONVERSATION_GET_CHANNEL,
  SESSION_CLOSE_CHANNEL,
  SESSION_EVENT_CHANNEL,
  SESSION_OPEN_CHANNEL,
  TURN_SEND_CHANNEL
} from '../shared/channels'
import type { ContractCommands } from '../shared/commands'
import type { ConversationReply } from '../shared/conversation'
import type { SessionId } from '../shared/ids'
import {
  defaultProjectPathFor,
  defaultWriteDiagnostic,
  failure,
  noProject,
  senderOf,
  unexpected
} from './bridge-kit'
import { beginTurn } from './fold/turn-end'
import { agentNameFor } from './install-model'
import { personaProjectionFor } from './persona-states'
import { createTranscriptRegistry } from './projections/transcript'
import type { TranscriptRegistry } from './projections/transcript'
import { createHandoffComposer } from './session-handoff'
import { NOT_FOUND, createSessionRegistry } from './session-registry'
import type { OpenReply, SessionRegistry } from './session-registry'
import { isAgentId, spawnSession } from './sources/session/session-process'
import type { SpawnOutcome, SpawnSessionOptions } from './sources/session/session-process'

/**
 * The channels behind the preload's session methods are spelled in
 * `src/shared/channels.ts` and re-exported here for tests/bridge-contract.test.ts.
 * Every event travels on the one `session:event` channel as `{name, payload}`;
 * `conversation:get` is the read a window makes on connecting and
 * `conversation:end` the one command that clears a conversation.
 */
export {
  CONVERSATION_END_CHANNEL,
  CONVERSATION_GET_CHANNEL,
  SESSION_CLOSE_CHANNEL,
  SESSION_EVENT_CHANNEL,
  SESSION_OPEN_CHANNEL,
  TURN_SEND_CHANNEL
}

type CloseReply = ContractCommands['session.close']['reply']
type SendReply = ContractCommands['turn.send']['reply']
type EndReply = ContractCommands['conversation.end']['reply']

export type SessionBridgeDeps = {
  projectPathFor?: (webContentsId: number) => string | undefined
  /** Start the process for one session; the real one starts `claude`. */
  spawn?: (options: SpawnSessionOptions) => Promise<SpawnOutcome>
  /** The clock every event is stamped from, injected so the fold never reads one. */
  now?: () => number
  newSessionId?: () => SessionId
  /**
   * A persona's display name from main's own install model, for the window with
   * this id. The real one reads the install bridge's projection.
   */
  agentName?: (webContentsId: number, agentId: string) => string | undefined
  /**
   * The transcripts, per project, that survive a reload and a relaunch. The
   * real one keeps them under `userData`; the composition root holds it so it
   * can flush them when the app quits.
   */
  transcripts?: TranscriptRegistry
  /** One diagnostic line, without its newline; the real one writes it to stderr. */
  writeDiagnostic?: (line: string) => void
  /** The silence clock: how long a busy session may say nothing, and what runs the timer. */
  quietMs?: number
  schedule?: (run: () => void, ms: number) => () => void
}

/** What the five handlers share. */
type Context = {
  projectPathFor: (webContentsId: number) => string | undefined
  now: () => number
  writeDiagnostic: (line: string) => void
  transcripts: TranscriptRegistry
  registry: SessionRegistry
  handoffFor: ReturnType<typeof createHandoffComposer>
}

function openSession(ctx: Context) {
  return async (event: IpcMainInvokeEvent, agentId: unknown): Promise<OpenReply> => {
    const sender = senderOf(event)
    const projectRoot = ctx.projectPathFor(sender.id)
    if (projectRoot === undefined) {
      return noProject('session')
    }
    if (!isAgentId(agentId)) {
      return failure({
        code: 'session/invalid-agent',
        message: 'session · not a valid agent id'
      })
    }
    try {
      const service = ctx.registry.serviceFor(sender, projectRoot)
      const existing = service.byAgent.get(agentId)
      const reply = await (existing !== undefined
        ? existing.ready
        : ctx.registry.open(sender, service, projectRoot, agentId).ready)
      if (!reply.ok) {
        return reply
      }
      const handoff = ctx.handoffFor(sender, service, projectRoot, agentId)
      return handoff === undefined ? reply : { ...reply, handoff }
    } catch (error) {
      return unexpected('session', error, ctx.writeDiagnostic)
    }
  }
}

function sendTurn(ctx: Context) {
  return async (event: IpcMainInvokeEvent, sessionId: unknown, text: unknown): Promise<SendReply> => {
    const sender = senderOf(event)
    const service = ctx.registry.serviceOf(sender.id)
    const entry = typeof sessionId === 'string' ? service?.bySession.get(sessionId) : undefined
    if (service === undefined || entry === undefined || entry.closed) {
      return NOT_FOUND
    }
    if (entry.turn.busy || entry.session === undefined) {
      return failure({
        code: 'session/busy',
        message: 'session · a turn is already in flight'
      })
    }
    if (typeof text !== 'string') {
      return failure({
        code: 'session/invalid-turn',
        message: 'session · a turn is text'
      })
    }
    // Busy from here, so a second send while this one is being written is refused.
    entry.turn = beginTurn(entry.turn)
    const written = await entry.session.write(text)
    // The window or the process went while the write was in flight: there is no turn to record.
    if (entry.closed) {
      return NOT_FOUND
    }
    if (!written) {
      entry.turn = { ...entry.turn, busy: false }
      return failure({
        code: 'session/write-failed',
        message: 'session · the turn could not be written'
      })
    }
    // The user's turn is recorded once it is written, at the instant it started.
    const at = ctx.now()
    ctx.transcripts.forProject(entry.projectRoot).recordUserTurn(text, at)
    service.personas.apply({
      name: 'turn:started',
      payload: { sessionId: entry.sessionId, at }
    })
    ctx.registry.watch(sender, service, entry)
    return { ok: true }
  }
}

// Ends one session of this window: its process is killed and it is closed
// through `finish`, so `session:closed` is emitted. The transcript is not
// touched, and neither is any other session. Nothing else ends a session
// short of the conversation ending, the process exiting or the window going.
function closeSession(ctx: Context) {
  return (event: IpcMainInvokeEvent, sessionId: unknown): CloseReply => {
    const sender = senderOf(event)
    const service = ctx.registry.serviceOf(sender.id)
    const entry = typeof sessionId === 'string' ? service?.bySession.get(sessionId) : undefined
    if (service === undefined || entry === undefined || entry.closed) {
      return NOT_FOUND
    }
    entry.session?.kill()
    ctx.registry.finish(sender, service, entry, 'closed')
    return { ok: true }
  }
}

// The one way a transcript is cleared (FR15). The file is cleared first: if
// that fails nothing else happens and the window keeps everything it has.
// Only then are the window's sessions killed and closed, so the reply, sent
// after their `session:closed` events, finds the window's own state settled.
function endConversation(ctx: Context) {
  return (event: IpcMainInvokeEvent, projectId: unknown): EndReply => {
    const sender = senderOf(event)
    const projectRoot = ctx.projectPathFor(sender.id)
    if (projectRoot === undefined) {
      return noProject('conversation')
    }
    if (projectId !== projectRoot) {
      return failure({
        code: 'conversation/wrong-project',
        message: 'conversation · not the project this window holds'
      })
    }
    const cleared = ctx.transcripts.forProject(projectRoot).clear()
    if (!cleared.ok) {
      return failure({
        code: 'conversation/end-failed',
        message: 'conversation · could not end the conversation',
        detail: cleared.errno
      })
    }
    const service = ctx.registry.serviceOf(sender.id)
    if (service !== undefined) {
      ctx.registry.closeSessions(sender, service)
      service.lastOpened = undefined
      service.written.clear()
    }
    return { ok: true }
  }
}

// Synchronous on purpose: everything main sent before this reply is in the
// snapshot and everything after it is not, which is what lets the window drop
// the events that arrive first and fold the ones that follow.
function getConversation(ctx: Context) {
  return (event: IpcMainInvokeEvent): ConversationReply => {
    const sender = senderOf(event)
    const projectRoot = ctx.projectPathFor(sender.id)
    if (projectRoot === undefined) {
      return noProject('conversation')
    }
    const service = ctx.registry.serviceOf(sender.id)
    // A window that reads the conversation again has reloaded: which persona it
    // was with is no longer known, and a handoff from a guess would be wrong.
    if (service !== undefined) {
      service.lastOpened = undefined
    }
    // A session still starting has told the window nothing yet, and is not one.
    const live = [...(service?.bySession.values() ?? [])].filter(
      (entry) => !entry.closed && entry.session !== undefined
    )
    return {
      ok: true,
      snapshot: {
        entries: [...ctx.transcripts.forProject(projectRoot).entries()],
        sessions: live.map(({ agentId, sessionId }) => ({ agentId, sessionId })),
        busy: live.filter((entry) => entry.turn.busy).map((entry) => entry.sessionId),
        personas: personaProjectionFor(sender, ctx.now).snapshot()
      }
    }
  }
}

/**
 * Open a persona's session, send it turns, and push what it says.
 *
 * Turns are serialised here, not in the renderer: a turn is in flight from the
 * activation write or a send until a main-thread `result` arrives with no
 * background task live (`fold/turn-end`), and a send in that window is refused,
 * never queued. The registry holds the sessions and folds their frames; this
 * registers the five handlers that speak for them.
 *
 * Nothing crosses the bridge from stderr, and a failed start carries the
 * errno code and no message of the system's own.
 */
export function registerSessionBridge(deps: SessionBridgeDeps = {}): void {
  const now = deps.now ?? (() => Date.now())
  const transcripts =
    deps.transcripts ?? createTranscriptRegistry({ userDataPath: () => app.getPath('userData') })
  const ctx: Context = {
    projectPathFor: deps.projectPathFor ?? defaultProjectPathFor,
    now,
    writeDiagnostic: deps.writeDiagnostic ?? defaultWriteDiagnostic,
    transcripts,
    registry: createSessionRegistry({
      start: deps.spawn ?? spawnSession,
      now,
      newSessionId: deps.newSessionId ?? (() => randomUUID()),
      transcripts,
      ...(deps.quietMs !== undefined ? { quietMs: deps.quietMs } : {}),
      ...(deps.schedule !== undefined ? { schedule: deps.schedule } : {})
    }),
    handoffFor: createHandoffComposer({
      transcripts,
      nameOf: deps.agentName ?? agentNameFor,
      now
    })
  }

  ipcMain.handle(SESSION_OPEN_CHANNEL, openSession(ctx))
  ipcMain.handle(TURN_SEND_CHANNEL, sendTurn(ctx))
  ipcMain.handle(SESSION_CLOSE_CHANNEL, closeSession(ctx))
  ipcMain.handle(CONVERSATION_END_CHANNEL, endConversation(ctx))
  ipcMain.handle(CONVERSATION_GET_CHANNEL, getConversation(ctx))
}
