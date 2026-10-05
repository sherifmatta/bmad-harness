import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContractEvent, PersonaState } from '../src/shared/events'
import type { ArtifactObservation } from '../src/shared/rail'
import { SETTLE_MS } from '../src/main/fold/rail-rows'

/**
 * Story 3.13's beat, replayed: a persona that has finished a run reads `live`,
 * never `file changed`. Three recordings that write through `Write`, `Edit` and
 * Bash are dispatched as runs through the real session bridge, sharing one
 * window with the real rail bridge, whose watcher is a fake: the persona's own
 * file, `prd.md`, is observed at each tool call the main thread made before the
 * run's terminal event, and its settle flip lands inside the window after it.
 *
 * Time is a fake clock both bridges read, advanced by hand: the recording has
 * no gaps between frames at full rate, so a tool call's observation, the quiet
 * before it settles and the terminal event all sit where this test puts them.
 */

type Handler = (...args: never[]) => unknown
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: () => null },
  app: { getPath: () => '/unused' }
}))

const { createTranscriptRegistry } = await import('../src/main/projections/transcript')
const { MENU_DISPATCH_CHANNEL, SESSION_EVENT_CHANNEL, SESSION_OPEN_CHANNEL, registerSessionBridge } = await import(
  '../src/main/session-bridge'
)
const { RAIL_GET_CHANNEL, registerRailBridge } = await import('../src/main/rail-bridge')

type Frame = { type: string; parent_tool_use_id?: string | null; message?: { content?: unknown } }
type ToolUse = { type: string; name: string }

const RUNS = resolve(import.meta.dirname, '..', 'fixtures', 'runs')
const PM = 'bmad-agent-pm'
/** The persona's own file, as the rail names it: owned by pm from its class alone. */
const PRD = '_bmad/planning-artifacts/prd.md'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})
afterEach(() => {
  vi.useRealTimers()
})

type Replay = {
  /** Every `persona:state` the window was told for pm, in order. */
  states: PersonaState[]
  /** The tool calls the replay observed `prd.md` for, by tool. */
  observed: Record<string, number>
  /** Whether the run's terminal event was told. */
  ended: boolean
}

/**
 * Dispatch `scenario` as a run, observe `prd.md` at each Write, Edit and Bash call before the
 * terminal event, stop at that event, and let the last observation settle inside the window after it.
 */
async function replay(scenario: string, { lateWrite = false }: { lateWrite?: boolean } = {}): Promise<Replay> {
  handlers.clear()
  const meta = JSON.parse(readFileSync(join(RUNS, `${scenario}.meta.json`), 'utf8')) as {
    cwd: string
    turns: { text: string }[]
  }
  const frames = readFileSync(join(RUNS, `${scenario}.jsonl`), 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Frame)
  const userData = mkdtempSync(join(tmpdir(), 'harness-live-after-run-'))
  try {
    const told: ContractEvent[] = []
    const sender = {
      id: 1,
      send: (channel: string, event: ContractEvent) => {
        if (channel === SESSION_EVENT_CHANNEL) told.push(event)
      },
      isDestroyed: () => false,
      once: () => {}
    }
    let feed: (frame: unknown) => void = () => {}
    let emit: (observation: ArtifactObservation) => void = () => {}
    let finishScan: () => void = () => {}

    registerSessionBridge({
      transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
      projectPathFor: () => meta.cwd,
      newSessionId: () => 's1',
      newRunId: () => 'run-1',
      agentName: () => 'John',
      writeDiagnostic: () => {},
      menuEntryFor: (_window, _agent, code) =>
        code === 'GO' ? { code: 'GO', description: 'Run it', action: { kind: 'prompt', prompt: meta.turns[0].text } } : undefined,
      readText: () => Promise.resolve(undefined),
      schedule: () => () => {},
      spawn: (options) => {
        feed = options.onFrame
        return Promise.resolve({ ok: true, session: { write: () => Promise.resolve(true), interrupt: () => Promise.resolve(true), kill: () => {} } })
      }
    })
    registerRailBridge({
      projectPathFor: () => meta.cwd,
      writeDiagnostic: () => {},
      watch: ({ onObservation }) => {
        emit = onObservation
        const ready = new Promise<void>((resolveReady) => {
          finishScan = () => {
            onObservation({ type: 'artifact:found', path: PRD, size: 1, mtimeMs: 1 })
            resolveReady()
          }
        })
        return { ready, close: () => Promise.resolve() }
      }
    })
    const call = <T>(channel: string, ...args: unknown[]): T => (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)

    // The window as it opens: the rail's first snapshot is the baseline, then a persona's session.
    const railReady = call<Promise<unknown>>(RAIL_GET_CHANNEL)
    finishScan()
    await railReady
    await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, PM)
    feed({ type: 'result', subtype: 'success', is_error: false })
    const dispatched = await call<Promise<{ ok: boolean }>>(MENU_DISPATCH_CHANNEL, 's1', 'GO')
    expect(dispatched.ok).toBe(true)

    const hasEnded = (): boolean => told.some((event) => event.name === 'run:finished' || event.name === 'run:failed' || event.name === 'run:stopped')
    const observed: Record<string, number> = {}
    let calls = 0
    for (const frame of frames) {
      if (!hasEnded() && frame.type === 'assistant' && !frame.parent_tool_use_id) {
        for (const block of (frame.message?.content ?? []) as ToolUse[]) {
          if (block.type !== 'tool_use' || !['Write', 'Edit', 'Bash'].includes(block.name)) continue
          // Some calls follow the last by under the quiet window, some by well over it.
          vi.advanceTimersByTime(calls % 3 === 0 ? SETTLE_MS + 100 : 100)
          calls += 1
          observed[block.name] = (observed[block.name] ?? 0) + 1
          emit({ type: 'artifact:written', path: PRD, size: calls, mtimeMs: Date.now() })
        }
      }
      feed(frame)
      // The run is over with its turn. What the recording holds beyond is turns nobody dispatched here.
      if (hasEnded()) break
    }
    // The watcher's last flip lands up to one quiet window after the last observation.
    vi.advanceTimersByTime(SETTLE_MS)
    if (lateWrite) {
      vi.advanceTimersByTime(1_000)
      emit({ type: 'artifact:written', path: PRD, size: 99, mtimeMs: Date.now() })
    }

    const states = told.flatMap((event) =>
      event.name === 'persona:state' && event.payload.agentId === PM ? [event.payload.state] : []
    )
    return { states, observed, ended: hasEnded() }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
}

describe('a finished run leaves its persona live', () => {
  const cases: [string, string[]][] = [
    ['multi-file-sonnet', ['Write', 'Edit']],
    ['fast-path-sonnet', ['Bash']],
    ['fast-path-opus', ['Bash']]
  ]

  for (const [scenario, tools] of cases) {
    it(`${scenario}: reads work, then live, and never note`, async () => {
      const result = await replay(scenario)

      expect(result.ended).toBe(true)
      for (const tool of tools) expect(result.observed[tool], tool).toBeGreaterThan(0)
      expect(result.states).toContain('work')
      // The run reads `work` first and `live` after it: the last `live` comes after the first `work`.
      expect(result.states.indexOf('work')).toBeLessThan(result.states.lastIndexOf('live'))
      expect(new Set(result.states).has('note')).toBe(false)
      expect(result.states.every((state) => ['work', 'live', 'idle'].includes(state))).toBe(true)
      expect(result.states.at(-1)).toBe('live')
    }, 60_000)
  }

  it('still raises a note for a write made well after the window closes', async () => {
    const result = await replay('multi-file-sonnet', { lateWrite: true })

    expect(result.states.at(-1)).toBe('note')
    expect(result.states.filter((state) => state === 'note')).toHaveLength(1)
  }, 60_000)
})
