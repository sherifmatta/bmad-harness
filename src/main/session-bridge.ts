import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { app, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import {
  CONVERSATION_END_CHANNEL,
  CONVERSATION_GET_CHANNEL,
  MENU_DISPATCH_CHANNEL,
  RUN_STOP_CHANNEL,
  SESSION_CLOSE_CHANNEL,
  SESSION_EVENT_CHANNEL,
  SESSION_OPEN_CHANNEL,
  TURN_SEND_CHANNEL
} from '../shared/channels'
import type { ContractCommands } from '../shared/commands'
import type { ConversationReply, MenuDispatchReply } from '../shared/conversation'
import type { RunId, SessionId } from '../shared/ids'
import type { ArtifactObservation } from '../shared/rail'
import {
  defaultProjectPathFor,
  defaultWriteDiagnostic,
  failure,
  noProject,
  senderOf,
  unexpected
} from './bridge-kit'
import type { Sender } from './bridge-kit'
import { beginTurn } from './fold/turn-end'
import { agentNameFor, menuEntryFor } from './install-model'
import { personaProjectionFor } from './persona-states'
import { createTranscriptRegistry } from './projections/transcript'
import type { TranscriptRegistry } from './projections/transcript'
import { createHandoffComposer } from './session-handoff'
import { NOT_FOUND, createSessionRegistry } from './session-registry'
import type { Entry, OpenReply, Service, SessionRegistry, SessionRegistryDeps } from './session-registry'
import type { TemplatePlan } from '../shared/section-plan'
import type { ResolvedMenuEntry } from './sources/install/schema'
import { readText } from './sources/project/read-text'
import { readPlan } from './sources/skill/read-plan'
import { canonicalPath } from './sources/session/canonical-path'
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
  MENU_DISPATCH_CHANNEL,
  RUN_STOP_CHANNEL,
  SESSION_CLOSE_CHANNEL,
  SESSION_EVENT_CHANNEL,
  SESSION_OPEN_CHANNEL,
  TURN_SEND_CHANNEL
}

type CloseReply = ContractCommands['session.close']['reply']
type SendReply = ContractCommands['turn.send']['reply']
type StopReply = ContractCommands['run.stop']['reply']
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
  /**
   * What the permission policy reads: the app's data directory (the real one is
   * `userData`, read when a request arrives), the home directory and the file
   * system's view of a path (the real one resolves links).
   */
  userDataDir?: () => string
  homeDir?: string
  canonicalize?: (absolutePath: string) => string
  /**
   * What a persona's menu code runs, from main's own install model, for the
   * window with this id. The session bridge asks the install model, never the
   * reverse; the real one reads the install bridge's projection.
   */
  menuEntryFor?: (webContentsId: number, agentId: string, code: string) => ResolvedMenuEntry | undefined
  newRunId?: () => RunId
  /** A memlog's text, read when the watcher saw it change; the real one reads the disk. */
  readText?: (absolutePath: string) => Promise<string | undefined>
  /**
   * The sections a skill's own template predicts, read once at dispatch for the
   * project and skill; `undefined` when there is none to read. The real one
   * reads the template under the project's `.claude/skills/<skill>/assets/`.
   */
  readPlan?: (projectRoot: string, skill: string) => Promise<TemplatePlan | undefined>
  /**
   * Hears each run event a window is told, with the run's card as main holds it
   * after the event folded. The composition root hands the one listener that
   * speaks for a run outside the window (`windows/run-notification`); with none,
   * nothing outside the window hears a run end.
   */
  told?: SessionRegistryDeps['told']
}

/** What the session side offers the rest of main: the rail's watcher tells it what it saw. */
export type SessionBridge = {
  /** A file of the window's project changed; resolves once a memlog's new notes, if any, are told. */
  observeArtifact(sender: Sender, projectRoot: string, observation: ArtifactObservation): Promise<void>
}

/** What the handlers share. */
type Context = {
  projectPathFor: (webContentsId: number) => string | undefined
  now: () => number
  writeDiagnostic: (line: string) => void
  transcripts: TranscriptRegistry
  registry: SessionRegistry
  handoffFor: ReturnType<typeof createHandoffComposer>
  menuEntryFor: NonNullable<SessionBridgeDeps['menuEntryFor']>
  newRunId: () => RunId
  readPlan: NonNullable<SessionBridgeDeps['readPlan']>
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

/** A session that can take a turn now, or the envelope saying why it cannot. */
type Refusal = ReturnType<typeof failure>
type Writable = { ok: true; service: Service; entry: Entry; arg: string } | { ok: false; error: Refusal }

/** The session a turn is for: open, idle, and the argument a string. Checked in this order. */
function writableSession(ctx: Context, sender: Sender, sessionId: unknown, arg: unknown): Writable {
  const service = ctx.registry.serviceOf(sender.id)
  const entry = typeof sessionId === 'string' ? service?.bySession.get(sessionId) : undefined
  if (service === undefined || entry === undefined || entry.closed) {
    return { ok: false, error: NOT_FOUND }
  }
  if (entry.turn.busy || entry.session === undefined) {
    return { ok: false, error: failure({ code: 'session/busy', message: 'session · a turn is already in flight' }) }
  }
  if (typeof arg !== 'string') {
    return { ok: false, error: failure({ code: 'session/invalid-turn', message: 'session · a turn is text' }) }
  }
  return { ok: true, service, entry, arg }
}

/**
 * Write one turn into an idle session: busy from the moment the write begins,
 * so a second turn while this one is being written is refused, and free again
 * only if the write failed. What the turn is (a send, a dispatch) is the
 * caller's to record once this says it was written.
 */
async function writeTurn(entry: Entry, text: string): Promise<{ ok: true } | Refusal> {
  entry.turn = beginTurn(entry.turn)
  const written = (await entry.session?.write(text)) ?? false
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
  // The user acted: whatever a stop held is spent, and a turn nobody sent after this is no continuation.
  entry.afterStop = undefined
  return { ok: true }
}

function sendTurn(ctx: Context) {
  return async (event: IpcMainInvokeEvent, sessionId: unknown, text: unknown): Promise<SendReply> => {
    const sender = senderOf(event)
    const target = writableSession(ctx, sender, sessionId, text)
    if (!target.ok) {
      return target.error
    }
    const { service, entry } = target
    const reply = await writeTurn(entry, target.arg)
    if (!reply.ok) {
      return reply
    }
    // The user's turn is recorded once it is written, at the instant it started.
    const at = ctx.now()
    ctx.transcripts.forProject(entry.projectRoot).recordUserTurn(target.arg, at)
    // A finished run's `live` ends when the next turn starts.
    service.personas.detach(entry.sessionId)
    service.personas.apply({
      name: 'turn:started',
      payload: { sessionId: entry.sessionId, at }
    })
    ctx.registry.watch(sender, service, entry)
    return { ok: true }
  }
}

/** What a resolved menu entry writes as the turn: the skill, invoked, or the prompt verbatim. */
function turnOf(entry: ResolvedMenuEntry): string {
  return entry.action.kind === 'skill' ? `/${entry.action.skill}` : entry.action.prompt
}

// A menu entry activated (AD-9). The renderer sends a session and a code and
// nothing else; main alone resolves the code against the persona's menu and
// decides between a skill and a prompt. The turn is written like a send, but no
// user turn is recorded: the run's card is what the transcript shows of it.
function dispatchMenu(ctx: Context) {
  return async (event: IpcMainInvokeEvent, sessionId: unknown, code: unknown): Promise<MenuDispatchReply> => {
    const sender = senderOf(event)
    const target = writableSession(ctx, sender, sessionId, code)
    if (!target.ok) {
      return target.error
    }
    const chosen = target.arg
    const resolved = ctx.menuEntryFor(sender.id, target.entry.agentId, chosen)
    if (resolved === undefined) {
      return failure({
        code: 'menu/unknown-entry',
        message: 'menu · this persona has no such entry'
      })
    }
    // A skill's plan is read before the turn is written, so `run:started` carries
    // it. The read can take a moment and the session is not yet busy: it is
    // checked again after, so two presses cannot both start a turn.
    let plan: TemplatePlan | undefined
    let writable = target
    if (resolved.action.kind === 'skill') {
      plan = await readPlanOf(ctx, target.entry.projectRoot, resolved.action.skill)
      const again = writableSession(ctx, sender, sessionId, code)
      if (!again.ok) {
        return again.error
      }
      writable = again
    }
    const { service, entry } = writable
    const reply = await writeTurn(entry, turnOf(resolved))
    if (!reply.ok) {
      return reply
    }
    const runId = ctx.newRunId()
    ctx.registry.startRun(sender, service, entry, runId, resolved.code, plan)
    ctx.registry.watch(sender, service, entry)
    return { ok: true, runId }
  }
}

/** The plan of a skill, or none: reading it is never a reason for a run not to start. */
async function readPlanOf(ctx: Context, projectRoot: string, skill: string): Promise<TemplatePlan | undefined> {
  try {
    return await ctx.readPlan(projectRoot, skill)
  } catch {
    return undefined
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

/** What a stop is told for a run that is not in flight: ended, never started, or another window's. */
const RUN_NOT_FOUND = failure({ code: 'run/not-found', message: 'run · no such run is in flight' })

// Stops one run of this window. The run is found by its id among the window's
// sessions, never through the roster, so an orphan's run stops as any other
// does. The reply is sent once the stop has settled: when the CLI accepted the
// interrupt (the card ends on the turn's own `result`, later) or when the
// session was ended instead (`session-stop`). A run that is not in flight, or is
// not this window's, is `run/not-found`; a stop for one already stopping is ok.
function stopRun(ctx: Context) {
  return async (event: IpcMainInvokeEvent, runId: unknown): Promise<StopReply> => {
    const sender = senderOf(event)
    const service = ctx.registry.serviceOf(sender.id)
    const entry =
      typeof runId === 'string'
        ? [...(service?.bySession.values() ?? [])].find((held) => !held.closed && held.run?.runId === runId)
        : undefined
    if (service === undefined || entry === undefined) {
      return RUN_NOT_FOUND
    }
    return (await ctx.registry.stop(sender, service, entry)) === 'ok' ? { ok: true } : RUN_NOT_FOUND
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
      service.runs.clear()
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
    const transcript = ctx.transcripts.forProject(projectRoot)
    const own = service?.runs.snapshot() ?? []
    const held = new Set(own.map((card) => card.runId))
    return {
      ok: true,
      snapshot: {
        entries: [...transcript.entries()],
        sessions: live.map(({ agentId, sessionId }) => ({ agentId, sessionId })),
        busy: live.filter((entry) => entry.turn.busy).map((entry) => entry.sessionId),
        personas: personaProjectionFor(sender, ctx.now).snapshot(),
        // The cards the transcript keeps that this window does not hold (the stored conversation's,
        // and those of an earlier window of this launch), each as it ended, then this window's own.
        runs: [...transcript.storedRuns().filter((card) => !held.has(card.runId)), ...own]
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
 * never queued. A menu dispatch is a turn too, and the run it starts lives as
 * long as that turn (`session-run`). The registry holds the sessions and folds
 * their frames; this registers the seven handlers that speak for them, and hands
 * the composition root the way the rail's watcher reports a memlog changing.
 *
 * Nothing crosses the bridge from stderr, and a failed start carries the
 * errno code and no message of the system's own.
 */
export function registerSessionBridge(deps: SessionBridgeDeps = {}): SessionBridge {
  const now = deps.now ?? (() => Date.now())
  const newRunId = deps.newRunId ?? ((): RunId => randomUUID())
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
      newRunId,
      transcripts,
      userDataDir: deps.userDataDir ?? (() => app.getPath('userData')),
      homeDir: deps.homeDir ?? homedir(),
      canonicalize: deps.canonicalize ?? canonicalPath,
      readText: deps.readText ?? readText,
      ...(deps.quietMs !== undefined ? { quietMs: deps.quietMs } : {}),
      ...(deps.schedule !== undefined ? { schedule: deps.schedule } : {}),
      ...(deps.told !== undefined ? { told: deps.told } : {})
    }),
    handoffFor: createHandoffComposer({
      transcripts,
      nameOf: deps.agentName ?? agentNameFor,
      now
    }),
    menuEntryFor: deps.menuEntryFor ?? menuEntryFor,
    newRunId,
    readPlan: deps.readPlan ?? readPlan
  }

  ipcMain.handle(SESSION_OPEN_CHANNEL, openSession(ctx))
  ipcMain.handle(TURN_SEND_CHANNEL, sendTurn(ctx))
  ipcMain.handle(MENU_DISPATCH_CHANNEL, dispatchMenu(ctx))
  ipcMain.handle(RUN_STOP_CHANNEL, stopRun(ctx))
  ipcMain.handle(SESSION_CLOSE_CHANNEL, closeSession(ctx))
  ipcMain.handle(CONVERSATION_END_CHANNEL, endConversation(ctx))
  ipcMain.handle(CONVERSATION_GET_CHANNEL, getConversation(ctx))

  return {
    observeArtifact: (sender, projectRoot, observation) => ctx.registry.observe(sender, projectRoot, observation)
  }
}
