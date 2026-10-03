import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  SESSION_ARGS,
  SESSION_COMMAND,
  activationTurn,
  createLineSplitter,
  isAgentId,
  spawnSession,
  userTurnLine
} from './session-process'
import type { SessionChild, SessionSpawn } from './session-process'

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

function harness() {
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
      onExit: exits
    })
  return { child, calls, frames, killed, exits, start }
}

describe('SESSION_ARGS', () => {
  it('is exactly the session command', () => {
    expect(SESSION_COMMAND).toBe('claude')
    expect(SESSION_ARGS.join(' ')).toBe(
      '-p --input-format stream-json --output-format stream-json --include-partial-messages --verbose --setting-sources project,local'
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
      onExit: () => {}
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
