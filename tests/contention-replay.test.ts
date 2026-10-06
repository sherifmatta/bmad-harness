import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContractEvent } from '../src/shared/events'
import type { ArtifactObservation, RailRow, RailSnapshot } from '../src/shared/rail'
import { SETTLE_MS } from '../src/main/fold/rail-rows'
import { projectRelative } from '../src/main/fold/route-frame'
import { createRailProjection } from '../src/main/projections/rail'

/**
 * Story 3.9's beat, replayed: two personas' sessions in one window, each
 * dispatching `multi-file-sonnet` (an addendum, a pre-review copy and a larger
 * PRD, each by one `Write`, then the PRD revised by `Edit`s), the second one
 * file behind the first, through the real session bridge and the real rail
 * bridge, whose watcher is a fake. Both sessions write the same three paths, so
 * the rail row of each is contended exactly while both runs that have not ended
 * show it, and the first run to end hands the row back to the other.
 *
 * The harness reports and does nothing else: every write of both runs is
 * committed, nothing is written to either session but the turn it was sent,
 * nothing is interrupted or killed, and the rows' disk state is what a rail
 * projection that only ever heard the watcher says at every step.
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
const { RAIL_CHANGED_CHANNEL, RAIL_GET_CHANNEL, registerRailBridge } = await import('../src/main/rail-bridge')

type ToolUse = { type: string; id: string; name: string; input: Record<string, unknown> }
type Frame = {
  type: string
  parent_tool_use_id?: string | null
  message?: { content?: unknown }
}

const RUNS = resolve(import.meta.dirname, '..', 'fixtures', 'runs')
const PM = 'bmad-agent-pm'
const ANALYST = 'bmad-agent-analyst'
const meta = JSON.parse(readFileSync(join(RUNS, 'multi-file-sonnet.meta.json'), 'utf8')) as {
  cwd: string
  turns: { text: string }[]
}
const frames = readFileSync(join(RUNS, 'multi-file-sonnet.jsonl'), 'utf8')
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as Frame)
const tools: ToolUse[] = frames.flatMap((frame) =>
  frame.type === 'assistant' && !frame.parent_tool_use_id
    ? ((frame.message?.content ?? []) as ToolUse[]).filter((block) => block.type === 'tool_use')
    : []
)
const relative = (path: unknown): string => projectRelative(String(path), meta.cwd) ?? ''
const writes = tools.filter((tool) => tool.name === 'Write')
const ADDENDUM = relative(writes[0].input.file_path)
const PRE_REVIEW = relative(writes[1].input.file_path)
const PRD = relative(writes[2].input.file_path)
const PATHS = [ADDENDUM, PRE_REVIEW, PRD]
/** Every call of the recording that changes a file: three `Write`s and the `Edit`s. */
const changes = tools.filter((tool) => tool.name === 'Write' || tool.name === 'Edit')

/** The index of the frame that brings a call's result back. */
const resultOf = (tool: ToolUse): number =>
  frames.findIndex(
    (frame) =>
      frame.type === 'user' &&
      ((frame.message?.content ?? []) as { type: string; tool_use_id?: string }[]).some(
        (block) => block.type === 'tool_result' && block.tool_use_id === tool.id
      )
  )
const cuts = writes.map(resultOf)
/** The recording in four runs of frames, each ending where a `Write` comes back, the last holding the `Edit`s. */
const parts = [
  frames.slice(0, cuts[0] + 1),
  frames.slice(cuts[0] + 1, cuts[1] + 1),
  frames.slice(cuts[1] + 1, cuts[2] + 1),
  frames.slice(cuts[2] + 1)
]

/** The second session's copy of the recording: its own call ids, so no two sessions share one. */
const SUFFIX = '-mary'
const second = (frame: Frame): Frame => {
  let text = JSON.stringify(frame)
  for (const tool of tools) text = text.replaceAll(tool.id, `${tool.id}${SUFFIX}`)
  return JSON.parse(text) as Frame
}
const secondParts = parts.map((part) => part.map(second))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})
afterEach(() => {
  vi.useRealTimers()
})

/** How long a recorded frame is taken to take: the CLI streams a piece every few tens of milliseconds. */
const FRAME_MS = 20
const RUN_OF = [PM, ANALYST]
const ENDS = new Set(['run:finished', 'run:failed', 'run:stopped'])

/** The disk fields of a row, and nothing the stream or the class adds. */
const disk = (row: RailRow): { path: string; state: string; savedAt?: number } =>
  row.state === 'saved' ? { path: row.path, state: row.state, savedAt: row.savedAt } : { path: row.path, state: row.state }

type Step = {
  stage: string
  rows: RailRow[]
  /** What a rail projection told only what the watcher saw says, as disk fields. */
  watcher: ReturnType<typeof disk>[]
  /** How many events main had told the window. */
  told: number
}

type Replay = {
  steps: Step[]
  told: ContractEvent[]
  pushed: RailSnapshot[]
  written: string[][]
  interrupted: number[]
  killed: number[]
  dispatched: { ok: boolean }[]
  rowsAfterRuns: RailRow[]
  rowsAfterSettle: RailRow[]
  projectTouched: boolean
}

async function replay(): Promise<Replay> {
  handlers.clear()
  const userData = mkdtempSync(join(tmpdir(), 'harness-contention-'))
  const projectExisted = existsSync(meta.cwd)
  try {
    const told: ContractEvent[] = []
    const pushed: RailSnapshot[] = []
    const sender = {
      id: 1,
      send: (channel: string, payload: unknown) => {
        if (channel === SESSION_EVENT_CHANNEL) told.push(payload as ContractEvent)
        if (channel === RAIL_CHANGED_CHANNEL) pushed.push(payload as RailSnapshot)
      },
      isDestroyed: () => false,
      once: () => {}
    }
    const feeds: ((frame: unknown) => void)[] = []
    const written: string[][] = []
    const interrupted: number[] = []
    const killed: number[] = []
    let emit: (observation: ArtifactObservation) => void = () => {}
    let finishScan: () => void = () => {}
    let sessions = 0
    let runs = 0

    registerSessionBridge({
      transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
      projectPathFor: () => meta.cwd,
      newSessionId: () => `s${(sessions += 1)}`,
      newRunId: () => `run-${(runs += 1)}`,
      agentName: (_window, agentId) => (agentId === PM ? 'John' : 'Mary'),
      writeDiagnostic: () => {},
      menuEntryFor: (_window, _agent, code) =>
        code === 'GO' ? { code: 'GO', description: 'Run it', action: { kind: 'prompt', prompt: meta.turns[0].text } } : undefined,
      readText: () => Promise.resolve(undefined),
      // The prose a run holds is released on this timer, so a piece of text reaches the window as it would live.
      schedule: (run, ms) => {
        const timer = setTimeout(run, ms)
        return () => clearTimeout(timer)
      },
      spawn: (options) => {
        const at = feeds.length
        feeds.push(options.onFrame)
        written.push([])
        interrupted.push(0)
        killed.push(0)
        return Promise.resolve({
          ok: true,
          session: {
            write: (text: string) => {
              written[at].push(text)
              return Promise.resolve(true)
            },
            interrupt: () => {
              interrupted[at] += 1
              return Promise.resolve(true)
            },
            kill: () => {
              killed[at] += 1
            }
          }
        })
      }
    })
    registerRailBridge({
      projectPathFor: () => meta.cwd,
      writeDiagnostic: () => {},
      watch: ({ onObservation }) => {
        emit = onObservation
        const ready = new Promise<void>((resolveReady) => {
          finishScan = resolveReady
        })
        return { ready, close: () => Promise.resolve() }
      }
    })
    const call = <T>(channel: string, ...args: unknown[]): T =>
      (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)

    const railReady = call<Promise<unknown>>(RAIL_GET_CHANNEL)
    finishScan()
    await railReady
    // A second rail that only ever hears the watcher: the disk state the first must never differ from.
    const control = createRailProjection({ onChange: () => {}, now: () => Date.now() })
    control.ready()

    // Two personas' sessions, both through their activation turn.
    for (const agent of RUN_OF) await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, agent)
    for (const feed of feeds) feed({ type: 'result', subtype: 'success', is_error: false })
    const baseline = ((await call<Promise<{ snapshot: RailSnapshot }>>(RAIL_GET_CHANNEL)).snapshot).rows
    pushed.length = 0

    const steps: Step[] = []
    const callsById = new Map<string, ToolUse>(
      changes.flatMap((tool) => [
        [tool.id, tool],
        [`${tool.id}${SUFFIX}`, tool]
      ])
    )
    let observed = 0
    let stage = ''
    const current = (): RailRow[] => pushed.at(-1)?.rows ?? baseline
    const record = (): void =>
      void steps.push({ stage, rows: current(), watcher: control.snapshot().rows.map(disk), told: told.length })

    /** One recorded frame of one session; a write that comes back is seen by the watcher a moment later. */
    const play = (at: number, frame: Frame): void => {
      feeds[at](frame)
      // The stream is a frame every few milliseconds, as the CLI's is.
      vi.advanceTimersByTime(FRAME_MS)
      record()
      const results = frame.type === 'user' ? ((frame.message?.content ?? []) as { type: string; tool_use_id?: string }[]) : []
      for (const block of results) {
        const tool = block.type === 'tool_result' ? callsById.get(block.tool_use_id ?? '') : undefined
        if (tool === undefined) continue
        vi.advanceTimersByTime(50)
        observed += 1
        const observation: ArtifactObservation = {
          type: 'artifact:written',
          path: relative(tool.input.file_path),
          size: observed,
          mtimeMs: Date.now()
        }
        emit(observation)
        control.observe(observation)
        record()
      }
    }
    /** Two runs of frames played together, one frame of each in turn: neither waits for the other. */
    const together = (first: Frame[], other: Frame[]): void => {
      for (let i = 0; i < Math.max(first.length, other.length); i += 1) {
        if (i < first.length) play(0, first[i])
        if (i < other.length) play(1, other[i])
      }
    }
    const dispatch = async (sessionId: string): Promise<{ ok: boolean }> =>
      call<Promise<{ ok: boolean }>>(MENU_DISPATCH_CHANNEL, sessionId, 'GO')

    const dispatched: { ok: boolean }[] = []
    // John starts and writes the addendum alone.
    dispatched.push(await dispatch('s1'))
    stage = 'john alone'
    for (const frame of parts[0]) play(0, frame)
    // Mary starts a file behind him, while his run is still in flight.
    dispatched.push(await dispatch('s2'))
    stage = 'mary one file behind'
    together(parts[1], secondParts[0])
    stage = 'mary two files behind'
    together(parts[2], secondParts[1])
    stage = 'john revises while mary writes the PRD'
    together(parts[3], secondParts[2])
    stage = 'mary alone'
    for (const frame of secondParts[3]) play(1, frame)

    const rowsAfterRuns = current()
    vi.advanceTimersByTime(SETTLE_MS)
    return {
      steps,
      told,
      pushed,
      written,
      interrupted,
      killed,
      dispatched,
      rowsAfterRuns,
      rowsAfterSettle: current(),
      projectTouched: existsSync(meta.cwd) !== projectExisted
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
}

const rowOf = (rows: RailRow[], path: string): RailRow | undefined => rows.find((row) => row.path === path)
const textOf = (rows: RailRow[], path: string): string | undefined => rowOf(rows, path)?.annotation?.text

/**
 * Which runs, of those that had not ended, had written each path, as the first
 * `told` events of the window say it: read from the events, not the fold under test.
 */
function writersAt(told: ContractEvent[], count: number): Map<string, string[]> {
  const agents = new Map<string, string>()
  const ended = new Set<string>()
  const holding = new Map<string, Set<string>>()
  for (const event of told.slice(0, count)) {
    if (event.name === 'run:started') agents.set(event.payload.runId, event.payload.agentId ?? '')
    else if (ENDS.has(event.name) && 'runId' in event.payload) ended.add(event.payload.runId)
    else if (event.name === 'doc:prose' && event.payload.text !== '') {
      holding.set(event.payload.path, (holding.get(event.payload.path) ?? new Set()).add(event.payload.runId))
    }
  }
  const out = new Map<string, string[]>()
  for (const [path, runIds] of holding) {
    const live = [...agents.keys()].filter((runId) => runIds.has(runId) && !ended.has(runId))
    if (live.length > 0) out.set(path, live.map((runId) => agents.get(runId) ?? ''))
  }
  return out
}

describe('two personas writing the same files, replayed through the session and rail bridges', () => {
  it('is the recording it is named for, played by two sessions of two personas at once', async () => {
    expect(PATHS).toEqual([
      '_bmad/prds/tidewatch/addendum.md',
      '_bmad/prds/tidewatch/prd.pre-review.md',
      '_bmad/prds/tidewatch/prd.md'
    ])
    expect(changes.length).toBeGreaterThanOrEqual(5)
    expect(parts.every((part) => part.length > 0)).toBe(true)

    const { dispatched, told } = await replay()

    // The second run started while the first was still in flight, and neither start was refused.
    expect(dispatched.map(({ ok }) => ok)).toEqual([true, true])
    const started = told.flatMap((event) => (event.name === 'run:started' ? [[event.payload.runId, event.payload.agentId]] : []))
    expect(started).toEqual([
      ['run-1', PM],
      ['run-2', ANALYST]
    ])
    // Both runs ran to their own end, the first before the second.
    const ends = told.flatMap((event) => (event.name === 'run:finished' ? [event.payload.runId] : []))
    expect(ends).toEqual(['run-1', 'run-2'])
  })

  it('reads `contention` and both owners, in start order, exactly while both runs that have not ended have written the file', async () => {
    const { steps, told } = await replay()
    let contended = 0
    let single = 0

    for (const step of steps) {
      const writers = writersAt(told, step.told)
      for (const path of PATHS) {
        const row = rowOf(step.rows, path)
        // A row exists only once the watcher has seen the file: until then nothing is drawn, whoever is writing.
        if (row === undefined) continue
        const who = writers.get(path) ?? []
        if (row.annotation === undefined) {
          // A row the watcher made carries the stream's words the moment a run holds the file, and no word once none does.
          expect(who, `${step.stage}: ${path}`).toEqual([])
          continue
        }
        if (who.length >= 2) {
          expect(row.annotation, `${step.stage}: ${path}`).toEqual({ text: 'contention', owners: [{ agentId: PM }, { agentId: ANALYST }] })
          expect(Object.keys(row.annotation)).not.toContain('owner')
          contended += 1
        } else {
          // One writer: the annotation of a single run, under that run's persona.
          expect(who, `${step.stage}: ${path}`).toHaveLength(1)
          expect(row.annotation.text, `${step.stage}: ${path}`).toMatch(/^(?:writing|revising)(?: · §\d+ .+)?$/)
          expect(row.annotation.owner, `${step.stage}: ${path}`).toEqual({ agentId: who[0] })
          expect(Object.keys(row.annotation)).not.toContain('owners')
          single += 1
        }
      }
    }
    expect(contended).toBeGreaterThan(0)
    expect(single).toBeGreaterThan(0)
    // Every file was contended at some step, and read as one run's at another.
    for (const path of PATHS) {
      expect(steps.some((step) => textOf(step.rows, path) === 'contention'), path).toBe(true)
      expect(steps.some((step) => /^(?:writing|revising)/.test(textOf(step.rows, path) ?? '')), path).toBe(true)
    }
  })

  it('contends only the files both write: the one file of the second run, while the first writes the next', async () => {
    const { steps } = await replay()

    // John writes the next file while Mary is on the addendum: only the addendum is contended.
    const severalAtOnce = steps.find(
      (step) =>
        textOf(step.rows, ADDENDUM) === 'contention' &&
        /^writing/.test(textOf(step.rows, PRE_REVIEW) ?? '') &&
        rowOf(step.rows, PRE_REVIEW)?.annotation?.owner?.agentId === PM
    )
    expect(severalAtOnce).toBeDefined()
    // The file only John has written is never contended before Mary writes it.
    const johnOnly = steps.filter((step) => step.stage === 'john alone' || step.stage === 'mary one file behind')
    for (const step of johnOnly) expect(textOf(step.rows, PRD), step.stage).not.toBe('contention')

    // While Mary is two files behind the PRD is John's alone, and the other two files are contended.
    const prdAlone = steps.find(
      (step) =>
        step.stage === 'mary two files behind' &&
        /^writing · §/.test(textOf(step.rows, PRD) ?? '') &&
        textOf(step.rows, ADDENDUM) === 'contention' &&
        textOf(step.rows, PRE_REVIEW) === 'contention'
    )
    expect(prdAlone).toBeDefined()
    expect(rowOf(prdAlone?.rows ?? [], PRD)?.annotation?.owner).toEqual({ agentId: PM })
  })

  it('hands every row back to the run still writing when the first run ends, and never says `stopped`', async () => {
    const { steps, told } = await replay()
    const firstEnd = told.findIndex((event) => event.name === 'run:finished' && event.payload.runId === 'run-1')
    expect(firstEnd).toBeGreaterThan(-1)

    // The row the first end leaves contended is read in the step after it: the first run's words are gone.
    const after = steps.filter((step) => step.told > firstEnd && step.stage !== 'mary alone')
    expect(after.length).toBeGreaterThan(0)
    const first = after[0]
    for (const path of PATHS) {
      const row = rowOf(first.rows, path)
      if (row?.annotation === undefined) continue
      expect(row.annotation.text, path).not.toBe('contention')
      expect(row.annotation.text, path).not.toBe('stopped')
      expect(row.annotation.owner, path).toEqual({ agentId: ANALYST })
    }
    // Mary's PRD was contended with John's until he ended, and hers alone after.
    expect(steps.some((step) => step.stage === 'john revises while mary writes the PRD' && textOf(step.rows, PRD) === 'contention')).toBe(true)
    let annotated = 0
    for (const step of steps.filter((each) => each.stage === 'mary alone')) {
      const annotation = rowOf(step.rows, PRD)?.annotation
      // The step her run ends on leaves the row clean; every step before it names her alone.
      if (annotation === undefined) continue
      expect(annotation.text).not.toBe('contention')
      expect(annotation.owner).toEqual({ agentId: ANALYST })
      annotated += 1
    }
    expect(annotated).toBeGreaterThan(0)
  })

  it('leaves every row clean when the second run ends, and the rows saved only by the watcher’s settle', async () => {
    const { rowsAfterRuns, rowsAfterSettle } = await replay()

    expect(rowsAfterRuns.map((row) => row.path)).toEqual([...PATHS].sort())
    // The runs ending is not the stream saying saved: no row is annotated, and the state is the watcher's.
    for (const row of rowsAfterRuns) expect(Object.keys(row), row.path).not.toContain('annotation')
    expect(rowOf(rowsAfterRuns, PRD)?.state).toBe('changing')
    for (const row of rowsAfterSettle) {
      expect(Object.keys(row), row.path).not.toContain('annotation')
      expect(row.state, row.path).toBe('saved')
    }
  })

  it('says nothing of the disk: at every step each row’s state is what a rail that heard only the watcher says', async () => {
    const { steps } = await replay()

    expect(steps.length).toBeGreaterThan(1000)
    for (const step of steps) expect(step.rows.map(disk), step.stage).toEqual(step.watcher)
  })

  it('prevents, resolves and undoes nothing: every write of both runs is committed, and no session is sent a word it was not', async () => {
    const { told, written, interrupted, killed, dispatched, projectTouched } = await replay()

    for (const runId of ['run-1', 'run-2']) {
      const commits = told.flatMap((event) => (event.name === 'doc:committed' && event.payload.runId === runId ? [event.payload] : []))
      // Every `Write` and every `Edit` of the recording came back and was committed, for both runs.
      expect(commits, runId).toHaveLength(changes.length)
      expect(commits.every((commit) => commit.ok), runId).toBe(true)
    }
    expect(told.some((event) => event.name === 'run:stopped' || event.name === 'run:failed')).toBe(false)
    // Each session was sent its one dispatched turn and nothing else, and was never interrupted or killed.
    expect(dispatched.map(({ ok }) => ok)).toEqual([true, true])
    expect(written.map((lines) => lines.length)).toEqual([1, 1])
    expect(interrupted).toEqual([0, 0])
    expect(killed).toEqual([0, 0])
    // The project is the CLI's: the harness made nothing in it.
    expect(projectTouched).toBe(false)
  })

  it('pushes the contention annotation through the rail’s own channel, and the one word is the only new one', async () => {
    const { pushed } = await replay()
    const annotations = pushed.flatMap((snapshot) => snapshot.rows.flatMap((row) => (row.annotation === undefined ? [] : [row.annotation])))

    expect(annotations.some((annotation) => annotation.text === 'contention')).toBe(true)
    for (const annotation of annotations) {
      if (annotation.text === 'contention') {
        expect(annotation).toEqual({ text: 'contention', owners: [{ agentId: PM }, { agentId: ANALYST }] })
      } else {
        expect(annotation.text).toMatch(/^(?:writing|revising)(?: · §\d+ .+)?$/)
      }
    }
  })
})
