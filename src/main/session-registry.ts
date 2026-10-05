import type { ContractEvent } from '../shared/events'
import type { AgentId, RunId, SessionId } from '../shared/ids'
import type { ArtifactObservation } from '../shared/rail'
import type { TemplatePlan } from '../shared/section-plan'
import type { SessionOpenReply } from '../shared/conversation'
import { failure, sendTo } from './bridge-kit'
import type { Sender } from './bridge-kit'
import { LINES, QUIET_MS, createQuietClock, createVoice, defaultSchedule } from './session-voice'
import { SESSION_EVENT_CHANNEL } from '../shared/channels'
import { personaProjectionFor } from './persona-states'
import type { PersonaProjection } from './projections/personas'
import { railAnnotatorFor } from './rail-annotations'
import type { RailAnnotator } from './projections/rail-annotator'
import { createRunProjection } from './projections/runs'
import type { RunProjection } from './projections/runs'
import { createMemlogCounts, createRunKit, deliver, endRun, observeMemlog, startRun } from './session-run'
import type { ActiveRun, MemlogCounts, RunKit } from './session-run'
import { stopRun } from './session-stop'
import type { TranscriptRegistry } from './projections/transcript'
import { initialRouteState, routeFrame } from './fold/route-frame'
import type { RouteState } from './fold/route-frame'
import { readFrame } from './fold/frame'
import { foldTurn, initialTurn } from './fold/turn-end'
import type { TurnState } from './fold/turn-end'
import { foldWrittenPaths, initialWrittenState, withWrittenPaths } from './fold/written-paths'
import type { WrittenState } from './fold/written-paths'
import { decidePermission } from './fold/permission-policy'
import type {
  PermissionAnswer,
  PermissionAsk,
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
  /**
   * Whether a turn is in flight and what is running behind it: from the
   * activation write or a send until a main-thread `result` arrives with no
   * background task live (see `fold/turn-end`).
   */
  turn: TurnState
  closed: boolean
  route: RouteState
  /** The writes of this session's chat turns that have begun and not yet closed. */
  written: WrittenState
  /** What `session.open` answers, for a second open that arrives mid-spawn. */
  ready: Promise<OpenReply>
  /** Stops the silence clock, while one is running: set while a turn is in flight. */
  stopQuietClock: (() => void) | undefined
  /** The run in flight, from its dispatch until its turn or the session ends (`session-run`). */
  run: ActiveRun | undefined
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
  /** The window's run cards, as main holds them for a reload. */
  runs: RunProjection
  /** What the window's runs say of the rail's rows, shared with the rail bridge, which hands it the projection to tell. */
  annotations: RailAnnotator
  /** Every memlog's entry count as last read, so a run's notes are only what was appended after. */
  memlogs: MemlogCounts
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
  /** Run `run` after `ms`; returns the way to cancel it. Replaceable by a test that holds time still. */
  schedule?: (run: () => void, ms: number) => () => void
  quietMs?: number
  /**
   * What the permission policy reads besides each session's own project root:
   * the app's data directory (read when a request arrives), the home directory
   * `~` and `$HOME` stand for, and the file system's view of a path.
   */
  userDataDir: () => string
  homeDir: string
  canonicalize: (absolutePath: string) => string
  /** A file's text, or `undefined`; the real one reads the disk. */
  readText: (absolutePath: string) => Promise<string | undefined>
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
  /**
   * Start, or start again, the silence clock of a session whose turn is in
   * flight; stop it for one whose turn is not. Called when a turn begins.
   */
  watch(sender: Sender, service: Service, entry: Entry): void
  /** A dispatch was written into a session: its run begins. */
  startRun(sender: Sender, service: Service, entry: Entry, runId: RunId, code: string, plan?: TemplatePlan): void
  /**
   * The user asked to stop the run `entry` has in flight: it is marked stopping
   * and interrupted (`session-stop`). `'not-found'` when the entry has no run.
   */
  stop(sender: Sender, service: Service, entry: Entry): Promise<'ok' | 'not-found'>
  /**
   * The rail's watcher saw a file of the window's project; a memlog is read for
   * the notes of the run in flight. Resolves once it is accounted for.
   */
  observe(sender: Sender, projectRoot: string, observation: ArtifactObservation): Promise<void>
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
  announce: (sender: Sender, service: Service, event: ContractEvent) => void
  /** The harness says a line in its own voice. */
  say: (sender: Sender, entry: Entry, text: string) => void
  runs: RunKit
}

/** What one raw frame from a session does: end its turn, or say something, or write a file. */
function foldFrame(
  sinks: FrameSinks,
  sender: Sender,
  service: Service,
  entry: Entry,
  frame: unknown
): void {
  const { now, announce, say, runs } = sinks
  if (entry.closed) {
    return
  }
  const step = foldTurn(entry.turn, readFrame(frame))
  entry.turn = step.state
  const signal = step.signal
  // A turn the user asked to stop ends on a failed `result`, which is the stop and not a failure.
  const stopped = signal?.kind === 'ended' && signal.failed && entry.run?.stopping === true
  // A failed result is told whether or not it freed the session: a line in the
  // transcript, and the persona reads `error` once it is no longer working.
  if (signal?.kind === 'failed-while-pending' || (signal?.kind === 'ended' && signal.failed && !stopped)) {
    say(sender, entry, LINES.failed(signal.subtype))
    service.personas.apply({ name: 'turn:failed', payload: { sessionId: entry.sessionId, at: now() } })
  }
  if (signal?.kind === 'ended') {
    // A run ends with its turn: the terminal event comes before the session is free.
    endRun(runs, sender, service, entry, stopped ? 'stopped' : { failed: signal.failed, subtype: signal.subtype })
    announce(sender, service, {
      name: 'session:awaiting-turn',
      payload: { sessionId: entry.sessionId, at: now() }
    })
    return
  }
  if (signal?.kind === 'resumed') {
    // A turn nobody sent: the session works again, though the renderer sent nothing.
    service.personas.detach(entry.sessionId)
    service.personas.apply({
      name: 'turn:started',
      payload: { sessionId: entry.sessionId, at: now() }
    })
  }
  const routed = routeFrame(entry.route, frame, {
    sessionId: entry.sessionId,
    agentId: entry.agentId,
    ...(entry.run === undefined ? {} : { runId: entry.run.runId }),
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
  // What the persona said is kept and told; a run's document events go to its card.
  deliver(runs, sender, service, entry, routed.events)
}

/** What starting a session's process needs of the registry that holds it. */
type StartKit = {
  start: SessionRegistryDeps['start']
  now: () => number
  announce: (sender: Sender, service: Service, event: ContractEvent) => void
  say: (sender: Sender, entry: Entry, text: string) => void
  watch: (sender: Sender, service: Service, entry: Entry) => void
  discard: (service: Service, entry: Entry) => void
  finish: SessionRegistry['finish']
  onFrame: (sender: Sender, service: Service, entry: Entry, frame: unknown) => void
  /** The permission policy, for a session in this project. */
  decide: (projectRoot: string, ask: PermissionAsk) => PermissionAnswer
}

/**
 * Start the process behind an entry and say how it went. A start that throws or
 * rejects leaves nothing behind: the entry is dropped from both maps and the
 * failure goes to the handler's catch.
 */
function startProcess(kit: StartKit, sender: Sender, service: Service, entry: Entry): Promise<OpenReply> {
  const { agentId, projectRoot } = entry
  return new Promise<SpawnOutcome>((resolve) =>
    resolve(
      kit.start({
        agentId,
        cwd: projectRoot,
        onFrame: (frame) => kit.onFrame(sender, service, entry, frame),
        decide: (ask) => kit.decide(projectRoot, ask),
        onExit: () => {
          if (!entry.closed) {
            kit.say(sender, entry, LINES.exited)
          }
          kit.finish(sender, service, entry, 'process-exited')
        }
      })
    )
  ).then(
    (outcome): OpenReply => {
      if (!outcome.ok) {
        kit.discard(service, entry)
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
      kit.announce(sender, service, {
        name: 'session:opened',
        payload: { sessionId: entry.sessionId, agentId, at: kit.now() }
      })
      // The activation turn is in flight.
      kit.watch(sender, service, entry)
      return { ok: true, sessionId: entry.sessionId }
    },
    (error: unknown): never => {
      kit.discard(service, entry)
      throw error
    }
  )
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

  const sayLine = createVoice({ transcripts, now, emit })
  const say = (sender: Sender, entry: Entry, text: string): void =>
    sayLine(sender, { sessionId: entry.sessionId, projectRoot: entry.projectRoot, text })
  const clock = createQuietClock<Sender, Entry>({
    schedule: deps.schedule ?? defaultSchedule,
    quietMs: deps.quietMs ?? QUIET_MS,
    onQuiet: (sender, entry) => say(sender, entry, LINES.quiet(deps.quietMs ?? QUIET_MS))
  })
  const watch = (sender: Sender, _service: Service, entry: Entry): void => clock(sender, entry)
  const schedule = deps.schedule ?? defaultSchedule
  const runs = createRunKit({ now, schedule, emit, transcripts, readText: deps.readText })
  const decide = (projectRoot: string, ask: PermissionAsk): PermissionAnswer =>
    decidePermission(ask, {
      projectRoot,
      userDataDir: deps.userDataDir(),
      homeDir: deps.homeDir,
      canonicalize: deps.canonicalize
    })

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
      written: new Map(),
      runs: createRunProjection(),
      annotations: railAnnotatorFor(sender),
      memlogs: createMemlogCounts()
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
    entry.stopQuietClock?.()
    entry.stopQuietClock = undefined
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
    // A run still in flight ends with its session, before the session is closed; one whose stop
    // was asked for ends as that stop, whichever way the session went.
    endRun(runs, sender, service, entry, entry.run?.stopping === true ? 'stopped' : 'session-ended')
    discard(service, entry)
    announce(sender, service, {
      name: 'session:closed',
      payload: { sessionId: entry.sessionId, agentId: entry.agentId, reason, at: now() }
    })
  }

  function onFrame(sender: Sender, service: Service, entry: Entry, frame: unknown): void {
    foldFrame({ now, announce, say, runs }, sender, service, entry, frame)
    watch(sender, service, entry)
  }

  function open(sender: Sender, service: Service, projectRoot: string, agentId: AgentId): Entry {
    const entry: Entry = {
      sessionId: newSessionId(),
      agentId,
      projectRoot,
      session: undefined,
      turn: initialTurn,
      closed: false,
      route: initialRouteState,
      written: initialWrittenState,
      ready: Promise.resolve(NOT_FOUND),
      stopQuietClock: undefined,
      run: undefined
    }
    service.bySession.set(entry.sessionId, entry)
    service.byAgent.set(agentId, entry)

    entry.ready = startProcess(
      { start, now, announce, say, watch, discard, finish, onFrame, decide },
      sender,
      service,
      entry
    )
    return entry
  }

  return {
    serviceOf: (senderId) => services.get(senderId),
    serviceFor,
    open,
    watch,
    startRun: (sender, service, entry, runId, code, plan) => startRun(runs, sender, service, entry, runId, code, plan),
    stop: (sender, service, entry) => stopRun({ runs, say, finish }, sender, service, entry),
    observe: (sender, projectRoot, observation) =>
      observeMemlog(runs, sender, () => serviceFor(sender, projectRoot), projectRoot, observation),
    closeSessions,
    finish
  }
}
