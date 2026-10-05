import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationReply, ConversationSnapshot } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'
import type { SessionChild } from '../src/main/sources/session/session-process'

/**
 * Story 3.7's stop, replayed from the recording: `interrupt-inband`, a real
 * session in which a `control_request` interrupt was written while a 20 KB
 * `Write` of the PRD was still streaming. Its frames are fed to the real session
 * bridge and registry through the real session process (`spawnSession`) over a
 * fake child, so the interrupt line main writes, and the `control_response` the
 * recording holds, travel the whole way: nothing but the CLI is faked.
 *
 * The recording is a dispatched run: its activation turn ends at line 252, the
 * drafting turn is sent as a menu dispatch (line 253 on), the stream is fed to
 * line 2154, `run.stop` is pressed, and lines 2155 to 2157 follow: the
 * `control_response`, the user frame the CLI writes for an interrupted turn, and
 * the interrupted turn's `result` (`error_during_execution`, `is_error`). The
 * recorded answer carries the recorder's own `request_id`; it is replaced by the
 * id main wrote, as the CLI answers each request by its id. After it the
 * recording's own follow-up turn (lines 2158 on) is the proof the session lived.
 *
 * The recording's project path is replaced by a scratch project, in which the
 * PRD stands as it was written before the stop, so that "the file is as it was"
 * is a comparison of bytes. The CLI streams the `Write`'s `file_path` in pieces,
 * so the path is rewritten across them, whole, in the piece that closes it.
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
const { STOP_ACK_MS } = await import('../src/main/session-stop')
const { LINES } = await import('../src/main/session-voice')
const { spawnSession } = await import('../src/main/sources/session/session-process')
const {
  CONVERSATION_GET_CHANNEL,
  MENU_DISPATCH_CHANNEL,
  RUN_STOP_CHANNEL,
  SESSION_OPEN_CHANNEL,
  TURN_SEND_CHANNEL,
  registerSessionBridge
} = await import('../src/main/session-bridge')

const RUNS = resolve(import.meta.dirname, '..', 'fixtures', 'runs')
const meta = JSON.parse(readFileSync(join(RUNS, 'interrupt-inband.meta.json'), 'utf8')) as {
  cwd: string
  interruptedAtLine: number
  turns: { afterLine: number; text?: string; control?: { type: string; request_id: string; request: { subtype: string } } }[]
}
const raw = readFileSync(join(RUNS, 'interrupt-inband.jsonl'), 'utf8')
  .split('\n')
  .filter((line) => line.length > 0)

/** The recording's line `n`, counted from 1 as the metadata counts. */
const recorded = (n: number): string => raw[n - 1]
const recordedFrame = (n: number): { type: string; subtype?: string; is_error?: boolean; response?: { subtype: string; request_id: string } } =>
  JSON.parse(recorded(n))

/** The recording with its project path replaced, in the one place the stop depends on it: the interrupted `Write`'s `file_path`. */
function withProjectPath(project: string): string[] {
  const out = raw.slice()
  const frameAt = (at: number) => JSON.parse(raw[at]) as { type: string; parent_tool_use_id?: string | null; event?: { type?: string; index?: number; content_block?: { name?: string }; delta?: { type?: string; partial_json?: string } } }
  const started = raw.findIndex((_, at) => {
    const frame = frameAt(at)
    return frame.event?.type === 'content_block_start' && frame.event.content_block?.name === 'Write' && frame.parent_tool_use_id === null
  })
  const { index } = frameAt(started).event ?? {}
  let text = ''
  const pieces: number[] = []
  for (let at = started + 1; at < raw.length; at += 1) {
    const { event } = frameAt(at)
    if (event?.type !== 'content_block_delta' || event.index !== index || event.delta?.type !== 'input_json_delta') continue
    text += event.delta.partial_json ?? ''
    pieces.push(at)
    if (!/"file_path": "[^"]*"/.test(text)) continue
    for (const piece of pieces) {
      const frame = frameAt(piece)
      if (frame.event?.delta) frame.event.delta.partial_json = piece === at ? text.replaceAll(meta.cwd, project) : ''
      out[piece] = JSON.stringify(frame)
    }
    break
  }
  return out
}

const ACTIVATION_RESULT = 252
const INTERRUPT_AT = meta.interruptedAtLine
const ACK = INTERRUPT_AT + 1
const INTERRUPTED_RESULT = INTERRUPT_AT + 3
/** The recording's last `result`: the end of its follow-up turn. */
const LAST_RESULT = raw.findLastIndex((line) => (JSON.parse(line) as { type: string }).type === 'result') + 1

const A = 'bmad-agent-pm'
const PRD = '_bmad/planning-artifacts/prds/prd-bmad-harness-2026-10-01/prd.md'
const AS_WRITTEN = '# Postbox\n\nThe PRD as the last confirmed write left it.\n'

/** A child process as `spawnSession` sees one: what is written to its stdin, and what it prints. */
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
  /** Print some lines, each with its newline, as one chunk. */
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
let project: string
let timers: { at: number; run: () => void; cancelled: boolean }[]
let clock: number

beforeEach(() => {
  handlers.clear()
  root = mkdtempSync(join(tmpdir(), 'harness-stop-replay-'))
  project = join(root, 'project')
  mkdirSync(project)
  timers = []
  clock = 1_000
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/** Let time pass: run every timer due by then. */
function advance(ms: number): void {
  clock += ms
  for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
    if (!timer.cancelled && timer.at <= clock) {
      timer.cancelled = true
      timer.run()
    }
  }
}

const turnsWritten = (child: FakeChild): { type: string; message?: { content?: { text?: string }[] } }[] =>
  child.writes.map((line) => JSON.parse(line)).filter((line) => line.type === 'user')
const interruptsWritten = (child: FakeChild): { type: string; request_id: string; request: { subtype: string } }[] =>
  child.writes.map((line) => JSON.parse(line)).filter((line) => line.type === 'control_request')
const settle = async (): Promise<void> => {
  for (let at = 0; at < 8; at += 1) await Promise.resolve()
}

/**
 * The recording up to the moment the stop is pressed: the session opened and
 * its activation over, the drafting turn dispatched as a run, and the stream
 * fed to the interrupted line, with the scratch project's PRD in place.
 */
async function pressed() {
  // The recording, with its project path as the scratch project.
  const lines = withProjectPath(project)
  const frameOf = (n: number): string => lines[n - 1]
  const prdFile = join(project, PRD)
  mkdirSync(dirname(prdFile), { recursive: true })
  writeFileSync(prdFile, AS_WRITTEN)

  const child = new FakeChild()
  const killed: (number | undefined)[] = []
  const sender = new FakeSender()
  registerSessionBridge({
    transcripts: createTranscriptRegistry({ userDataPath: () => join(root, 'userData'), schedule: () => () => {}, log: () => {} }),
    projectPathFor: () => project,
    now: () => clock,
    newSessionId: () => 's1',
    newRunId: () => 'run-1',
    agentName: () => 'John',
    writeDiagnostic: () => {},
    menuEntryFor: (_window, _agent, code) =>
      code === 'DP' ? { code: 'DP', description: 'Draft the PRD', action: { kind: 'skill', skill: 'bmad-prd' } } : undefined,
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
  const call = <T>(channel: string, ...args: unknown[]): T =>
    (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)
  const snapshot = (): ConversationSnapshot => {
    const reply = call<ConversationReply>(CONVERSATION_GET_CHANNEL)
    if (!reply.ok) throw new Error('no snapshot')
    return reply.snapshot
  }

  await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, A)
  // The activation turn, to its `result`; then the drafting turn is sent as a button's dispatch.
  child.print(Array.from({ length: ACTIVATION_RESULT }, (_, at) => frameOf(at + 1)))
  const dispatched = await call<Promise<{ ok: boolean; runId: string }>>(MENU_DISPATCH_CHANNEL, 's1', 'DP')
  expect(dispatched).toEqual({ ok: true, runId: 'run-1' })
  child.print(Array.from({ length: INTERRUPT_AT - ACTIVATION_RESULT }, (_, at) => frameOf(ACTIVATION_RESULT + at + 1)))

  /** What the CLI printed after the interrupt: its answer to the id main wrote, then the turn's end, in one chunk. */
  const answered = (requestId: string, subtype = 'success'): string[] => [
    JSON.stringify({ type: 'control_response', response: { subtype, request_id: requestId, response: { still_queued: [] } } }),
    frameOf(ACK + 1),
    frameOf(INTERRUPTED_RESULT)
  ]
  const stopped = (): Promise<unknown> => call<Promise<unknown>>(RUN_STOP_CHANNEL, 'run-1')
  const events = (name: ContractEvent['name']): ContractEvent['payload'][] =>
    sender.sent.flatMap((event) => (event.name === name ? [event.payload] : []))
  return { child, killed, sender, call, snapshot, answered, stopped, events, frameOf, prdFile }
}

describe('interrupt-inband, as the recording that settled the stop', () => {
  it('is the recording it is named for: the interrupt at line 2154, its answer next, the interrupted result, then a follow-up turn', () => {
    expect(INTERRUPT_AT).toBe(2154)
    expect(meta.turns.map((turn) => turn.afterLine)).toEqual([0, 253, 2154, 2158])
    expect(meta.turns[2].control).toEqual({ type: 'control_request', request_id: 'rec-2154', request: { subtype: 'interrupt' } })
    expect(recordedFrame(ACTIVATION_RESULT)).toMatchObject({ type: 'result', is_error: false })
    expect(recordedFrame(ACK)).toMatchObject({ type: 'control_response', response: { subtype: 'success', request_id: 'rec-2154' } })
    expect(recordedFrame(INTERRUPTED_RESULT)).toMatchObject({ type: 'result', subtype: 'error_during_execution', is_error: true })
    expect(recordedFrame(LAST_RESULT)).toMatchObject({ type: 'result', is_error: false })
  })
})

describe('a stop the recording’s CLI acknowledged', () => {
  it('writes one interrupt line, exactly the recorded request with the id main gave it, and nothing else, then tells the window nothing', async () => {
    const scene = await pressed()
    const told = scene.sender.sent.length

    const reply = scene.stopped()
    await settle()

    const [interrupt] = interruptsWritten(scene.child)
    expect(interruptsWritten(scene.child)).toHaveLength(1)
    expect(interrupt).toEqual({ ...meta.turns[2].control, request_id: expect.any(String) })
    expect(interrupt.request_id).not.toBe('')
    expect(scene.child.writes.at(-1)).toBe(`${JSON.stringify(interrupt)}\n`)
    expect(scene.sender.sent).toHaveLength(told)
    expect(scene.killed).toEqual([])

    scene.child.print(scene.answered(interrupt.request_id))
    await expect(reply).resolves.toEqual({ ok: true })
  })

  it('ends the card on the turn’s result row as run:stopped: no run:failed, no failed line, the session open, the interrupted write uncommitted', async () => {
    const scene = await pressed()
    expect(scene.snapshot().runs[0].status).toBe('running')

    const reply = scene.stopped()
    await settle()
    scene.child.print(scene.answered(interruptsWritten(scene.child)[0].request_id))
    await reply

    const names = scene.sender.names
    expect(names.slice(-2)).toEqual(['run:stopped', 'session:awaiting-turn'])
    expect(scene.events('run:stopped')).toEqual([{ runId: 'run-1', sessionId: 's1', at: clock }])
    expect(scene.events('run:failed')).toEqual([])
    expect(scene.events('harness:said')).toEqual([])
    expect(scene.events('session:closed')).toEqual([])
    expect(scene.events('doc:committed')).toEqual([])
    expect(scene.killed).toEqual([])
    const after = scene.snapshot()
    expect(after.sessions).toEqual([{ agentId: A, sessionId: 's1' }])
    expect(after.busy).toEqual([])
    expect(after.entries.filter((entry) => entry.kind === 'sysline')).toEqual([])
    // The card ends with what had streamed into it, uncommitted: the body is left as it was.
    expect(after.runs[0]).toMatchObject({ runId: 'run-1', status: 'stopped' })
    expect(after.runs[0].error).toBeUndefined()
    expect(after.runs[0].documents[0]).toMatchObject({ path: PRD, sections: [] })
    expect(after.runs[0].documents[0].text.length).toBeGreaterThan(1_000)
  })

  it('still ends as run:stopped when the control response and the result are told as one chunk, which they are here: the flag is set before the line is written', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    const [interrupt] = interruptsWritten(scene.child)

    // One chunk, the answer and the whole of the turn's end; nothing between them but the newline.
    scene.child.print(scene.answered(interrupt.request_id))
    await reply

    expect(scene.events('run:stopped')).toHaveLength(1)
    expect(scene.events('run:failed')).toEqual([])
  })

  it('leaves the project’s files exactly as they were written: the recording’s PRD, byte for byte', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    scene.child.print(scene.answered(interruptsWritten(scene.child)[0].request_id))
    await reply

    expect(readFileSync(scene.prdFile, 'utf8')).toBe(AS_WRITTEN)
    expect(readdirSync(dirname(scene.prdFile))).toEqual(['prd.md'])
  })

  it('takes the recording’s own follow-up turn into the same process, and lets it end as an ordinary turn', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    scene.child.print(scene.answered(interruptsWritten(scene.child)[0].request_id))
    await reply
    const followUp = meta.turns[3].text ?? ''
    const before = scene.sender.sent.length

    await expect(scene.call<Promise<unknown>>(TURN_SEND_CHANNEL, 's1', followUp)).resolves.toEqual({ ok: true })

    expect(turnsWritten(scene.child).at(-1)?.message?.content?.[0]?.text).toBe(followUp)
    // The recorded follow-up turn, from its own first frame to its result: the persona writes the PRD in its own voice.
    scene.child.print(Array.from({ length: LAST_RESULT - INTERRUPTED_RESULT }, (_, at) => scene.frameOf(INTERRUPTED_RESULT + at + 1)))
    const later = scene.sender.sent.slice(before).map((event) => event.name)
    expect(later).toContain('persona:said')
    expect(later.filter((name) => /^run:/.test(name))).toEqual([])
    expect(scene.events('run:stopped')).toHaveLength(1)
    expect(scene.snapshot().busy).toEqual([])
    expect(scene.snapshot().sessions).toEqual([{ agentId: A, sessionId: 's1' }])
    expect(scene.killed).toEqual([])
  })

  it('does not stop a run twice: a second press writes no second line and the replies are ok', async () => {
    const scene = await pressed()
    const first = scene.stopped()
    await settle()

    await expect(scene.stopped()).resolves.toEqual({ ok: true })

    expect(interruptsWritten(scene.child)).toHaveLength(1)
    scene.child.print(scene.answered(interruptsWritten(scene.child)[0].request_id))
    await first
    await expect(scene.stopped()).resolves.toEqual({ ok: false, error: { code: 'run/not-found', message: 'run · no such run is in flight' } })
    expect(interruptsWritten(scene.child)).toHaveLength(1)
  })
})

describe('a stop the recording’s CLI did not acknowledge', () => {
  /** The fallback's whole effect, whatever made it happen. */
  async function expectEnded(scene: Awaited<ReturnType<typeof pressed>>, reply: Promise<unknown>): Promise<void> {
    await expect(reply).resolves.toEqual({ ok: true })
    expect(scene.killed).toEqual([4242])
    expect(scene.sender.names.slice(-3)).toEqual(['run:stopped', 'harness:said', 'session:closed'])
    expect(scene.events('run:stopped')).toEqual([{ runId: 'run-1', sessionId: 's1', at: clock }])
    expect(scene.events('run:failed')).toEqual([])
    expect(scene.events('harness:said')).toEqual([{ sessionId: 's1', id: expect.any(String), text: LINES.stopEnded, at: clock }])
    expect(scene.events('session:closed')).toEqual([{ sessionId: 's1', agentId: A, reason: 'closed', at: clock }])
    expect(scene.snapshot().sessions).toEqual([])
    expect(scene.snapshot().runs[0].status).toBe('stopped')
    expect(scene.snapshot().entries.filter((entry) => entry.kind === 'sysline')).toEqual([
      expect.objectContaining({ text: 'stop not acknowledged · the session ended with the run' })
    ])
    expect(readFileSync(scene.prdFile, 'utf8')).toBe(AS_WRITTEN)
  }

  it('ends the session, the card and the transcript’s line when the CLI answers with another subtype', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    scene.child.print([
      JSON.stringify({ type: 'control_response', response: { subtype: 'error', request_id: interruptsWritten(scene.child)[0].request_id, error: 'not now' } })
    ])

    await expectEnded(scene, reply)
  })

  it('ends the same way when nothing answers within STOP_ACK_MS, and not a moment before', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    advance(STOP_ACK_MS - 1)
    await settle()
    expect(scene.killed).toEqual([])
    expect(scene.events('run:stopped')).toEqual([])

    advance(1)

    await expectEnded(scene, reply)
  })

  it('ignores the answer that comes late, and the turn’s end after it: one terminal event, one line, one kill', async () => {
    const scene = await pressed()
    const reply = scene.stopped()
    await settle()
    const requestId = interruptsWritten(scene.child)[0].request_id
    advance(STOP_ACK_MS)
    await expectEnded(scene, reply)
    const told = scene.sender.sent.length

    scene.child.print(scene.answered(requestId))
    advance(60_000)
    await settle()

    expect(scene.sender.sent).toHaveLength(told)
    expect(scene.killed).toEqual([4242])
  })

  it('leaves the file as it was, and writes nothing to it, on either way', async () => {
    const scene = await pressed()
    const before = readFileSync(scene.prdFile)
    const reply = scene.stopped()
    await settle()
    advance(STOP_ACK_MS)
    await reply

    expect(readFileSync(scene.prdFile).equals(before)).toBe(true)
  })
})
