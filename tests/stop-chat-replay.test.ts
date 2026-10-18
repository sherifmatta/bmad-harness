import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationReply, ConversationSnapshot } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'
import type { SessionChild } from '../src/main/sources/session/session-process'

/**
 * Story 3.19's stop of a turn that is not a run, replayed from the recording:
 * `interrupt-inband-chat`, a real session in which a plain chat turn (no skill, no
 * tool) was interrupted in-band while its prose was streaming. Its frames are fed
 * to the real session bridge and registry through the real session process
 * (`spawnSession`) over a fake child, so the interrupt line main writes, and the
 * `control_response` the recording holds, travel the whole way: nothing but the
 * CLI is faked.
 *
 * The recording's first turn is the question; the session's own activation turn
 * ends in a `result` the recording does not have (the recorder wrote no activation),
 * so a plain `result` row stands for it here, and the question is sent through
 * `turn.send` as the window sends one. Lines 1 to 53 are the turn up to the
 * recorder's interrupt; 54 is the `control_response` (answered here by the id main
 * wrote), 55 and 56 the cut-off message and the CLI's interrupted-user frame, 57
 * the turn's `result` (`error_during_execution`, `is_error`), and 58 to 69 the
 * follow-up turn.
 */

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler)
  },
  BrowserWindow: { fromWebContents: () => null },
  app: { getPath: () => '/unused' }
}))

const { createTranscriptRegistry } = await import('../src/main/projections/transcript')
const { STOP_ACK_MS, STOP_RESULT_MS } = await import('../src/main/session-stop')
const { LINES } = await import('../src/main/session-voice')
const { spawnSession } = await import('../src/main/sources/session/session-process')
const {
  CONVERSATION_GET_CHANNEL,
  MENU_DISPATCH_CHANNEL,
  RUN_STOP_CHANNEL,
  SESSION_OPEN_CHANNEL,
  TURN_SEND_CHANNEL,
  TURN_STOP_CHANNEL,
  registerSessionBridge
} = await import('../src/main/session-bridge')

const RUNS = resolve(import.meta.dirname, '..', 'fixtures', 'runs')
const meta = JSON.parse(readFileSync(join(RUNS, 'interrupt-inband-chat.meta.json'), 'utf8')) as {
  interruptedAtLine: number
  turns: { afterLine: number; text?: string; control?: { type: string; request_id: string; request: { subtype: string } } }[]
}
const raw = readFileSync(join(RUNS, 'interrupt-inband-chat.jsonl'), 'utf8')
  .split('\n')
  .filter((line) => line.length > 0)

/** The recording's line `n`, counted from 1 as the metadata counts. */
const recorded = (n: number): string => raw[n - 1]
const INTERRUPT_AT = meta.interruptedAtLine
const ACK = INTERRUPT_AT + 1
const INTERRUPTED_RESULT = raw.findIndex((line) => (JSON.parse(line) as { type: string }).type === 'result') + 1
const LAST = raw.length
const QUESTION = meta.turns[0].text ?? ''
const FOLLOW_UP = meta.turns.at(-1)?.text ?? ''

const A = 'bmad-agent-pm'
const ACTIVATED = JSON.stringify({ type: 'result', subtype: 'success', is_error: false })

class FakeChild extends EventEmitter {
  pid = 4242
  writes: string[] = []
  stdout = new EventEmitter()
  stdin = {
    write: (data: string, callback?: (error?: Error | null) => void): boolean => {
      this.writes.push(data)
      callback?.(null)
      return true
    },
    on: (): void => {}
  }
  print(lines: string[]): void {
    this.stdout.emit('data', `${lines.join('\n')}\n`)
  }
}

class FakeSender {
  sent: ContractEvent[] = []
  readonly id = 1
  send(_channel: string, event: ContractEvent): void {
    this.sent.push(event)
  }
  isDestroyed(): boolean {
    return false
  }
  once(): void {}
  get names(): string[] {
    return this.sent.map((event) => event.name).filter((name) => name !== 'persona:state')
  }
}

let root: string
let timers: { at: number; run: () => void; cancelled: boolean }[]
let clock: number

beforeEach(() => {
  handlers.clear()
  root = mkdtempSync(join(tmpdir(), 'harness-stop-chat-replay-'))
  mkdirSync(join(root, 'project'))
  timers = []
  clock = 1_000
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function advance(ms: number): void {
  clock += ms
  for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
    if (!timer.cancelled && timer.at <= clock) {
      timer.cancelled = true
      timer.run()
    }
  }
}

const interruptsWritten = (child: FakeChild): { type: string; request_id: string; request: { subtype: string } }[] =>
  child.writes.map((line) => JSON.parse(line)).filter((line) => line.type === 'control_request')
const turnsWritten = (child: FakeChild): { message?: { content?: { text?: string }[] } }[] =>
  child.writes.map((line) => JSON.parse(line)).filter((line) => line.type === 'user')
const settle = async (): Promise<void> => {
  for (let at = 0; at < 8; at += 1) await Promise.resolve()
}

/** The session open and its activation over, the question sent, and the stream fed to the recorder's interrupt. */
async function pressed() {
  const project = join(root, 'project')
  const child = new FakeChild()
  const killed: (number | undefined)[] = []
  const sender = new FakeSender()
  const userData = join(root, 'userData')
  const register = (): void =>
    void registerSessionBridge({
      transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
      projectPathFor: () => project,
      now: () => clock,
      newSessionId: () => 's1',
      newRunId: () => 'run-1',
      agentName: () => 'John',
      writeDiagnostic: () => {},
      menuEntryFor: () => undefined,
      readPlan: () => Promise.resolve(undefined),
      readText: () => Promise.resolve(undefined),
      schedule: (run, ms) => {
        const timer = { at: clock + ms, run, cancelled: false }
        timers.push(timer)
        return () => void (timer.cancelled = true)
      },
      spawn: (options) =>
        spawnSession({
          ...options,
          spawn: () => {
            queueMicrotask(() => child.emit('spawn'))
            return child as unknown as SessionChild
          },
          killGroup: (pid) => void killed.push(pid)
        })
    })
  register()
  const call = <T>(channel: string, ...args: unknown[]): T =>
    (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)
  const snapshot = (): ConversationSnapshot => {
    const reply = call<ConversationReply>(CONVERSATION_GET_CHANNEL)
    if (!reply.ok) throw new Error('no snapshot')
    return reply.snapshot
  }

  await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, A)
  child.print([ACTIVATED])
  await expect(call<Promise<unknown>>(TURN_SEND_CHANNEL, 's1', QUESTION)).resolves.toEqual({ ok: true })
  child.print(Array.from({ length: INTERRUPT_AT }, (_, at) => recorded(at + 1)))
  sender.sent = []

  /** What the CLI printed after the interrupt: its answer to the id main wrote, then the turn's end, in one chunk. */
  const answered = (requestId: string, subtype = 'success'): string[] => [
    JSON.stringify({ type: 'control_response', response: { subtype, request_id: requestId, response: { still_queued: [] } } }),
    ...Array.from({ length: INTERRUPTED_RESULT - ACK }, (_, at) => recorded(ACK + at + 1))
  ]
  const stopped = (): Promise<unknown> => call<Promise<unknown>>(TURN_STOP_CHANNEL, 's1')
  const events = (name: ContractEvent['name']): ContractEvent['payload'][] =>
    sender.sent.flatMap((event) => (event.name === name ? [event.payload] : []))
  return { child, killed, sender, call, snapshot, answered, stopped, events, register, userData }
}

describe('interrupt-inband-chat, as the recording of a plain chat turn stopped', () => {
  it('is the recording it is named for: a question, an interrupt in the prose, its answer next, the interrupted result, a follow-up', () => {
    expect(meta.turns.map((turn) => turn.afterLine)).toEqual([0, INTERRUPT_AT, INTERRUPTED_RESULT])
    expect(meta.turns[1].control).toEqual({ type: 'control_request', request_id: `rec-${INTERRUPT_AT}`, request: { subtype: 'interrupt' } })
    expect(JSON.parse(recorded(ACK))).toMatchObject({ type: 'control_response', response: { subtype: 'success' } })
    expect(JSON.parse(recorded(INTERRUPTED_RESULT))).toMatchObject({ type: 'result', subtype: 'error_during_execution', is_error: true })
    expect(JSON.parse(recorded(LAST))).toMatchObject({ type: 'result', subtype: 'success', is_error: false })
  })
})

describe('a stop of the plain turn the recording’s CLI acknowledged', () => {
  it('writes one interrupt line, the recorded request with the id main gave it, and tells the window nothing until the result', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()

    const [interrupt] = interruptsWritten(scene.child)
    expect(interruptsWritten(scene.child)).toHaveLength(1)
    expect(interrupt).toEqual({ ...meta.turns[1].control, request_id: expect.any(String) })
    expect(scene.child.writes.at(-1)).toBe(`${JSON.stringify(interrupt)}\n`)
    expect(scene.sender.sent).toEqual([])
    expect(scene.killed).toEqual([])

    scene.child.print(scene.answered(interrupt.request_id))
    await expect(reply).resolves.toEqual({ ok: true })
  })

  it('ends the turn on the failed result with no run event, no failure line, no turn:failed and one harness line, before the session is free', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    scene.child.print(scene.answered(interruptsWritten(scene.child)[0].request_id))
    await reply

    expect(scene.sender.names.filter((name) => name !== 'persona:said')).toEqual(['harness:said', 'session:awaiting-turn'])
    expect(scene.events('harness:said')).toEqual([{ sessionId: 's1', id: expect.any(String), text: LINES.stopped, at: clock, agentId: A }])
    expect(scene.sender.names.filter((name) => /^run:/.test(name))).toEqual([])
    expect(scene.sender.sent.some((event) => event.name === 'harness:said' && /turn failed/.test(event.payload.text))).toBe(false)
    expect(scene.events('session:closed')).toEqual([])
    expect(scene.killed).toEqual([])
    expect(scene.snapshot().runs).toEqual([])
  })

  it('leaves the persona resting, never `error`, and the session open and free', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    scene.child.print(scene.answered(interruptsWritten(scene.child)[0].request_id))
    await reply

    const states = scene.sender.sent.flatMap((event) => (event.name === 'persona:state' ? [event.payload.state] : []))
    expect(states).not.toContain('error')
    const after = scene.snapshot()
    expect(after.sessions).toEqual([{ agentId: A, sessionId: 's1' }])
    expect(after.busy).toEqual([])
    expect(after.personas.filter((persona) => persona.state === 'error')).toEqual([])
  })

  it('keeps the persona’s words so far and the one harness line in the transcript, and reads them again after a reload', async () => {
    const scene = await pressed()
    const said = scene.sender.sent.length
    const reply = scene.stopped()
    await settle()
    scene.child.print(scene.answered(interruptsWritten(scene.child)[0].request_id))
    await reply
    expect(said).toBe(0)

    const entries = scene.snapshot().entries
    const lines = entries.filter((entry) => entry.kind === 'sysline')
    expect(lines).toEqual([expect.objectContaining({ text: LINES.stopped })])
    // The line fell after the persona's words and before anything the next turn adds.
    expect(entries.findIndex((entry) => entry.kind === 'persona')).toBeGreaterThanOrEqual(0)
    expect(entries.at(-1)).toMatchObject({ kind: 'sysline', text: LINES.stopped })
    // A window that reloads reads the same conversation again, the line where it fell.
    expect(scene.snapshot().entries.map((entry) => entry.kind)).toEqual(entries.map((entry) => entry.kind))
  })

  it('is stopped even when the acknowledgement and the result arrive in the one chunk: the mark is set before the line is written', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()

    scene.child.print(scene.answered(interruptsWritten(scene.child)[0].request_id))
    await reply

    expect(scene.events('harness:said')).toHaveLength(1)
    expect(scene.sender.names.filter((name) => /^run:/.test(name))).toEqual([])
  })

  it('takes the recording’s follow-up turn into the same process and says nothing more of the stop', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    scene.child.print(scene.answered(interruptsWritten(scene.child)[0].request_id))
    await reply
    const before = scene.sender.sent.length

    await expect(scene.call<Promise<unknown>>(TURN_SEND_CHANNEL, 's1', FOLLOW_UP)).resolves.toEqual({ ok: true })
    expect(turnsWritten(scene.child).at(-1)?.message?.content?.[0]?.text).toBe(FOLLOW_UP)
    scene.child.print(Array.from({ length: LAST - INTERRUPTED_RESULT }, (_, at) => recorded(INTERRUPTED_RESULT + at + 1)))

    const later = scene.sender.sent.slice(before).map((event) => event.name)
    expect(later).toContain('persona:said')
    expect(later).not.toContain('harness:said')
    expect(later.filter((name) => /^run:/.test(name))).toEqual([])
    expect(scene.snapshot().busy).toEqual([])
    expect(scene.killed).toEqual([])
  })

  it('does not stop a turn twice: a second press writes no second line and the reply is ok; once over it is not-found', async () => {
    const scene = await pressed()
    const first = scene.stopped()
    await settle()

    await expect(scene.stopped()).resolves.toEqual({ ok: true })

    expect(interruptsWritten(scene.child)).toHaveLength(1)
    scene.child.print(scene.answered(interruptsWritten(scene.child)[0].request_id))
    await first
    await expect(scene.stopped()).resolves.toEqual({ ok: false, error: { code: 'turn/not-found', message: 'turn · no turn is in flight' } })
    expect(interruptsWritten(scene.child)).toHaveLength(1)
  })

  it('leaves the timers alone once the turn has ended: the late STOP_RESULT_MS finds nothing to end', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    scene.child.print(scene.answered(interruptsWritten(scene.child)[0].request_id))
    await reply
    const told = scene.sender.sent.length

    advance(STOP_RESULT_MS + 60_000)

    expect(scene.sender.sent).toHaveLength(told)
    expect(scene.killed).toEqual([])
  })
})

describe('a stop of the plain turn the recording’s CLI did not acknowledge', () => {
  async function expectEnded(scene: Awaited<ReturnType<typeof pressed>>, reply: Promise<unknown>, line: string): Promise<void> {
    await expect(reply).resolves.toEqual({ ok: true })
    expect(scene.killed).toEqual([4242])
    expect(scene.sender.names).toEqual(['harness:said', 'session:closed'])
    expect(scene.events('harness:said')).toEqual([{ sessionId: 's1', id: expect.any(String), text: line, at: clock, agentId: A }])
    expect(scene.events('session:closed')).toEqual([{ sessionId: 's1', agentId: A, reason: 'closed', at: clock }])
    expect(scene.snapshot().sessions).toEqual([])
    expect(scene.sender.names.filter((name) => /^run:/.test(name))).toEqual([])
  }

  it('kills the process, says so in the harness’s register and closes the session when the CLI refuses', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    scene.child.print([
      JSON.stringify({ type: 'control_response', response: { subtype: 'error', request_id: interruptsWritten(scene.child)[0].request_id, error: 'not now' } })
    ])

    await expectEnded(scene, reply, LINES.stopTurnEnded)
  })

  it('does the same after STOP_ACK_MS of silence', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    advance(STOP_ACK_MS)

    await expectEnded(scene, reply, LINES.stopTurnEnded)
  })

  it('does the same when the interrupt is acknowledged and the turn does not end in STOP_RESULT_MS', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    scene.child.print([
      JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: interruptsWritten(scene.child)[0].request_id, response: { still_queued: [] } } })
    ])
    await expect(reply).resolves.toEqual({ ok: true })
    expect(scene.sender.sent).toEqual([])

    advance(STOP_RESULT_MS)
    await settle()

    expect(scene.killed).toEqual([4242])
    expect(scene.sender.names).toEqual(['harness:said', 'session:closed'])
    expect(scene.events('harness:said')).toEqual([{ sessionId: 's1', id: expect.any(String), text: LINES.stopTurnUnfinished, at: clock, agentId: A }])
  })

  it('says it in lower case, `·`-separated and without terminal punctuation, never in a persona’s voice', () => {
    for (const line of [LINES.stopped, LINES.stopTurnEnded, LINES.stopTurnUnfinished]) {
      expect(line).toBe(line.toLowerCase())
      expect(line).not.toMatch(/[.!?]$/)
      expect(line).toContain(' · ')
    }
    expect(LINES.stopped).toBe('stopped · the turn ended early')
  })
})

describe('the one stop for a turn in flight, a run or a plain turn', () => {
  it('answers not-found for a session with no turn in flight, an unknown id and a non-string id, and writes nothing', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    scene.child.print(scene.answered(interruptsWritten(scene.child)[0].request_id))
    await reply
    const written = scene.child.writes.length
    const notFound = { ok: false, error: { code: 'turn/not-found', message: 'turn · no turn is in flight' } }

    await expect(scene.call<Promise<unknown>>(TURN_STOP_CHANNEL, 's1')).resolves.toEqual(notFound)
    await expect(scene.call<Promise<unknown>>(TURN_STOP_CHANNEL, 'nobody')).resolves.toEqual(notFound)
    await expect(scene.call<Promise<unknown>>(TURN_STOP_CHANNEL, 42)).resolves.toEqual(notFound)
    expect(scene.child.writes).toHaveLength(written)
  })

  it('answers a run in flight as the card’s stop does: run:stopped on the failed result, never run:failed, no extra line', async () => {
    const project = join(root, 'project')
    const child = new FakeChild()
    const sender = new FakeSender()
    registerSessionBridge({
      transcripts: createTranscriptRegistry({ userDataPath: () => join(root, 'userData'), schedule: () => () => {}, log: () => {} }),
      projectPathFor: () => project,
      now: () => clock,
      newSessionId: () => 's1',
      newRunId: () => 'run-1',
      agentName: () => 'John',
      writeDiagnostic: () => {},
      menuEntryFor: () => ({ code: 'DP', description: 'Draft', action: { kind: 'prompt', prompt: QUESTION } }),
      readPlan: () => Promise.resolve(undefined),
      readText: () => Promise.resolve(undefined),
      schedule: () => () => {},
      spawn: (options) =>
        spawnSession({
          ...options,
          spawn: () => {
            queueMicrotask(() => child.emit('spawn'))
            return child as unknown as SessionChild
          },
          killGroup: () => {}
        })
    })
    const call = <T>(channel: string, ...args: unknown[]): T =>
      (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)
    await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, A)
    child.print([ACTIVATED])
    await expect(call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, 's1', 'DP')).resolves.toEqual({ ok: true, runId: 'run-1' })
    child.print(Array.from({ length: INTERRUPT_AT }, (_, at) => recorded(at + 1)))
    sender.sent = []

    const reply = call<Promise<unknown>>(TURN_STOP_CHANNEL, 's1')
    await settle()
    const [interrupt] = interruptsWritten(child)
    child.print([
      JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: interrupt.request_id, response: { still_queued: [] } } }),
      ...Array.from({ length: INTERRUPTED_RESULT - ACK }, (_, at) => recorded(ACK + at + 1))
    ])
    await expect(reply).resolves.toEqual({ ok: true })

    expect(interruptsWritten(child)).toHaveLength(1)
    expect(sender.names.filter((name) => name !== 'persona:said')).toEqual(['run:stopped', 'session:awaiting-turn'])
    expect(sender.names).not.toContain('run:failed')
    expect(sender.names).not.toContain('harness:said')
    // The card's own stop, now that the run is over, has nothing left to stop.
    await expect(call<Promise<unknown>>(RUN_STOP_CHANNEL, 'run-1')).resolves.toMatchObject({ ok: false, error: { code: 'run/not-found' } })
  })
})
