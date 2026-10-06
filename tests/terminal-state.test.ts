import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ContractEvent } from '../src/shared/events'
import { readFrame } from '../src/main/fold/frame'
import type { FrameInput } from '../src/main/fold/frame'
import { foldTurn, initialTurn } from '../src/main/fold/turn-end'
import type { TurnState } from '../src/main/fold/turn-end'
import { initialRouteState, routeFrame } from '../src/main/fold/route-frame'
import type { RouteState } from '../src/main/fold/route-frame'
import { LINES } from '../src/main/session-voice'

/**
 * Story 3.8's invariants, pinned so they can fail (FR87-FR90).
 *
 * Most of what the story asks for was built before it: the terminal state is
 * read from the per-turn `result` by `is_error` and `subtype`, a write counts on
 * its `tool_result`, one `doc:committed` per call carries that call's id, and the
 * harness keeps its own register when a session ends. Built by construction is
 * not the same as pinned, and each of these can regress silently, so each is
 * asserted here: as a sweep over the sources where a rule is "never named", and
 * as a fold over frames where it is a behaviour.
 *
 * `tests/terminal-replay.test.ts` drives the three recordings of a run that
 * ended early all the way through the bridge; these are the rules those
 * recordings happen to obey, stated so a later change cannot quietly break them.
 */

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  })
}

/** Every non-test source under `src/`, repo-relative. Comments are kept: a rule that names nothing names it nowhere. */
const code = new Map<string, string>(
  filesUnder(SRC)
    .map((path) => relative(ROOT, path))
    .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.endsWith('.d.ts'))
    .map((path) => [path, readFileSync(join(ROOT, path), 'utf8')])
)

/** Every file whose text matches, named so a failure says where. */
function offenders(pattern: RegExp, within: (path: string) => boolean = () => true): string[] {
  return [...code].filter(([path, text]) => within(path) && pattern.test(text)).map(([path]) => path)
}

const underMain = (path: string): boolean => path.startsWith('src/main/')
const underFold = (path: string): boolean => path.startsWith('src/main/fold/')

describe('the terminal state is read from the result row and nothing else (AD-11)', () => {
  it('reads sources at all, so a sweep that finds nothing has looked at something', () => {
    expect(code.size).toBeGreaterThan(50)
    expect([...code].every(([, text]) => text.length > 0)).toBe(true)
  })

  it('names `stop_reason` nowhere in src: the recordings carry one, and nothing reads it', () => {
    expect(offenders(/stop_reason|stopReason/)).toEqual([])
  })

  it('ends no run and no turn on a process exit code: the fold is handed no code, and nothing under main reads one', () => {
    // The fold that decides a turn's end sees only narrowed frames; an exit code or signal is not among them.
    expect(offenders(/\bexitCode\b|\bexit_code\b|\bSIGINT\b|\bSIGTERM\b|\bkillSignal\b|process\.exit/, underFold)).toEqual([])
    // The one `onExit` main hands the process takes no argument at all: there is no code to act on.
    expect(code.get('src/main/sources/session/session-process.ts')).toMatch(/onExit:\s*\(\)\s*=>\s*void/)
    expect(code.get('src/main/session-registry.ts')).toMatch(/onExit:\s*\(\)\s*=>\s*\{/)
    expect(offenders(/onExit:\s*\((?!\))/, underMain)).toEqual([])
  })

  it('ends a turn from a `result` row and from no other kind of frame', () => {
    const inputs: FrameInput[] = [
      { kind: 'message-start', messageId: 'm1' },
      { kind: 'text-delta', index: 0, text: 'words' },
      { kind: 'background-tasks', taskIds: [] },
      { kind: 'tool-results', results: [{ callId: 'c1', failed: true }] }
    ]
    for (const input of inputs) {
      expect(foldTurn(initialTurn, input).signal?.kind, input.kind).not.toBe('ended')
    }
    expect(foldTurn(initialTurn, { kind: 'turn-result', failed: true, subtype: 'anything' }).signal).toEqual({
      kind: 'ended',
      failed: true,
      subtype: 'anything'
    })
  })

  it('narrows a `result` to `is_error` and `subtype`, carrying no other field of the row', () => {
    const row = {
      type: 'result',
      subtype: 'error_max_budget_usd',
      is_error: true,
      stop_reason: null,
      errors: ['Reached maximum budget ($1)'],
      total_cost_usd: 1.0595736,
      duration_api_ms: 487_436
    }
    expect(readFrame(row)).toEqual({ kind: 'turn-result', failed: true, subtype: 'error_max_budget_usd' })
    // The same row with a different `stop_reason` narrows to exactly the same input.
    expect(readFrame({ ...row, stop_reason: 'tool_use' })).toEqual(readFrame(row))
    expect(readFrame({ ...row, stop_reason: 'end_turn', errors: [] })).toEqual(readFrame(row))
  })
})

describe('every error subtype travels one path', () => {
  const SUBTYPES = ['error_during_execution', 'error_max_budget_usd', 'error_something_new_the_cli_invents']

  it('names no subtype anywhere in src: none can be special-cased without this failing', () => {
    expect(offenders(/error_during_execution|error_max_budget_usd|error_during|max_budget/)).toEqual([])
  })

  it('ends the turn the same way for each, carrying the CLI’s own word and nothing more', () => {
    for (const subtype of SUBTYPES) {
      const row = { type: 'result', subtype, is_error: true }
      expect(foldTurn(initialTurn, readFrame(row)), subtype).toEqual({
        state: { busy: false, tasks: new Set() },
        signal: { kind: 'ended', failed: true, subtype }
      })
      expect(LINES.failed(subtype), subtype).toBe(`turn failed · ${subtype}`)
    }
    // A subtype that is not the plain word the CLI always writes is dropped, not shown.
    expect(LINES.failed(undefined)).toBe('turn failed')
    expect(LINES.failed('Error: something <script>')).toBe('turn failed')
  })

  it('leaves the session busy for each when background tasks are live, and ends it once the set is empty', () => {
    const live: TurnState = { busy: true, tasks: new Set(['task-1']) }
    for (const subtype of SUBTYPES) {
      const pending = foldTurn(live, readFrame({ type: 'result', subtype, is_error: true }))
      expect(pending.signal, subtype).toEqual({ kind: 'failed-while-pending', subtype })
      expect(pending.state.busy, subtype).toBe(true)

      const emptied = foldTurn(pending.state, readFrame({ type: 'system', subtype: 'background_tasks_changed', tasks: [] }))
      const ended = foldTurn(emptied.state, readFrame({ type: 'result', subtype, is_error: true }))
      expect(ended.signal, subtype).toEqual({ kind: 'ended', failed: true, subtype })
    }
  })

  it('ends no turn on a successful result while the gate’s subagents are still live', () => {
    const live: TurnState = { busy: true, tasks: new Set(['t1', 't2']) }
    const step = foldTurn(live, readFrame({ type: 'result', subtype: 'success', is_error: false }))

    expect(step.signal).toBeUndefined()
    expect(step.state.busy).toBe(true)
  })
})

describe('a write counts on its `tool_result`', () => {
  const ROOT_PATH = '/work/project'
  const ctx = { sessionId: 's1', runId: 'run-1', projectRoot: ROOT_PATH, now: 10 }
  const stream = (event: unknown): unknown => ({ type: 'stream_event', parent_tool_use_id: null, event })

  /** The frames one `Write` streams, whole: its block, its input, and its close. */
  const writeFrames = (index: number, callId: string, path: string, content: string): unknown[] => {
    const json = JSON.stringify({ file_path: `${ROOT_PATH}/${path}`, content })
    return [
      stream({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: callId, name: 'Write', input: {} } }),
      stream({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: json } }),
      stream({ type: 'content_block_stop', index })
    ]
  }
  const resultsFrame = (results: { id: string; failed?: boolean }[]): unknown => ({
    type: 'user',
    parent_tool_use_id: null,
    message: {
      role: 'user',
      content: results.map(({ id, failed }) => ({ type: 'tool_result', tool_use_id: id, is_error: failed === true, content: 'x' }))
    }
  })

  /** Route every frame from a fresh state, returning what it told. */
  function routed(frames: readonly unknown[], from: RouteState = initialRouteState): { state: RouteState; events: ContractEvent[] } {
    let state = from
    const events: ContractEvent[] = []
    for (const frame of frames) {
      const step = routeFrame(state, frame, ctx)
      state = step.state
      events.push(...step.events)
    }
    return { state, events }
  }

  const committed = (events: readonly ContractEvent[]): Extract<ContractEvent, { name: 'doc:committed' }>['payload'][] =>
    events.flatMap((event) => (event.name === 'doc:committed' ? [event.payload] : []))

  it('commits exactly one per call, carrying that call’s id, when a frame answers two writes at once', () => {
    const { events } = routed([
      stream({ type: 'message_start', message: { id: 'm1' } }),
      ...writeFrames(1, 'c1', '_bmad/prd.md', '## Vision\nA.\n'),
      ...writeFrames(2, 'c2', '_bmad/addendum.md', '## Notes\nB.\n'),
      resultsFrame([{ id: 'c1' }, { id: 'c2' }])
    ])

    const commits = committed(events)
    expect(commits.map((payload) => payload.callId)).toEqual(['c1', 'c2'])
    expect(commits).toHaveLength(2)
    expect(commits[0]).toMatchObject({ ok: true, path: '_bmad/prd.md', sections: ['Vision'] })
    expect(commits[1]).toMatchObject({ ok: true, path: '_bmad/addendum.md', sections: ['Notes'] })
  })

  it('commits nothing a second time: the same result told twice answers no pending write', () => {
    const first = routed([
      stream({ type: 'message_start', message: { id: 'm1' } }),
      ...writeFrames(1, 'c1', '_bmad/prd.md', '## Vision\nA.\n'),
      resultsFrame([{ id: 'c1' }])
    ])
    expect(committed(first.events)).toHaveLength(1)

    const again = routed([resultsFrame([{ id: 'c1' }])], first.state)

    expect(again.events).toEqual([])
  })

  it('commits a rejected write as `ok: false`, naming the call, with no sections at all', () => {
    const { events } = routed([
      stream({ type: 'message_start', message: { id: 'm1' } }),
      ...writeFrames(1, 'c1', '_bmad/prd.md', '## Vision\nA.\n## Goals\nB.\n'),
      resultsFrame([{ id: 'c1', failed: true }])
    ])

    const commits = committed(events)
    expect(commits).toHaveLength(1)
    expect(commits[0]).toEqual({
      ok: false,
      runId: 'run-1',
      sessionId: 's1',
      callId: 'c1',
      path: '_bmad/prd.md',
      error: { code: 'doc/write-rejected', message: 'doc · the write was rejected' },
      at: 10
    })
    // Nothing un-renders: the rejected batch committed no names, so none was ever taken out of the foot.
    expect(Object.keys(commits[0])).not.toContain('sections')
    expect(Object.keys(commits[0])).not.toContain('text')
  })

  it('commits one `ok: false` and one `ok: true` when a frame holds a rejected call beside an accepted one', () => {
    const { events } = routed([
      stream({ type: 'message_start', message: { id: 'm1' } }),
      ...writeFrames(1, 'c1', '_bmad/prd.md', '## Vision\nA.\n'),
      ...writeFrames(2, 'c2', '_bmad/addendum.md', '## Notes\nB.\n'),
      resultsFrame([{ id: 'c1', failed: true }, { id: 'c2' }])
    ])

    expect(committed(events).map((payload) => [payload.callId, payload.ok])).toEqual([
      ['c1', false],
      ['c2', true]
    ])
  })

  it('commits nothing for a rejected call that is not a tracked document write — the corpus has two', () => {
    const RUNS = resolve(ROOT, 'fixtures', 'runs')
    const lineOf = (scenario: string, n: number): unknown =>
      JSON.parse(
        readFileSync(join(RUNS, `${scenario}.jsonl`), 'utf8')
          .split('\n')
          .filter((line) => line.length > 0)[n - 1]
      )

    for (const [scenario, line] of [
      ['interrupt-sigint', 199],
      ['reviewer-gate-failure-induced', 107]
    ] as const) {
      const frame = lineOf(scenario, line) as {
        type: string
        message?: { content?: { type: string; is_error?: boolean; tool_use_id?: string }[] }
      }
      // The recording really does hold a failed tool result there, for a call of its own.
      expect(frame.type, scenario).toBe('user')
      const rejected = frame.message?.content?.find((block) => block.type === 'tool_result' && block.is_error === true)
      expect(rejected, scenario).toBeDefined()
      expect(rejected?.tool_use_id, scenario).not.toBe('c1')

      // A real tracked `Write` is pending for another call while the frame arrives.
      const pending = routed([
        stream({ type: 'message_start', message: { id: 'm1' } }),
        ...writeFrames(1, 'c1', '_bmad/prd.md', '## Vision\nA.\n')
      ])
      expect(Object.keys(pending.state.writes), scenario).toEqual(['c1'])

      const after = routed([frame], pending.state)

      // The rejected call is not a document write of this run: nothing commits, and the real write is still pending.
      expect(after.events, scenario).toEqual([])
      expect(Object.keys(after.state.writes), scenario).toEqual(['c1'])
      // And it commits when its own result comes back, as it would have without the frame between.
      expect(committed(routed([resultsFrame([{ id: 'c1' }])], after.state).events), scenario).toHaveLength(1)
    }
  })
})

describe('the harness keeps its own register when a session ends with the run', () => {
  it('builds a persona’s voice in one place, from a text delta and nothing else', () => {
    // Built in one place: every other mention under main reads an event that already exists.
    expect(offenders(/name:\s*['"`]persona:said['"`],/, underMain).sort()).toEqual(['src/main/fold/route-frame.ts'])
    const route = code.get('src/main/fold/route-frame.ts') ?? ''
    // The one builder, declared once, reached from the branch that reads a text block's delta.
    expect(route.match(/function personaSaid\b/g)).toHaveLength(1)
    expect(route).toMatch(/case 'text-delta':[\s\S]*?personaSaid\(state, input\.text, ctx\)/)
  })

  it('says the end of a session in the harness’s own line, which no persona could have written', () => {
    expect(LINES.exited).toBe('session ended · the process exited')
    expect(LINES.exited).toMatch(/^[a-z]/)
  })

  it('synthesises no persona speech from a terminal frame: a `result` and an exit route no text', () => {
    const ctx = { sessionId: 's1', runId: 'run-1', projectRoot: '/work/project', now: 10 }
    for (const frame of [
      { type: 'result', subtype: 'error_during_execution', is_error: true },
      { type: 'result', subtype: 'success', is_error: false },
      { type: 'system', subtype: 'task_summary' }
    ]) {
      expect(routeFrame(initialRouteState, frame, ctx).events).toEqual([])
    }
  })
})
