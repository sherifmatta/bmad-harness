import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationReply, ConversationSnapshot, TranscriptRecord } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'
import type { AgentView } from '../src/shared/install'
import type { SpawnOutcome, SpawnSessionOptions, SessionProcess } from '../src/main/sources/session/session-process'
import type { TranscriptRegistry } from '../src/main/projections/transcript'
import { hydrate, initialConversation } from '../src/renderer/ui/chat/conversation-state'
import { isEntryInPersonaThread } from '../src/renderer/ui/chat/transcript-entry'
import { threadAgentOf } from '../src/shared/thread'

/**
 * Story 8.7, the real-bridge half (Epic 8's closing audit): the real session bridge, registry and transcript
 * store over a fake process, read the way a window reads them. The mounted half is `epic-8-audit.dom.test.tsx`; the
 * static half is `contract.test.ts` and `negative-surface.test.ts`. What each story of the epic pinned where it
 * built it (`src/main/session-bridge.test.ts`, `session-stop.test.ts`) is not repeated; this file adds the views
 * those pins cannot give:
 *
 * - the first message to a seat, in order, by every process write and every recorded line;
 * - the whole store partitioned by the one predicate, and its file bytes untouched by any number of reads and switches;
 * - one persona's thread closed from the whole conversation (stored, then live), and every other byte of it left;
 * - `conversation.end` still the one whole clear.
 *
 * Nothing is written by hand where main makes it: every record, run card and file below was made by a message sent
 * through the bridge. It is in `tests/` because it reaches both layers: main's bridge and the renderer's `hydrate`.
 */

const handlers = new Map<string, (...args: never[]) => unknown>()
let userData = ''

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: () => null },
  app: { getPath: (name: string) => (name === 'userData' ? userData : `/unexpected/${name}`) }
}))

const { createTranscriptRegistry } = await import('../src/main/projections/transcript')
const { transcriptFilePath } = await import('../src/main/sources/persistence/transcript-file')
const { CONVERSATION_END_CHANNEL, CONVERSATION_GET_CHANNEL, SESSION_CLOSE_CHANNEL, SESSION_OPEN_CHANNEL, TURN_SEND_CHANNEL, registerSessionBridge } =
  await import('../src/main/session-bridge')

class FakeSender {
  sent: ContractEvent[] = []
  constructor(readonly id: number) {}
  send(_channel: string, event: ContractEvent): void {
    this.sent.push(event)
  }
  isDestroyed(): boolean {
    return false
  }
  once(): void {}
  get names(): string[] {
    return this.sent.map((event) => event.name)
  }
}

type FakeProcess = {
  options: SpawnSessionOptions
  writes: string[]
  killed: boolean
  session: SessionProcess
  /** The entries the transcript held at the instant main asked to spawn it. */
  atSpawn: TranscriptRecord[]
  up(): Promise<void>
  fail(errno: string): void
  frame(frame: unknown): void
  exit(): void
}

const MARY = 'bmad-agent-analyst'
const JOHN = 'bmad-agent-pm'
const AMELIA = 'bmad-agent-dev'
const NAMES: Record<string, string> = { [MARY]: 'Mary', [JOHN]: 'John', [AMELIA]: 'Amelia' }
const CAST = [AMELIA, MARY, JOHN]
const PROJECT = '/project-1'
const agentOf = (id: string): AgentView => ({ id, module: 'bmm', name: NAMES[id] ?? id, title: '', icon: '', description: '' })

let processes: FakeProcess[]
let clock: number
let ids: number
let registry: TranscriptRegistry

beforeEach(() => {
  handlers.clear()
  processes = []
  clock = 1_000
  ids = 0
  userData = mkdtempSync(join(tmpdir(), 'harness-epic-8-audit-'))
  registry = createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} })
  registerSessionBridge({
    transcripts: registry,
    projectPathFor: () => PROJECT,
    now: () => (clock += 1),
    newSessionId: () => `s${(ids += 1)}`,
    writeDiagnostic: () => {},
    agentName: (_id, agentId) => NAMES[agentId],
    roster: () => Object.entries(NAMES).map(([id, name]) => ({ id, name })),
    skills: () => [{ name: 'bmad-build', description: 'Build a thing' }],
    menuEntryFor: (_id, _agent, code) => (code === 'BP' ? { code: 'BP', description: 'x', action: { kind: 'skill', skill: 'bmad-brainstorming' } } : undefined),
    readPlan: () => Promise.resolve({ spine: ['Goals'], menu: [] }),
    spawn: (options) =>
      new Promise<SpawnOutcome>((resolve) => {
        const writes: string[] = []
        const fake: FakeProcess = {
          options,
          writes,
          killed: false,
          atSpawn: structuredClone(registry.forProject(PROJECT).entries()) as TranscriptRecord[],
          session: {
            write: (text) => {
              writes.push(text)
              return Promise.resolve(true)
            },
            interrupt: () => Promise.resolve(true),
            kill: () => void (fake.killed = true)
          },
          // The real source writes the activation turn as it resolves.
          up: async () => {
            writes.push(options.firstTurn ?? `/${options.agentId}`)
            resolve({ ok: true, session: fake.session })
            await Promise.resolve()
          },
          fail: (errno) => resolve({ ok: false, errno }),
          frame: (frame) => options.onFrame(frame),
          exit: () => options.onExit()
        }
        processes.push(fake)
      })
  })
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

const invoke = <T>(channel: string, sender: FakeSender, ...args: unknown[]): T =>
  (handlers.get(channel) as unknown as (event: { sender: FakeSender }, ...rest: unknown[]) => T)({ sender }, ...args)
const open = (sender: FakeSender, target: unknown): Promise<{ ok: boolean; sessionId?: string; error?: { code: string } }> =>
  invoke(SESSION_OPEN_CHANNEL, sender, target)
const send = (sender: FakeSender, sessionId: string, text: string, mention?: string): Promise<{ ok: boolean }> =>
  mention === undefined ? invoke(TURN_SEND_CHANNEL, sender, sessionId, text) : invoke(TURN_SEND_CHANNEL, sender, sessionId, text, mention)
const close = (sender: FakeSender, target: unknown): { ok: boolean; error?: { code: string } } => invoke(SESSION_CLOSE_CHANNEL, sender, target)
const end = (sender: FakeSender): { ok: boolean } => invoke(CONVERSATION_END_CHANNEL, sender, PROJECT)

const entries = (): TranscriptRecord[] => registry.forProject(PROJECT).entries() as TranscriptRecord[]
const snapshotOf = (sender: FakeSender): ConversationSnapshot => {
  const reply = invoke<ConversationReply>(CONVERSATION_GET_CHANNEL, sender)
  if (!reply.ok) throw new Error('no snapshot')
  return reply.snapshot
}
const stored = (): { entries: TranscriptRecord[]; runs?: { card: { runId: string; agentId?: string; skill?: string; sessionId: string } }[]; skillSessions?: { sessionId: string }[] } =>
  JSON.parse(readFileSync(transcriptFilePath(userData, PROJECT), 'utf8'))
const bytes = (): Buffer => readFileSync(transcriptFilePath(userData, PROJECT))

const messageStart = (id: string): unknown => ({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id } } })
const textStart = { type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } } }
const delta = (text: string): unknown => ({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } } })
const result = (subtype = 'success', isError = false): unknown => ({ type: 'result', subtype, is_error: isError })
const reading = (id: string, ...words: string[]): unknown[] => [messageStart(id), textStart, ...words.map(delta)]
const speak = (proc: FakeProcess, id: string, ...words: string[]): void => reading(id, ...words).forEach((frame) => proc.frame(frame))

/** Ask main to open a target and bring up the process it spawns, as the window would; `up` is false for a refusal path. */
async function begin(sender: FakeSender, target: unknown, up = true): Promise<{ reply: Promise<{ ok: boolean; sessionId?: string; error?: { code: string } }>; proc: FakeProcess }> {
  const before = processes.length
  const reply = open(sender, target)
  for (let turns = 0; turns < 20 && processes.length === before; turns += 1) await Promise.resolve()
  const proc = processes[processes.length - 1]
  if (processes.length === before) throw new Error('main did not spawn')
  if (up) await proc.up()
  return { reply, proc }
}

describe('the first message to a persona with no seat, over the real bridge (Story 8.3, audited by Story 8.7)', () => {
  it('records the user’s turn before it asks for the process, then writes /<agentId> once as the first stdin turn and the message only after that turn ends', async () => {
    const sender = new FakeSender(1)
    const { reply, proc } = await begin(sender, { seat: JOHN, message: '  hello  John ', mention: '@John' }, false)

    // Before the process exists: the turn is recorded, in John's thread, with the chip the user typed; nothing is written.
    expect(proc.atSpawn).toEqual([{ kind: 'user', id: 'm-0', at: expect.any(Number), text: '  hello  John ', mention: '@John', agentId: JOHN }])
    expect(proc.writes).toEqual([])
    expect(sender.names).toEqual([])
    await proc.up()
    const { sessionId } = (await reply) as { sessionId: string }

    // Up: `/bmad-agent-pm` is the first and only write. Greeting words flow and the message is still held.
    expect(proc.writes).toEqual([`/${JOHN}`])
    speak(proc, 'msg_1', 'Hi, ', 'I am ', '**John**', ' — ready.')
    expect(proc.writes).toEqual([`/${JOHN}`])
    expect(sender.names).not.toContain('session:awaiting-turn')
    // The activation turn ends: now, and not before, the message is written, as typed.
    proc.frame(result())
    expect(proc.writes).toEqual([`/${JOHN}`, '  hello  John '])
    speak(proc, 'msg_2', 'The ', 'answer, ', 'whole.')
    proc.frame(result())
    expect(proc.writes.filter((write) => write.startsWith('/bmad-agent'))).toEqual([`/${JOHN}`])
    expect(processes).toHaveLength(1)

    // One user turn, recorded once, ahead of both of the persona's replies; the activation reply carries its flag and the answer none.
    expect(entries().map((entry) => [entry.kind, entry.kind === 'persona' ? entry.activation : undefined, entry.text])).toEqual([
      ['user', undefined, '  hello  John '],
      ['persona', true, 'Hi, I am **John** — ready.'],
      ['persona', undefined, 'The answer, whole.']
    ])
    expect(entries().every((entry) => threadAgentOf(entry) === JOHN)).toBe(true)

    // A window that reads it back folds the pieces into the same words, in arrival order, none edited.
    const folded = hydrate(initialConversation, snapshotOf(sender), agentOf).state.entries
    expect(folded.filter((entry) => entry.kind === 'persona').map((entry) => (entry.kind === 'persona' ? [entry.text, entry.activation === true, entry.agent.id] : []))).toEqual([
      ['Hi, I am **John** — ready.', true, JOHN],
      ['The answer, whole.', false, JOHN]
    ])
    const spoken = sender.sent.flatMap((event) => (event.name === 'persona:said' ? [event.payload.text] : []))
    expect(spoken.join('')).toBe('Hi, I am **John** — ready.The answer, whole.')
    expect(snapshotOf(sender).sessions).toEqual([{ agentId: JOHN, sessionId }])
  })

  it('answers a refused spawn with its error, keeps the one recorded turn, leaves no seat and tries nothing again', async () => {
    const sender = new FakeSender(1)
    const { reply, proc } = await begin(sender, { seat: JOHN, message: 'hello' }, false)
    proc.fail('ENOENT')

    expect(await reply).toMatchObject({ ok: false, error: { code: 'session/spawn-failed' } })
    for (let turns = 0; turns < 20; turns += 1) await Promise.resolve()
    expect(processes).toHaveLength(1)
    expect(proc.writes).toEqual([])
    expect(entries()).toEqual([{ kind: 'user', id: 'm-0', at: expect.any(Number), text: 'hello', agentId: JOHN }])
    expect(snapshotOf(sender).sessions).toEqual([])
    expect(sender.names).toEqual([])
  })

  it('spawns nothing and writes nothing to a persona whose seat main already holds: a turn to it is a plain send', async () => {
    const sender = new FakeSender(1)
    const { reply, proc } = await begin(sender, JOHN)
    const { sessionId } = (await reply) as { sessionId: string }
    proc.frame(result())

    expect(await open(sender, { seat: JOHN, message: 'again' })).toMatchObject({ ok: false, error: { code: 'session/busy' } })
    expect(await open(sender, JOHN)).toEqual({ ok: true, sessionId })
    expect(processes).toHaveLength(1)
    expect(proc.writes).toEqual([`/${JOHN}`])
    expect(entries()).toEqual([])
  })
})

/**
 * Two personas with a thread each, the room and a skill-first session, every one live and idle, each with records and
 * each (but the room) with a run card, all made through the bridge. Mary was started by a skill button and John by a first
 * message; both hold a user turn, words and a harness line.
 */
async function conversation() {
  const sender = new FakeSender(1)

  const john = await begin(sender, { seat: JOHN, message: 'to john' })
  const johnId = ((await john.reply) as { sessionId: string }).sessionId
  john.proc.frame(messageStart('j0'))
  speak(john.proc, 'j1', 'Hi, John here.')
  john.proc.frame(result())
  speak(john.proc, 'j2', 'johns words')
  john.proc.frame(result())
  // A turn that fails leaves a harness line in his thread.
  await send(sender, johnId, 'johns second')
  john.proc.frame(result('error_during_execution', true))

  const mary = await begin(sender, { seat: MARY, code: 'BP' })
  const maryId = ((await mary.reply) as { sessionId: string }).sessionId
  speak(mary.proc, 'a1', 'marys brainstorm')
  mary.proc.frame(result())
  await send(sender, maryId, 'to mary', '@Mary')
  mary.proc.frame(result())
  speak(mary.proc, 'a2', 'marys answer')
  mary.proc.frame(result())

  const room = await begin(sender, { room: CAST })
  const roomId = ((await room.reply) as { sessionId: string }).sessionId
  room.proc.frame(result())
  await send(sender, roomId, 'to the room')
  speak(room.proc, 'r1', '🧙 **Mary:** roomwords')
  room.proc.frame(result())

  const skill = await begin(sender, { first: '/bmad-build make a thing' })
  const skillId = ((await skill.reply) as { sessionId: string }).sessionId
  speak(skill.proc, 'k1', 'skillwords')
  skill.proc.frame(result())
  await send(sender, skillId, 'to the skill')
  skill.proc.frame(result())

  registry.flushAll()
  return { sender, ids: { john: johnId, mary: maryId, room: roomId, skill: skillId }, procs: { john: john.proc, mary: mary.proc, room: room.proc, skill: skill.proc } }
}

/** The thread a stored record is in, by the shared predicate for a persona's and by each flag for the other two: or none. */
function threadsOf(record: { room?: true; skillSession?: string; agentId?: string }): string[] {
  return [
    ...(threadAgentOf(record) === undefined ? [] : [threadAgentOf(record) as string]),
    ...(record.room === true ? ['room'] : []),
    ...(record.skillSession !== undefined ? ['skill'] : [])
  ]
}

describe('the whole store, partitioned by the one predicate (Stories 8.1 and 8.4, audited by Story 8.7)', () => {
  it('holds every stored record, in memory and in the file, in exactly one thread, and every run card in exactly one', async () => {
    const { sender } = await conversation()

    const file = stored()
    expect(file.entries.map((entry) => entry.kind)).toContain('sysline')
    expect(entries()).toEqual(file.entries)
    for (const record of file.entries) {
      const threads = threadsOf(record)
      expect(threads, `${record.kind} ${record.text}`).toHaveLength(1)
      // A skill's own words are a skill session's, and a record main made for a persona's seat names that persona.
      if (record.kind === 'skill') expect(threads).toEqual(['skill'])
      if (threads[0] === JOHN || threads[0] === MARY) expect(threadAgentOf(record)).toBe(threads[0])
    }
    expect(new Set(file.entries.flatMap(threadsOf))).toEqual(new Set([JOHN, MARY, 'room', 'skill']))
    // Four threads, none empty, the persona's own: John's user turn, greeting, answer and failed-turn line; Mary's, hers.
    const of = (thread: string): TranscriptRecord[] => file.entries.filter((record) => threadsOf(record)[0] === thread)
    expect(of(JOHN).map((record) => record.kind)).toEqual(['user', 'persona', 'persona', 'user', 'sysline'])
    expect(of(MARY).map((record) => record.kind)).toEqual(['persona', 'user', 'persona'])
    expect(of(JOHN).length + of(MARY).length + of('room').length + of('skill').length).toBe(file.entries.length)
    // Run cards: Mary's BP run is hers by `agentId`, the skill session's is its own and no persona's.
    expect(file.runs?.length).toBe(2)
    for (const { card } of file.runs ?? []) {
      const threads = threadsOf({ agentId: card.agentId, ...(card.skill !== undefined && card.agentId === undefined ? { skillSession: card.sessionId } : {}) })
      expect(threads, card.runId).toHaveLength(1)
    }
    expect((file.runs ?? []).map(({ card }) => threadAgentOf(card))).toEqual([MARY, undefined])

    // The renderer's own folds of it agree: no entry is in two personas' threads, and each persona's thread is the one main stored.
    const folded = hydrate(initialConversation, snapshotOf(sender), agentOf).state.entries
    for (const entry of folded) {
      expect([JOHN, MARY, AMELIA].filter((persona) => isEntryInPersonaThread(entry, persona)).length, entry.id).toBeLessThanOrEqual(1)
    }
    expect(folded.filter((entry) => isEntryInPersonaThread(entry, JOHN))).toHaveLength(of(JOHN).length)
    expect(folded.filter((entry) => isEntryInPersonaThread(entry, MARY))).toHaveLength(of(MARY).length + 1)
    expect(folded.filter((entry) => isEntryInPersonaThread(entry, AMELIA))).toEqual([])
  })

  it('leaves the stored file’s bytes, and every process, exactly as they were after any number of reads and switches between live seats', async () => {
    const { sender, ids: held, procs } = await conversation()
    const before = bytes()
    const writes = Object.values(procs).map((proc) => [...proc.writes])
    const memory = structuredClone(entries())
    const spawned = processes.length

    for (let round = 0; round < 12; round += 1) {
      // The window reads the conversation and folds it, and turns to each persona and to the room: none of which is a write.
      const snapshot = snapshotOf(sender)
      hydrate(initialConversation, snapshot, agentOf)
      expect(await open(sender, JOHN)).toEqual({ ok: true, sessionId: held.john })
      expect(await open(sender, MARY)).toEqual({ ok: true, sessionId: held.mary })
      expect(await open(sender, { room: CAST })).toMatchObject({ ok: true, sessionId: held.room })
      registry.flushAll()
    }

    expect(bytes().equals(before)).toBe(true)
    expect(entries()).toEqual(memory)
    expect(processes).toHaveLength(spawned)
    expect(Object.values(procs).map((proc) => proc.writes)).toEqual(writes)
    expect(Object.values(procs).every((proc) => !proc.killed)).toBe(true)
  })
})

describe('closing one persona’s thread, from the whole conversation (Story 8.5, audited by Story 8.7)', () => {
  const closes = (sender: FakeSender): string[] => sender.sent.flatMap((event) => (event.name === 'session:closed' ? [event.payload.sessionId] : []))
  const thread = (record: { room?: true; skillSession?: string; agentId?: string }, who: string): boolean => threadsOf(record)[0] === who

  it('deletes a stored thread by `{ agentId }`: its records, runs and bookkeeping go, nothing is written in place, and every other byte of the store stays', async () => {
    const { sender, procs } = await conversation()
    // John's process goes without being asked to, as a relaunch leaves it: his thread stays, stored with no seat.
    procs.john.exit()
    expect(snapshotOf(sender).sessions.map(({ agentId }) => agentId)).toEqual([MARY])
    registry.flushAll()
    const before = stored()
    const johns = before.entries.filter((record) => thread(record, JOHN))
    expect(johns.length).toBeGreaterThan(0)
    const others = structuredClone(before.entries.filter((record) => !thread(record, JOHN)))
    const flat = Object.values(procs).map((proc) => [...proc.writes])
    const sentBefore = sender.sent.length

    expect(close(sender, { agentId: JOHN })).toEqual({ ok: true })
    registry.flushAll()

    const after = stored()
    // His records are gone and no record stands in their place: the others, byte for byte, in order.
    expect(after.entries.some((record) => thread(record, JOHN))).toBe(false)
    expect(after.entries).toEqual(others)
    expect(entries()).toEqual(others)
    expect(after.entries).toHaveLength(before.entries.length - johns.length)
    expect(after.runs).toEqual(before.runs)
    expect(after.skillSessions).toEqual(before.skillSessions)
    expect(JSON.stringify(after.entries)).not.toMatch(/johns words|to john|Hi, John here/)
    // Nothing was said by main about it, no session was asked to end or write, and no other process was touched.
    expect(sender.sent.slice(sentBefore).flatMap((event) => (event.name === 'harness:said' || event.name === 'persona:said' ? [event.name] : []))).toEqual([])
    expect(Object.values(procs).map((proc) => proc.writes)).toEqual(flat)
    expect(procs.mary.killed || procs.room.killed || procs.skill.killed).toBe(false)
    expect(snapshotOf(sender).entries).toEqual(others)
    // A second close finds nothing to delete.
    expect(close(sender, { agentId: JOHN })).toMatchObject({ ok: false, error: { code: 'session/not-found' } })
  })

  it('deletes a live persona’s thread by `{ agentId }` after ending its session, leaving the room, the skill session and the other persona whole', async () => {
    const { sender, ids: held, procs } = await conversation()
    const before = stored()
    const others = structuredClone(before.entries.filter((record) => !thread(record, MARY)))
    const johnsRuns = (before.runs ?? []).filter(({ card }) => card.agentId !== MARY)

    expect(close(sender, { agentId: MARY })).toEqual({ ok: true })
    registry.flushAll()

    expect(procs.mary.killed).toBe(true)
    expect([procs.john, procs.room, procs.skill].some((proc) => proc.killed)).toBe(false)
    expect(closes(sender)).toEqual([held.mary])
    const after = stored()
    expect(after.entries).toEqual(others)
    expect(after.runs).toEqual(johnsRuns)
    expect(after.skillSessions).toEqual(before.skillSessions)
    const snapshot = snapshotOf(sender)
    expect(snapshot.sessions.map(({ agentId }) => agentId)).toEqual([JOHN])
    expect(snapshot.room?.sessionId).toBe(held.room)
    expect(snapshot.skillSessions).toEqual([{ sessionId: held.skill, skill: 'bmad-build', live: true }])
    expect(snapshot.runs.map(({ agentId }) => agentId)).toEqual([undefined])
    // The others still take a turn, which is what holding context is.
    expect(await send(sender, held.john, 'still here')).toEqual({ ok: true })
    expect(await send(sender, held.room, 'still here')).toEqual({ ok: true })
    expect(await send(sender, held.skill, 'still here')).toEqual({ ok: true })
  })

  it('leaves `conversation.end` the one whole clear: after both closes it ends what is left, kills every process and empties the store', async () => {
    const { sender, procs } = await conversation()
    const project = registry.forProject(PROJECT)
    let clears = 0
    const clear = project.clear.bind(project)
    project.clear = () => {
      clears += 1
      return clear()
    }

    // Neither close is a clear of the transcript.
    procs.john.exit()
    expect(close(sender, { agentId: JOHN })).toEqual({ ok: true })
    expect(close(sender, { agentId: MARY })).toEqual({ ok: true })
    expect(clears).toBe(0)
    expect(entries().length).toBeGreaterThan(0)

    expect(end(sender)).toEqual({ ok: true })

    expect(clears).toBe(1)
    expect(procs.room.killed).toBe(true)
    expect(procs.skill.killed).toBe(true)
    expect(entries()).toEqual([])
    expect(!existsSync(transcriptFilePath(userData, PROJECT)) || stored().entries.length === 0).toBe(true)
    const snapshot = snapshotOf(sender)
    expect(snapshot.sessions).toEqual([])
    expect(snapshot.room).toBeUndefined()
    expect(snapshot.skillSessions).toBeUndefined()
    expect(snapshot.runs).toEqual([])
  })
})
