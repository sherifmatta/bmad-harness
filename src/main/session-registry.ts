import type { ContractEvent } from '../shared/events'
import type { AgentId, SessionId } from '../shared/ids'
import type { SessionOpenReply } from '../shared/conversation'
import { failure, sendTo } from './bridge-kit'
import type { Sender } from './bridge-kit'
import { SESSION_EVENT_CHANNEL } from '../shared/channels'
import { personaProjectionFor } from './persona-states'
import type { PersonaProjection } from './projections/personas'
import type { TranscriptRegistry } from './projections/transcript'
import { initialRouteState, routeFrame } from './fold/route-frame'
import type { RouteState } from './fold/route-frame'
import { endsTurn } from './fold/turn-end'
import { foldWrittenPaths, initialWrittenState, withWrittenPaths } from './fold/written-paths'
import type { WrittenState } from './fold/written-paths'
import type {
  SessionProcess,
  SpawnOutcome,
  SpawnSessionOptions
} from './sources/session/session-process'

/**
 * The sessions of every window: who is open, what each one is doing, and what
 * its frames mean. The IPC handlers in `session-bridge` ask it; nothing here
 * knows a channel but the one events travel on.
 *
 * A window's service exists from its first `session.open` and holds one session
 * per agent: a second open for a live agent is the same session and spawns
 * nothing. Frames are folded in main and only `persona:said` goes on to the
 * renderer; it never sees a frame.
 */

export type OpenReply = SessionOpenReply

export type Entry = {
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

export type Service = {
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

export const NOT_FOUND = failure({
  code: 'session/not-found',
  message: 'session · no such session is open'
})

export type SessionRegistryDeps = {
  start: (options: SpawnSessionOptions) => Promise<SpawnOutcome>
  now: () => number
  newSessionId: () => SessionId
  transcripts: TranscriptRegistry
}

export type SessionRegistry = {
  /** The service a window already has, if any. */
  serviceOf(senderId: number): Service | undefined
  /** The window's service, made on first ask. */
  serviceFor(sender: Sender, projectRoot: string): Service
  /** Start a session; its `ready` says how that went. */
  open(sender: Sender, service: Service, projectRoot: string, agentId: AgentId): Entry
  /** Kill every session of a window and close each one. */
  closeSessions(sender: Sender, service: Service): void
  /** Close one session; emits `session:closed` unless it already was. */
  finish(
    sender: Sender,
    service: Service,
    entry: Entry,
    reason: 'closed' | 'process-exited'
  ): void
}

type FrameSinks = {
  now: () => number
  transcripts: TranscriptRegistry
  announce: (sender: Sender, service: Service, event: ContractEvent) => void
  emit: (sender: Sender, event: ContractEvent) => void
}

/** What one raw frame from a session does: end its turn, or say something, or write a file. */
function foldFrame(
  sinks: FrameSinks,
  sender: Sender,
  service: Service,
  entry: Entry,
  frame: unknown
): void {
  const { now, transcripts, announce, emit } = sinks
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

export function createSessionRegistry(deps: SessionRegistryDeps): SessionRegistry {
  const { start, now, newSessionId, transcripts } = deps
  const services = new Map<number, Service>()

  function emit(sender: Sender, event: ContractEvent): void {
    sendTo(sender, SESSION_EVENT_CHANNEL, event)
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

  /** Forget a session that never came up: it was never announced, so nothing is closed. */
  function discard(service: Service, entry: Entry): void {
    entry.closed = true
    service.bySession.delete(entry.sessionId)
    if (service.byAgent.get(entry.agentId) === entry) {
      service.byAgent.delete(entry.agentId)
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
    discard(service, entry)
    announce(sender, service, {
      name: 'session:closed',
      payload: { sessionId: entry.sessionId, agentId: entry.agentId, reason, at: now() }
    })
  }

  function onFrame(sender: Sender, service: Service, entry: Entry, frame: unknown): void {
    foldFrame({ now, transcripts, announce, emit }, sender, service, entry, frame)
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

    // A start that throws or rejects leaves nothing behind: the entry is
    // dropped from both maps and the failure goes to the handler's catch.
    entry.ready = new Promise<SpawnOutcome>((resolve) =>
      resolve(
        start({
          agentId,
          cwd: projectRoot,
          onFrame: (frame) => onFrame(sender, service, entry, frame),
          onExit: () => finish(sender, service, entry, 'process-exited')
        })
      )
    ).then(
      (outcome): OpenReply => {
        if (!outcome.ok) {
          discard(service, entry)
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
      },
      (error: unknown): never => {
        discard(service, entry)
        throw error
      }
    )
    return entry
  }

  return {
    serviceOf: (senderId) => services.get(senderId),
    serviceFor,
    open,
    closeSessions,
    finish
  }
}
