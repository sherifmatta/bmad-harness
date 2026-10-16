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
  TURN_SEND_CHANNEL,
  TURN_STOP_CHANNEL
} from '../shared/channels'
import type { ContractCommands } from '../shared/commands'
import type { ConversationReply, MenuDispatchReply } from '../shared/conversation'
import type { RunId, SessionId } from '../shared/ids'
import type { ArtifactObservation } from '../shared/rail'
import { skillOf } from '../shared/run-skill'
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
import { agentNameFor, menuEntryFor, rosterFor, skillsFor } from './install-model'
import { validMention } from './mention'
import type { RosterMember } from './install-model'
import type { SkillView } from '../shared/install'
import { personaProjectionFor } from './persona-states'
import { createTranscriptRegistry } from './projections/transcript'
import type { TranscriptRegistry } from './projections/transcript'
import { LINES } from './session-voice'
import { NOT_FOUND, createSessionRegistry, kindOf } from './session-registry'
import type { Entry, OpenReply, Service, SessionRegistry, SessionRegistryDeps } from './session-registry'
import type { TemplatePlan } from '../shared/section-plan'
import type { ResolvedMenuEntry } from './sources/install/schema'
import { readText } from './sources/project/read-text'
import { readPlan } from './sources/skill/read-plan'
import { canonicalPath } from './sources/session/canonical-path'
import { ROOM_SKILL, isAgentId, roomActivationTurn, spawnSession } from './sources/session/session-process'
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
  TURN_SEND_CHANNEL,
  TURN_STOP_CHANNEL
}

type CloseReply = ContractCommands['session.close']['reply']
type SendReply = ContractCommands['turn.send']['reply']
type StopReply = ContractCommands['run.stop']['reply']
type StopTurnReply = ContractCommands['turn.stop']['reply']
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
   * The roster of the window with this id, in roster order, from main's own install
   * model: what a room's cast is checked and named against (Story 4.1). The real one
   * reads the install bridge's projection.
   */
  roster?: (webContentsId: number) => readonly RosterMember[]
  /**
   * Every skill the install of the window with this id declares, in manifest order: what a first message's
   * `/<name>` is matched against (Story 7.5). The real one reads the install bridge's projection.
   */
  skills?: (webContentsId: number) => readonly SkillView[]
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
  nameOf: NonNullable<SessionBridgeDeps['agentName']>
  roster: NonNullable<SessionBridgeDeps['roster']>
  skills: NonNullable<SessionBridgeDeps['skills']>
  menuEntryFor: NonNullable<SessionBridgeDeps['menuEntryFor']>
  newRunId: () => RunId
  readPlan: NonNullable<SessionBridgeDeps['readPlan']>
}

/** The argument that asks for the room rather than a persona: an object carrying `room`. */
function asksForRoom(target: unknown): target is { room: unknown } {
  return typeof target === 'object' && target !== null && !Array.isArray(target) && 'room' in target
}

/** The argument that carries a first message: an object carrying `first` (Story 7.5). */
function asksForFirst(target: unknown): target is { first: unknown } {
  return typeof target === 'object' && target !== null && !Array.isArray(target) && 'first' in target
}

const INVALID_CAST = failure({
  code: 'session/invalid-cast',
  message: 'session · not a valid cast for a room'
})

/** A cast that is a non-empty list of agent ids the roster has, each once in the order given; else `undefined`. */
function castOf(room: unknown, roster: readonly RosterMember[]): RosterMember[] | undefined {
  if (!Array.isArray(room) || room.length === 0) {
    return undefined
  }
  const cast: RosterMember[] = []
  for (const id of room as unknown[]) {
    const member = isAgentId(id) ? roster.find((held) => held.id === id) : undefined
    if (member === undefined) {
      return undefined
    }
    if (!cast.includes(member)) {
      cast.push(member)
    }
  }
  return cast
}

/**
 * Open the window's room (Story 4.1): a session of the same kind as a persona's, with
 * no agent, activated with the party skill. One per window: a second open finds the
 * live room, spawns nothing and says nothing. The sysline naming who is present is
 * said once, by the open that started the process, and only when it came up.
 */
async function openRoom(
  ctx: Context,
  sender: Sender,
  projectRoot: string,
  room: unknown
): Promise<OpenReply> {
  const roster = ctx.roster(sender.id)
  const cast = castOf(room, roster)
  if (cast === undefined) {
    return INVALID_CAST
  }
  const service = ctx.registry.serviceFor(sender, projectRoot)
  const live = service.room
  if (live !== undefined) {
    // The window's cast and open time are the live room's own, not what this open was asked for.
    return withRoom(await live.ready, live)
  }
  const entry = ctx.registry.openRoom(
    sender,
    service,
    projectRoot,
    cast.map(({ id }) => id),
    roomActivationTurn(
      cast,
      roster.map(({ id }) => id)
    )
  )
  const reply = await entry.ready
  if (reply.ok && !entry.closed) {
    ctx.registry.say(sender, entry, LINES.roomOpened(cast.map(({ id, name }) => (name === '' ? id : name))))
  }
  return withRoom(reply, entry)
}

/** An ok answer to opening the room, with the room's own cast and open time on it (Story 4.7). */
function withRoom(reply: OpenReply, entry: Entry): OpenReply {
  if (!reply.ok || entry.roomCast === undefined || entry.openedAt === undefined) {
    return reply
  }
  return { ...reply, room: { cast: [...entry.roomCast], openedAt: entry.openedAt } }
}

/**
 * A persona's seat, opened or found: turning to a persona is no record (Story 7.4). The one way the tile, `@name`
 * and a first message's `/<agent>` all arrive at a seat.
 */
async function openSeat(ctx: Context, sender: Sender, projectRoot: string, agentId: string): Promise<OpenReply> {
  const service = ctx.registry.serviceFor(sender, projectRoot)
  const existing = service.byAgent.get(agentId)
  return existing !== undefined ? existing.ready : ctx.registry.open(sender, service, projectRoot, agentId).ready
}

/**
 * The refusal of a first message that names no installed skill (Story 7.5): the first word as typed, the
 * leading `/` removed, case kept. It is the command's reply and nothing is recorded or started.
 */
function noSkill(word: string): ReturnType<typeof failure> {
  return failure({ code: 'session/no-skill', message: `no skill named ${word.startsWith('/') ? word.slice(1) : word}` })
}

/**
 * A first message, typed in the New session chat (Story 7.5), read here and nowhere else: its first word, up
 * to the first whitespace, must begin `/` and name, exactly and case-sensitively, a skill of the window's
 * install. A roster persona's skill is that persona's seat, the party skill with a roster is the room opened
 * with everyone as its cast, and any other installed skill starts a skill-first session on the text as typed.
 * A reply for a seat or the room carries the words after the name (`rest`), present only when there are some.
 */
async function openFirst(ctx: Context, sender: Sender, projectRoot: string, first: unknown): Promise<OpenReply> {
  const text = typeof first === 'string' ? first : ''
  const trimmed = text.trimStart()
  const word = trimmed.split(/\s+/, 1)[0] ?? ''
  const name = word.startsWith('/') ? word.slice(1) : undefined
  const skills = ctx.skills(sender.id)
  const skill =
    name === undefined || skillOf(name) === undefined ? undefined : skills.find((held) => held.name === name)
  if (name === undefined || skill === undefined) {
    return noSkill(word)
  }
  const rest = trimmed.slice(word.length).trim()
  const withRest = (reply: OpenReply): OpenReply => (reply.ok && rest !== '' ? { ...reply, rest } : reply)
  const roster = ctx.roster(sender.id)
  if (roster.some(({ id }) => id === name)) {
    const reply = await openSeat(ctx, sender, projectRoot, name)
    return withRest(reply.ok ? { ...reply, seat: name } : reply)
  }
  if (name === ROOM_SKILL && roster.length > 0) {
    return withRest(
      await openRoom(
        ctx,
        sender,
        projectRoot,
        roster.map(({ id }) => id)
      )
    )
  }
  const service = ctx.registry.serviceFor(sender, projectRoot)
  return ctx.registry.openSkill(sender, service, projectRoot, name, text).ready
}

function openSession(ctx: Context) {
  return async (event: IpcMainInvokeEvent, agentId: unknown): Promise<OpenReply> => {
    const sender = senderOf(event)
    const projectRoot = ctx.projectPathFor(sender.id)
    if (projectRoot === undefined) {
      return noProject('session')
    }
    if (asksForFirst(agentId)) {
      try {
        return await openFirst(ctx, sender, projectRoot, agentId.first)
      } catch (error) {
        return unexpected('session', error, ctx.writeDiagnostic)
      }
    }
    if (asksForRoom(agentId)) {
      try {
        return await openRoom(ctx, sender, projectRoot, agentId.room)
      } catch (error) {
        return unexpected('session', error, ctx.writeDiagnostic)
      }
    }
    if (!isAgentId(agentId)) {
      return failure({
        code: 'session/invalid-agent',
        message: 'session · not a valid agent id'
      })
    }
    try {
      // Turning to a persona is not a record: a live seat answers as it is, one that is not
      // live opens, and no other seat or transcript entry is touched (Story 7.4).
      return await openSeat(ctx, sender, projectRoot, agentId)
    } catch (error) {
      return unexpected('session', error, ctx.writeDiagnostic)
    }
  }
}

/** A session that can take a turn now, or the envelope saying why it cannot. */
type Refusal = ReturnType<typeof failure>
type Writable = { ok: true; service: Service; entry: Entry; arg: string } | { ok: false; error: Refusal }

/** The refusal for a session whose turn is in flight (a room's send interrupts it instead). */
const BUSY = failure({ code: 'session/busy', message: 'session · a turn is already in flight' })

/** The session a turn is for: open, idle, and the argument a string. Checked in this order. */
function writableSession(ctx: Context, sender: Sender, sessionId: unknown, arg: unknown): Writable {
  const service = ctx.registry.serviceOf(sender.id)
  const entry = typeof sessionId === 'string' ? service?.bySession.get(sessionId) : undefined
  if (service === undefined || entry === undefined || entry.closed) {
    return { ok: false, error: NOT_FOUND }
  }
  if (entry.turn.busy || entry.session === undefined) {
    return { ok: false, error: BUSY }
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

/**
 * A send into a room whose turn is in flight: the room's speaker is interrupted and, once the turn has
 * ended, the session is writable. `undefined` when this is not that case (refused for another reason,
 * or a persona's or a skill-first session, whose busy refusal is unchanged); a refusal when the interrupt was not
 * acknowledged or the turn did not end in time, with nothing killed and nothing said.
 */
async function interruptedRoom(
  ctx: Context,
  sender: Sender,
  sessionId: unknown,
  arg: unknown,
  refusal: Refusal
): Promise<Writable | undefined> {
  if (refusal !== BUSY || typeof arg !== 'string') {
    return undefined
  }
  const entry = ctx.registry.serviceOf(sender.id)?.bySession.get(sessionId as string)
  if (entry === undefined || kindOf(entry) !== 'room' || entry.closed || entry.session === undefined) {
    return undefined
  }
  if (!(await ctx.registry.interruptTurn(entry))) {
    return { ok: false, error: BUSY }
  }
  // The turn ended while the send waited: the session may have gone, or another send may have got in first.
  return writableSession(ctx, sender, sessionId, arg)
}

/** What a send to a skill-first session that is listed and not held is told (Story 7.5). */
const SESSION_ENDED = failure({ code: 'session/ended', message: 'session ended' })

/** Whether the transcript of the sender's project lists a skill-first session by this id. */
function listedSkillSession(ctx: Context, sender: Sender, sessionId: unknown): boolean {
  const projectRoot = ctx.projectPathFor(sender.id)
  return (
    typeof sessionId === 'string' &&
    projectRoot !== undefined &&
    ctx.transcripts.forProject(projectRoot).skillSessions().some((held) => held.sessionId === sessionId)
  )
}

function sendTurn(ctx: Context) {
  const sendNow = async (
    event: IpcMainInvokeEvent,
    sessionId: unknown,
    text: unknown,
    mention: unknown
  ): Promise<SendReply> => {
    const sender = senderOf(event)
    let target = writableSession(ctx, sender, sessionId, text)
    if (!target.ok) {
      // A room has no gate (Story 4.2): a send into its turn in flight interrupts the speaker and is
      // written once the turn has ended. Any other refusal, and a persona's busy session, stand.
      const room = await interruptedRoom(ctx, sender, sessionId, text, target.error)
      if (room === undefined) {
        return target.error
      }
      if (!room.ok) {
        return room.error
      }
      target = room
    }
    const { service, entry } = target
    const reply = await writeTurn(entry, target.arg)
    if (!reply.ok) {
      return reply
    }
    // The user's turn is recorded once it is written, at the instant it started.
    const at = ctx.now()
    const transcript = ctx.transcripts.forProject(entry.projectRoot)
    const kind = kindOf(entry)
    if (kind === 'room') {
      transcript.recordUserTurn(target.arg, at, true)
    } else if (kind === 'skill') {
      // A skill-first session's turn belongs to its own thread (Story 7.5); no persona received it, so no mention is kept.
      transcript.recordUserTurn(target.arg, at, undefined, undefined, entry.sessionId)
    } else if (entry.agentId !== undefined) {
      // A mention is kept only if it names the persona that received the turn; otherwise it is dropped, silently.
      const named = validMention(mention, ctx.nameOf(sender.id, entry.agentId))
      transcript.recordUserTurn(target.arg, at, undefined, named)
    }
    // A finished run's `live` ends when the next turn starts.
    service.personas.detach(entry.sessionId)
    service.personas.apply({
      name: 'turn:started',
      payload: { sessionId: entry.sessionId, at }
    })
    ctx.registry.watch(sender, service, entry)
    return { ok: true }
  }
  return (
    event: IpcMainInvokeEvent,
    sessionId: unknown,
    text: unknown,
    mention?: unknown
  ): Promise<SendReply> => {
    const sender = senderOf(event)
    const entry = typeof sessionId === 'string' ? ctx.registry.serviceOf(sender.id)?.bySession.get(sessionId) : undefined
    if ((entry === undefined || entry.closed) && listedSkillSession(ctx, sender, sessionId)) {
      // A skill-first session the transcript lists and this launch does not hold (Story 7.5): it ended with the
      // launch, or its process exited. Nothing starts and nothing is recorded; the reply is the window's to draw.
      return Promise.resolve(SESSION_ENDED)
    }
    if (entry === undefined || kindOf(entry) !== 'room') {
      return sendNow(event, sessionId, text, mention)
    }
    // The room's sends are one at a time (Story 4.2): each interrupts and writes after the one before it is
    // done, so none is refused as busy by another of the user's own, and they are written in the order made.
    const run = entry.roomSends.then(() => sendNow(event, sessionId, text, undefined))
    entry.roomSends = run.catch(() => undefined)
    return run
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
    // The room has no menu, and neither has a skill-first session: a dispatch for either is a session nobody can dispatch into.
    const agentId = target.entry.agentId
    if (kindOf(target.entry) !== 'persona' || agentId === undefined) {
      return NOT_FOUND
    }
    const resolved = ctx.menuEntryFor(sender.id, agentId, chosen)
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
    // The name is a record for the card's head: main reads it here and nothing dispatches by it.
    const skill = resolved.action.kind === 'skill' ? skillOf(resolved.action.skill) : undefined
    ctx.registry.startRun(sender, service, entry, runId, resolved.code, plan, skill)
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
// through `finish`, so `session:closed` is emitted. A room says one harness line
// first (Story 4.5), and so does a persona's seat (Story 7.4): the thread keeps
// every turn, so the line is what says the persona starts fresh. A skill-first
// session (Story 7.5) says nothing and takes its own records with it: its
// records, its stored run cards, its run-projection cards and its list item.
// One the transcript lists and this launch does not hold (it ended with a
// launch) is removed the same way, with no process to kill. The transcript is
// not otherwise touched, and neither is any other session. Nothing else ends a
// session short of the conversation ending, the process exiting or the window going.
function closeSession(ctx: Context) {
  return (event: IpcMainInvokeEvent, sessionId: unknown): CloseReply => {
    const sender = senderOf(event)
    const service = ctx.registry.serviceOf(sender.id)
    const held = typeof sessionId === 'string' ? service?.bySession.get(sessionId) : undefined
    const entry = held === undefined || held.closed ? undefined : held
    if (service === undefined || entry === undefined) {
      return removeListedSkillSession(ctx, sender, service, sessionId)
    }
    const kind = kindOf(entry)
    if (kind === 'room') {
      ctx.registry.say(sender, entry, LINES.roomStopped)
    } else if (kind === 'persona') {
      ctx.registry.say(sender, entry, LINES.seatEnded(ctx.nameOf(sender.id, entry.agentId ?? '') || (entry.agentId ?? '')))
    }
    entry.session?.kill()
    ctx.registry.finish(sender, service, entry, 'closed')
    if (kind === 'skill') {
      // One still starting was never listed: there is nothing to remove, and it is ended all the same.
      removeListedSkillSession(ctx, sender, service, entry.sessionId)
    }
    return { ok: true }
  }
}

/**
 * Take a skill-first session's records, stored run cards, run-projection cards and list item out of the
 * window's project (Story 7.5); `session/not-found` when the transcript lists no such session. Nothing else
 * is touched, and no line is written.
 */
function removeListedSkillSession(
  ctx: Context,
  sender: Sender,
  service: Service | undefined,
  sessionId: unknown
): CloseReply {
  const projectRoot = ctx.projectPathFor(sender.id)
  if (typeof sessionId !== 'string' || projectRoot === undefined) {
    return NOT_FOUND
  }
  if (!ctx.transcripts.forProject(projectRoot).removeSkillSession(sessionId)) {
    return NOT_FOUND
  }
  service?.runs.removeSession(sessionId)
  return { ok: true }
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

/**
 * What a turn stop is told for a session with no turn to stop: none open by that id, a closed one, a
 * room, one with nothing in flight or no process yet. A code of its own, which the window ignores as it
 * ignores `run/not-found`.
 */
const TURN_NOT_FOUND = failure({ code: 'turn/not-found', message: 'turn · no turn is in flight' })

// Stops the turn in flight in one session of this window (Story 3.19). The session is found by its id;
// `session-stop` takes the run path when it has a run in flight (`run:stopped`, as the card's stop) and
// stops a plain chat turn otherwise. The reply is sent once the interrupt is acknowledged or the session
// was ended instead, as `run.stop`'s is. A second stop for a turn already stopping is ok.
function stopTurn(ctx: Context) {
  return async (event: IpcMainInvokeEvent, sessionId: unknown): Promise<StopTurnReply> => {
    const sender = senderOf(event)
    const service = ctx.registry.serviceOf(sender.id)
    const entry = typeof sessionId === 'string' ? service?.bySession.get(sessionId) : undefined
    if (service === undefined || entry === undefined || entry.closed) {
      return TURN_NOT_FOUND
    }
    return (await ctx.registry.stopTurn(sender, service, entry)) === 'ok' ? { ok: true } : TURN_NOT_FOUND
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
      service.written.clear()
      service.annotations.roomCleared()
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
    // A session still starting has told the window nothing yet, and is not one.
    // The room is no persona's session: the snapshot lists persona sessions only.
    const live = [...(service?.bySession.values() ?? [])].filter(
      (entry) => !entry.closed && entry.session !== undefined
    )
    const personaSessions = live.flatMap((entry) =>
      kindOf(entry) === 'persona' && entry.agentId !== undefined ? [{ agentId: entry.agentId, sessionId: entry.sessionId }] : []
    )
    // The live room is named beside them (Story 4.7), from main's memory alone: one still starting is
    // not in `live`, and one that stopped, exited or came before a relaunch is not held at all.
    const room = live.find((entry) => kindOf(entry) === 'room' && entry.roomCast !== undefined && entry.openedAt !== undefined)
    const transcript = ctx.transcripts.forProject(projectRoot)
    // The skill-first sessions the transcript lists (Story 7.5), in start order; one is live only if this launch holds it.
    const skillSessions = transcript.skillSessions().map(({ sessionId, skill }) => ({
      sessionId,
      skill,
      live: service?.skills.get(sessionId)?.closed === false
    }))
    const own = service?.runs.snapshot() ?? []
    const held = new Set(own.map((card) => card.runId))
    return {
      ok: true,
      snapshot: {
        entries: [...transcript.entries()],
        sessions: personaSessions,
        ...(room?.roomCast === undefined || room.openedAt === undefined
          ? {}
          : { room: { sessionId: room.sessionId, cast: [...room.roomCast], openedAt: room.openedAt } }),
        busy: live.filter((entry) => entry.turn.busy).map((entry) => entry.sessionId),
        personas: personaProjectionFor(sender, ctx.now).snapshot(),
        // The cards the transcript keeps that this window does not hold (the stored conversation's,
        // and those of an earlier window of this launch), each as it ended, then this window's own.
        runs: [...transcript.storedRuns().filter((card) => !held.has(card.runId)), ...own],
        ...(skillSessions.length === 0 ? {} : { skillSessions })
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
 * their frames; this registers the eight handlers that speak for them, and hands
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
      roster: deps.roster ?? rosterFor,
      transcripts,
      userDataDir: deps.userDataDir ?? (() => app.getPath('userData')),
      homeDir: deps.homeDir ?? homedir(),
      canonicalize: deps.canonicalize ?? canonicalPath,
      readText: deps.readText ?? readText,
      ...(deps.quietMs !== undefined ? { quietMs: deps.quietMs } : {}),
      ...(deps.schedule !== undefined ? { schedule: deps.schedule } : {}),
      ...(deps.told !== undefined ? { told: deps.told } : {})
    }),
    nameOf: deps.agentName ?? agentNameFor,
    roster: deps.roster ?? rosterFor,
    skills: deps.skills ?? skillsFor,
    menuEntryFor: deps.menuEntryFor ?? menuEntryFor,
    newRunId,
    readPlan: deps.readPlan ?? readPlan
  }

  ipcMain.handle(SESSION_OPEN_CHANNEL, openSession(ctx))
  ipcMain.handle(TURN_SEND_CHANNEL, sendTurn(ctx))
  ipcMain.handle(MENU_DISPATCH_CHANNEL, dispatchMenu(ctx))
  ipcMain.handle(RUN_STOP_CHANNEL, stopRun(ctx))
  ipcMain.handle(TURN_STOP_CHANNEL, stopTurn(ctx))
  ipcMain.handle(SESSION_CLOSE_CHANNEL, closeSession(ctx))
  ipcMain.handle(CONVERSATION_END_CHANNEL, endConversation(ctx))
  ipcMain.handle(CONVERSATION_GET_CHANNEL, getConversation(ctx))

  return {
    observeArtifact: (sender, projectRoot, observation) => ctx.registry.observe(sender, projectRoot, observation)
  }
}
