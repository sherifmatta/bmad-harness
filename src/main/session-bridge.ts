import { randomUUID } from 'node:crypto'
import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import type { ContractCommands } from '../shared/commands'
import type { ContractEvent } from '../shared/events'
import type { AgentId, SessionId } from '../shared/ids'
import type { HarnessError } from '../shared/install'
import { initialRouteState, routeFrame } from './fold/route-frame'
import type { RouteState } from './fold/route-frame'
import { endsTurn } from './fold/turn-end'
import { isAgentId, spawnSession } from './sources/session/session-process'
import type {
  SessionProcess,
  SpawnOutcome,
  SpawnSessionOptions
} from './sources/session/session-process'
import { projectPathForWebContents } from './windows/main-window'

/**
 * The three channels behind the preload's three session methods. Exported so
 * tests/bridge-contract.test.ts can tie them to the preload's own literals.
 * Every event travels on the one `session:event` channel as `{name, payload}`.
 */
export const SESSION_OPEN_CHANNEL = 'session:open'
export const TURN_SEND_CHANNEL = 'turn:send'
export const SESSION_EVENT_CHANNEL = 'session:event'

/** The parts of a `WebContents` the bridge touches. */
type Sender = {
  id: number
  send(channel: string, event: ContractEvent): void
  isDestroyed(): boolean
  once(event: 'destroyed', listener: () => void): unknown
}

type OpenReply = ContractCommands['session.open']['reply']
type SendReply = ContractCommands['turn.send']['reply']

export type SessionBridgeDeps = {
  projectPathFor?: (webContentsId: number) => string | undefined
  /** Start the process for one session; the real one starts `claude`. */
  spawn?: (options: SpawnSessionOptions) => Promise<SpawnOutcome>
  /** The clock every event is stamped from, injected so the fold never reads one. */
  now?: () => number
  newSessionId?: () => SessionId
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
  /** What `session.open` answers, for a second open that arrives mid-spawn. */
  ready: Promise<OpenReply>
}

type Service = {
  bySession: Map<SessionId, Entry>
  byAgent: Map<AgentId, Entry>
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

  const services = new Map<number, Service>()

  function emit(sender: Sender, event: ContractEvent): void {
    if (!sender.isDestroyed()) {
      sender.send(SESSION_EVENT_CHANNEL, event)
    }
  }

  function serviceFor(sender: Sender): Service {
    const existing = services.get(sender.id)
    if (existing !== undefined) {
      return existing
    }
    const service: Service = { bySession: new Map(), byAgent: new Map() }
    services.set(sender.id, service)

    // The window is gone: its processes go with it. The renderer is no longer
    // there to hear `session:closed`, so `emit` says nothing to a destroyed
    // sender, but the entries are closed all the same so nothing speaks again.
    sender.once('destroyed', () => {
      for (const entry of [...service.bySession.values()]) {
        entry.session?.kill()
        finish(sender, service, entry, 'closed')
      }
      services.delete(sender.id)
    })
    return service
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
    emit(sender, {
      name: 'session:closed',
      payload: { sessionId: entry.sessionId, agentId: entry.agentId, reason, at: now() }
    })
  }

  function onFrame(sender: Sender, entry: Entry, frame: unknown): void {
    if (entry.closed) {
      return
    }
    if (endsTurn(frame)) {
      entry.inFlight = false
      emit(sender, {
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
    for (const event of routed.events) {
      // A chat turn: the words are all the renderer is told.
      if (event.name === 'persona:said') {
        emit(sender, event)
      }
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
      ready: Promise.resolve(NOT_FOUND)
    }
    service.bySession.set(entry.sessionId, entry)
    service.byAgent.set(agentId, entry)

    entry.ready = start({
      agentId,
      cwd: projectRoot,
      onFrame: (frame) => onFrame(sender, entry, frame),
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
      emit(sender, {
        name: 'session:opened',
        payload: { sessionId: entry.sessionId, agentId, at: now() }
      })
      return { ok: true, sessionId: entry.sessionId }
    })
    return entry
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
      const service = serviceFor(sender)
      const existing = service.byAgent.get(agentId)
      if (existing !== undefined) {
        return existing.ready
      }
      return open(sender, service, projectRoot, agentId).ready
    }
  )

  ipcMain.handle(
    TURN_SEND_CHANNEL,
    (event: IpcMainInvokeEvent, sessionId: unknown, text: unknown): SendReply => {
      const sender = event.sender as unknown as Sender
      const entry =
        typeof sessionId === 'string' ? services.get(sender.id)?.bySession.get(sessionId) : undefined
      if (entry === undefined || entry.closed) {
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
      return { ok: true }
    }
  )
}
