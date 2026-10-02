import { randomUUID } from 'node:crypto'
import { app, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { ContractCommands } from '../shared/commands'
import type { ConversationReply, SessionOpenReply, SyslineRecord } from '../shared/conversation'
import type { ContractEvent } from '../shared/events'
import type { AgentId, SessionId } from '../shared/ids'
import type { HarnessError } from '../shared/install'
import { agentNameFor } from './install-model'
import type { PersonaProjection } from './projections/personas'
import { createTranscriptRegistry } from './projections/transcript'
import type { TranscriptRegistry } from './projections/transcript'
import { SESSION_EVENT_CHANNEL, personaProjectionFor } from './persona-states'
import { initialRouteState, routeFrame } from './fold/route-frame'
import type { RouteState } from './fold/route-frame'
import { endsTurn } from './fold/turn-end'
import { foldWrittenPaths, initialWrittenState, withWrittenPaths } from './fold/written-paths'
import type { WrittenState } from './fold/written-paths'
import { isAgentId, spawnSession } from './sources/session/session-process'
import type {
  SessionProcess,
  SpawnOutcome,
  SpawnSessionOptions
} from './sources/session/session-process'
import { projectPathForWebContents } from './windows/main-window'

/**
 * The channels behind the preload's five session methods. Exported so
 * tests/bridge-contract.test.ts can tie them to the preload's own literals.
 * Every event travels on the one `session:event` channel as `{name, payload}`;
 * `conversation:get` is the read a window makes on connecting and
 * `conversation:end` the one command that clears a conversation.
 */
export const SESSION_OPEN_CHANNEL = 'session:open'
export const TURN_SEND_CHANNEL = 'turn:send'
export const CONVERSATION_GET_CHANNEL = 'conversation:get'
export const CONVERSATION_END_CHANNEL = 'conversation:end'
export { SESSION_EVENT_CHANNEL }

/** The parts of a `WebContents` the bridge touches. */
type Sender = {
  id: number
  send(channel: string, event: ContractEvent): void
  isDestroyed(): boolean
  once(event: 'destroyed', listener: () => void): unknown
}

type OpenReply = SessionOpenReply
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
}

type Entry = {
  sessionId: SessionId
  agentId: AgentId
  projectRoot: string
  session: SessionProcess | undefined
  /** True from the activation write or a send until the turn's `result` frame. */
  inFlight: boolean
  closed: boolean
  route: RouteState
  /** The writes of this session's chat turns that have begun and not yet closed. */
  written: WrittenState
  /** What `session.open` answers, for a second open that arrives mid-spawn. */
  ready: Promise<OpenReply>
}

type Service = {
  /** The project this window was opened for, which its transcript is kept under. */
  projectRoot: string
  bySession: Map<SessionId, Entry>
  byAgent: Map<AgentId, Entry>
  /** The window's persona states, shared with the rail bridge. */
  personas: PersonaProjection
  /**
   * The persona whose session this window last opened successfully. Memory only:
   * it is reset by `conversation:get` and by ending the conversation, so a window
   * that reloaded has no `from` rather than a wrong one.
   */
  lastOpened: AgentId | undefined
  /**
   * The project-relative files each persona's chat turns wrote this conversation,
   * in write order, each once. Memory only, cleared when the conversation ends.
   */
  written: Map<AgentId, readonly string[]>
}

function failure(error: HarnessError): { ok: false; error: HarnessError } {
  return { ok: false, error }
}

const NOT_FOUND = failure({
  code: 'session/not-found',
  message: 'session · no such session is open'
})

/**
 * Open a persona's session, send it turns, and push what it says.
 *
 * The service for a window exists from its first `session.open` and holds one
 * session per agent: a second open for a live agent is the same session and
 * spawns nothing. Turns are serialised here, not in the renderer: a turn is in
 * flight from the activation write or a send until the CLI's `result` frame,
 * and a send in that window is refused, never queued. Frames are folded in main
 * and only `persona:said` goes on to the renderer; it never sees a frame.
 *
 * Nothing crosses the bridge from stderr, and a failed start carries the
 * errno code and no message of the system's own.
 */
export function registerSessionBridge(deps: SessionBridgeDeps = {}): void {
  const projectPathFor = deps.projectPathFor ?? projectPathForWebContents
  const start = deps.spawn ?? spawnSession
  const now = deps.now ?? (() => Date.now())
  const newSessionId = deps.newSessionId ?? (() => randomUUID())
  const nameOf = deps.agentName ?? agentNameFor
  const transcripts =
    deps.transcripts ?? createTranscriptRegistry({ userDataPath: () => app.getPath('userData') })

  const services = new Map<number, Service>()

  function emit(sender: Sender, event: ContractEvent): void {
    if (!sender.isDestroyed()) {
      sender.send(SESSION_EVENT_CHANNEL, event)
    }
  }

  /** Tell the renderer, then let the persona states hear it: both from the one event. */
  function announce(sender: Sender, service: Service, event: ContractEvent): void {
    emit(sender, event)
    service.personas.apply(event)
  }

  function serviceFor(sender: Sender, projectRoot: string): Service {
    const existing = services.get(sender.id)
    if (existing !== undefined) {
      return existing
    }
    const service: Service = {
      projectRoot,
      bySession: new Map(),
      byAgent: new Map(),
      personas: personaProjectionFor(sender, now),
      lastOpened: undefined,
      written: new Map()
    }
    services.set(sender.id, service)

    // The window is gone: its processes go with it. The renderer is no longer
    // there to hear `session:closed`, so `emit` says nothing to a destroyed
    // sender, but the entries are closed all the same so nothing speaks again.
    // The transcript is kept, and written now rather than when its timer fires.
    sender.once('destroyed', () => {
      closeSessions(sender, service)
      services.delete(sender.id)
      transcripts.flush(projectRoot)
    })
    return service
  }

  /**
   * Kill every session of a window and close each one: a session still
   * starting is closed too, and the process it was starting is killed when it
   * arrives. Each emits `session:closed`, so none is reclaimed silently.
   */
  function closeSessions(sender: Sender, service: Service): void {
    for (const entry of [...service.bySession.values()]) {
      entry.session?.kill()
      finish(sender, service, entry, 'closed')
    }
  }

  function finish(
    sender: Sender,
    service: Service,
    entry: Entry,
    reason: 'closed' | 'process-exited'
  ): void {
    if (entry.closed) {
      return
    }
    entry.closed = true
    service.bySession.delete(entry.sessionId)
    if (service.byAgent.get(entry.agentId) === entry) {
      service.byAgent.delete(entry.agentId)
    }
    announce(sender, service, {
      name: 'session:closed',
      payload: { sessionId: entry.sessionId, agentId: entry.agentId, reason, at: now() }
    })
  }

  function onFrame(sender: Sender, service: Service, entry: Entry, frame: unknown): void {
    if (entry.closed) {
      return
    }
    if (endsTurn(frame)) {
      entry.inFlight = false
      announce(sender, service, {
        name: 'session:awaiting-turn',
        payload: { sessionId: entry.sessionId, at: now() }
      })
      return
    }
    const routed = routeFrame(entry.route, frame, {
      sessionId: entry.sessionId,
      agentId: entry.agentId,
      projectRoot: entry.projectRoot,
      now: now()
    })
    entry.route = routed.state
    const wrote = foldWrittenPaths(entry.written, frame, entry.projectRoot)
    entry.written = wrote.state
    if (wrote.paths.length > 0) {
      const before = service.written.get(entry.agentId) ?? []
      service.written.set(entry.agentId, withWrittenPaths(before, wrote.paths))
    }
    for (const event of routed.events) {
      // A chat turn: the words are all the renderer is told, and the transcript keeps them.
      if (event.name === 'persona:said') {
        transcripts.forProject(entry.projectRoot).recordPersonaSaid(event.payload)
        emit(sender, event)
      }
      // Whatever the fold routed is heard by the persona states, which use only the run events.
      service.personas.apply(event)
    }
  }

  function open(sender: Sender, service: Service, projectRoot: string, agentId: AgentId): Entry {
    const entry: Entry = {
      sessionId: newSessionId(),
      agentId,
      projectRoot,
      session: undefined,
      inFlight: true,
      closed: false,
      route: initialRouteState,
      written: initialWrittenState,
      ready: Promise.resolve(NOT_FOUND)
    }
    service.bySession.set(entry.sessionId, entry)
    service.byAgent.set(agentId, entry)

    entry.ready = start({
      agentId,
      cwd: projectRoot,
      onFrame: (frame) => onFrame(sender, service, entry, frame),
      onExit: () => finish(sender, service, entry, 'process-exited')
    }).then((outcome): OpenReply => {
      if (!outcome.ok) {
        entry.closed = true
        service.bySession.delete(entry.sessionId)
        if (service.byAgent.get(agentId) === entry) {
          service.byAgent.delete(agentId)
        }
        return failure({
          code: 'session/spawn-failed',
          message: 'session · could not start the session',
          detail: outcome.errno
        })
      }
      if (entry.closed) {
        // The window went while the process was starting.
        outcome.session.kill()
        return NOT_FOUND
      }
      entry.session = outcome.session
      announce(sender, service, {
        name: 'session:opened',
        payload: { sessionId: entry.sessionId, agentId, at: now() }
      })
      return { ok: true, sessionId: entry.sessionId }
    })
    return entry
  }

  /**
   * Whether an open that succeeded was a handoff, and if so the sysline it wrote.
   * It was one when the transcript already has an entry and the window's last
   * opened persona is a different one; that persona is `from`, and the files it
   * wrote are what the new one picks up from. A persona the roster does not name
   * is not announced, and the open itself is unchanged. Either way this open is
   * now the last one.
   */
  function handoffFor(
    sender: Sender,
    service: Service,
    projectRoot: string,
    agentId: AgentId
  ): SyslineRecord | undefined {
    const from = service.lastOpened
    service.lastOpened = agentId
    if (from === undefined || from === agentId) {
      return undefined
    }
    const transcript = transcripts.forProject(projectRoot)
    if (transcript.entries().length === 0) {
      return undefined
    }
    const fromName = nameOf(sender.id, from)
    const toName = nameOf(sender.id, agentId)
    if (fromName === undefined || toName === undefined) {
      return undefined
    }
    const files = service.written.get(from) ?? []
    const text =
      `handed off · ${fromName} → ${toName}` +
      (files.length === 0 ? '' : ` · picking up from ${files.join(', ')}`)
    return transcript.recordSysline(text, now())
  }

  ipcMain.handle(
    SESSION_OPEN_CHANNEL,
    async (event: IpcMainInvokeEvent, agentId: unknown): Promise<OpenReply> => {
      const sender = event.sender as unknown as Sender
      const projectRoot = projectPathFor(sender.id)
      if (projectRoot === undefined) {
        return failure({
          code: 'session/no-project',
          message: 'session · no project is open for this window'
        })
      }
      if (!isAgentId(agentId)) {
        return failure({
          code: 'session/invalid-agent',
          message: 'session · not a valid agent id'
        })
      }
      const service = serviceFor(sender, projectRoot)
      const existing = service.byAgent.get(agentId)
      const reply = await (existing !== undefined
        ? existing.ready
        : open(sender, service, projectRoot, agentId).ready)
      if (!reply.ok) {
        return reply
      }
      const handoff = handoffFor(sender, service, projectRoot, agentId)
      return handoff === undefined ? reply : { ...reply, handoff }
    }
  )

  ipcMain.handle(
    TURN_SEND_CHANNEL,
    (event: IpcMainInvokeEvent, sessionId: unknown, text: unknown): SendReply => {
      const sender = event.sender as unknown as Sender
      const service = services.get(sender.id)
      const entry = typeof sessionId === 'string' ? service?.bySession.get(sessionId) : undefined
      if (service === undefined || entry === undefined || entry.closed) {
        return NOT_FOUND
      }
      if (entry.inFlight || entry.session === undefined) {
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
      entry.inFlight = true
      if (!entry.session.write(text)) {
        entry.inFlight = false
        return failure({
          code: 'session/write-failed',
          message: 'session · the turn could not be written'
        })
      }
      // The user's turn is recorded once it is written, at the instant it started.
      const at = now()
      transcripts.forProject(entry.projectRoot).recordUserTurn(text, at)
      service.personas.apply({
        name: 'turn:started',
        payload: { sessionId: entry.sessionId, at }
      })
      return { ok: true }
    }
  )

  // The one way a transcript is cleared (FR15). The file is cleared first: if
  // that fails nothing else happens and the window keeps everything it has.
  // Only then are the window's sessions killed and closed, so the reply, sent
  // after their `session:closed` events, finds the window's own state settled.
  ipcMain.handle(
    CONVERSATION_END_CHANNEL,
    (event: IpcMainInvokeEvent, projectId: unknown): EndReply => {
      const sender = event.sender as unknown as Sender
      const projectRoot = projectPathFor(sender.id)
      if (projectRoot === undefined) {
        return failure({
          code: 'conversation/no-project',
          message: 'conversation · no project is open for this window'
        })
      }
      if (projectId !== projectRoot) {
        return failure({
          code: 'conversation/wrong-project',
          message: 'conversation · not the project this window holds'
        })
      }
      const cleared = transcripts.forProject(projectRoot).clear()
      if (!cleared.ok) {
        return failure({
          code: 'conversation/end-failed',
          message: 'conversation · could not end the conversation',
          detail: cleared.errno
        })
      }
      const service = services.get(sender.id)
      if (service !== undefined) {
        closeSessions(sender, service)
        service.lastOpened = undefined
        service.written.clear()
      }
      return { ok: true }
    }
  )

  // Synchronous on purpose: everything main sent before this reply is in the
  // snapshot and everything after it is not, which is what lets the window drop
  // the events that arrive first and fold the ones that follow.
  ipcMain.handle(CONVERSATION_GET_CHANNEL, (event: IpcMainInvokeEvent): ConversationReply => {
    const sender = event.sender as unknown as Sender
    const projectRoot = projectPathFor(sender.id)
    if (projectRoot === undefined) {
      return failure({
        code: 'conversation/no-project',
        message: 'conversation · no project is open for this window'
      })
    }
    const service = services.get(sender.id)
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
        entries: [...transcripts.forProject(projectRoot).entries()],
        sessions: live.map(({ agentId, sessionId }) => ({ agentId, sessionId })),
        busy: live.filter((entry) => entry.inFlight).map((entry) => entry.sessionId),
        personas: personaProjectionFor(sender, now).snapshot()
      }
    }
  })
}
