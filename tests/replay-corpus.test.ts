import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { ConversationReply } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'

/**
 * The replay corpus is a build dependency, so it is asserted rather than
 * trusted: a fixture that stopped being parseable, or a scenario that quietly
 * lost the shape it is named for, fails here instead of surfacing as a
 * mysteriously green interpreter test later. These read the frames raw and
 * route none of them; interpreting a frame is the fold's job.
 */

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler)
  },
  BrowserWindow: { fromWebContents: () => null }
}))

const { createTranscriptRegistry } = await import('../src/main/projections/transcript')
const { CONVERSATION_GET_CHANNEL, SESSION_OPEN_CHANNEL, TURN_SEND_CHANNEL, registerSessionBridge } = await import(
  '../src/main/session-bridge'
)

const RUNS = resolve(import.meta.dirname, '..', 'fixtures', 'runs')

interface Frame {
  type: string
  subtype?: string
  parent_tool_use_id?: string | null
  model?: string
  is_error?: boolean
  stop_reason?: string | null
  index?: number
  event?: {
    type: string
    index?: number
    content_block?: { type: string; name?: string }
    delta?: { type: string; partial_json?: string }
  }
  message?: { content: { type: string; name?: string; input?: Record<string, unknown> }[] }
}

interface Meta {
  scenario: string
  argv: string[]
  contractVersion: unknown
  model: string
  interrupt: string | null
  notes: string[]
  turns: { afterLine: number; text?: string; control?: unknown }[]
  exit: { code: number | null; signal: string | null }
  lines: number
  resultRows: number
}

const SCENARIOS = readdirSync(RUNS)
  .filter((name) => name.endsWith('.jsonl'))
  .map((name) => name.slice(0, -'.jsonl'.length))
  .sort()

const cache = new Map<string, Frame[]>()
function frames(scenario: string): Frame[] {
  let loaded = cache.get(scenario)
  if (!loaded) {
    loaded = readFileSync(join(RUNS, `${scenario}.jsonl`), 'utf8')
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as Frame)
    cache.set(scenario, loaded)
  }
  return loaded
}

const meta = (scenario: string): Meta => JSON.parse(readFileSync(join(RUNS, `${scenario}.meta.json`), 'utf8')) as Meta

const results = (scenario: string): Frame[] => frames(scenario).filter((f) => f.type === 'result')

/** Tool calls made by the main thread, in order, with the frame index they landed at. */
function mainThreadTools(scenario: string): { at: number; name: string; input: Record<string, unknown> }[] {
  const calls: { at: number; name: string; input: Record<string, unknown> }[] = []
  frames(scenario).forEach((frame, at) => {
    if (frame.type !== 'assistant' || frame.parent_tool_use_id) return
    for (const block of frame.message?.content ?? []) {
      if (block.type === 'tool_use') calls.push({ at, name: block.name ?? '', input: block.input ?? {} })
    }
  })
  return calls
}

/** Frames the main thread did not author: subagent output, task bookkeeping, rate-limit notices. */
function isQuiet(frame: Frame): boolean {
  if (frame.parent_tool_use_id) return true
  if (frame.type === 'system' && (frame.subtype ?? '').startsWith('task_')) return true
  return frame.type === 'rate_limit_event'
}

function longestQuietWindow(scenario: string): number {
  let longest = 0
  let run = 0
  for (const frame of frames(scenario)) {
    run = isQuiet(frame) ? run + 1 : 0
    longest = Math.max(longest, run)
  }
  return longest
}

describe('the corpus as a whole', () => {
  it('holds the named scenarios, each as raw frames beside its metadata', () => {
    expect(SCENARIOS).toEqual([
      'coaching-path',
      'fast-path-opus',
      'fast-path-sonnet',
      'interrupt-inband',
      'interrupt-sigint',
      'multi-file-sonnet',
      'reviewer-gate-failure-induced'
    ])
  })

  it.each(SCENARIOS)('%s: every line is a JSON frame and the session opens with system/init', (scenario) => {
    const all = frames(scenario)
    expect(all.length).toBe(meta(scenario).lines)
    expect(all.every((f) => typeof f.type === 'string')).toBe(true)
    expect(all[0]).toMatchObject({ type: 'system', subtype: 'init' })
    expect(all[0].model).toBe(meta(scenario).model)
  })

  it.each(SCENARIOS)('%s: was recorded with the three load-bearing flags', (scenario) => {
    const { argv } = meta(scenario)
    expect(argv).toEqual(expect.arrayContaining(['--include-partial-messages', '--input-format', 'stream-json']))
    expect(argv[argv.indexOf('--setting-sources') + 1]).toBe('project,local')
    expect(argv).not.toContain('--forward-subagent-text')
  })

  it.each(SCENARIOS)('%s: carries a contract-version stamp as metadata only, and a frame count that matches', (scenario) => {
    const m = meta(scenario)
    expect(m).toHaveProperty('contractVersion')
    expect(m.resultRows).toBe(results(scenario).length)
    expect(m.scenario).toBe(scenario)
  })
})

describe('fast-path-sonnet: one large write minutes in, then revisions', () => {
  const tools = mainThreadTools('fast-path-sonnet')
  const documentWrite = tools.find((t) => t.name === 'Write' && String(t.input.content ?? '').length > 40_000)

  it('has a single document-sized Write well after the session opened', () => {
    expect(documentWrite).toBeDefined()
    expect(String(documentWrite?.input.file_path)).toMatch(/prd\.md$/)
    expect(documentWrite?.at).toBeGreaterThan(1000)
    expect(tools.filter((t) => t.name === 'Write' && String(t.input.content ?? '').length > 40_000)).toHaveLength(1)
  })

  it('follows it with revision Edits to the same file', () => {
    const edits = tools.filter((t) => t.name === 'Edit' && t.at > (documentWrite?.at ?? Infinity))
    expect(edits.length).toBeGreaterThan(5)
    expect(edits.every((t) => t.input.file_path === documentWrite?.input.file_path)).toBe(true)
  })

  it('contains a parallel-subagent window in which the main thread says nothing', () => {
    expect(longestQuietWindow('fast-path-sonnet')).toBeGreaterThanOrEqual(30)
  })

  it('streams the Write input as partial JSON, which is why the flag is load-bearing', () => {
    const deltas = frames('fast-path-sonnet').filter(
      (f) => f.type === 'stream_event' && !f.parent_tool_use_id && f.event?.delta?.type === 'input_json_delta'
    )
    expect(deltas.length).toBeGreaterThan(50)
  })
})

describe('multi-file-sonnet: several files by Write, the largest last, then revisions by Edit', () => {
  const tools = mainThreadTools('multi-file-sonnet')
  const writes = tools.filter((t) => t.name === 'Write')

  it('writes an addendum, a pre-review copy and the PRD, each once and each larger than the one before', () => {
    expect(writes.map((t) => String(t.input.file_path).split('/').at(-1))).toEqual(['addendum.md', 'prd.pre-review.md', 'prd.md'])
    const sizes = writes.map((t) => String(t.input.content ?? '').length)
    expect(sizes[0]).toBeLessThan(sizes[1])
    expect(sizes[1]).toBeLessThan(sizes[2])
  })

  it('revises only the PRD, by Edit, after it was written', () => {
    const prd = writes.at(-1)
    const edits = tools.filter((t) => t.name === 'Edit')
    expect(edits.length).toBeGreaterThanOrEqual(2)
    expect(edits.every((t) => t.at > (prd?.at ?? Infinity) && t.input.file_path === prd?.input.file_path)).toBe(true)
  })

  it('uses no Bash, no subagent, and ends its one turn in success', () => {
    expect(tools.every((t) => t.name === 'Write' || t.name === 'Edit')).toBe(true)
    expect(frames('multi-file-sonnet').some((f) => f.parent_tool_use_id)).toBe(false)
    expect(results('multi-file-sonnet')).toEqual([expect.objectContaining({ subtype: 'success', is_error: false })])
  })
})

describe('fast-path-opus: the same workflow where the document never goes through Write', () => {
  it('lands the document through Bash heredocs and uses neither Write nor Edit', () => {
    const tools = mainThreadTools('fast-path-opus')
    expect(tools.some((t) => t.name === 'Write' || t.name === 'Edit')).toBe(false)
    const heredocs = tools.filter((t) => t.name === 'Bash' && String(t.input.command).includes('prd.md') && String(t.input.command).length > 8000)
    expect(heredocs.length).toBeGreaterThan(5)
  })

  it('has a long main-thread-silent window while background subagents run', () => {
    expect(longestQuietWindow('fast-path-opus')).toBeGreaterThan(100)
  })

  it('ends turns the harness did not send when a background subagent finishes', () => {
    const sends = meta('fast-path-opus').turns.length
    expect(results('fast-path-opus').length).toBeGreaterThan(sends)
  })
})

describe('coaching-path: a document built in batched writes across many turns', () => {
  it('writes prd.md in several multi-kilobyte Bash batches, a few sections at a time', () => {
    const batches = mainThreadTools('coaching-path').filter(
      (t) => t.name === 'Bash' && String(t.input.command).includes('prd.md') && String(t.input.command).length > 6000
    )
    expect(batches.length).toBeGreaterThanOrEqual(4)
  })

  it('is a conversation: the persona asked and the recorder answered several times', () => {
    expect(meta('coaching-path').turns.length).toBeGreaterThanOrEqual(8)
    expect(results('coaching-path').every((r) => r.is_error === false)).toBe(true)
  })
})

describe('interrupt-sigint: the process is signalled while a write is streaming', () => {
  it('records that the signal was sent and that the session ended with it', () => {
    const m = meta('interrupt-sigint')
    expect(m.interrupt).toBe('sigint')
    expect(m.exit.code).toBe(0)
    const last = results('interrupt-sigint').at(-1)
    expect(last).toMatchObject({ subtype: 'error_during_execution', is_error: true, stop_reason: 'tool_use' })
    expect(frames('interrupt-sigint').at(-1)?.type).toBe('result')
  })

  it('cuts the write off mid-stream: its input never completed', () => {
    const all = frames('interrupt-sigint')
    const started = all.findLastIndex(
      (f) => f.type === 'stream_event' && f.event?.type === 'content_block_start' && f.event.content_block?.name === 'Write'
    )
    expect(started).toBeGreaterThan(0)
    const after = all.slice(started)
    const index = all[started].event?.index
    expect(after.some((f) => f.type === 'stream_event' && f.event?.type === 'content_block_stop' && f.event.index === index)).toBe(false)
    const streamed = after
      .filter((f) => f.type === 'stream_event' && f.event?.delta?.type === 'input_json_delta')
      .reduce((n, f) => n + (f.event?.delta?.partial_json?.length ?? 0), 0)
    expect(streamed).toBeGreaterThanOrEqual(20_000)
  })
})

describe('interrupt-inband: the turn is interrupted and the session carries on', () => {
  it('answers the interrupt, ends the turn in error, and then completes a later turn', () => {
    const all = frames('interrupt-inband')
    const rows = results('interrupt-inband')
    expect(all.some((f) => f.type === 'control_response')).toBe(true)
    expect(rows[1]).toMatchObject({ subtype: 'error_during_execution', is_error: true })
    expect(rows.at(-1)).toMatchObject({ subtype: 'success', is_error: false })
    expect(meta('interrupt-inband').turns.some((t) => t.control !== undefined)).toBe(true)
  })

  it('writes the document after the interrupt', () => {
    const write = mainThreadTools('interrupt-inband').find((t) => t.name === 'Write' && String(t.input.content ?? '').length > 30_000)
    expect(write).toBeDefined()
  })
})

describe('reviewer-gate-failure-induced: a failure while reviewers are running, labelled as induced', () => {
  it('ends in error after subagents were dispatched and before they reported', () => {
    const tools = mainThreadTools('reviewer-gate-failure-induced')
    expect(tools.filter((t) => t.name === 'Agent')).toHaveLength(2)
    const last = results('reviewer-gate-failure-induced').at(-1)
    expect(last).toMatchObject({ subtype: 'error_max_budget_usd', is_error: true })
  })

  it('says in its own metadata that the failure was not natural', () => {
    expect(meta('reviewer-gate-failure-induced').notes.join(' ')).toMatch(/induced, not natural/i)
    expect(meta('reviewer-gate-failure-induced').argv).toContain('--max-budget-usd')
  })
})

/**
 * Every recording replayed through the session bridge, frame by frame, with the
 * harness sending each recorded turn where the recorder did. A `result` row is
 * the end of *a* turn and not of the one sent, so the session is busy until the
 * CLI says nothing is running behind it (`system/background_tasks_changed`),
 * and it takes the turns nobody sent.
 */
describe('the corpus replayed through the session bridge', () => {
  type Replayed = {
    /** The frame index at which each `session:awaiting-turn` was emitted. */
    idleAt: number[]
    /** Whether the session was busy after each frame, by index. */
    busyAfter: boolean[]
    /** The persona's state after each `persona:state`, with the frame index it came at. */
    personaAt: { at: number; state: string }[]
    /** The sends the harness made: the frame count when each was made, and whether the session was idle then and took it. */
    sends: { afterLine: number; idle: boolean; accepted: boolean }[]
  }

  class Sender {
    sent: ContractEvent[] = []
    constructor(readonly id = 1) {}
    send(_channel: string, event: ContractEvent): void {
      this.sent.push(event)
    }
    isDestroyed(): boolean {
      return false
    }
    once(): void {}
  }

  async function replay(scenario: string): Promise<Replayed> {
    handlers.clear()
    const userData = mkdtempSync(join(tmpdir(), 'harness-replay-'))
    try {
      let feed: (frame: unknown) => void = () => {}
      let clock = 0
      registerSessionBridge({
        transcripts: createTranscriptRegistry({
          userDataPath: () => userData,
          schedule: () => () => {},
          log: () => {}
        }),
        projectPathFor: () => '/replay-project',
        now: () => (clock += 1),
        newSessionId: () => 's1',
        agentName: () => 'Mary',
        writeDiagnostic: () => {},
        spawn: (options) => {
          feed = options.onFrame
          return Promise.resolve({ ok: true, session: { write: () => Promise.resolve(true), kill: () => {} } })
        }
      })
      const sender = new Sender()
      const call = <T>(channel: string, ...args: unknown[]): T =>
        (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)
      await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, 'bmad-agent-analyst')

      const busy = (): boolean => {
        const reply = call<ConversationReply>(CONVERSATION_GET_CHANNEL)
        return reply.ok && reply.snapshot.busy.length > 0
      }
      // The first recorded turn is the activation, which the bridge's open already wrote.
      const turns = meta(scenario).turns.filter((turn) => turn.text !== undefined && turn.afterLine > 0)
      const all = frames(scenario)
      const out: Replayed = { idleAt: [], busyAfter: [], personaAt: [], sends: [] }
      let seen = 0
      /** What main has said since the last look, filed under the frame it was said at. */
      const collect = (at: number): void => {
        for (const event of sender.sent.slice(seen)) {
          if (event.name === 'session:awaiting-turn') out.idleAt.push(at)
          if (event.name === 'persona:state') out.personaAt.push({ at, state: event.payload.state })
        }
        seen = sender.sent.length
      }
      collect(-1)
      // One frame past the recording, so a send recorded after its last line is made too.
      all.push({ type: 'end-of-recording' })
      for (let at = 0; at < all.length; at += 1) {
        for (const turn of turns.filter((candidate) => candidate.afterLine === at)) {
          const idle = !busy()
          const reply = await call<Promise<{ ok: boolean }>>(TURN_SEND_CHANNEL, 's1', turn.text)
          out.sends.push({ afterLine: at, idle, accepted: reply.ok })
          collect(at)
        }
        feed(all[at])
        collect(at)
        out.busyAfter.push(busy())
      }
      out.busyAfter.pop()
      return out
    } finally {
      rmSync(userData, { recursive: true, force: true })
    }
  }

  /** The 0-based frame index of each main-thread `result`. */
  const resultIndexes = (scenario: string): number[] =>
    frames(scenario).flatMap((frame, at) => (frame.type === 'result' && !frame.parent_tool_use_id ? [at] : []))

  it.each(SCENARIOS)('%s: the session is idle at every recorded send, and each send is taken', async (scenario) => {
    const replayed = await replay(scenario)

    expect(replayed.sends.length).toBe(
      meta(scenario).turns.filter((turn) => turn.text !== undefined && turn.afterLine > 0).length
    )
    for (const send of replayed.sends) {
      expect(send, `${scenario} send after line ${send.afterLine}`).toMatchObject({ idle: true, accepted: true })
    }
  }, 120_000)

  it('fast-path-opus: 14 result rows for 3 sends, three awaiting-turns, at result rows 533, 25780 and 46799', async () => {
    const replayed = await replay('fast-path-opus')

    expect(resultIndexes('fast-path-opus')).toHaveLength(14)
    expect(replayed.idleAt).toEqual([533, 25780, 46799])
    // Busy from each send until the true end of the turn, with the persona working throughout.
    for (const [from, to] of [
      [535, 25780],
      [25782, 46799]
    ]) {
      for (let at = from; at < to; at += 1) {
        expect(replayed.busyAfter[at], `busy after frame ${at}`).toBe(true)
      }
    }
    expect(replayed.busyAfter[533]).toBe(false)
    expect(replayed.busyAfter[25780]).toBe(false)
    expect(replayed.busyAfter[46799]).toBe(false)
    // Working from the open, idle at each true end, and working again from each send, which is made before frame 535 and 25782 are fed.
    expect(replayed.personaAt).toEqual([
      { at: -1, state: 'work' },
      { at: 533, state: 'idle' },
      { at: 535, state: 'work' },
      { at: 25780, state: 'idle' },
      { at: 25782, state: 'work' },
      { at: 46799, state: 'idle' }
    ])
  }, 120_000)

  it('fast-path-sonnet: takes the turn nobody sent after an idle at row 1553, and is idle again by the send at 1639', async () => {
    const replayed = await replay('fast-path-sonnet')

    expect(replayed.idleAt.slice(0, 3)).toEqual([277, 1553, 1637])
    expect(replayed.busyAfter[1553]).toBe(false)
    expect(replayed.busyAfter[1556]).toBe(true)
    expect(replayed.busyAfter[1637]).toBe(false)
  }, 120_000)

  it.each(SCENARIOS)('%s: is idle after every awaiting-turn and busy after every frame that is not between a result and a send', async (scenario) => {
    const replayed = await replay(scenario)
    const idle = new Set(replayed.idleAt)

    expect(replayed.idleAt.length).toBeGreaterThanOrEqual(
      meta(scenario).turns.filter((turn) => turn.text !== undefined).length
    )
    for (const at of replayed.idleAt) {
      expect(replayed.busyAfter[at], `${scenario} frame ${at}`).toBe(false)
    }
    // Every result row that did not free the session left a background task live.
    for (const at of resultIndexes(scenario)) {
      if (!idle.has(at)) {
        expect(replayed.busyAfter[at], `${scenario} result ${at}`).toBe(true)
      }
    }
  }, 120_000)
})
