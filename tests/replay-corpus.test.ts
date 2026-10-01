import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The replay corpus is a build dependency, so it is asserted rather than
 * trusted: a fixture that stopped being parseable, or a scenario that quietly
 * lost the shape it is named for, fails here instead of surfacing as a
 * mysteriously green interpreter test later. These read the frames raw and
 * route none of them; interpreting a frame is the fold's job.
 */

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
