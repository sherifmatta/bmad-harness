import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContractEvent } from '../shared/events'
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

const { SESSION_EVENT_CHANNEL, SESSION_OPEN_CHANNEL, TURN_SEND_CHANNEL, registerSessionBridge } =
  await import('./session-bridge')

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

beforeEach(() => {
  handlers.clear()
  processes = []
  clock = 1_000
  ids = 0
  projectOf = (id) => (id < 100 ? `/project-${id}` : undefined)
  registerSessionBridge({
    projectPathFor: (id) => projectOf(id),
    now: () => (clock += 1),
    newSessionId: () => `s${(ids += 1)}`,
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
      })
  })
})

const open = (sender: FakeSender, agentId: unknown) =>
  (handlers.get(SESSION_OPEN_CHANNEL) as unknown as OpenHandler)({ sender }, agentId)
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
  it('are the three literals the preload shares', () => {
    expect([SESSION_OPEN_CHANNEL, TURN_SEND_CHANNEL, SESSION_EVENT_CHANNEL]).toEqual([
      'session:open',
      'turn:send',
      'session:event'
    ])
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
      ]
    ])
  })

  it('returns the same session and spawns nothing when the agent is already live', async () => {
    const { sender, reply } = await opened()

    await expect(open(sender, 'bmad-agent-analyst')).resolves.toEqual(reply)
    expect(processes).toHaveLength(1)
    expect(sender.names).toEqual(['session:opened'])
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
    expect(one.names).toEqual(['session:opened', 'session:opened'])
    expect(two.names).toEqual(['session:opened'])
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

    expect(sender.names).toEqual(['session:opened'])
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

    expect(sender.names).toEqual(['session:opened'])
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

    expect(sender.names).toEqual(['session:opened', 'session:closed'])
    expect(sender.names).not.toContain('session:awaiting-turn')
    expect(send(sender, reply.sessionId, 'hi')).toMatchObject({ error: { code: 'session/not-found' } })
  })

  it('does not end the turn on a subagent’s result', async () => {
    const { sender, reply, proc } = await opened()
    proc.frame({ type: 'result', parent_tool_use_id: 'toolu_1' })

    expect(sender.names).toEqual(['session:opened'])
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

describe('close', () => {
  it('pushes session:closed (process-exited) once, last, and lets the agent open afresh', async () => {
    const { sender, proc } = await opened()
    proc.frame(messageStart('m'))
    proc.frame(textStart)
    proc.frame(delta('bye'))
    proc.exit()
    proc.exit()
    proc.frame(delta('after'))

    expect(sender.names).toEqual(['session:opened', 'persona:said', 'session:closed'])
    expect(sender.events[2].payload).toMatchObject({
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
