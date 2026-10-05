import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  SESSION_ARGS,
  SESSION_COMMAND,
  activationTurn,
  createLineSplitter,
  interruptLine,
  isAgentId,
  spawnSession,
  userTurnLine
} from './session-process'
import type { PermissionAnswer, PermissionAsk, SessionChild, SessionSpawn } from './session-process'

class FakeChild extends EventEmitter {
  pid: number | undefined = 4242
  writes: string[] = []
  stdout = new EventEmitter()
  stdin: {
    write: (data: string, callback?: (error?: Error | null) => void) => boolean
    on: (event: 'error', listener: () => void) => void
    destroyed?: boolean
    writable?: boolean
  } = {
    write: (data: string, callback) => {
      this.writes.push(data)
      if (this.failWrites) throw new Error('write after end')
      this.writeCallbacks.push(callback)
      // A stream says a write went once it has flushed it; a test that wants it to fail holds it.
      if (!this.holdCallbacks) callback?.(null)
      return true
    },
    on: (_event, listener) => void this.stdinErrors.push(listener)
  }
  failWrites = false
  holdCallbacks = false
  writeCallbacks: (((error?: Error | null) => void) | undefined)[] = []
  stdinErrors: (() => void)[] = []
  spawn(): void {
    this.emit('spawn')
  }
  out(chunk: string | Buffer): void {
    this.stdout.emit('data', chunk)
  }
}

function harness(decide: (ask: PermissionAsk) => PermissionAnswer = (ask) => ({
  behavior: 'allow',
  updatedInput: ask.input as Record<string, unknown>
})) {
  const child = new FakeChild()
  const calls: { command: string; args: readonly string[]; cwd: string }[] = []
  const spawn: SessionSpawn = (command, args, { cwd }) => {
    calls.push({ command, args, cwd })
    return child as unknown as SessionChild
  }
  const frames: unknown[] = []
  const killed: (number | undefined)[] = []
  const exits = vi.fn()
  const start = (agentId = 'bmad-agent-analyst') =>
    spawnSession({
      agentId,
      cwd: '/work/project',
      spawn,
      killGroup: (pid) => void killed.push(pid),
      onFrame: (frame) => void frames.push(frame),
      onExit: exits,
      decide
    })
  return { child, calls, frames, killed, exits, start }
}

describe('SESSION_ARGS', () => {
  it('is exactly the session command', () => {
    expect(SESSION_COMMAND).toBe('claude')
    expect(SESSION_ARGS.join(' ')).toBe(
      '-p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local --permission-prompt-tool stdio'
    )
  })
})

describe('isAgentId', () => {
  it.each(['bmad-agent-analyst', 'a', 'A_b-1', '9lives'])('accepts %s', (id) => {
    expect(isAgentId(id)).toBe(true)
  })
  it.each(['', '../x', 'a b', '-a', '_a', 'a/b', 'a\n', 'é', 5, null, undefined])('refuses %s', (id) => {
    expect(isAgentId(id)).toBe(false)
  })
})

describe('userTurnLine', () => {
  it('is one JSON line holding the text as a text block', () => {
    const line = userTurnLine('hi\nthere')

    expect(line.endsWith('\n')).toBe(true)
    expect(line.slice(0, -1)).not.toContain('\n')
    expect(JSON.parse(line)).toEqual({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: 'hi\nthere' }] }
    })
  })

  it('names the agent’s own skill and nothing else for activation', () => {
    expect(activationTurn('bmad-agent-pm')).toBe('/bmad-agent-pm')
  })
})

describe('createLineSplitter', () => {
  function collect() {
    const lines: string[] = []
    return { lines, splitter: createLineSplitter((line) => void lines.push(line)) }
  }

  it('emits each whole line once and holds a partial until its newline', () => {
    const { lines, splitter } = collect()
    splitter.push('{"a":')
    expect(lines).toEqual([])
    splitter.push('1}\n{"b":2}\n{"c"')
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
    splitter.push(':3}\n')
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}'])
  })

  it('reads a character cut across two buffers whole', () => {
    const { lines, splitter } = collect()
    const bytes = Buffer.from('é\n', 'utf8')
    splitter.push(bytes.subarray(0, 1))
    splitter.push(bytes.subarray(1))
    expect(lines).toEqual(['é'])
  })
})

describe('spawnSession', () => {
  it('spawns claude with the exact argv in the project root, and writes /<agentId> first', async () => {
    const { child, calls, start } = harness()
    const pending = start()
    expect(child.writes).toEqual([])
    child.spawn()
    const outcome = await pending

    expect(outcome.ok).toBe(true)
    expect(calls).toEqual([{ command: 'claude', args: SESSION_ARGS, cwd: '/work/project' }])
    expect(child.writes).toHaveLength(1)
    expect(JSON.parse(child.writes[0])).toEqual({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: '/bmad-agent-analyst' }] }
    })
  })

  it('never passes the activation as an argument', async () => {
    const { child, calls, start } = harness()
    const pending = start()
    child.spawn()
    await pending

    expect(calls[0].args.join(' ')).not.toContain('bmad-agent-analyst')
  })

  it('reports a missing claude as its errno and nothing else, with no session', async () => {
    const { child, exits, start } = harness()
    const pending = start()
    child.emit('error', Object.assign(new Error('spawn claude ENOENT /usr/bin/secret'), { code: 'ENOENT' }))
    child.emit('close')

    const outcome = await pending
    expect(outcome).toEqual({ ok: false, errno: 'ENOENT' })
    expect(exits).not.toHaveBeenCalled()
  })

  it('reports a synchronous throw as a failure', async () => {
    const outcome = await spawnSession({
      agentId: 'a',
      cwd: '/x',
      spawn: () => {
        throw Object.assign(new Error('boom'), { code: 'EACCES' })
      },
      onFrame: () => {},
      onExit: () => {},
      decide: () => ({ behavior: 'deny', message: 'x' })
    })
    expect(outcome).toEqual({ ok: false, errno: 'EACCES' })
  })

  it('parses each whole stdout line once, across chunks, and drops junk', async () => {
    const { child, frames, start } = harness()
    const pending = start()
    child.spawn()
    await pending

    child.out('{"type":"a"}\n{"type":')
    child.out('"b"}\nnot json at all\n\n')
    child.out(Buffer.from('{"type":"c"}\n'))

    expect(frames).toEqual([{ type: 'a' }, { type: 'b' }, { type: 'c' }])
  })

  it('writes later turns as user lines and refuses once the process has exited', async () => {
    const { child, exits, start } = harness()
    const pending = start()
    child.spawn()
    const outcome = await pending
    if (!outcome.ok) throw new Error('expected a session')

    await expect(outcome.session.write('hello')).resolves.toBe(true)
    expect(JSON.parse(child.writes[1]).message.content[0].text).toBe('hello')

    child.emit('close')
    child.emit('close')
    expect(exits).toHaveBeenCalledTimes(1)
    await expect(outcome.session.write('too late')).resolves.toBe(false)
    expect(child.writes).toHaveLength(2)
  })

  it('reports a write that throws as false', async () => {
    const { child, start } = harness()
    const pending = start()
    child.spawn()
    const outcome = await pending
    if (!outcome.ok) throw new Error('expected a session')

    child.failWrites = true
    await expect(outcome.session.write('x')).resolves.toBe(false)
  })

  describe('a pipe that has died', () => {
    async function session() {
      const { child, start } = harness()
      const pending = start()
      child.spawn()
      const outcome = await pending
      if (!outcome.ok) throw new Error('expected a session')
      return { child, session: outcome.session }
    }

    it('resolves false for the very first write when its own callback reports the error, and refuses the next', async () => {
      const { child, session: live } = await session()
      child.holdCallbacks = true

      const first = live.write('one')
      child.writeCallbacks.at(-1)?.(Object.assign(new Error('EPIPE'), { code: 'EPIPE' }))

      await expect(first).resolves.toBe(false)
      await expect(live.write('two')).resolves.toBe(false)
      expect(child.writes).toHaveLength(2)
    })

    it('resolves false for a write waiting on the stream when stdin raises, and refuses the next', async () => {
      const { child, session: live } = await session()
      child.holdCallbacks = true

      const first = live.write('one')
      child.stdinErrors.forEach((listener) => listener())

      await expect(first).resolves.toBe(false)
      await expect(live.write('two')).resolves.toBe(false)
      expect(child.writes).toHaveLength(2)
    })

    it('resolves false for a write waiting on the stream when the process closes', async () => {
      const { child, session: live } = await session()
      child.holdCallbacks = true

      const first = live.write('one')
      child.emit('close')

      await expect(first).resolves.toBe(false)
    })

    it('resolves true only once the stream has said the write went', async () => {
      const { child, session: live } = await session()
      child.holdCallbacks = true
      let settled = false
      const write = live.write('one').then((written) => ((settled = true), written))
      await Promise.resolve()
      expect(settled).toBe(false)

      child.writeCallbacks.at(-1)?.(null)

      await expect(write).resolves.toBe(true)
    })

    it('refuses a write to a stream that is destroyed or no longer writable', async () => {
      const destroyed = await session()
      destroyed.child.stdin.destroyed = true
      await expect(destroyed.session.write('x')).resolves.toBe(false)
      expect(destroyed.child.writes).toHaveLength(1)

      const closed = await session()
      closed.child.stdin.writable = false
      await expect(closed.session.write('x')).resolves.toBe(false)
    })

    it('stays silent about the failure itself: no error reaches a listener of the session’s own', async () => {
      const { child, session: live } = await session()

      expect(() => child.stdinErrors.forEach((listener) => listener())).not.toThrow()
      await expect(live.write('x')).resolves.toBe(false)
    })
  })

  describe('a permission request from the CLI', () => {
    async function live(decide?: (ask: PermissionAsk) => PermissionAnswer) {
      const parts = harness(decide)
      const pending = parts.start()
      parts.child.spawn()
      const outcome = await pending
      if (!outcome.ok) throw new Error('expected a session')
      return { ...parts, session: outcome.session, answers: () => parts.child.writes.slice(1).map((line) => JSON.parse(line)) }
    }

    const ask = (requestId: unknown, toolName: unknown, input: unknown) =>
      `${JSON.stringify({ type: 'control_request', request_id: requestId, request: { subtype: 'can_use_tool', tool_name: toolName, input } })}\n`

    it('is answered once, by its request_id, with what `decide` said, and never reaches onFrame', async () => {
      const decide = vi.fn((request: PermissionAsk): PermissionAnswer => ({
        behavior: 'allow',
        updatedInput: request.input as Record<string, unknown>
      }))
      const { child, frames, answers } = await live(decide)

      child.out(ask('req-1', 'Write', { file_path: 'notes/a.md', content: 'a' }))

      expect(decide).toHaveBeenCalledWith({ toolName: 'Write', input: { file_path: 'notes/a.md', content: 'a' } })
      expect(answers()).toEqual([
        {
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: 'req-1',
            response: { behavior: 'allow', updatedInput: { file_path: 'notes/a.md', content: 'a' } }
          }
        }
      ])
      expect(frames).toEqual([])
    })

    it('writes a deny as the CLI reads it: behavior and message', async () => {
      const { child, answers } = await live(() => ({ behavior: 'deny', message: 'blocked: /etc is outside the project' }))

      child.out(ask('req-2', 'Read', { file_path: '/etc/hosts' }))

      expect(answers()).toEqual([
        {
          type: 'control_response',
          response: {
            subtype: 'success',
            request_id: 'req-2',
            response: { behavior: 'deny', message: 'blocked: /etc is outside the project' }
          }
        }
      ])
    })

    it('answers two requests that arrive before either is answered, each by its own id', async () => {
      const { child, answers } = await live((request) =>
        request.toolName === 'Write'
          ? { behavior: 'allow', updatedInput: {} }
          : { behavior: 'deny', message: 'no' }
      )

      child.out(ask('a', 'Write', {}) + ask('b', 'Bash', {}))

      expect(answers().map((line) => [line.response.request_id, line.response.response.behavior])).toEqual([
        ['a', 'allow'],
        ['b', 'deny']
      ])
    })

    it('turns a `decide` that throws into a deny, still answered', async () => {
      const { child, answers } = await live(() => {
        throw new Error('boom /secret/path')
      })

      child.out(ask('req-3', 'Write', {}))

      const [answer] = answers()
      expect(answer.response.request_id).toBe('req-3')
      expect(answer.response.response.behavior).toBe('deny')
      expect(answer.response.response.message).not.toContain('/secret/path')
    })

    it('hands a malformed request to `decide` unread, so the policy denies it, and answers it', async () => {
      const decide = vi.fn((): PermissionAnswer => ({ behavior: 'deny', message: 'unrecognised permission request' }))
      const { child, answers } = await live(decide)

      child.out(`${JSON.stringify({ type: 'control_request', request_id: 'm', request: { subtype: 'can_use_tool' } })}\n`)

      expect(decide).toHaveBeenCalledWith({ toolName: undefined, input: undefined })
      expect(answers()).toHaveLength(1)
      expect(answers()[0].response).toMatchObject({ request_id: 'm', response: { behavior: 'deny' } })
    })

    it('answers another subtype, or a request with no body, with an error for its id, and asks `decide` nothing', async () => {
      const decide = vi.fn()
      const { child, frames, answers } = await live(decide)

      child.out(`${JSON.stringify({ type: 'control_request', request_id: 'x', request: { subtype: 'mcp_message' } })}\n`)
      child.out(`${JSON.stringify({ type: 'control_request', request_id: 'y', request: 'garbage' })}\n`)

      expect(decide).not.toHaveBeenCalled()
      expect(answers().map((line) => line.response)).toEqual([
        { subtype: 'error', request_id: 'x', error: 'unsupported control request' },
        { subtype: 'error', request_id: 'y', error: 'unsupported control request' }
      ])
      expect(frames).toEqual([])
    })

    it('ignores a cancel and a control response, and hands neither to onFrame', async () => {
      const decide = vi.fn()
      const { child, frames, answers } = await live(decide)

      child.out(`${JSON.stringify({ type: 'control_cancel_request', request_id: 'req-1' })}\n`)
      child.out(`${JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: 'z' } })}\n`)

      expect(answers()).toEqual([])
      expect(frames).toEqual([])
      expect(decide).not.toHaveBeenCalled()
    })

    it('cannot answer a request with no id: nothing is written and nothing reaches onFrame', async () => {
      const { child, frames, answers } = await live()

      child.out(`${JSON.stringify({ type: 'control_request', request: { subtype: 'can_use_tool', tool_name: 'Write', input: {} } })}\n`)

      expect(answers()).toEqual([])
      expect(frames).toEqual([])
    })

    it('writes nothing and throws nothing for a request that arrives after the process closed', async () => {
      const { child, exits, answers } = await live()
      child.emit('close')

      expect(() => child.out(ask('late', 'Write', {}))).not.toThrow()
      expect(answers()).toEqual([])
      expect(exits).toHaveBeenCalledTimes(1)
    })

    it('writes nothing and throws nothing to a stdin that is destroyed or has failed', async () => {
      const destroyed = await live()
      destroyed.child.stdin.destroyed = true
      expect(() => destroyed.child.out(ask('d', 'Write', {}))).not.toThrow()
      expect(destroyed.answers()).toEqual([])

      const failed = await live()
      failed.child.stdinErrors.forEach((listener) => listener())
      expect(() => failed.child.out(ask('f', 'Write', {}))).not.toThrow()
      expect(failed.answers()).toEqual([])
    })

    it('throws nothing when the write of an answer itself throws', async () => {
      const { child } = await live()
      child.failWrites = true

      expect(() => child.out(ask('t', 'Write', {}))).not.toThrow()
    })

    it('still hands every other frame to onFrame, in order around the requests', async () => {
      const { child, frames, answers } = await live()

      child.out(`{"type":"a"}\n${ask('r', 'Write', {}).trimEnd()}\n{"type":"b"}\n`)

      expect(frames).toEqual([{ type: 'a' }, { type: 'b' }])
      expect(answers()).toHaveLength(1)
    })
  })

  it('kills the process group', async () => {
    const { child, killed, start } = harness()
    const pending = start()
    child.spawn()
    const outcome = await pending
    if (!outcome.ok) throw new Error('expected a session')

    outcome.session.kill()
    expect(killed).toEqual([4242])
  })
})

describe('interruptLine', () => {
  it('is exactly one control_request line asking for an interrupt, with the id it was given', () => {
    const line = interruptLine('interrupt-1')

    expect(line).toBe('{"type":"control_request","request_id":"interrupt-1","request":{"subtype":"interrupt"}}\n')
    expect(line.slice(0, -1)).not.toContain('\n')
  })
})

describe('an interrupt of the turn in flight', () => {
  async function live() {
    const parts = harness()
    const pending = parts.start()
    parts.child.spawn()
    const outcome = await pending
    if (!outcome.ok) throw new Error('expected a session')
    const interrupts = (): { type: string; request_id: string; request: { subtype: string } }[] =>
      parts.child.writes
        .slice(1)
        .map((line) => JSON.parse(line))
        .filter((line) => line.type === 'control_request')
    const answer = (requestId: string, subtype = 'success'): void =>
      parts.child.out(`${JSON.stringify({ type: 'control_response', response: { subtype, request_id: requestId, response: { still_queued: [] } } })}\n`)
    return { ...parts, session: outcome.session, interrupts, answer }
  }

  /** Whether a promise has settled, without waiting on it. */
  const settled = async (promise: Promise<unknown>): Promise<boolean> => {
    let done = false
    void promise.then(() => (done = true))
    await Promise.resolve()
    await Promise.resolve()
    return done
  }

  it('writes one interrupt line, in-band, and never signals the process group', async () => {
    const { child, killed, session, interrupts } = await live()

    void session.interrupt()

    expect(child.writes).toHaveLength(2)
    expect(interrupts()).toEqual([{ type: 'control_request', request_id: expect.any(String), request: { subtype: 'interrupt' } }])
    expect(killed).toEqual([])
  })

  it('resolves true only for the control_response that carries its id with subtype success, and holds until then', async () => {
    const { session, interrupts, answer } = await live()
    const asked = session.interrupt()
    expect(await settled(asked)).toBe(false)

    answer('somebody-elses')
    expect(await settled(asked)).toBe(false)
    answer(interrupts()[0].request_id)

    await expect(asked).resolves.toBe(true)
  })

  it.each(['error', 'cancelled', 'anything-else'])('resolves false for an answer of subtype %s', async (subtype) => {
    const { session, interrupts, answer } = await live()
    const asked = session.interrupt()

    answer(interrupts()[0].request_id, subtype)

    await expect(asked).resolves.toBe(false)
  })

  it('resolves false when the write failed, and when the process or its pipe has already gone', async () => {
    const throwing = await live()
    throwing.child.failWrites = true
    await expect(throwing.session.interrupt()).resolves.toBe(false)

    const closed = await live()
    closed.child.emit('close')
    await expect(closed.session.interrupt()).resolves.toBe(false)

    const broken = await live()
    broken.child.stdinErrors.forEach((listener) => listener())
    await expect(broken.session.interrupt()).resolves.toBe(false)
  })

  it('resolves false when the process closes before it was answered', async () => {
    const { child, session } = await live()
    const asked = session.interrupt()

    child.emit('close')

    await expect(asked).resolves.toBe(false)
  })

  it('gives each interrupt an id of its own, and each is answered by its own response', async () => {
    const { session, interrupts, answer } = await live()
    const first = session.interrupt()
    const second = session.interrupt()
    const [one, two] = interrupts().map((line) => line.request_id)
    expect(one).not.toBe(two)

    answer(two, 'error')
    answer(one)

    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
  })

  it('drops an answer nobody is waiting for, and one that comes twice, without a throw or a frame', async () => {
    const { frames, session, interrupts, answer, child } = await live()
    answer('never-asked')
    const asked = session.interrupt()
    const id = interrupts()[0].request_id
    answer(id)
    answer(id)
    child.out(`${JSON.stringify({ type: 'control_response', response: 'garbage' })}\n`)
    child.out(`${JSON.stringify({ type: 'control_response' })}\n`)
    child.out(`${JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: 7 } })}\n`)

    await expect(asked).resolves.toBe(true)
    expect(frames).toEqual([])
  })

  it('says nothing of the turn: the CLI’s result is the turn’s end and reaches onFrame as it always does', async () => {
    const { frames, session, interrupts, answer, child } = await live()
    const asked = session.interrupt()
    answer(interrupts()[0].request_id)
    child.out(`${JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true })}\n`)

    await expect(asked).resolves.toBe(true)
    expect(frames).toEqual([{ type: 'result', subtype: 'error_during_execution', is_error: true }])
  })
})
