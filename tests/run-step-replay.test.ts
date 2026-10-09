import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationReply, RunCardSnapshot } from '../src/shared/conversation'
import type { ContractEvent, RunStep } from '../src/shared/events'
import { createPersonaProjection } from '../src/main/projections/personas'
import { createRailAnnotator } from '../src/main/projections/rail-annotator'
import { startCard } from '../src/main/fold/run-card'

/**
 * Story 3.16's steps, replayed from the corpus. Every `fixtures/runs/*.jsonl` goes through the
 * real session bridge and registry (the same way `tests/continuation-replay.test.tsx` feeds one),
 * in windows: one run from the start of the recording, and one from just after each main-thread
 * `result` row, each fed until the bridge itself ends the run. The steps main raised are then held
 * against a count taken from the raw frames alone, which never consults the fold: every main-thread
 * `tool_use` of the window not aimed at `.memlog.md`.
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
const { CONVERSATION_GET_CHANNEL, MENU_DISPATCH_CHANNEL, RUN_STOP_CHANNEL, SESSION_OPEN_CHANNEL, registerSessionBridge } = await import(
  '../src/main/session-bridge'
)

const RUNS = resolve(import.meta.dirname, '..', 'fixtures', 'runs')
const A = 'bmad-agent-pm'
const TERMINAL = new Set(['run:finished', 'run:stopped', 'run:failed'])

type Frame = {
  type: string
  parent_tool_use_id?: string | null
  event?: { type?: string; index?: number; content_block?: { type?: string; name?: string; id?: string } }
  message?: { content?: unknown }
}
type ToolUse = { type: string; id: string; name: string; input?: Record<string, unknown> }

const SCENARIOS = readdirSync(RUNS)
  .filter((file) => file.endsWith('.jsonl'))
  .map((file) => basename(file, '.jsonl'))
  .sort()

function load(scenario: string): { frames: Frame[]; cwd: string } {
  const frames = readFileSync(join(RUNS, `${scenario}.jsonl`), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Frame)
  const { cwd } = JSON.parse(readFileSync(join(RUNS, `${scenario}.meta.json`), 'utf8')) as { cwd: string }
  return { frames, cwd }
}

/** Whether the call's own input aims it at a run's working notes. */
function aimedAtMemlog(input: Record<string, unknown> | undefined): boolean {
  const path = input?.file_path ?? input?.notebook_path
  return typeof path === 'string' && basename(path) === '.memlog.md'
}

/** The main-thread calls in `frames[from, to)`, by the complete messages the CLI repeats: no fold is consulted. */
function mainCalls(frames: Frame[], from: number, to: number): ToolUse[] {
  const seen = new Map<string, ToolUse>()
  for (const frame of frames.slice(from, to)) {
    if (frame.type !== 'assistant' || (frame.parent_tool_use_id !== null && frame.parent_tool_use_id !== undefined)) continue
    for (const block of (frame.message?.content ?? []) as ToolUse[]) {
      if (block.type === 'tool_use') seen.set(block.id, block)
    }
  }
  return [...seen.values()]
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
}

type Fake = { feed: (frame: unknown) => void; interrupts: ((acknowledged: boolean) => void)[] }

let userData: string
let clock: number
let fake: Fake

beforeEach(() => {
  handlers.clear()
  userData = mkdtempSync(join(tmpdir(), 'harness-step-replay-'))
  clock = 1_000
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

function openBridge(project: string): void {
  let runs = 0
  registerSessionBridge({
    transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
    projectPathFor: () => project,
    now: () => clock,
    newSessionId: () => 's1',
    newRunId: () => `r${(runs += 1)}`,
    agentName: () => 'John',
    writeDiagnostic: () => {},
    menuEntryFor: () => ({ code: 'CP', description: 'Create the PRD', action: { kind: 'skill', skill: 'bmad-prd' } }),
    readPlan: () => Promise.resolve(undefined),
    readText: () => Promise.resolve(undefined),
    schedule: () => () => {},
    spawn: (options) => {
      const held: Fake = { feed: options.onFrame, interrupts: [] }
      fake = held
      return Promise.resolve({
        ok: true,
        session: {
          write: () => Promise.resolve(true),
          interrupt: () => new Promise<boolean>((resolveInterrupt) => held.interrupts.push(resolveInterrupt)),
          kill: () => {}
        }
      })
    }
  })
}

const call = <T,>(channel: string, sender: FakeSender, ...args: unknown[]): T =>
  (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)

const flush = async (): Promise<void> => {
  for (let at = 0; at < 5; at += 1) await Promise.resolve()
}

/** A session whose first turn is over and free, and a run dispatched into it. */
async function dispatched(project: string): Promise<FakeSender> {
  openBridge(project)
  const sender = new FakeSender()
  await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, sender, A)
  fake.feed({ type: 'result', subtype: 'success', is_error: false })
  const reply = await call<Promise<{ ok: boolean }>>(MENU_DISPATCH_CHANNEL, sender, 's1', 'CP')
  expect(reply.ok).toBe(true)
  return sender
}

const stepsOf = (sent: ContractEvent[]): RunStep[] => sent.flatMap((event) => (event.name === 'run:step' ? [event.payload] : []))

function cardOf(sender: FakeSender): RunCardSnapshot {
  const reply = call<ConversationReply>(CONVERSATION_GET_CHANNEL, sender)
  if (!reply.ok) throw new Error('no snapshot')
  return reply.snapshot.runs[0]
}

type Window = { sender: FakeSender; from: number; to: number; ended: boolean }

/** Feed `frames[from…]` into a fresh run until the bridge ends it, or the recording does. */
async function replayWindow(scenario: string, from: number): Promise<Window> {
  const { frames, cwd: project } = load(scenario)
  const sender = await dispatched(project)
  let to = from
  for (; to < frames.length; to += 1) {
    clock += 1
    fake.feed(frames[to])
    if (sender.sent.some((event) => TERMINAL.has(event.name))) {
      to += 1
      break
    }
  }
  return { sender, from, to, ended: sender.sent.some((event) => TERMINAL.has(event.name)) }
}

/** Where a window may begin: the start, and just after each main-thread `result` row. */
function starts(frames: Frame[]): number[] {
  const rows = frames.flatMap((frame, at) => (frame.type === 'result' && !frame.parent_tool_use_id ? [at + 1] : []))
  return [0, ...rows.filter((at) => at < frames.length)]
}

describe.each(SCENARIOS)('%s, replayed through main as dispatched runs', (scenario) => {
  const { frames, cwd: project } = load(scenario)

  it('raises one running per main-thread call not aimed at the memlog, each closed once, and leaves nothing running', async () => {
    let calls = 0
    for (const from of starts(frames)) {
      const { sender, to, ended } = await replayWindow(scenario, from)
      const expected = mainCalls(frames, from, to).filter((tool) => !aimedAtMemlog(tool.input))
      const steps = stepsOf(sender.sent)
      const running = steps.filter((step) => step.status === 'running')

      expect(running.map((step) => step.callId).sort(), `${scenario} from ${from}`).toEqual(expected.map((tool) => tool.id).sort())
      expect(new Set(running.map((step) => step.callId)).size).toBe(running.length)
      // Each call is closed at most once, after it opened, by its own result.
      const closings = steps.filter((step) => step.status !== 'running')
      expect(new Set(closings.map((step) => step.callId)).size).toBe(closings.length)
      for (const closing of closings) {
        const opened = steps.findIndex((step) => step.callId === closing.callId && step.status === 'running')
        expect(opened, closing.callId).toBeGreaterThanOrEqual(0)
        expect(opened).toBeLessThan(steps.indexOf(closing))
        expect(closing.at).toBeGreaterThanOrEqual(steps[opened].at)
      }
      // The card, as main hands it to a window: one step per call, none left running once the run has ended.
      const card = cardOf(sender)
      expect(card.steps.map((step) => step.callId).sort()).toEqual(expected.map((tool) => tool.id).sort())
      if (ended) {
        const terminal = sender.sent.find((event) => TERMINAL.has(event.name))
        const at = terminal === undefined ? 0 : (terminal.payload as { at: number }).at
        expect(card.steps.filter((step) => step.status === 'running')).toEqual([])
        // A call the run ended on, with no result, is closed `failed` at the terminal instant, by the card alone.
        const unanswered = card.steps.filter((step) => !closings.some((closing) => closing.callId === step.callId))
        for (const step of unanswered) expect(step).toMatchObject({ status: 'failed', endedAt: at })
      }
      calls += running.length
    }
    // The recording has calls to count, or this proves nothing about it.
    if (!['interrupt-inband-idle'].includes(scenario)) expect(calls).toBeGreaterThan(0)
  }, 120_000)

  it('holds a step label of the table’s verbs only, 48 characters at most, with no path, URL or argument of the recording', async () => {
    const VERBS = /^(read|write|edit|run|skill|agent|fetch|grep|glob|web search)(?: [^\s].*)?$|^[A-Za-z0-9_.-]+$/
    const events: ContractEvent[] = []
    for (const from of starts(frames)) events.push(...(await replayWindow(scenario, from)).sender.sent)
    for (const step of stepsOf(events)) {
      if (step.status !== 'running') continue
      expect(step.label, step.callId).toMatch(VERBS)
      expect(Array.from(step.label).length).toBeLessThanOrEqual(48)
      expect(step.label).not.toMatch(/:\/\/|\/private\/|\/Users\/|Bearer|sk-/)
    }
    expect(JSON.stringify(stepsOf(events))).not.toContain(project)
  }, 120_000)
})

describe('the 3,947-delta write of fast-path-sonnet', () => {
  it('raises one step for the call, not one per delta, though main tells its prose in pieces', async () => {
    const { frames } = load('fast-path-sonnet')
    const big = mainCalls(frames, 0, frames.length).find((tool) => tool.name === 'Write' && String(tool.input?.content ?? '').length > 40_000)
    expect(big).toBeDefined()
    const deltas = frames.filter((frame) => {
      const event = frame.event as { index?: number; delta?: { type?: string } } | undefined
      return event?.delta?.type === 'input_json_delta' && frame.parent_tool_use_id === null
    }).length
    expect(deltas).toBeGreaterThan(3_947)
    // Fed from the drafting turn: the run that holds the write.
    const from = starts(frames).filter((at) => mainCalls(frames, 0, at).some((tool) => tool.id === big?.id) === false).at(-1) ?? 0
    const { sender } = await replayWindow('fast-path-sonnet', from)
    const own = stepsOf(sender.sent).filter((step) => step.callId === big?.id)
    expect(own.map((step) => step.status)).toEqual(['running', 'done'])
    expect(own[0]).toMatchObject({ label: expect.stringMatching(/^write .*prd\.md$/) })
    expect(stepsOf(sender.sent).length).toBeLessThan(deltas / 20)
  }, 120_000)
})

describe('interrupt-inband-tasks-live-mid-write, stopped while a Write streams', () => {
  const SCENARIO = 'interrupt-inband-tasks-live-mid-write'
  const INTERRUPTED_AT = 325

  async function stopped(extra: unknown[] = []): Promise<{ sender: FakeSender; card: RunCardSnapshot }> {
    const { frames, cwd: project } = load(SCENARIO)
    const sender = await dispatched(project)
    for (const frame of frames.slice(0, INTERRUPTED_AT)) fake.feed(frame)
    for (const frame of extra) fake.feed(frame)
    const reply = call<Promise<unknown>>(RUN_STOP_CHANNEL, sender, 'r1')
    await flush()
    fake.interrupts[0](true)
    await reply
    for (const frame of frames.slice(INTERRUPTED_AT, 336)) fake.feed(frame)
    return { sender, card: cardOf(sender) }
  }

  it('ends the run stopped with the two Agent spawns as its steps, done, and no step for the Write that never became whole', async () => {
    const { sender, card } = await stopped()
    const names = sender.sent.map((event) => event.name)
    expect(names.filter((name) => TERMINAL.has(name))).toEqual(['run:stopped'])
    expect(stepsOf(sender.sent).map((step) => [step.status, 'label' in step ? step.label : undefined])).toEqual([
      ['running', 'agent general-purpose'],
      ['done', undefined],
      ['running', 'agent general-purpose'],
      ['done', undefined]
    ])
    expect(card.status).toBe('stopped')
    expect(card.steps.map((step) => step.status)).toEqual(['done', 'done'])
  })

  it('closes a call that was whole and had no result at the interrupt as failed at the stop’s instant, with no event of its own', async () => {
    // The CLI never closes a Write the interrupt cut off; here the block is closed by hand so a call is in flight.
    const closed = { type: 'stream_event', event: { type: 'content_block_stop', index: 0 }, parent_tool_use_id: null }
    const { sender, card } = await stopped([closed])
    const stop = sender.sent.find((event) => event.name === 'run:stopped')
    const inFlight = card.steps.at(-1)
    expect(inFlight).toMatchObject({ status: 'failed', label: 'write notes.md', endedAt: stop?.payload.at })
    expect(stepsOf(sender.sent).filter((step) => step.status !== 'running')).toHaveLength(2)
    expect(card.steps.filter((step) => step.status === 'running')).toEqual([])
  })
})

describe('what a step may carry', () => {
  const stream = (event: unknown) => ({ type: 'stream_event', event, parent_tool_use_id: null })
  const call = (index: number, name: string, id: string, input: Record<string, unknown>) => {
    const json = JSON.stringify(input)
    return [
      stream({ type: 'content_block_start', index, content_block: { type: 'tool_use', id, name, input: {} } }),
      ...(json.match(/.{1,17}/gs) ?? []).map((piece) => stream({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: piece } })),
      // The complete message the CLI repeats carries the whole input; it is not routed.
      { type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_1', content: [{ type: 'tool_use', id, name, input }] } },
      stream({ type: 'content_block_stop', index })
    ]
  }
  const result = (id: string) => ({
    type: 'user',
    parent_tool_use_id: null,
    message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'Bearer sk-x https://h/x /etc/passwd secret' }] }
  })

  it('holds nothing of a secret argument, a long command or an absolute path, in any event or in the card', async () => {
    const long = `deploy ${'--flag=hunter2-value '.repeat(20)}`
    expect(long.length).toBeGreaterThan(300)
    const sender = await dispatched('/work/project')
    for (const frame of [
      stream({ type: 'message_start', message: { id: 'msg_1' } }),
      ...call(0, 'Bash', 'b1', { command: 'curl -H "Authorization: Bearer sk-x" https://h/x?token=hunter2', description: 'fetch it' }),
      ...call(1, 'Read', 'r1', { file_path: '/etc/passwd' }),
      ...call(2, 'Bash', 'b2', { command: long }),
      ...call(3, 'WebFetch', 'w1', { url: 'https://user:pw@example.com:8443/secret/path?q=hunter2', prompt: 'summarise' }),
      ...call(4, 'Grep', 'g1', { pattern: 'hunter2', path: '/Users/me/private' }),
      ...call(5, 'Read', 'm1', { file_path: '/work/project/_bmad/x/.memlog.md' }),
      result('b1'),
      result('r1'),
      result('b2'),
      result('w1'),
      result('g1'),
      result('m1')
    ]) {
      fake.feed(frame)
    }
    const labels = stepsOf(sender.sent).flatMap((step) => ('label' in step ? [step.label] : []))
    expect(labels).toEqual(['run curl', 'read passwd', 'run deploy', 'fetch example.com', 'grep'])
    const everything = JSON.stringify([sender.sent, cardOf(sender)])
    for (const secret of ['sk-x', 'Bearer', 'hunter2', 'https://', '/etc/', '8443', 'user:pw', '/Users/me', '--flag', 'summarise', 'fetch it', '.memlog']) {
      expect(everything, secret).not.toContain(secret)
    }
    expect(stepsOf(sender.sent).filter((step) => step.status !== 'running')).toHaveLength(5)
  })

  it('moves neither a persona’s state nor the rail’s annotations', () => {
    const base: ContractEvent[] = [
      { name: 'session:opened', payload: { sessionId: 's1', agentId: A, at: 0 } },
      { name: 'run:started', payload: { runId: 'r1', sessionId: 's1', agentId: A, code: 'CP', at: 1 } }
    ]
    const step = (status: 'running' | 'done'): ContractEvent => ({
      name: 'run:step',
      payload:
        status === 'running'
          ? { runId: 'r1', sessionId: 's1', callId: 'c1', status, label: 'read a.md', at: 2 }
          : { runId: 'r1', sessionId: 's1', callId: 'c1', status, at: 3 }
    })
    const raised: ContractEvent[] = []
    const personas = createPersonaProjection({ onChange: (event) => raised.push(event), now: () => 0 })
    const told: [string, unknown][] = []
    const annotator = createRailAnnotator()
    annotator.bind({ annotate: (path, annotation) => told.push([path, annotation]), markRoom: () => {}, unmarkRoom: () => {}, clearRoom: () => {} })
    const card = startCard({ runId: 'r1', sessionId: 's1', agentId: A, code: 'CP', at: 1 })
    for (const event of base) {
      personas.apply(event)
      annotator.apply(event, card)
    }
    const before = JSON.stringify([raised, told, personas.snapshot()])
    expect(raised.length).toBeGreaterThan(0)
    for (const event of [step('running'), step('done')]) {
      personas.apply(event)
      annotator.apply(event, card)
    }
    expect(JSON.stringify([raised, told, personas.snapshot()])).toBe(before)
  })
})
