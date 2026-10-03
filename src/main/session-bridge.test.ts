import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionBridgeDeps } from './session-bridge'
import type { ConversationReply } from '../shared/conversation'
import type { ContractEvent } from '../shared/events'
import { forgetInstall, rememberInstall } from './install-model'
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
  BrowserWindow: { fromWebContents: () => null }
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
              return true
            },
            kill: () => void (fake.killed = true)
          },
          up: async () => {
            // The real source writes the activation turn as it resolves.
            writes.push(`/${options.agentId}`)
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

    await expect(send(sender, reply.sessionId, 'hi')).toMatchObject({
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
    await expect(send(sender, reply.sessionId, 'hi')).toEqual({ ok: true })
    expect(proc.writes).toEqual(['/bmad-agent-analyst', 'hi'])
  })

  it('puts the turn back in flight with each send', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())
    expect(send(sender, reply.sessionId, 'one')).toEqual({ ok: true })

    expect(send(sender, reply.sessionId, 'two')).toMatchObject({ error: { code: 'session/busy' } })
    expect(proc.writes).toEqual(['/bmad-agent-analyst', 'one'])

    proc.frame(result())
    expect(send(sender, reply.sessionId, 'two')).toEqual({ ok: true })
    expect(proc.writes).toEqual(['/bmad-agent-analyst', 'one', 'two'])
  })

  it('does not take the exit code for the signal', async () => {
    const { sender, reply, proc } = await opened()
    proc.exit()

    expect(sender.names).toEqual(['session:opened', 'persona:state', 'session:closed', 'persona:state'])
    expect(sender.names).not.toContain('session:awaiting-turn')
    expect(send(sender, reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/not-found' } })
  })

  it('does not end the turn on a subagent’s result', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame({ type: 'result', parent_tool_use_id: 'toolu_1' })

    expect(sender.names).toEqual(['session:opened', 'persona:state'])
    expect(send(sender, reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/busy' } })
  })

  it.each([['nope'], [undefined], [3]])('answers an unknown session id %j as session/not-found', async (id) => {
    const { sender } = await opened()

    expect(send(sender, id, 'hi')).toMatchObject({ ok: false, error: { code: 'session/not-found' } })
  })

  it('answers a window with no sessions as session/not-found', () => {
    expect(send(new FakeSender(9), 's1', 'hi')).toMatchObject({ error: { code: 'session/not-found' } })
  })

  it('does not let one window send into another’s session', async () => {
    const { reply, proc } = await opened(new FakeSender(1))
    proc.frame(result())

    expect(send(new FakeSender(2), reply.sessionId, 'hi')).toMatchObject({
      error: { code: 'session/not-found' }
    })
  })

  it('refuses a send while the process is still starting', async () => {
    const sender = new FakeSender(1)
    const pending = open(sender, 'bmad-agent-pm')

    expect(send(sender, 's1', 'hi')).toMatchObject({ error: { code: 'session/busy' } })
    await processes[0].up()
    await pending
  })

  it('refuses a turn that is not text', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())

    expect(send(sender, reply.sessionId, { x: 1 })).toMatchObject({
      error: { code: 'session/invalid-turn' }
    })
    expect(proc.writes).toEqual(['/bmad-agent-analyst'])
  })

  it('frees the turn again when the write itself fails', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())
    let fail = true
    proc.session.write = (text) => {
      if (fail) return false
      proc.writes.push(text)
      return true
    }

    expect(send(sender, reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/write-failed' } })
    fail = false
    expect(send(sender, reply.sessionId, 'hi')).toEqual({ ok: true })
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
    expect(send(sender, reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/busy' } })
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
    expect(send(sender, reply.sessionId, 'hi')).toEqual({ ok: true })
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
    expect(send(sender, reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/busy' } })

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
      'session:closed',
      'persona:state'
    ])
    expect(sender.events[3].payload).toMatchObject({
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
    expect(send(sender, second.reply.sessionId, 'still here')).toEqual({ ok: true })
    // The closed one is gone, and a late frame from it says nothing.
    const before = sender.sent.length
    first.proc.frame(delta('late'))
    expect(sender.sent).toHaveLength(before)
    expect(send(sender, first.reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/not-found' } })
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
    send(sender, reply.sessionId, 'hi')
    send(sender, reply.sessionId, 'again')

    expect(states(sender).map((payload) => payload.state)).toEqual(['work', 'idle', 'work'])
  })

  it('says nothing for a send whose write failed', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame(result())
    proc.session.write = () => false
    send(sender, reply.sessionId, 'hi')

    expect(states(sender).map((payload) => payload.state)).toEqual(['work', 'idle'])
  })

  it('stays work through a quiet phase with no frames', async () => {
    const { sender, proc } = await opened()
    proc.frame({ type: 'system', subtype: 'task_progress' })

    expect(states(sender).map((payload) => payload.state)).toEqual(['work'])
  })

  it('is idle again when the session closes mid-turn', async () => {
    const { sender, proc } = await opened()
    proc.exit()

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
      personas: []
    })
  })

  it('reload mid-turn: holds the partial message, the busy session and work with its time; later words join it; awaiting-turn clears busy', async () => {
    const { sender, proc } = await opened()
    for (const frame of [messageStart('msg_1'), textStart, delta('Hel')]) proc.frame(frame)

    expect(snapshotOf(sender)).toEqual({
      entries: [{ kind: 'persona', id: 'm-0', at: expect.any(Number), agentId: A, messageId: 'msg_1', text: 'Hel' }],
      sessions: [{ agentId: A, sessionId: 's1' }],
      busy: ['s1'],
      personas: [{ agentId: A, state: 'work', at: 1001 }]
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
    send(sender, reply.sessionId, 'thanks')
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
    send(sender, reply.sessionId, 'too early')
    expect(snapshotOf(sender).entries).toEqual([])

    proc.frame(result())
    send(sender, reply.sessionId, 'hello')
    send(sender, reply.sessionId, 'again')
    proc.session.write = () => false
    proc.frame(result())
    send(sender, reply.sessionId, 'unwritten')

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
    send(sender, reply.sessionId, 'thanks')
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
    expect(send(sender, reply.sessionId, 'carry on')).toEqual({ ok: true })
    expect(timers).toHaveLength(1)
    timers.forEach((timer) => timer())
    expect(logs).toHaveLength(1)
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
      snapshot: { entries: [{ text: 'Hi' }], sessions: [], busy: [] }
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
      snapshot: { entries: [{ text: 'Bye' }], sessions: [], busy: [], personas: [] }
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
    send(sender, reply.sessionId, 'thanks')
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
      snapshot: { entries: [], sessions: [], busy: [], personas: [] }
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
      snapshot: { entries: [], sessions: [], busy: [], personas: [] }
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
      send(sender, reply.sessionId, 'thanks')
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
