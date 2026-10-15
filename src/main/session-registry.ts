import type { ContractEvent } from '../shared/events'
import type { AgentId, EpochMs, RunId, SessionId } from '../shared/ids'
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
import type { ActiveRun, MemlogCounts, RunKit, StoppedRun } from './session-run'
import { interruptTurn, stopRun, stopTurn } from './session-stop'
import type { RosterMember } from './install-model'
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
 * nothing. It holds at most one room beside them (Story 4.1): a session with no
 * agent, kept in `room` and in `bySession`, never in `byAgent`. Frames are folded in main and only `persona:said` goes on to the
 * renderer; it never sees a frame.
 */

export type OpenReply = SessionOpenReply

export type Entry = {
  sessionId: SessionId
  /** The persona of the session; absent for the room, which has none (Story 4.1). */
  agentId?: AgentId
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
  /**
   * What the last run carried, while that run ended `stopped` at the user's ask and
   * nothing has happened since: a turn sent, an entry dispatched, a run started or
   * a run ending another way each clear it. Memory only, never persisted.
   */
  afterStop: StoppedRun | undefined
  /**
   * A send into a busy room is interrupting its turn (Story 4.2), or the user stopped a persona's
   * plain chat turn (Story 3.19): set from the interrupt's ask until the turn ends, or the send
   * gives up. The failed `result` such an interrupt ends the turn with is the user's own doing, so
   * it is no failure: a room's says nothing, a persona's says one stopped line. Memory only.
   */
  interrupting: boolean
  /** Whoever is waiting for this session's turn to end: released when it does, and when the session closes. */
  idleWaiters: (() => void)[]
  /** The last send into this room still running (Story 4.2): the next waits for it, so sends are written in the order made. */
  roomSends: Promise<unknown>
  /**
   * The room's cast in open order (Story 4.7), set when the room is made so a live room is never seen
   * without it. Absent on a persona's entry. Memory only.
   */
  roomCast: readonly AgentId[] | undefined
  /** When `session:opened` was announced for this entry, the same value as its `at`; `undefined` while starting. Memory only. */
  openedAt: EpochMs | undefined
}

export type Service = {
  /** The project this window was opened for, which its transcript is kept under. */
  projectRoot: string
  bySession: Map<SessionId, Entry>
  byAgent: Map<AgentId, Entry>
  /** The window's room session while it is open or starting; at most one (Story 4.1). */
  room: Entry | undefined
  /** The window's persona states, shared with the rail bridge. */
  personas: PersonaProjection
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
  /** The id of a run main starts itself: the continuation of a stopped run. */
  newRunId: () => RunId
  /**
   * The roster of the window with this id, in roster order: what a room's turn markers are read
   * against (Story 4.2). Left out, a room attributes nothing.
   */
  roster?: (webContentsId: number) => readonly RosterMember[]
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
  /** Hears each run event a window is told, with the run's card as it then stands (`session-run`). */
  told?: RunKit['told']
}

export type SessionRegistry = {
  /** The service a window already has, if any. */
  serviceOf(senderId: number): Service | undefined
  /** The window's service, made on first ask. */
  serviceFor(sender: Sender, projectRoot: string): Service
  /** Start a session; its `ready` says how that went. */
  open(sender: Sender, service: Service, projectRoot: string, agentId: AgentId): Entry
  /**
   * Start the window's room, a session with no agent whose first turn is `firstTurn`, for `cast`
   * (kept on the entry, in the order given); its `ready` says how that went. The caller has checked
   * there is none live.
   */
  openRoom(
    sender: Sender,
    service: Service,
    projectRoot: string,
    cast: readonly AgentId[],
    firstTurn: string
  ): Entry
  /** The harness says a line in its own voice about a session; a room's lines are flagged as the party thread's (Story 4.1). */
  say(sender: Sender, entry: Entry, text: string): void
  /** Kill every session of a window and close each one. */
  closeSessions(sender: Sender, service: Service): void
  /**
   * Start, or start again, the silence clock of a session whose turn is in
   * flight; stop it for one whose turn is not. Called when a turn begins.
   */
  watch(sender: Sender, service: Service, entry: Entry): void
  /**
   * The user sent into a room whose turn is in flight (Story 4.2): ask the CLI to end the turn
   * (`STOP_ACK_MS`) and wait for it to (`STOP_RESULT_MS`). True when the session is idle and the
   * send may be written; false when the CLI did not answer or the turn did not end in time, with
   * nothing killed, nothing said and `interrupting` cleared.
   */
  interruptTurn(entry: Entry): Promise<boolean>
  /** A dispatch was written into a session: its run begins. */
  startRun(
    sender: Sender,
    service: Service,
    entry: Entry,
    runId: RunId,
    code: string,
    plan?: TemplatePlan,
    skill?: string
  ): void
  /**
   * The user asked to stop the run `entry` has in flight: it is marked stopping
   * and interrupted (`session-stop`). `'not-found'` when the entry has no run.
   */
  stop(sender: Sender, service: Service, entry: Entry): Promise<'ok' | 'not-found'>
  /**
   * The user asked to stop whatever turn `entry` has in flight (Story 3.19): its run, by the same
   * path as `stop`, or a plain chat turn, marked `interrupting` and interrupted (`session-stop`).
   * `'not-found'` for a room, a closed entry or a session with no turn in flight.
   */
  stopTurn(sender: Sender, service: Service, entry: Entry): Promise<'ok' | 'not-found'>
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
  /** A room wrote these project-relative files: the rail marks them as the room's. */
  roomWrote: (service: Service, paths: readonly string[]) => void
  runs: RunKit
  newRunId: () => RunId
  /** The roster of the window, which a room's turn markers are read against. */
  roster: (sender: Sender) => readonly RosterMember[]
}

/** The session's turn is over, or the session is: an interrupt asked for it is spent, and whoever waits for it is released. */
function turnOver(entry: Entry): void {
  entry.interrupting = false
  for (const release of entry.idleWaiters.splice(0)) release()
}

/** What one raw frame from a session does: end its turn, or say something, or write a file. */
function foldFrame(
  sinks: FrameSinks,
  sender: Sender,
  service: Service,
  entry: Entry,
  frame: unknown
): void {
  const { now, announce, say, roomWrote, runs, newRunId, roster } = sinks
  if (entry.closed) {
    return
  }
  const step = foldTurn(entry.turn, readFrame(frame))
  entry.turn = step.state
  const signal = step.signal
  // A turn the user asked to stop ends on a failed `result`, which is the stop and not a failure.
  // That holds for a `result` that left the session busy (background tasks live) as much as for
  // one that freed it: the run is the user's turn, and the user's turn is over.
  const failedResult =
    signal?.kind === 'failed-while-pending' || (signal?.kind === 'ended' && signal.failed)
  // A stop that landed after the turn was written and before its run began marked the entry, not the run
  // (`turn.stop` found no run): the run is the user's turn all the same, so it ends stopped.
  const stopped = failedResult && (entry.run?.stopping === true || (entry.interrupting && entry.run !== undefined))
  // A room's turn the user's own send interrupted ends on a failed `result` as well, and that is no
  // failure either: the send is what the user asked for.
  const interrupted = failedResult && entry.interrupting
  // A persona's plain turn the user stopped says so once, at its first failed `result`: the harness's
  // own line, before the session is free. The mark is spent with it, so a wake that follows a result
  // which left tasks live adds none, and the stop's wait for the turn to end finds it done.
  if (interrupted && entry.agentId !== undefined && entry.run === undefined) {
    entry.interrupting = false
    say(sender, entry, LINES.stopped)
  }
  // A failed result is told whether or not it freed the session: a line in the
  // transcript, and the persona reads `error` once it is no longer working.
  if (failedResult && !stopped && !interrupted) {
    say(sender, entry, LINES.failed(signal.subtype))
    service.personas.apply({ name: 'turn:failed', payload: { sessionId: entry.sessionId, at: now() } })
  }
  if (stopped && signal.kind === 'failed-while-pending') {
    // The session stays busy until its background tasks drain, and the wake that follows frees it.
    endRun(runs, sender, service, entry, 'stopped')
  }
  if (signal?.kind === 'ended') {
    // A run ends with its turn: the terminal event comes before the session is free.
    endRun(runs, sender, service, entry, stopped ? 'stopped' : { failed: signal.failed, subtype: signal.subtype })
    announce(sender, service, {
      name: 'session:awaiting-turn',
      payload: { sessionId: entry.sessionId, at: now() }
    })
    // The turn is over, so a send waiting for it can be written.
    turnOver(entry)
    return
  }
  if (signal?.kind === 'resumed') {
    // A turn nobody sent: the session works again, though the renderer sent nothing.
    service.personas.detach(entry.sessionId)
    service.personas.apply({
      name: 'turn:started',
      payload: { sessionId: entry.sessionId, at: now() }
    })
    // The work carries on after a stop the user asked for: it has a run, so a card, a stop and a
    // notification. The run starts before the frame is routed so the turn's events carry its id.
    const held = entry.afterStop
    if (held !== undefined && entry.run === undefined) {
      say(sender, entry, LINES.carriedOn)
      startRun(runs, sender, service, entry, newRunId(), held.code, { spine: [...held.plan], menu: [...held.menu] }, held.skill)
    }
  }
  const routed = routeFrame(entry.route, frame, {
    sessionId: entry.sessionId,
    ...(entry.agentId === undefined ? {} : { agentId: entry.agentId }),
    ...(entry.run === undefined ? {} : { runId: entry.run.runId }),
    projectRoot: entry.projectRoot,
    now: now(),
    // Only a room reads the roster: a persona's session is its own speaker.
    ...(entry.agentId === undefined ? { roster: roster(sender) } : {})
  })
  entry.route = routed.state
  const wrote = foldWrittenPaths(entry.written, frame, entry.projectRoot)
  entry.written = wrote.state
  if (wrote.paths.length > 0) {
    if (entry.agentId === undefined) {
      // The room's files are the room's, not any persona's: they mark the rail's rows, and no handoff names them.
      roomWrote(service, wrote.paths)
    } else {
      // A persona writing a file the room wrote takes it over: it is the persona's now.
      service.annotations.personaWrote(wrote.paths)
      const before = service.written.get(entry.agentId) ?? []
      service.written.set(entry.agentId, withWrittenPaths(before, wrote.paths))
    }
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
function startProcess(
  kit: StartKit,
  sender: Sender,
  service: Service,
  entry: Entry,
  firstTurn: string | undefined
): Promise<OpenReply> {
  const { agentId, projectRoot } = entry
  return new Promise<SpawnOutcome>((resolve) =>
    resolve(
      kit.start({
        ...(agentId === undefined ? {} : { agentId }),
        ...(firstTurn === undefined ? {} : { firstTurn }),
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
      const at = kit.now()
      entry.openedAt = at
      kit.announce(sender, service, {
        name: 'session:opened',
        payload: { sessionId: entry.sessionId, ...(agentId === undefined ? {} : { agentId }), at }
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

/** A window's service as it begins: no session, no room, nothing written, and its own projections. */
function newService(sender: Sender, projectRoot: string, now: () => number): Service {
  return {
    projectRoot,
    bySession: new Map(),
    byAgent: new Map(),
    room: undefined,
    personas: personaProjectionFor(sender, now),
    written: new Map(),
    runs: createRunProjection(),
    annotations: railAnnotatorFor(sender),
    memlogs: createMemlogCounts()
  }
}

/** A new entry for a session about to start: the persona's, or the room's when there is no `agentId`. */
function newEntry(
  sessionId: SessionId,
  projectRoot: string,
  agentId: AgentId | undefined,
  roomCast?: readonly AgentId[]
): Entry {
  return {
    sessionId,
    ...(agentId === undefined ? {} : { agentId }),
    projectRoot,
    session: undefined,
    turn: initialTurn,
    closed: false,
    route: initialRouteState,
    written: initialWrittenState,
    ready: Promise.resolve(NOT_FOUND),
    stopQuietClock: undefined,
    run: undefined,
    afterStop: undefined,
    interrupting: false,
    idleWaiters: [],
    roomSends: Promise.resolve(),
    roomCast: roomCast === undefined ? undefined : [...roomCast],
    openedAt: undefined
  }
}

export function createSessionRegistry(deps: SessionRegistryDeps): SessionRegistry {
  const { start, now, newSessionId, newRunId, transcripts } = deps
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
  // A line of the room's (Story 4.1) is flagged as the party thread's: nothing a room says of itself lands in a persona's 1:1 thread.
  const say = (sender: Sender, entry: Entry, text: string): void =>
    sayLine(sender, {
      sessionId: entry.sessionId,
      projectRoot: entry.projectRoot,
      text,
      ...(entry.agentId === undefined ? { room: true as const } : {})
    })
  const clock = createQuietClock<Sender, Entry>({
    schedule: deps.schedule ?? defaultSchedule,
    quietMs: deps.quietMs ?? QUIET_MS,
    onQuiet: (sender, entry) => say(sender, entry, LINES.quiet(deps.quietMs ?? QUIET_MS))
  })
  const watch = (sender: Sender, _service: Service, entry: Entry): void => clock(sender, entry)
  const runs = createRunKit({ now, schedule: deps.schedule ?? defaultSchedule, emit, transcripts, readText: deps.readText, ...(deps.told === undefined ? {} : { told: deps.told }) })
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
    const service = newService(sender, projectRoot, now)
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
    if (entry.agentId !== undefined && service.byAgent.get(entry.agentId) === entry) {
      service.byAgent.delete(entry.agentId)
    }
    if (service.room === entry) {
      service.room = undefined
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
    turnOver(entry)
    announce(sender, service, {
      name: 'session:closed',
      payload: {
        sessionId: entry.sessionId,
        ...(entry.agentId === undefined ? {} : { agentId: entry.agentId }),
        reason,
        at: now()
      }
    })
  }

  function onFrame(sender: Sender, service: Service, entry: Entry, frame: unknown): void {
    foldFrame({ now, announce, say, roomWrote: (service, paths) => service.annotations.roomWrote(paths), runs, newRunId, roster: (sender) => deps.roster?.(sender.id) ?? [] }, sender, service, entry, frame)
    watch(sender, service, entry)
  }

  /** Hold a new entry and start its process; a room has no `agentId` and is given its first turn. */
  function begin(sender: Sender, service: Service, entry: Entry, firstTurn?: string): Entry {
    service.bySession.set(entry.sessionId, entry)
    const kit = { start, now, announce, say, watch, discard, finish, onFrame, decide }
    entry.ready = startProcess(kit, sender, service, entry, firstTurn)
    return entry
  }

  function open(sender: Sender, service: Service, projectRoot: string, agentId: AgentId): Entry {
    const entry = newEntry(newSessionId(), projectRoot, agentId)
    service.byAgent.set(agentId, entry)
    return begin(sender, service, entry)
  }

  function openRoom(sender: Sender, service: Service, projectRoot: string, cast: readonly AgentId[], firstTurn: string): Entry {
    const entry = newEntry(newSessionId(), projectRoot, undefined, cast)
    service.room = entry
    return begin(sender, service, entry, firstTurn)
  }

  return {
    serviceOf: (senderId) => services.get(senderId),
    serviceFor,
    open,
    openRoom,
    say,
    watch,
    startRun: (sender, service, entry, ...started) => startRun(runs, sender, service, entry, ...started),
    stop: (sender, service, entry) => stopRun({ runs, say, finish }, sender, service, entry),
    stopTurn: (sender, service, entry) => stopTurn({ runs, say, finish }, sender, service, entry),
    interruptTurn: (entry) => interruptTurn(runs, entry),
    observe: (sender, projectRoot, observation) =>
      observeMemlog(runs, sender, () => serviceFor(sender, projectRoot), projectRoot, observation),
    closeSessions,
    finish
  }
}
