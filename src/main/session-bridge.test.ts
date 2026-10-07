import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionBridgeDeps } from './session-bridge'
import type { ConversationReply } from '../shared/conversation'
import type { ContractEvent } from '../shared/events'
import { forgetInstall, rememberInstall } from './install-model'
import { railAnnotatorFor } from './rail-annotations'
import type { InstallProjection } from './projections/install'
import { createTranscriptRegistry } from './projections/transcript'
import type { TranscriptRegistry, TranscriptRegistryDeps } from './projections/transcript'
import { transcriptFilePath, writeTranscript as writeThrough } from './sources/persistence/transcript-file'
import type { SessionProcess, SpawnOutcome, SpawnSessionOptions } from './sources/session/session-process'

type OpenHandler = (event: { sender: FakeSender }, agentId: unknown) => Promise<unknown>
type SendHandler = (event: { sender: FakeSender }, sessionId: unknown, text: unknown) => unknown

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler)
  },
  BrowserWindow: { fromWebContents: () => null },
  // The app's data directory, for the permission policy's real default.
  app: { getPath: (name: string) => (name === 'userData' ? userData : `/unexpected/${name}`) }
}))

const {
  CONVERSATION_END_CHANNEL,
  CONVERSATION_GET_CHANNEL,
  SESSION_CLOSE_CHANNEL,
  SESSION_EVENT_CHANNEL,
  SESSION_OPEN_CHANNEL,
  TURN_SEND_CHANNEL,
  registerSessionBridge
} = await import('./session-bridge')

class FakeSender {
  sent: [string, ContractEvent][] = []
  destroyed = false
  destroyedListeners: (() => void)[] = []
  constructor(readonly id: number) {}
  send(channel: string, event: ContractEvent) {
    this.sent.push([channel, event])
  }
  isDestroyed() {
    return this.destroyed
  }
  once(_event: 'destroyed', listener: () => void) {
    this.destroyedListeners.push(listener)
  }
  destroy() {
    this.destroyed = true
    this.destroyedListeners.forEach((listener) => listener())
  }
  /** The window going while it can still be told: what the bridge announces as it goes. */
  closing() {
    this.destroyedListeners.forEach((listener) => listener())
    this.destroyed = true
  }
  get events(): ContractEvent[] {
    return this.sent.map(([, event]) => event)
  }
  get names(): string[] {
    return this.events.map((event) => event.name)
  }
}

type FakeProcess = {
  options: SpawnSessionOptions
  writes: string[]
  killed: boolean
  session: SessionProcess
  /** Settle the start as the process having spawned. */
  up(): Promise<void>
  fail(errno: string): void
  frame(frame: unknown): void
  exit(): void
}

let processes: FakeProcess[]
let clock: number
let ids: number
let projectOf: (id: number) => string | undefined
let userData: string
let timers: (() => void)[]
let logs: string[]
/** What the bridge wrote to its diagnostic line, apart from the transcript's own log. */
let diagnostics: string[]
let registry: TranscriptRegistry
/** The roster's display names in main's install model, by agent id; an id left out is not in it. */
let names: Record<string, string>

/**
 * Start the app, or start it again over the same data directory: a fresh
 * registry and bridge, as a new process would have, and nothing carried over.
 */
function launch(
  over: Partial<TranscriptRegistryDeps> = {},
  realNames = false,
  extra: Partial<SessionBridgeDeps> = {}
): void {
  handlers.clear()
  timers = []
  registry = createTranscriptRegistry({
    userDataPath: () => userData,
    schedule: (run) => {
      const timer = (): void => {
        timers = timers.filter((pending) => pending !== timer)
        run()
      }
      timers.push(timer)
      return () => void (timers = timers.filter((pending) => pending !== timer))
    },
    log: (line) => void logs.push(line),
    ...over
  })
  registerSessionBridge({
    transcripts: registry,
    projectPathFor: (id) => projectOf(id),
    now: () => (clock += 1),
    newSessionId: () => `s${(ids += 1)}`,
    writeDiagnostic: (line) => void diagnostics.push(line),
    // The shipped composition passes none: names then come from the real install model.
    ...(realNames ? {} : { agentName: (_id: number, agentId: string) => names[agentId] }),
    // The roster a room's cast is checked against: the names above, in the order they were given.
    roster: () => Object.entries(names).map(([id, name]) => ({ id, name })),
    spawn: (options) =>
      new Promise<SpawnOutcome>((resolve) => {
        const writes: string[] = []
        const fake: FakeProcess = {
          options,
          writes,
          killed: false,
          session: {
            write: (text) => {
              writes.push(text)
              return Promise.resolve(true)
            },
            interrupt: () => Promise.resolve(true),
            kill: () => void (fake.killed = true)
          },
          up: async () => {
            // The real source writes the activation turn as it resolves.
            writes.push(options.firstTurn ?? `/${options.agentId}`)
            resolve({ ok: true, session: fake.session })
            await Promise.resolve()
          },
          fail: (errno) => resolve({ ok: false, errno }),
          frame: (frame) => options.onFrame(frame),
          exit: () => options.onExit()
        }
        processes.push(fake)
      }),
    ...extra
  })
}

beforeEach(() => {
  processes = []
  clock = 1_000
  ids = 0
  logs = []
  diagnostics = []
  names = { 'bmad-agent-analyst': 'Mary', 'bmad-agent-pm': 'John', 'bmad-agent-dev': 'Amelia' }
  userData = mkdtempSync(join(tmpdir(), 'harness-session-bridge-'))
  projectOf = (id) => (id < 100 ? `/project-${id}` : undefined)
  launch()
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

const open = (sender: FakeSender, agentId: unknown) =>
  (handlers.get(SESSION_OPEN_CHANNEL) as unknown as OpenHandler)({ sender }, agentId)
const closeSession = (sender: FakeSender, sessionId: unknown) =>
  (handlers.get(SESSION_CLOSE_CHANNEL) as unknown as (e: { sender: FakeSender }, id: unknown) => unknown)(
    { sender },
    sessionId
  )
const send = (sender: FakeSender, sessionId: unknown, text: unknown) =>
  (handlers.get(TURN_SEND_CHANNEL) as unknown as SendHandler)({ sender }, sessionId, text)

async function opened(sender = new FakeSender(1), agentId = 'bmad-agent-analyst') {
  const pending = open(sender, agentId)
  await processes[processes.length - 1].up()
  const reply = (await pending) as { ok: true; sessionId: string }
  return { sender, reply, proc: processes[processes.length - 1] }
}

const delta = (text: string, parent: string | null = null) => ({
  type: 'stream_event',
  parent_tool_use_id: parent,
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }
})
const messageStart = (id: string) => ({
  type: 'stream_event',
  parent_tool_use_id: null,
  event: { type: 'message_start', message: { id } }
})
const textStart = {
  type: 'stream_event',
  parent_tool_use_id: null,
  event: { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }
}
const result = (subtype = 'success', is_error = false) => ({ type: 'result', subtype, is_error })

describe('channels', () => {
  it('are the six literals the preload shares', () => {
    expect([
      SESSION_OPEN_CHANNEL,
      SESSION_CLOSE_CHANNEL,
      TURN_SEND_CHANNEL,
      SESSION_EVENT_CHANNEL,
      CONVERSATION_GET_CHANNEL,
      CONVERSATION_END_CHANNEL
    ]).toEqual([
      'session:open',
      'session:close',
      'turn:send',
      'session:event',
      'conversation:get',
      'conversation:end'
    ])
  })
})

describe('a start that throws or rejects', () => {
  const cases: [string, NonNullable<SessionBridgeDeps['spawn']>][] = [
    ['rejects', () => Promise.reject(new TypeError('boom'))],
    [
      'throws',
      () => {
        throw new TypeError('boom')
      }
    ]
  ]

  it.each(cases)('replies session/unexpected, logs the cause, and forgets the session when the start %s', async (_how, spawn) => {
    let starts = 0
    launch({}, false, {
      spawn: (options) => {
        starts += 1
        return spawn(options)
      }
    })
    const sender = new FakeSender(1)

    await expect(open(sender, 'bmad-agent-pm')).resolves.toEqual({
      ok: false,
      error: { code: 'session/unexpected', message: 'session · unexpected failure', detail: 'TypeError' }
    })
    expect(diagnostics).toEqual(['session/unexpected · boom'])
    expect(sender.events).toEqual([])
    // Nothing is left behind: the agent is not live, and asking again starts afresh.
    const get = handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (e: { sender: FakeSender }) => ConversationReply
    expect(get({ sender })).toMatchObject({ ok: true, snapshot: { sessions: [], busy: [] } })
    await open(sender, 'bmad-agent-pm')
    expect(starts).toBe(2)
  })

  it('answers every overlapping open the same way', async () => {
    launch({}, false, { spawn: () => Promise.reject(new TypeError('boom')) })
    const sender = new FakeSender(1)

    const replies = await Promise.all([open(sender, 'bmad-agent-pm'), open(sender, 'bmad-agent-pm')])

    for (const reply of replies) {
      expect(reply).toMatchObject({ ok: false, error: { code: 'session/unexpected' } })
    }
  })
})

describe('session.open', () => {
  it('spawns once in the window’s project, writes the activation turn, replies with the session id and pushes session:opened', async () => {
    const { sender, reply, proc } = await opened()

    expect(reply).toEqual({ ok: true, sessionId: 's1' })
    expect(processes).toHaveLength(1)
    expect(proc.options.cwd).toBe('/project-1')
    expect(proc.options.agentId).toBe('bmad-agent-analyst')
    expect(proc.writes).toEqual(['/bmad-agent-analyst'])
    expect(sender.sent).toEqual([
      [
        SESSION_EVENT_CHANNEL,
        { name: 'session:opened', payload: { sessionId: 's1', agentId: 'bmad-agent-analyst', at: 1001 } }
      ],
      [
        SESSION_EVENT_CHANNEL,
        { name: 'persona:state', payload: { agentId: 'bmad-agent-analyst', state: 'work', at: 1001 } }
      ]
    ])
  })

  it('returns the same session and spawns nothing when the agent is already live', async () => {
    const { sender, reply } = await opened()

    await expect(open(sender, 'bmad-agent-analyst')).resolves.toEqual(reply)
    expect(processes).toHaveLength(1)
    expect(sender.names).toEqual(['session:opened', 'persona:state'])
  })

  it('shares one spawn between two opens that overlap', async () => {
    const sender = new FakeSender(1)
    const first = open(sender, 'bmad-agent-pm')
    const second = open(sender, 'bmad-agent-pm')
    await processes[0].up()

    await expect(first).resolves.toEqual({ ok: true, sessionId: 's1' })
    await expect(second).resolves.toEqual({ ok: true, sessionId: 's1' })
    expect(processes).toHaveLength(1)
  })

  it('keeps a session per agent, and a window’s sessions apart from another window’s', async () => {
    const one = new FakeSender(1)
    const two = new FakeSender(2)
    await opened(one, 'bmad-agent-pm')
    await opened(one, 'bmad-agent-analyst')
    await opened(two, 'bmad-agent-pm')

    expect(processes.map((proc) => proc.options.cwd)).toEqual(['/project-1', '/project-1', '/project-2'])
    expect(one.names).toEqual(['session:opened', 'persona:state', 'session:opened', 'persona:state'])
    expect(two.names).toEqual(['session:opened', 'persona:state'])
  })

  it.each([['../x'], ['a b'], [''], [7], [undefined], ['-x']])(
    'refuses %j as session/invalid-agent and spawns nothing',
    async (agentId) => {
      const reply = await open(new FakeSender(1), agentId)

      expect(reply).toMatchObject({ ok: false, error: { code: 'session/invalid-agent' } })
      expect(processes).toHaveLength(0)
    }
  )

  it('refuses a window with no project', async () => {
    const reply = await open(new FakeSender(500), 'bmad-agent-pm')

    expect(reply).toMatchObject({ ok: false, error: { code: 'session/no-project' } })
    expect(processes).toHaveLength(0)
  })

  it('answers a failed start with session/spawn-failed carrying the code only, and keeps no session', async () => {
    const sender = new FakeSender(1)
    const pending = open(sender, 'bmad-agent-pm')
    processes[0].fail('ENOENT')
    const reply = await pending

    expect(reply).toEqual({
      ok: false,
      error: {
        code: 'session/spawn-failed',
        message: 'session · could not start the session',
        detail: 'ENOENT'
      }
    })
    expect(sender.sent).toEqual([])
    expect(await send(sender, 's1', 'hi')).toMatchObject({ error: { code: 'session/not-found' } })

    // Not kept: the next open tries again.
    const again = open(sender, 'bmad-agent-pm')
    await processes[1].up()
    await expect(again).resolves.toMatchObject({ ok: true })
    expect(processes).toHaveLength(2)
  })
})

describe('speech', () => {
  it('pushes persona:said for each main-thread delta, one messageId, in order', async () => {
    const { sender, proc } = await opened()
    for (const frame of [messageStart('msg_1'), textStart, delta('Hel'), delta('lo '), delta('there')]) {
      proc.frame(frame)
    }

    const said = sender.events.filter((event) => event.name === 'persona:said')
    expect(said.map((event) => event.payload)).toEqual([
      { sessionId: 's1', agentId: 'bmad-agent-analyst', messageId: 'msg_1', text: 'Hel', at: expect.any(Number) },
      { sessionId: 's1', agentId: 'bmad-agent-analyst', messageId: 'msg_1', text: 'lo ', at: expect.any(Number) },
      { sessionId: 's1', agentId: 'bmad-agent-analyst', messageId: 'msg_1', text: 'there', at: expect.any(Number) }
    ])
    expect(sender.sent.every(([channel]) => channel === SESSION_EVENT_CHANNEL)).toBe(true)
  })

  it('pushes nothing for subagent text', async () => {
    const { sender, proc } = await opened()
    proc.frame(messageStart('msg_1'))
    proc.frame(textStart)
    proc.frame(delta('private', 'toolu_9'))

    expect(sender.names).toEqual(['session:opened', 'persona:state'])
  })

  it('pushes only persona:said from the fold, never a frame', async () => {
    const { sender, proc } = await opened()
    proc.frame({ type: 'system', subtype: 'init', secret: '/Users/x' })
    proc.frame({ type: 'assistant', message: { content: 'x' } })
    proc.frame(messageStart('m'))
    proc.frame({
      type: 'stream_event',
      parent_tool_use_id: null,
      event: {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 't', name: 'Write', input: {} }
      }
    })

    expect(sender.names).toEqual(['session:opened', 'persona:state'])
  })
})

describe('turn end and turn.send', () => {
  it('is in flight after activation, so a send is refused as busy and nothing is written', async () => {
    const { sender, reply, proc } = await opened()

    expect(await send(sender, reply.sessionId, 'hi')).toMatchObject({
      ok: false,
      error: { code: 'session/busy' }
    })
    expect(proc.writes).toEqual(['/bmad-agent-analyst'])
  })

  it.each([
    ['a success', result('success', false)],
    ['an error during execution', result('error_during_execution', true)]
  ])('emits session:awaiting-turn once on %s, after which a send is written', async (_name, row) => {
    const { sender, reply, proc } = await opened()
    proc.frame(row)

    expect(sender.events.filter((event) => event.name === 'session:awaiting-turn')).toEqual([
      { name: 'session:awaiting-turn', payload: { sessionId: 's1', at: expect.any(Number) } }
    ])
    expect(await send(sender, reply.sessionId, 'hi')).toEqual({ ok: true })
    expect(proc.writes).toEqual(['/bmad-agent-analyst', 'hi'])
  })

  it('puts the turn back in flight with each send', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())
    expect(await send(sender, reply.sessionId, 'one')).toEqual({ ok: true })

    expect(await send(sender, reply.sessionId, 'two')).toMatchObject({ error: { code: 'session/busy' } })
    expect(proc.writes).toEqual(['/bmad-agent-analyst', 'one'])

    proc.frame(result())
    expect(await send(sender, reply.sessionId, 'two')).toEqual({ ok: true })
    expect(proc.writes).toEqual(['/bmad-agent-analyst', 'one', 'two'])
  })

  it('does not take the exit code for the signal', async () => {
    const { sender, reply, proc } = await opened()
    proc.exit()

    expect(sender.names).toEqual([
      'session:opened',
      'persona:state',
      'harness:said',
      'session:closed',
      'persona:state'
    ])
    expect(sender.names).not.toContain('session:awaiting-turn')
    expect(await send(sender, reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/not-found' } })
  })

  it('does not end the turn on a subagent’s result', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame({ type: 'result', parent_tool_use_id: 'toolu_1' })

    expect(sender.names).toEqual(['session:opened', 'persona:state'])
    expect(await send(sender, reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/busy' } })
  })

  it.each([['nope'], [undefined], [3]])('answers an unknown session id %j as session/not-found', async (id) => {
    const { sender } = await opened()

    expect(await send(sender, id, 'hi')).toMatchObject({ ok: false, error: { code: 'session/not-found' } })
  })

  it('answers a window with no sessions as session/not-found', async () => {
    expect(await send(new FakeSender(9), 's1', 'hi')).toMatchObject({ error: { code: 'session/not-found' } })
  })

  it('does not let one window send into another’s session', async () => {
    const { reply, proc } = await opened(new FakeSender(1))
    proc.frame(result())

    expect(await send(new FakeSender(2), reply.sessionId, 'hi')).toMatchObject({
      error: { code: 'session/not-found' }
    })
  })

  it('refuses a send while the process is still starting', async () => {
    const sender = new FakeSender(1)
    const pending = open(sender, 'bmad-agent-pm')

    expect(await send(sender, 's1', 'hi')).toMatchObject({ error: { code: 'session/busy' } })
    await processes[0].up()
    await pending
  })

  it('refuses a turn that is not text', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())

    expect(await send(sender, reply.sessionId, { x: 1 })).toMatchObject({
      error: { code: 'session/invalid-turn' }
    })
    expect(proc.writes).toEqual(['/bmad-agent-analyst'])
  })

  it('frees the turn again when the write itself fails', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())
    let fail = true
    proc.session.write = (text) => {
      if (fail) return Promise.resolve(false)
      proc.writes.push(text)
      return Promise.resolve(true)
    }

    expect(await send(sender, reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/write-failed' } })
    fail = false
    expect(await send(sender, reply.sessionId, 'hi')).toEqual({ ok: true })
  })

  it('waits for the write: a send is busy while it is being written, and a write that settles false records nothing, starts no work and frees the session', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())
    let settle: (written: boolean) => void = () => {}
    proc.session.write = () => new Promise<boolean>((resolve) => void (settle = resolve))
    const first = send(sender, reply.sessionId, 'hi')

    expect(await send(sender, reply.sessionId, 'second')).toMatchObject({ error: { code: 'session/busy' } })
    settle(false)

    expect(await first).toMatchObject({ error: { code: 'session/write-failed' } })
    const get = handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (e: { sender: FakeSender }) => ConversationReply
    const snapshot = get({ sender })
    expect(snapshot.ok && snapshot.snapshot.entries).toEqual([])
    expect(snapshot.ok && snapshot.snapshot.busy).toEqual([])
    expect(sender.events.filter((event) => event.name === 'persona:state').map((event) => event.payload.state)).toEqual(['work', 'idle'])
  })

  it('records nothing when the session closed while the write was in flight', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())
    let settle: (written: boolean) => void = () => {}
    proc.session.write = () => new Promise<boolean>((resolve) => void (settle = resolve))
    const pending = send(sender, reply.sessionId, 'hi')
    closeSession(sender, reply.sessionId)
    settle(true)

    expect(await pending).toMatchObject({ error: { code: 'session/not-found' } })
    expect(sender.events.filter((event) => event.name === 'persona:state').map((event) => event.payload.state)).toEqual(['work', 'idle'])
    const get = handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (e: { sender: FakeSender }) => ConversationReply
    const snapshot = get({ sender })
    expect(snapshot.ok && snapshot.snapshot.entries).toEqual([])
  })
})

const tasksChanged = (...ids: string[]) => ({
  type: 'system',
  subtype: 'background_tasks_changed',
  tasks: ids.map((task_id) => ({ task_id, task_type: 'local_agent', description: 'x' }))
})

describe('the pending turn', () => {
  const personaStates = (sender: FakeSender) =>
    sender.events.flatMap((event) => (event.name === 'persona:state' ? [event.payload.state] : []))
  const awaiting = (sender: FakeSender) =>
    sender.events.filter((event) => event.name === 'session:awaiting-turn')
  const busyOf = (sender: FakeSender): string[] => {
    const get = handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (e: { sender: FakeSender }) => ConversationReply
    const reply = get({ sender })
    return reply.ok ? reply.snapshot.busy : []
  }

  it('stays busy and working through a result while a background task is live, and refuses a send as busy', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(tasksChanged('task-a'))
    proc.frame(result())

    expect(awaiting(sender)).toEqual([])
    expect(personaStates(sender)).toEqual(['work'])
    expect(busyOf(sender)).toEqual([reply.sessionId])
    expect(await send(sender, reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/busy' } })
    expect(proc.writes).toEqual(['/bmad-agent-analyst'])
  })

  it('frees the session once a result arrives with the set empty, and only then', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(tasksChanged('task-a', 'task-b'))
    proc.frame(result())
    proc.frame(tasksChanged('task-b'))
    proc.frame(result())
    expect(awaiting(sender)).toEqual([])

    proc.frame(tasksChanged())
    proc.frame(result())

    expect(awaiting(sender)).toHaveLength(1)
    expect(personaStates(sender)).toEqual(['work', 'idle'])
    expect(busyOf(sender)).toEqual([])
    expect(await send(sender, reply.sessionId, 'hi')).toEqual({ ok: true })
  })

  it('works as it always did when the CLI never sends the task frame: one result frees the session', async () => {
    const { sender, proc } = await opened()
    proc.frame(result())

    expect(awaiting(sender)).toHaveLength(1)
  })

  it('treats a main-thread message that starts while the session is free as a turn nobody sent: busy and working again', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())
    expect(busyOf(sender)).toEqual([])

    proc.frame(messageStart('msg_wake'))

    expect(busyOf(sender)).toEqual([reply.sessionId])
    expect(personaStates(sender)).toEqual(['work', 'idle', 'work'])
    expect(await send(sender, reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/busy' } })

    proc.frame(result())
    expect(awaiting(sender)).toHaveLength(2)
    expect(personaStates(sender)).toEqual(['work', 'idle', 'work', 'idle'])
  })

  it('does not take a subagent’s message start for a turn', async () => {
    const { sender, proc } = await opened()
    proc.frame(result())
    proc.frame({
      type: 'stream_event',
      parent_tool_use_id: 'toolu_1',
      event: { type: 'message_start', message: { id: 'sub' } }
    })

    expect(busyOf(sender)).toEqual([])
  })

  it('drops a text delta that has no open block, and says what is in one', async () => {
    const { sender, proc } = await opened()
    proc.frame(messageStart('m1'))
    proc.frame(delta('stray'))
    proc.frame(textStart)
    proc.frame(delta('spoken'))

    expect(
      sender.events.flatMap((event) => (event.name === 'persona:said' ? [event.payload.text] : []))
    ).toEqual(['spoken'])
  })

  it('gives two messages with no id two records, not one', async () => {
    const { sender, proc } = await opened()
    const noId = { type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: {} } }
    proc.frame(noId)
    proc.frame(textStart)
    proc.frame(delta('one'))
    proc.frame(noId)
    proc.frame(textStart)
    proc.frame(delta('two'))

    const get = handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (e: { sender: FakeSender }) => ConversationReply
    const reply = get({ sender })
    expect(reply.ok && reply.snapshot.entries.map((entry) => entry.text)).toEqual(['one', 'two'])
  })
})

describe('what the harness says in its own voice', () => {
  const lines = (sender: FakeSender) =>
    sender.events.flatMap((event) => (event.name === 'harness:said' ? [event.payload] : []))
  const states = (sender: FakeSender) =>
    sender.events.flatMap((event) => (event.name === 'persona:state' ? [event.payload.state] : []))
  const conversation = (sender: FakeSender) =>
    (handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (e: { sender: FakeSender }) => ConversationReply)({ sender })

  it('says a failed result in a line and reads the persona as error until the next turn starts, then frees the session', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result('error_during_execution', true))

    expect(lines(sender)).toEqual([
      { sessionId: 's1', id: 'm-0', text: 'turn failed · error_during_execution', at: expect.any(Number) }
    ])
    expect(states(sender)).toEqual(['work', 'error'])
    expect(sender.names.filter((name) => name === 'session:awaiting-turn')).toHaveLength(1)
    // The next send works, and a turn that starts clears the error.
    expect(await send(sender, reply.sessionId, 'again')).toEqual({ ok: true })
    expect(states(sender)).toEqual(['work', 'error', 'work'])
    proc.frame(result())
    expect(states(sender)).toEqual(['work', 'error', 'work', 'idle'])
  })

  it('keeps the line in the transcript, after the words it follows, so a reload finds it', async () => {
    const { sender, proc } = await opened()
    proc.frame(messageStart('m'))
    proc.frame(textStart)
    proc.frame(delta('half a thought'))
    proc.frame(result('error_max_budget_usd', true))

    const reply = conversation(sender)
    expect(reply.ok && reply.snapshot.entries.map((entry) => [entry.kind, entry.text])).toEqual([
      ['persona', 'half a thought'],
      ['sysline', 'turn failed · error_max_budget_usd']
    ])
  })

  it.each([
    ['carries no subtype', { type: 'result', is_error: true }],
    ['carries one that is not a plain word', { type: 'result', is_error: true, subtype: 'Has Spaces /etc' }]
  ])('says only that the turn failed when the result %s', async (_name, row) => {
    const { sender, proc } = await opened()
    proc.frame(row)

    expect(lines(sender).map((line) => line.text)).toEqual(['turn failed'])
  })

  it('says nothing for a result that did not fail', async () => {
    const { sender, proc } = await opened()
    proc.frame(result())

    expect(lines(sender)).toEqual([])
    expect(states(sender)).toEqual(['work', 'idle'])
  })

  it('says a failed result while background tasks are live without freeing the session: working, with the line', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(tasksChanged('a'))
    proc.frame(result('error_during_execution', true))

    expect(lines(sender).map((line) => line.text)).toEqual(['turn failed · error_during_execution'])
    expect(sender.names).not.toContain('session:awaiting-turn')
    expect(states(sender)).toEqual(['work'])
    expect(await send(sender, reply.sessionId, 'x')).toMatchObject({ error: { code: 'session/busy' } })
  })

  it('says a process that exits, reads the persona as error, and lets the next open work', async () => {
    const { sender, proc } = await opened()
    proc.exit()

    expect(lines(sender).map((line) => line.text)).toEqual(['session ended · the process exited'])
    expect(sender.names.indexOf('harness:said')).toBeLessThan(sender.names.indexOf('session:closed'))
    expect(states(sender)).toEqual(['work', 'error'])

    const again = open(sender, 'bmad-agent-analyst')
    await processes[1].up()
    await expect(again).resolves.toEqual({ ok: true, sessionId: 's2' })
    expect(states(sender)).toEqual(['work', 'error', 'work'])
  })

  it('says nothing when the user closes the session, or the window goes', async () => {
    const one = await opened(new FakeSender(1), 'bmad-agent-pm')
    closeSession(one.sender, one.reply.sessionId)
    const two = await opened(new FakeSender(2), 'bmad-agent-pm')
    two.sender.closing()
    // The process reports its own exit after being killed; the session is already closed.
    two.proc.exit()
    one.proc.exit()

    expect(lines(one.sender)).toEqual([])
    expect(lines(two.sender)).toEqual([])
  })

  it('records the line where it fell, and its id is the transcript’s own', async () => {
    const { sender, proc } = await opened()
    proc.frame(result('error_during_execution', true))
    proc.frame(messageStart('wake'))
    proc.frame(textStart)
    proc.frame(delta('later'))

    const reply = conversation(sender)
    expect(reply.ok && reply.snapshot.entries.map((entry) => entry.id)).toEqual(['m-0', 'm-1'])
  })
})

describe('the silence clock', () => {
  let clock: { run: () => void; ms: number; cancelled: boolean }[]
  const lines = (sender: FakeSender) =>
    sender.events.flatMap((event) => (event.name === 'harness:said' ? [event.payload.text] : []))
  const live = () => clock.filter((timer) => !timer.cancelled)
  const QUIET = 'no output for 120s · the session may be stuck · close it to start over'

  beforeEach(() => {
    clock = []
    launch({}, false, {
      quietMs: 120_000,
      schedule: (run, ms) => {
        // A timer that has run is spent, as a real one is.
        const timer = {
          run: () => {
            timer.cancelled = true
            run()
          },
          ms,
          cancelled: false
        }
        clock.push(timer)
        return () => void (timer.cancelled = true)
      }
    })
  })

  it('starts when the session opens, for the activation turn, at 120 s', async () => {
    await opened()

    expect(live().map((timer) => timer.ms)).toEqual([120_000])
  })

  it('writes a harness line when it runs out, and closes nothing, kills nothing, and leaves the session busy', async () => {
    const { sender, reply, proc } = await opened()
    live()[0].run()

    expect(lines(sender)).toEqual([QUIET])
    expect(proc.killed).toBe(false)
    expect(sender.names).not.toContain('session:closed')
    expect(await send(sender, reply.sessionId, 'x')).toMatchObject({ error: { code: 'session/busy' } })
    // The line is the transcript's own, and the persona is still working.
    expect(sender.events.filter((event) => event.name === 'persona:state')).toHaveLength(1)
  })

  it('starts again on any frame at all, a subagent’s or a system row’s too, and says nothing while frames keep coming', async () => {
    const { sender, proc } = await opened()
    const first = live()[0]
    proc.frame({ type: 'system', subtype: 'task_progress' })
    proc.frame({ type: 'stream_event', parent_tool_use_id: 'toolu_1', event: { type: 'content_block_stop', index: 0 } })

    expect(first.cancelled).toBe(true)
    expect(live()).toHaveLength(1)
    expect(lines(sender)).toEqual([])
  })

  it('says it once per silence, not repeatedly, and again after the session has spoken and gone quiet again', async () => {
    const { sender, proc } = await opened()
    live()[0].run()
    expect(live()).toEqual([])

    proc.frame({ type: 'system', subtype: 'task_progress' })
    live()[0].run()

    expect(lines(sender)).toEqual([QUIET, QUIET])
  })

  it('stops when the turn ends, and starts with the next send, and not for a failed write', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())
    expect(live()).toEqual([])

    await send(sender, reply.sessionId, 'again')
    expect(live()).toHaveLength(1)

    proc.frame(result())
    proc.session.write = () => Promise.resolve(false)
    await send(sender, reply.sessionId, 'refused')
    expect(live()).toEqual([])
  })

  it('does not run for a result that left a background task live: the session is still busy and the clock goes on', async () => {
    const { proc } = await opened()
    proc.frame(tasksChanged('a'))
    proc.frame(result())

    expect(live()).toHaveLength(1)
  })

  it('starts for a turn nobody sent', async () => {
    const { proc } = await opened()
    proc.frame(result())
    expect(live()).toEqual([])
    proc.frame(messageStart('wake'))

    expect(live()).toHaveLength(1)
  })

  it('stops when the session closes, by the user, by the process or with the window, and a timer that runs late says nothing', async () => {
    const one = await opened(new FakeSender(1), 'bmad-agent-pm')
    const timer = live()[0]
    closeSession(one.sender, one.reply.sessionId)
    expect(timer.cancelled).toBe(true)
    timer.run()
    expect(lines(one.sender)).toEqual([])

    const two = await opened(new FakeSender(2), 'bmad-agent-pm')
    const second = live()[0]
    two.proc.exit()
    expect(second.cancelled).toBe(true)
  })

  it('is 120 seconds, and its real timer never holds the app open', async () => {
    const { QUIET_MS, defaultSchedule } = await import('./session-voice')
    expect(QUIET_MS).toBe(120_000)

    const spy = vi.useFakeTimers()
    try {
      let ran = 0
      const cancel = defaultSchedule(() => void (ran += 1), 120_000)
      spy.advanceTimersByTime(119_999)
      expect(ran).toBe(0)
      spy.advanceTimersByTime(1)
      expect(ran).toBe(1)
      cancel()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('close', () => {
  it('pushes session:closed (process-exited) once, last, and lets the agent open afresh', async () => {
    const { sender, proc } = await opened()
    proc.frame(messageStart('m'))
    proc.frame(textStart)
    proc.frame(delta('bye'))
    proc.exit()
    proc.exit()
    proc.frame(delta('after'))

    expect(sender.names).toEqual([
      'session:opened',
      'persona:state',
      'persona:said',
      'harness:said',
      'session:closed',
      'persona:state'
    ])
    expect(sender.events[4].payload).toMatchObject({
      sessionId: 's1',
      agentId: 'bmad-agent-analyst',
      reason: 'process-exited'
    })

    const again = open(sender, 'bmad-agent-analyst')
    await processes[1].up()
    await expect(again).resolves.toEqual({ ok: true, sessionId: 's2' })
  })

  it('kills every process when the window is destroyed, and says nothing more afterwards', async () => {
    const sender = new FakeSender(1)
    const first = await opened(sender, 'bmad-agent-pm')
    const second = await opened(sender, 'bmad-agent-analyst')
    const before = sender.sent.length

    sender.destroy()
    first.proc.exit()
    second.proc.frame(delta('late'))

    expect(first.proc.killed).toBe(true)
    expect(second.proc.killed).toBe(true)
    expect(sender.sent).toHaveLength(before)
  })

  it('kills a process that finishes starting after the window is destroyed', async () => {
    const sender = new FakeSender(1)
    const pending = open(sender, 'bmad-agent-pm')
    sender.destroy()
    await processes[0].up()

    await expect(pending).resolves.toMatchObject({ ok: false })
    expect(processes[0].killed).toBe(true)
    expect(sender.sent).toEqual([])
  })
})

describe('session.close', () => {
  const say = (proc: FakeProcess, text: string) => {
    proc.frame(messageStart('m1'))
    proc.frame(textStart)
    proc.frame(delta(text))
  }

  it('kills that one process, emits session:closed with reason closed, and replies ok', async () => {
    const sender = new FakeSender(1)
    const first = await opened(sender, 'bmad-agent-pm')
    const second = await opened(sender, 'bmad-agent-analyst')
    const before = sender.sent.length

    expect(closeSession(sender, first.reply.sessionId)).toEqual({ ok: true })

    expect(first.proc.killed).toBe(true)
    expect(second.proc.killed).toBe(false)
    const closed = sender.events.slice(before).filter((event) => event.name === 'session:closed')
    expect(closed).toEqual([
      {
        name: 'session:closed',
        payload: {
          sessionId: first.reply.sessionId,
          agentId: 'bmad-agent-pm',
          reason: 'closed',
          at: expect.any(Number)
        }
      }
    ])
  })

  it('keeps the transcript and leaves the other sessions working', async () => {
    const sender = new FakeSender(1)
    const first = await opened(sender, 'bmad-agent-pm')
    const second = await opened(sender, 'bmad-agent-analyst')
    say(first.proc, 'kept')
    const turns = registry.forProject('/project-1').entries()

    closeSession(sender, first.reply.sessionId)

    expect(registry.forProject('/project-1').entries()).toEqual(turns)
    expect(turns).toHaveLength(1)
    second.proc.frame(result())
    expect(await send(sender, second.reply.sessionId, 'still here')).toEqual({ ok: true })
    // The closed one is gone, and a late frame from it says nothing.
    const before = sender.sent.length
    first.proc.frame(delta('late'))
    expect(sender.sent).toHaveLength(before)
    expect(await send(sender, first.reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/not-found' } })
  })

  it('lets the agent open afresh after its session was closed', async () => {
    const sender = new FakeSender(1)
    const first = await opened(sender, 'bmad-agent-pm')
    closeSession(sender, first.reply.sessionId)

    const again = open(sender, 'bmad-agent-pm')
    await processes[1].up()
    await expect(again).resolves.toEqual({ ok: true, sessionId: 's2' })
  })

  it('answers session/not-found for an unknown id, a closed one, a non-string and a window with none', async () => {
    const sender = new FakeSender(1)
    const { reply } = await opened(sender)
    const notFound = { ok: false, error: { code: 'session/not-found' } }

    expect(closeSession(sender, 'nope')).toMatchObject(notFound)
    expect(closeSession(sender, undefined)).toMatchObject(notFound)
    expect(closeSession(sender, 7)).toMatchObject(notFound)
    expect(closeSession(new FakeSender(9), reply.sessionId)).toMatchObject(notFound)
    expect(closeSession(new FakeSender(2), reply.sessionId)).toMatchObject(notFound)

    expect(closeSession(sender, reply.sessionId)).toEqual({ ok: true })
    const before = sender.sent.length
    expect(closeSession(sender, reply.sessionId)).toMatchObject(notFound)
    expect(sender.sent).toHaveLength(before)
  })

  it('closes a session whose turn is in flight', async () => {
    const sender = new FakeSender(1)
    const { reply, proc } = await opened(sender)

    expect(closeSession(sender, reply.sessionId)).toEqual({ ok: true })
    expect(proc.killed).toBe(true)
  })
})

describe('persona:state', () => {
  const states = (sender: FakeSender) =>
    sender.events.flatMap((event) => (event.name === 'persona:state' ? [event.payload] : []))

  it('is work from the session opening, with the opening event’s own time, and idle when the turn ends', async () => {
    const { sender, proc } = await opened()

    expect(states(sender)).toEqual([{ agentId: 'bmad-agent-analyst', state: 'work', at: 1001 }])

    proc.frame(result())
    const awaiting = sender.events.find((event) => event.name === 'session:awaiting-turn')

    expect(states(sender)).toEqual([
      { agentId: 'bmad-agent-analyst', state: 'work', at: 1001 },
      { agentId: 'bmad-agent-analyst', state: 'idle', at: awaiting?.payload.at }
    ])
  })

  it('is work again from a successful send, and says nothing for a refused one', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())
    await send(sender, reply.sessionId, 'hi')
    await send(sender, reply.sessionId, 'again')

    expect(states(sender).map((payload) => payload.state)).toEqual(['work', 'idle', 'work'])
  })

  it('says nothing for a send whose write failed', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())
    proc.session.write = () => Promise.resolve(false)
    await send(sender, reply.sessionId, 'hi')

    expect(states(sender).map((payload) => payload.state)).toEqual(['work', 'idle'])
  })

  it('stays work through a quiet phase with no frames', async () => {
    const { sender, proc } = await opened()
    proc.frame({ type: 'system', subtype: 'task_progress' })

    expect(states(sender).map((payload) => payload.state)).toEqual(['work'])
  })

  it('is error when the process exits mid-turn, which is not a thing the user asked for', async () => {
    const { sender, proc } = await opened()
    proc.exit()

    expect(states(sender).map((payload) => payload.state)).toEqual(['work', 'error'])
  })

  it('is idle when the user closes the session mid-turn', async () => {
    const { sender, reply } = await opened()
    closeSession(sender, reply.sessionId)

    expect(states(sender).map((payload) => payload.state)).toEqual(['work', 'idle'])
  })

  it('keeps each window’s personas apart', async () => {
    const one = new FakeSender(1)
    const two = new FakeSender(2)
    await opened(one, 'bmad-agent-pm')
    await opened(two, 'bmad-agent-pm')

    expect(states(one)).toHaveLength(1)
    expect(states(two)).toHaveLength(1)
  })
})

describe('conversation:get', () => {
  const get = (sender: FakeSender): ConversationReply =>
    (handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (event: { sender: FakeSender }) => ConversationReply)({
      sender
    })
  const snapshotOf = (sender: FakeSender) => {
    const reply = get(sender)
    if (!reply.ok) throw new Error('expected a snapshot')
    return reply.snapshot
  }
  const A = 'bmad-agent-analyst'

  it('is a read: it pushes nothing and spawns nothing', async () => {
    const sender = new FakeSender(1)
    get(sender)

    expect(sender.sent).toEqual([])
    expect(processes).toHaveLength(0)
  })

  it('answers a window with no project with the envelope', () => {
    expect(get(new FakeSender(500))).toEqual({
      ok: false,
      error: {
        code: 'conversation/no-project',
        message: 'conversation · no project is open for this window'
      }
    })
  })

  it('answers an empty conversation for a project with no history', () => {
    expect(snapshotOf(new FakeSender(1))).toEqual({
      entries: [],
      sessions: [],
      busy: [],
      personas: [],
      runs: []
    })
  })

  it('reload mid-turn: holds the partial message, the busy session and work with its time; later words join it; awaiting-turn clears busy', async () => {
    const { sender, proc } = await opened()
    for (const frame of [messageStart('msg_1'), textStart, delta('Hel')]) proc.frame(frame)

    expect(snapshotOf(sender)).toEqual({
      entries: [{ kind: 'persona', id: 'm-0', at: expect.any(Number), agentId: A, messageId: 'msg_1', text: 'Hel' }],
      sessions: [{ agentId: A, sessionId: 's1' }],
      busy: ['s1'],
      personas: [{ agentId: A, state: 'work', at: 1001 }],
      runs: []
    })

    proc.frame(delta('lo'))
    expect(snapshotOf(sender).entries).toMatchObject([{ id: 'm-0', text: 'Hello' }])

    proc.frame(result())
    expect(snapshotOf(sender)).toMatchObject({
      sessions: [{ agentId: A, sessionId: 's1' }],
      busy: [],
      personas: []
    })
  })

  it('reload idle: holds the turns and the live session, with nothing busy and no state that is not idle', async () => {
    const { sender, reply, proc } = await opened()
    for (const frame of [messageStart('msg_1'), textStart, delta('Hi'), result()]) proc.frame(frame)
    await send(sender, reply.sessionId, 'thanks')
    proc.frame(result())

    const snapshot = snapshotOf(sender)
    expect(snapshot.entries.map((entry) => [entry.kind, entry.text])).toEqual([
      ['persona', 'Hi'],
      ['user', 'thanks']
    ])
    expect(snapshot.sessions).toEqual([{ agentId: A, sessionId: 's1' }])
    expect(snapshot.busy).toEqual([])
    expect(snapshot.personas).toEqual([])
  })

  it('records the user’s turn when it is written, and not one that was refused', async () => {
    const { sender, reply, proc } = await opened()
    await send(sender, reply.sessionId, 'too early')
    expect(snapshotOf(sender).entries).toEqual([])

    proc.frame(result())
    await send(sender, reply.sessionId, 'hello')
    await send(sender, reply.sessionId, 'again')
    proc.session.write = () => Promise.resolve(false)
    proc.frame(result())
    await send(sender, reply.sessionId, 'unwritten')

    expect(snapshotOf(sender).entries).toEqual([
      { kind: 'user', id: 'm-0', at: expect.any(Number), text: 'hello' }
    ])
  })

  it('does not record the activation turn, a subagent’s words or a message with no agent', async () => {
    const { sender, proc } = await opened()
    proc.frame(messageStart('msg_1'))
    proc.frame(textStart)
    proc.frame(delta('private', 'toolu_9'))

    expect(snapshotOf(sender).entries).toEqual([])
  })

  it('gives a session still starting no place in the snapshot', async () => {
    const sender = new FakeSender(1)
    const pending = open(sender, A)

    expect(snapshotOf(sender).sessions).toEqual([])
    await processes[0].up()
    await pending
    expect(snapshotOf(sender).sessions).toEqual([{ agentId: A, sessionId: 's1' }])
  })

  it('relaunch: the transcript is present, no session is live or busy, and every persona is idle', async () => {
    const { sender, reply, proc } = await opened()
    for (const frame of [messageStart('msg_1'), textStart, delta('Hi'), result()]) proc.frame(frame)
    await send(sender, reply.sessionId, 'thanks')
    proc.frame(messageStart('msg_2'))
    proc.frame(textStart)
    proc.frame(delta('Partly'))
    registry.flushAll()

    launch()
    const again = snapshotOf(new FakeSender(1))

    expect(again.entries.map((entry) => [entry.id, entry.kind, entry.text])).toEqual([
      ['m-0', 'persona', 'Hi'],
      ['m-1', 'user', 'thanks'],
      ['m-2', 'persona', 'Partly']
    ])
    expect(again.sessions).toEqual([])
    expect(again.busy).toEqual([])
    expect(again.personas).toEqual([])

    // The conversation goes on from where it was: ids continue past the file's.
    const next = await opened(new FakeSender(1))
    next.proc.frame(messageStart('msg_9'))
    next.proc.frame(textStart)
    next.proc.frame(delta('Back'))
    expect(snapshotOf(next.sender).entries.at(-1)).toMatchObject({ id: 'm-3', text: 'Back' })
  })

  it('keeps two projects’ transcripts apart, in two files', async () => {
    const one = await opened(new FakeSender(1), A)
    const two = await opened(new FakeSender(2), A)
    one.proc.frame(messageStart('a'))
    one.proc.frame(textStart)
    one.proc.frame(delta('first'))
    two.proc.frame(messageStart('b'))
    two.proc.frame(textStart)
    two.proc.frame(delta('second'))
    registry.flushAll()

    expect(snapshotOf(one.sender).entries.map((entry) => entry.text)).toEqual(['first'])
    expect(snapshotOf(two.sender).entries.map((entry) => entry.text)).toEqual(['second'])
    expect(readdirSync(join(userData, 'conversations'))).toHaveLength(2)
  })

  it('writes the transcript when the scheduler fires, and nothing before', async () => {
    const { proc } = await opened()
    proc.frame(messageStart('msg_1'))
    proc.frame(textStart)
    proc.frame(delta('Hi'))
    const file = transcriptFilePath(userData, '/project-1')

    expect(existsSync(file)).toBe(false)
    timers.forEach((timer) => timer())
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({
      version: 1,
      projectPath: '/project-1',
      entries: [{ kind: 'persona', text: 'Hi' }]
    })
  })

  it('goes on when a write fails, logs it, and writes again on the next change', async () => {
    let failing = 1
    launch({
      write: () => {
        failing -= 1
        return failing >= 0 ? { ok: false, errno: 'ENOSPC' } : { ok: true }
      }
    })
    const { sender, reply, proc } = await opened()
    proc.frame(messageStart('msg_1'))
    proc.frame(textStart)
    proc.frame(delta('Hi'))
    timers.forEach((timer) => timer())
    expect(logs).toEqual(['persist/write-failed \u00b7 ENOSPC'])

    proc.frame(result())
    expect(await send(sender, reply.sessionId, 'carry on')).toEqual({ ok: true })
    expect(timers).toHaveLength(1)
    timers.forEach((timer) => timer())
    expect(logs).toHaveLength(1)
  })
})

describe('a stored conversation that cannot be read', () => {
  const plant = (content: string): string => {
    const file = transcriptFilePath(userData, '/project-1')
    mkdirSync(join(userData, 'conversations'), { recursive: true })
    writeFileSync(file, content)
    return file
  }
  const get = (sender: FakeSender): ConversationReply =>
    (handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (e: { sender: FakeSender }) => ConversationReply)({ sender })

  it('opens with a line of the harness’s own at the top, and the file set aside whole', () => {
    const file = plant('{not json')

    const reply = get(new FakeSender(1))

    expect(reply.ok && reply.snapshot.entries).toMatchObject([
      { kind: 'sysline', text: 'earlier conversation could not be read · kept aside' }
    ])
    expect(readFileSync(`${file}.aside`, 'utf8')).toBe('{not json')
    expect(logs).toEqual(['persist/quarantined · corrupt'])
  })

  it('goes on from there: later turns come after the line, and nothing written replaces the original', async () => {
    const file = plant(JSON.stringify({ version: 9, projectPath: '/project-1', entries: [] }))
    const { sender, reply, proc } = await opened()
    proc.frame(result())
    await send(sender, reply.sessionId, 'hello')
    registry.flushAll()

    const stored = JSON.parse(readFileSync(file, 'utf8'))
    expect(stored.entries.map((entry: { text: string }) => entry.text)).toEqual([
      'earlier conversation could not be read · kept aside',
      'hello'
    ])
    expect(JSON.parse(readFileSync(`${file}.aside`, 'utf8')).version).toBe(9)
    expect(logs).toEqual(['persist/quarantined · unknown-version'])
  })

  it('says nothing for a conversation that was simply never stored', () => {
    const reply = get(new FakeSender(1))

    expect(reply.ok && reply.snapshot.entries).toEqual([])
    expect(logs).toEqual([])
  })
})

describe('reclaim', () => {
  const A = 'bmad-agent-analyst'

  it('emits session:closed when the process exits, and keeps the transcript', async () => {
    const { sender, proc } = await opened()
    proc.frame(messageStart('msg_1'))
    proc.frame(textStart)
    proc.frame(delta('Hi'))
    proc.exit()

    expect(sender.events.filter((event) => event.name === 'session:closed')).toMatchObject([
      { payload: { sessionId: 's1', agentId: A, reason: 'process-exited' } }
    ])
    const reply = (handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (e: { sender: FakeSender }) => ConversationReply)({ sender })
    expect(reply).toMatchObject({
      ok: true,
      snapshot: {
        entries: [{ text: 'Hi' }, { kind: 'sysline', text: 'session ended · the process exited' }],
        sessions: [],
        busy: []
      }
    })
  })

  it('emits session:closed for each session when the window is destroyed, and writes the transcript then', async () => {
    const sender = new FakeSender(1)
    const first = await opened(sender, 'bmad-agent-pm')
    await opened(sender, A)
    first.proc.frame(messageStart('msg_1'))
    first.proc.frame(textStart)
    first.proc.frame(delta('Bye'))
    const file = transcriptFilePath(userData, '/project-1')
    expect(existsSync(file)).toBe(false)

    sender.closing()

    expect(sender.events.filter((event) => event.name === 'session:closed')).toMatchObject([
      { payload: { sessionId: 's1', reason: 'closed' } },
      { payload: { sessionId: 's2', reason: 'closed' } }
    ])
    expect(JSON.parse(readFileSync(file, 'utf8')).entries).toMatchObject([{ text: 'Bye' }])
  })

  it('finds the transcript again when the project’s next window asks', async () => {
    const sender = new FakeSender(1)
    const { proc } = await opened(sender)
    proc.frame(messageStart('msg_1'))
    proc.frame(textStart)
    proc.frame(delta('Bye'))
    sender.destroy()

    const reply = (handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (e: { sender: FakeSender }) => ConversationReply)({
      sender: new FakeSender(1)
    })
    expect(reply).toMatchObject({
      ok: true,
      snapshot: { entries: [{ text: 'Bye' }], sessions: [], busy: [], personas: [], runs: [] }
    })
  })
})

describe('conversation.end', () => {
  const A = 'bmad-agent-analyst'
  type EndReply = { ok: true } | { ok: false; error: { code: string; message: string; detail?: string } }
  const end = (sender: FakeSender, projectId: unknown): EndReply =>
    (handlers.get(CONVERSATION_END_CHANNEL) as unknown as (e: { sender: FakeSender }, id: unknown) => EndReply)(
      { sender },
      projectId
    )
  const get = (sender: FakeSender): ConversationReply =>
    (handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (e: { sender: FakeSender }) => ConversationReply)({ sender })
  const entriesOf = (sender: FakeSender) => {
    const reply = get(sender)
    if (!reply.ok) throw new Error('expected a snapshot')
    return reply.snapshot.entries
  }
  const say = (proc: FakeProcess, id: string, text: string) => {
    proc.frame(messageStart(id))
    proc.frame(textStart)
    proc.frame(delta(text))
  }
  const closedEvents = (sender: FakeSender) => sender.events.filter((event) => event.name === 'session:closed')
  const fileOf = (project: string) => transcriptFilePath(userData, project)

  it('clears the file to entries: [], closes the idle live session and replies ok', async () => {
    const { sender, reply, proc } = await opened()
    say(proc, 'msg_1', 'Hi')
    proc.frame(result())
    await send(sender, reply.sessionId, 'thanks')
    registry.flushAll()
    expect(JSON.parse(readFileSync(fileOf('/project-1'), 'utf8')).entries).toHaveLength(2)

    expect(end(sender, '/project-1')).toEqual({ ok: true })

    expect(JSON.parse(readFileSync(fileOf('/project-1'), 'utf8'))).toEqual({
      version: 1,
      projectPath: '/project-1',
      entries: []
    })
    expect(proc.killed).toBe(true)
    expect(closedEvents(sender)).toMatchObject([{ payload: { sessionId: 's1', agentId: A, reason: 'closed' } }])
    expect(get(sender)).toMatchObject({
      ok: true,
      snapshot: { entries: [], sessions: [], busy: [], personas: [], runs: [] }
    })
  })

  it('closes a session killed mid-turn, and records and emits nothing from it afterwards', async () => {
    const { sender, proc } = await opened()
    say(proc, 'msg_1', 'Hel')
    const before = sender.sent.length

    expect(end(sender, '/project-1')).toEqual({ ok: true })
    const afterEnd = sender.sent.length
    proc.frame(delta('lo'))
    proc.frame(result())
    proc.exit()

    expect(proc.killed).toBe(true)
    expect(afterEnd).toBeGreaterThan(before)
    expect(sender.sent).toHaveLength(afterEnd)
    expect(closedEvents(sender)).toHaveLength(1)
    expect(entriesOf(sender)).toEqual([])
    // Nothing is left to write: the cleared file stays cleared.
    registry.flushAll()
    expect(JSON.parse(readFileSync(fileOf('/project-1'), 'utf8')).entries).toEqual([])
  })

  it('emits session:closed for each live session', async () => {
    const sender = new FakeSender(1)
    await opened(sender, 'bmad-agent-pm')
    await opened(sender, A)

    end(sender, '/project-1')

    expect(closedEvents(sender)).toMatchObject([
      { payload: { sessionId: 's1', reason: 'closed' } },
      { payload: { sessionId: 's2', reason: 'closed' } }
    ])
    expect(processes.every((proc) => proc.killed)).toBe(true)
  })

  it('opens a fresh session for the next message, and the transcript begins again at m-0', async () => {
    const { sender, proc } = await opened()
    say(proc, 'msg_1', 'Hi')
    end(sender, '/project-1')

    const next = await opened(sender)
    expect(next.reply.sessionId).toBe('s2')
    expect(processes).toHaveLength(2)
    say(next.proc, 'msg_9', 'Again')
    expect(entriesOf(sender)).toMatchObject([{ id: 'm-0', text: 'Again' }])
  })

  it('relaunch after an end: the transcript is empty and every persona idle', async () => {
    const { sender, proc } = await opened()
    say(proc, 'msg_1', 'Hi')
    registry.flushAll()
    end(sender, '/project-1')

    launch()
    expect(get(new FakeSender(1))).toEqual({
      ok: true,
      snapshot: { entries: [], sessions: [], busy: [], personas: [], runs: [] }
    })
  })

  it('refuses another project’s id and touches nothing', async () => {
    const { sender, proc } = await opened()
    say(proc, 'msg_1', 'Hi')
    registry.flushAll()
    const before = sender.sent.length

    expect(end(sender, '/project-2')).toEqual({
      ok: false,
      error: { code: 'conversation/wrong-project', message: 'conversation · not the project this window holds' }
    })

    expect(proc.killed).toBe(false)
    expect(sender.sent).toHaveLength(before)
    expect(entriesOf(sender)).toHaveLength(1)
    expect(JSON.parse(readFileSync(fileOf('/project-1'), 'utf8')).entries).toHaveLength(1)
  })

  it.each([undefined, 1, null, {}, ['/project-1']])('refuses a non-string id (%j)', async (id) => {
    const { sender, proc } = await opened()

    expect(end(sender, id)).toMatchObject({ ok: false, error: { code: 'conversation/wrong-project' } })
    expect(proc.killed).toBe(false)
    expect(closedEvents(sender)).toEqual([])
  })

  it('refuses a window with no project', () => {
    expect(end(new FakeSender(500), '/project-500')).toEqual({
      ok: false,
      error: { code: 'conversation/no-project', message: 'conversation · no project is open for this window' }
    })
  })

  it('on a failed write changes nothing: the transcript, the sessions and the file stay', async () => {
    let failing = false
    launch({ write: (file, project, entries) => (failing ? { ok: false, errno: 'EACCES' } : writeThrough(file, project, entries)) })
    const { sender, proc } = await opened()
    say(proc, 'msg_1', 'Hi')
    registry.flushAll()
    failing = true
    const before = sender.sent.length

    expect(end(sender, '/project-1')).toEqual({
      ok: false,
      error: {
        code: 'conversation/end-failed',
        message: 'conversation · could not end the conversation',
        detail: 'EACCES'
      }
    })

    expect(logs).toEqual(['persist/write-failed · EACCES'])
    expect(proc.killed).toBe(false)
    expect(sender.sent).toHaveLength(before)
    expect(entriesOf(sender)).toMatchObject([{ text: 'Hi' }])
    expect(JSON.parse(readFileSync(fileOf('/project-1'), 'utf8')).entries).toMatchObject([{ text: 'Hi' }])
    // The session still speaks into the transcript.
    say(proc, 'msg_2', 'More')
    expect(entriesOf(sender)).toHaveLength(2)
  })

  it('refuses a transcript path inside the project, with the errno', async () => {
    const project = mkdtempSync(join(tmpdir(), 'harness-project-'))
    const inside = join(project, 'data')
    mkdirSync(inside)
    userData = inside
    projectOf = () => project
    launch()
    try {
      const { sender } = await opened()
      expect(end(sender, project)).toMatchObject({
        ok: false,
        error: { code: 'conversation/end-failed', detail: 'inside-project' }
      })
      expect(readdirSync(inside)).toEqual([])
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })

  it('kills the process of an open still starting, closes it, and the open answers not-found', async () => {
    const sender = new FakeSender(1)
    const pending = open(sender, A)

    expect(end(sender, '/project-1')).toEqual({ ok: true })
    expect(closedEvents(sender)).toMatchObject([{ payload: { sessionId: 's1', reason: 'closed' } }])
    await processes[0].up()

    expect(await pending).toMatchObject({ ok: false, error: { code: 'session/not-found' } })
    expect(processes[0].killed).toBe(true)
    expect(sender.names).not.toContain('session:opened')
  })

  it('clears only its own project: another project’s file and sessions stay', async () => {
    const one = await opened(new FakeSender(1), A)
    const two = await opened(new FakeSender(2), A)
    say(one.proc, 'a', 'first')
    say(two.proc, 'b', 'second')
    registry.flushAll()

    end(one.sender, '/project-1')

    expect(JSON.parse(readFileSync(fileOf('/project-1'), 'utf8')).entries).toEqual([])
    expect(JSON.parse(readFileSync(fileOf('/project-2'), 'utf8')).entries).toMatchObject([{ text: 'second' }])
    expect(two.proc.killed).toBe(false)
    expect(closedEvents(two.sender)).toEqual([])
    expect(entriesOf(two.sender)).toHaveLength(1)
  })

  it('works for a window that never opened a session', () => {
    const sender = new FakeSender(1)

    expect(end(sender, '/project-1')).toEqual({ ok: true })
    expect(sender.sent).toEqual([])
  })
})

describe('what is written, and where', () => {
  it('is one file under userData and none inside the project root', async () => {
    const project = mkdtempSync(join(tmpdir(), 'harness-project-'))
    mkdirSync(join(project, '_bmad'))
    projectOf = () => project
    try {
      const { sender, reply, proc } = await opened()
      for (const frame of [messageStart('msg_1'), textStart, delta('Hi'), result()]) proc.frame(frame)
      await send(sender, reply.sessionId, 'thanks')
      sender.destroy()

      expect(readdirSync(join(userData, 'conversations'))).toHaveLength(1)
      expect(readdirSync(userData)).toEqual(['conversations'])
      expect(readdirSync(project)).toEqual(['_bmad'])
      expect(readdirSync(join(project, '_bmad'))).toEqual([])
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})

describe('handoff', () => {
  const A = 'bmad-agent-analyst'
  const B = 'bmad-agent-pm'
  type Opened = { ok: true; sessionId: string; handoff?: unknown }
  const end = (sender: FakeSender, projectId: string) =>
    (handlers.get(CONVERSATION_END_CHANNEL) as unknown as (e: { sender: FakeSender }, id: unknown) => unknown)(
      { sender },
      projectId
    )
  const get = (sender: FakeSender): ConversationReply =>
    (handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (e: { sender: FakeSender }) => ConversationReply)({ sender })
  /**
   * What the transcript holds, read from the registry: reading it through
   * `conversation:get` would be a window reloading, which forgets the last persona.
   */
  const entriesOf = (sender: FakeSender) => registry.forProject(`/project-${sender.id}`).entries()
  const say = (proc: FakeProcess, id: string, text: string) => {
    proc.frame(messageStart(id))
    proc.frame(textStart)
    proc.frame(delta(text))
  }
  /** One main-thread Write (or Edit) of `path`, streamed in pieces, as the CLI would. */
  const writes = (proc: FakeProcess, path: string, tool = 'Write', index = 3) => {
    const json = JSON.stringify({ file_path: path, content: 'body' })
    proc.frame({
      type: 'stream_event',
      parent_tool_use_id: null,
      event: { type: 'content_block_start', index, content_block: { type: 'tool_use', id: `t${index}`, name: tool, input: {} } }
    })
    for (let at = 0; at < json.length; at += 6) {
      proc.frame({
        type: 'stream_event',
        parent_tool_use_id: null,
        event: { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(at, at + 6) } }
      })
    }
    proc.frame({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_stop', index } })
  }
  const openAs = async (sender: FakeSender, agentId: string) => {
    const done = await opened(sender, agentId)
    return { ...done, reply: done.reply as Opened }
  }
  const syslines = (sender: FakeSender) => entriesOf(sender).filter((entry) => entry.kind === 'sysline')

  it('writes one sysline on opening another persona over a transcript that has turns, names the files the first wrote in write order, and returns it on the open’s reply', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Here is the plan')
    writes(a.proc, '/project-1/b.md')
    writes(a.proc, '/project-1/a.md', 'Edit', 4)
    writes(a.proc, '/project-1/b.md', 'Edit', 5)
    const eventsBefore = sender.events.length

    const b = await openAs(sender, B)

    const text = 'handed off · Mary → John · picking up from b.md, a.md'
    expect(b.reply).toEqual({ ok: true, sessionId: 's2', handoff: { kind: 'sysline', id: 'm-1', at: expect.any(Number), text } })
    expect(entriesOf(sender)).toMatchObject([{ kind: 'persona', text: 'Here is the plan' }, { kind: 'sysline', text }])
    // The line travels on the reply and in the snapshot, never as a new event.
    expect(sender.events.slice(eventsBefore).map((event) => event.name)).toEqual(['session:opened', 'persona:state'])
    // The first persona's session is left running.
    expect(a.proc.killed).toBe(false)
    // And a window that reads the conversation afterwards is given the line like any record.
    const reply = get(sender)
    expect(reply.ok && reply.snapshot.entries[1]).toEqual(b.reply.handoff)
  })

  it('says only who and who when the first persona wrote nothing', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Hello')

    const b = await openAs(sender, B)

    expect(b.reply.handoff).toMatchObject({ text: 'handed off · Mary → John' })
  })

  it('writes nothing on a first open, over an empty transcript, or on re-activating the persona it last opened', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    expect(a.reply.handoff).toBeUndefined()
    expect('handoff' in a.reply).toBe(false)

    // No turns yet: opening another persona is not a handoff.
    const b = await openAs(sender, B)
    expect('handoff' in b.reply).toBe(false)
    expect(entriesOf(sender)).toEqual([])

    say(b.proc, 'msg_1', 'Hi')
    await expect(open(sender, B)).resolves.toEqual({ ok: true, sessionId: 's2' })
    expect(syslines(sender)).toEqual([])
  })

  it('hands back to a persona whose session is live: the same session, a sysline naming what the other wrote', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Plan')
    writes(a.proc, '/project-1/plan.md')
    const b = await openAs(sender, B)
    writes(b.proc, '/project-1/brief.md')
    writes(b.proc, '/project-1/.memlog.md', 'Write', 4)
    writes(b.proc, '/etc/outside.md', 'Write', 5)

    const back = await open(sender, A)

    expect(processes).toHaveLength(2)
    expect(back).toMatchObject({
      ok: true,
      sessionId: 's1',
      handoff: { text: 'handed off · John → Mary · picking up from brief.md' }
    })
    expect(syslines(sender).map((entry) => entry.text)).toEqual([
      'handed off · Mary → John · picking up from plan.md',
      'handed off · John → Mary · picking up from brief.md'
    ])
  })

  it('keeps the written files per persona, across a session that closed and opened again', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Plan')
    writes(a.proc, '/project-1/one.md')
    a.proc.exit()
    const again = await openAs(sender, A)
    writes(again.proc, '/project-1/two.md')

    const b = await openAs(sender, B)

    expect(b.reply.handoff).toMatchObject({ text: 'handed off · Mary → John · picking up from one.md, two.md' })
  })

  it('raises no doc event for a chat turn’s write, and persona states stay as they were', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    const before = sender.events.length
    writes(a.proc, '/project-1/a.md')

    expect(sender.events.slice(before)).toEqual([])
  })

  it('writes nothing for an open that fails, and the last persona stays the one before it', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Hello')

    const failing = open(sender, B)
    processes[processes.length - 1].fail('ENOENT')
    await expect(failing).resolves.toMatchObject({ ok: false, error: { code: 'session/spawn-failed' } })
    expect(syslines(sender)).toEqual([])

    // Still with Mary: opening her again is not a handoff, opening John once he starts is.
    await expect(open(sender, A)).resolves.toEqual({ ok: true, sessionId: 's1' })
    const b = await openAs(sender, B)
    expect(b.reply.handoff).toMatchObject({ text: 'handed off · Mary → John' })
  })

  it('refuses the handoff, and only that, for a persona the install model does not name', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Hello')
    delete names[B]

    const b = await openAs(sender, B)

    expect(b.reply).toEqual({ ok: true, sessionId: 's2' })
    expect(syslines(sender)).toEqual([])
    // The open stands, and it is the last one: going back to Mary is a handoff only if Mary is named.
    names[B] = 'John'
    const back = await open(sender, A)
    expect(back).toMatchObject({ handoff: { text: 'handed off · John → Mary' } })
  })

  it('does not name an empty display name, and takes both names from the model, never from the id', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Hello')
    names[B] = 'Bob'
    names[A] = 'Ann'

    const b = await openAs(sender, B)

    expect(b.reply.handoff).toMatchObject({ text: 'handed off · Ann → Bob' })
  })

  it('forgets who it was with when the window reads the conversation again: the next open writes none, the one after does', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Hello')
    get(sender)

    const b = await openAs(sender, B)
    expect('handoff' in b.reply).toBe(false)
    expect(syslines(sender)).toEqual([])

    await expect(open(sender, A)).resolves.toMatchObject({ handoff: { text: 'handed off · John → Mary' } })
  })

  it('keeps the sysline through a relaunch, and writes none on the first open after it', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Hello')
    await openAs(sender, B)
    registry.flushAll()

    launch()
    const again = new FakeSender(1)
    expect(entriesOf(again).map((entry) => entry.kind)).toEqual(['persona', 'sysline'])
    const reopened = await openAs(again, A)

    expect('handoff' in reopened.reply).toBe(false)
    expect(entriesOf(again).map((entry) => entry.kind)).toEqual(['persona', 'sysline'])
  })

  it('clears the last persona and the written files when the conversation ends', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Hello')
    writes(a.proc, '/project-1/old.md')
    await openAs(sender, B)

    expect(end(sender, '/project-1')).toEqual({ ok: true })
    expect(entriesOf(sender)).toEqual([])

    const fresh = await openAs(sender, A)
    expect('handoff' in fresh.reply).toBe(false)
    say(fresh.proc, 'msg_2', 'A new conversation')
    const next = await openAs(sender, B)
    expect(next.reply.handoff).toMatchObject({ text: 'handed off · Mary → John' })
  })

  it('lands the sysline while the first persona is mid-turn, and her later words open a new record after it', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Thinking')

    await openAs(sender, B)
    a.proc.frame(delta(' on'))

    expect(entriesOf(sender).map((entry) => [entry.kind, entry.text])).toEqual([
      ['persona', 'Thinking'],
      ['sysline', 'handed off · Mary → John'],
      ['persona', ' on']
    ])
  })

  it('keeps two windows’ last persona and written files apart', async () => {
    const one = new FakeSender(1)
    const two = new FakeSender(2)
    const a1 = await openAs(one, A)
    say(a1.proc, 'msg_1', 'Hello')
    writes(a1.proc, '/project-1/one.md')
    const a2 = await openAs(two, A)
    say(a2.proc, 'msg_2', 'Hello')

    const b2 = await openAs(two, B)

    expect(b2.reply.handoff).toMatchObject({ text: 'handed off · Mary → John' })
    expect(syslines(one)).toEqual([])
  })

  it('never says context or continuity in the text the harness authors', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Hello')
    writes(a.proc, '/project-1/a.md')

    const b = await openAs(sender, B)

    expect((b.reply.handoff as { text: string }).text).not.toMatch(/context|continu/i)
  })

  it('does not record the open itself, or anything else, as a turn', async () => {
    const sender = new FakeSender(1)
    const a = await openAs(sender, A)
    say(a.proc, 'msg_1', 'Hello')
    await openAs(sender, B)

    expect(entriesOf(sender).filter((entry) => entry.kind === 'user')).toEqual([])
  })

  it('takes both names from the install model the install bridge fills when the composition passes no lookup', async () => {
    launch({}, true)
    const sender = new FakeSender(1)
    const projection = {
      snapshot: () => ({
        agents: [
          { id: A, name: 'Mary' },
          { id: B, name: 'John' }
        ]
      })
    } as unknown as InstallProjection
    rememberInstall(sender.id, projection)
    try {
      const a = await openAs(sender, A)
      say(a.proc, 'msg_1', 'Hello')

      const b = await openAs(sender, B)

      expect((b.reply.handoff as { text: string }).text).toBe('handed off · Mary → John')
    } finally {
      forgetInstall(sender.id, projection)
    }
  })
})

describe('permission requests', () => {
  const write = (filePath: string) => ({ toolName: 'Write', input: { file_path: filePath, content: '' } })

  it('are decided per session, against that session’s own project root, the data directory and the home directory', async () => {
    let dataReads = 0
    launch({}, false, {
      userDataDir: () => ((dataReads += 1), '/data'),
      homeDir: '/home/me',
      canonicalize: (path) => posix.normalize(path)
    })
    const one = await opened(new FakeSender(1))
    const two = await opened(new FakeSender(2))
    expect(dataReads).toBe(0)

    expect(one.proc.options.decide(write('/project-1/a.md'))).toEqual({
      behavior: 'allow',
      updatedInput: { file_path: '/project-1/a.md', content: '' }
    })
    expect(one.proc.options.decide(write('notes/a.md')).behavior).toBe('allow')
    expect(one.proc.options.decide(write('/data/logs/a.log')).behavior).toBe('allow')
    expect(one.proc.options.decide(write('/project-2/a.md'))).toEqual({
      behavior: 'deny',
      message: 'blocked: /project-2/a.md is outside the project'
    })
    expect(one.proc.options.decide(write('~/a.md')).behavior).toBe('deny')
    expect(two.proc.options.decide(write('/project-2/a.md')).behavior).toBe('allow')
    expect(two.proc.options.decide(write('/project-1/a.md')).behavior).toBe('deny')
    // The data directory is read when a request arrives, not when the bridge starts.
    expect(dataReads).toBeGreaterThan(0)
  })

  it('read the real userData and home directory when the composition passes neither', async () => {
    const project = join(homedir(), 'harness-session-bridge-no-such-project')
    projectOf = () => project
    launch()
    const { proc } = await opened(new FakeSender(1))

    expect(proc.options.decide(write(join(userData, 'logs', 'a.log'))).behavior).toBe('allow')
    expect(proc.options.decide(write('~/harness-session-bridge-no-such-project/a.md')).behavior).toBe('allow')
    expect(proc.options.decide(write('~/elsewhere.md'))).toEqual({
      behavior: 'deny',
      message: 'blocked: ~/elsewhere.md is outside the project'
    })
  })

  it('use the real canonicaliser when the composition passes none', async () => {
    launch({}, false, { userDataDir: () => '/data' })
    const { proc } = await opened(new FakeSender(1))

    expect(proc.options.decide(write('/project-1/new/a.md')).behavior).toBe('allow')
    expect(proc.options.decide(write('/project-1/../a.md')).behavior).toBe('deny')
  })
})

describe('the room (Story 4.1)', () => {
  const FIVE = {
    'bmad-agent-analyst': 'Mary',
    'bmad-agent-pm': 'John',
    'bmad-agent-architect': 'Winston',
    'bmad-agent-ux-designer': 'Sally',
    'bmad-agent-dev': 'Amelia'
  }
  const ROOM_SYSLINE = 'room opened by you · present · Mary · John · Winston · Sally · Amelia'
  const get = (sender: FakeSender): ConversationReply =>
    (handlers.get(CONVERSATION_GET_CHANNEL) as unknown as (e: { sender: FakeSender }) => ConversationReply)({ sender })
  const dispatch = (sender: FakeSender, sessionId: unknown, code: unknown) =>
    (handlers.get('menu:dispatch') as unknown as (e: { sender: FakeSender }, id: unknown, code: unknown) => Promise<unknown>)(
      { sender },
      sessionId,
      code
    )
  const said = (sender: FakeSender) =>
    sender.events.flatMap((event) => (event.name === 'harness:said' ? [event.payload] : []))
  async function openRoom(sender: FakeSender, cast: unknown) {
    const pending = open(sender, { room: cast })
    await processes[processes.length - 1]?.up()
    return { reply: (await pending) as { ok: true; sessionId: string }, proc: processes[processes.length - 1] }
  }

  beforeEach(() => {
    names = { ...FIVE }
  })

  it('opens an agentless session activated with the party skill alone when the cast is the whole roster, and says who is present once', async () => {
    const sender = new FakeSender(1)
    const { reply, proc } = await openRoom(sender, Object.keys(FIVE))

    expect(reply).toEqual({ ok: true, sessionId: 's1' })
    expect(processes).toHaveLength(1)
    expect(proc.options.cwd).toBe('/project-1')
    expect(proc.options.agentId).toBeUndefined()
    expect(proc.writes).toEqual(['/bmad-party-mode'])
    expect(sender.sent).toEqual([
      [SESSION_EVENT_CHANNEL, { name: 'session:opened', payload: { sessionId: 's1', at: 1001 } }],
      [
        SESSION_EVENT_CHANNEL,
        { name: 'harness:said', payload: { sessionId: 's1', id: 'm-0', text: ROOM_SYSLINE, at: 1003, room: true } }
      ]
    ])
    expect(registry.forProject('/project-1').entries()).toEqual([
      { kind: 'sysline', id: 'm-0', at: 1003, text: ROOM_SYSLINE, room: true }
    ])
  })

  it('names a subset after the skill, in the order given and each once, and says those names', async () => {
    const sender = new FakeSender(1)
    const { proc } = await openRoom(sender, ['bmad-agent-analyst', 'bmad-agent-pm', 'bmad-agent-analyst'])

    expect(proc.writes).toEqual(['/bmad-party-mode Mary (bmad-agent-analyst), John (bmad-agent-pm)'])
    expect(said(sender).map((line) => line.text)).toEqual(['room opened by you · present · Mary · John'])
  })

  it('says the id where the roster’s name is empty', async () => {
    names['bmad-agent-pm'] = ''
    const sender = new FakeSender(1)
    const { proc } = await openRoom(sender, ['bmad-agent-pm', 'bmad-agent-dev'])

    expect(proc.writes).toEqual(['/bmad-party-mode bmad-agent-pm (bmad-agent-pm), Amelia (bmad-agent-dev)'])
    expect(said(sender).map((line) => line.text)).toEqual(['room opened by you · present · bmad-agent-pm · Amelia'])
  })

  it('returns the live room and spawns and says nothing when it is opened again, however the casts differ', async () => {
    const sender = new FakeSender(1)
    const { reply } = await openRoom(sender, Object.keys(FIVE))

    await expect(open(sender, { room: ['bmad-agent-pm'] })).resolves.toEqual(reply)
    expect(processes).toHaveLength(1)
    expect(said(sender)).toHaveLength(1)
  })

  it('shares one spawn and one sysline between two opens that overlap', async () => {
    const sender = new FakeSender(1)
    const first = open(sender, { room: Object.keys(FIVE) })
    const second = open(sender, { room: Object.keys(FIVE) })
    await processes[0].up()

    await expect(first).resolves.toEqual({ ok: true, sessionId: 's1' })
    await expect(second).resolves.toEqual({ ok: true, sessionId: 's1' })
    expect(processes).toHaveLength(1)
    expect(said(sender)).toHaveLength(1)
  })

  it('keeps a persona’s session and the room apart, in the same window', async () => {
    const sender = new FakeSender(1)
    const persona = await opened(sender, 'bmad-agent-pm')
    const { reply } = await openRoom(sender, Object.keys(FIVE))

    expect(reply.sessionId).not.toBe(persona.reply.sessionId)
    expect(processes).toHaveLength(2)
    // The room has no persona state, and the persona's own session is as it was.
    expect(sender.events.filter((event) => event.name === 'persona:state')).toHaveLength(1)
  })

  it.each([[[]], [['../x']], [['bmad-agent-nobody']], [['bmad-agent-pm', 7]], ['bmad-agent-pm'], [undefined], [{}]])(
    'refuses the cast %j as session/invalid-cast and spawns nothing',
    async (cast) => {
      const sender = new FakeSender(1)
      const reply = await open(sender, { room: cast })

      expect(reply).toEqual({
        ok: false,
        error: { code: 'session/invalid-cast', message: 'session · not a valid cast for a room' }
      })
      expect(processes).toHaveLength(0)
      expect(sender.events).toEqual([])
    }
  )

  it('refuses a cast for a live room too, rather than answering for one nobody asked for', async () => {
    const sender = new FakeSender(1)
    await openRoom(sender, Object.keys(FIVE))

    await expect(open(sender, { room: [] })).resolves.toMatchObject({ ok: false, error: { code: 'session/invalid-cast' } })
  })

  it('still reads an object with no room as an invalid agent', async () => {
    await expect(open(new FakeSender(1), {})).resolves.toMatchObject({ ok: false, error: { code: 'session/invalid-agent' } })
  })

  it('fails as a persona does when the process cannot start, says nothing, and starts afresh next time', async () => {
    const sender = new FakeSender(1)
    const failing = open(sender, { room: Object.keys(FIVE) })
    processes[0].fail('ENOENT')

    await expect(failing).resolves.toEqual({
      ok: false,
      error: { code: 'session/spawn-failed', message: 'session · could not start the session', detail: 'ENOENT' }
    })
    expect(sender.events).toEqual([])
    expect(registry.forProject('/project-1').entries()).toEqual([])

    const { reply } = await openRoom(sender, Object.keys(FIVE))
    expect(reply.ok).toBe(true)
    expect(processes).toHaveLength(2)
  })

  it('is not in the conversation snapshot, which lists persona sessions only', async () => {
    const sender = new FakeSender(1)
    await openRoom(sender, Object.keys(FIVE))
    await opened(sender, 'bmad-agent-pm')

    expect(get(sender)).toMatchObject({
      ok: true,
      snapshot: { sessions: [{ agentId: 'bmad-agent-pm', sessionId: 's2' }], personas: [{ agentId: 'bmad-agent-pm' }] }
    })
    const snapshot = get(sender)
    expect(snapshot.ok && snapshot.snapshot.entries).toEqual([
      { kind: 'sysline', id: 'm-0', at: expect.any(Number), text: ROOM_SYSLINE, room: true }
    ])
    // A window that reloads finds the chooser: the snapshot omits the room, and opening again finds it.
    const reopened = get(new FakeSender(2))
    expect(reopened).toMatchObject({ ok: true, snapshot: { sessions: [] } })
  })

  it('refuses a menu dispatch for it as session/not-found and never throws on the missing agent', async () => {
    const sender = new FakeSender(1)
    const { reply } = await openRoom(sender, Object.keys(FIVE))
    processes[0].frame(result())

    await expect(dispatch(sender, reply.sessionId, 'CP')).resolves.toMatchObject({
      ok: false,
      error: { code: 'session/not-found' }
    })
  })

  it('closes like any session: session:closed once, without an agent, and a room opens again afterwards', async () => {
    const sender = new FakeSender(1)
    const { reply, proc } = await openRoom(sender, Object.keys(FIVE))

    expect(closeSession(sender, reply.sessionId)).toEqual({ ok: true })
    expect(proc.killed).toBe(true)
    proc.exit()
    const closed = sender.events.filter((event) => event.name === 'session:closed')
    expect(closed).toEqual([{ name: 'session:closed', payload: { sessionId: 's1', reason: 'closed', at: expect.any(Number) } }])

    const again = await openRoom(sender, Object.keys(FIVE))
    expect(again.reply.sessionId).toBe('s2')
    expect(said(sender)).toHaveLength(2)
  })

  it('closes when its process exits, in the room’s own register and not in a persona’s thread', async () => {
    const sender = new FakeSender(1)
    const { proc } = await openRoom(sender, Object.keys(FIVE))
    proc.exit()

    expect(sender.events.filter((event) => event.name === 'session:closed')).toHaveLength(1)
    expect(said(sender).map(({ text, room }) => [text, room])).toEqual([
      [ROOM_SYSLINE, true],
      ['session ended · the process exited', true]
    ])
  })

  it('closes with the conversation and with the window', async () => {
    const sender = new FakeSender(1)
    const { proc } = await openRoom(sender, Object.keys(FIVE))
    ;(handlers.get(CONVERSATION_END_CHANNEL) as unknown as (e: { sender: FakeSender }, id: unknown) => unknown)(
      { sender },
      '/project-1'
    )

    expect(proc.killed).toBe(true)
    expect(sender.events.filter((event) => event.name === 'session:closed')).toHaveLength(1)

    const other = new FakeSender(2)
    const second = await openRoom(other, Object.keys(FIVE))
    other.destroy()
    expect(second.proc.killed).toBe(true)
  })

  it('marks the files its chat turns write as the room’s on the rail, and raises no document event', async () => {
    const sender = new FakeSender(1)
    const told: string[] = []
    railAnnotatorFor(sender).bind({ annotate: () => undefined, markRoom: (path) => void told.push(path), unmarkRoom: () => undefined, clearRoom: () => undefined })
    const { proc } = await openRoom(sender, Object.keys(FIVE))
    const before = sender.events.length
    const json = JSON.stringify({ file_path: '/project-1/_bmad/party/note.md', content: 'body' })
    proc.frame({
      type: 'stream_event',
      parent_tool_use_id: null,
      event: { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 't2', name: 'Write', input: {} } }
    })
    for (let at = 0; at < json.length; at += 9) {
      proc.frame({
        type: 'stream_event',
        parent_tool_use_id: null,
        event: { type: 'content_block_delta', index: 2, delta: { type: 'input_json_delta', partial_json: json.slice(at, at + 9) } }
      })
    }
    proc.frame({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_stop', index: 2 } })

    expect(told).toEqual(['_bmad/party/note.md'])
    expect(sender.events.slice(before)).toEqual([])
  })

  /** One main-thread Write of `path`, streamed in pieces, as the CLI would. */
  function writeFile(proc: FakeProcess, path: string, index = 2): void {
    const json = JSON.stringify({ file_path: path, content: 'body' })
    const frame = (event: unknown) => proc.frame({ type: 'stream_event', parent_tool_use_id: null, event })
    frame({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: `t${index}`, name: 'Write', input: {} } })
    for (let at = 0; at < json.length; at += 9) {
      frame({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json.slice(at, at + 9) } })
    }
    frame({ type: 'content_block_stop', index })
  }

  it('gives a file back when a persona session writes what the room wrote, and the room’s own rewrite takes it again', async () => {
    const sender = new FakeSender(1)
    const marks: string[] = []
    railAnnotatorFor(sender).bind({
      annotate: () => undefined,
      markRoom: (path) => void marks.push(`mark ${path}`),
      unmarkRoom: (path) => void marks.push(`unmark ${path}`),
      clearRoom: () => void marks.push('clear')
    })
    const room = await openRoom(sender, Object.keys(FIVE))
    const persona = await opened(sender, 'bmad-agent-pm')

    writeFile(room.proc, '/project-1/_bmad/party/note.md')
    writeFile(persona.proc, '/project-1/_bmad/party/note.md')
    writeFile(persona.proc, '/project-1/_bmad/party/other.md', 3)
    writeFile(room.proc, '/project-1/_bmad/party/note.md', 4)

    expect(marks).toEqual(['mark _bmad/party/note.md', 'unmark _bmad/party/note.md', 'mark _bmad/party/note.md'])
  })

  it('clears every room mark when the conversation ends', async () => {
    const sender = new FakeSender(1)
    const marks: string[] = []
    railAnnotatorFor(sender).bind({
      annotate: () => undefined,
      markRoom: (path) => void marks.push(`mark ${path}`),
      unmarkRoom: () => undefined,
      clearRoom: () => void marks.push('clear')
    })
    const { proc } = await openRoom(sender, Object.keys(FIVE))
    writeFile(proc, '/project-1/_bmad/party/note.md')

    ;(handlers.get(CONVERSATION_END_CHANNEL) as unknown as (e: { sender: FakeSender }, id: unknown) => unknown)(
      { sender },
      '/project-1'
    )

    expect(marks).toEqual(['mark _bmad/party/note.md', 'clear'])
  })

  it('leaves a busy room out of the snapshot’s busy set, as it leaves it out of the sessions', async () => {
    const sender = new FakeSender(1)
    await openRoom(sender, Object.keys(FIVE))
    // The room's activation turn is in flight; a persona's is too.
    const snapshotOf = (): { sessions: unknown[]; busy: string[] } => {
      const reply = get(sender)
      if (!reply.ok) throw new Error('no snapshot')
      return reply.snapshot
    }
    expect(snapshotOf().busy).toEqual([])

    const persona = await opened(sender, 'bmad-agent-pm')

    expect(snapshotOf()).toMatchObject({ sessions: [{ sessionId: persona.reply.sessionId }], busy: [persona.reply.sessionId] })
  })
})
