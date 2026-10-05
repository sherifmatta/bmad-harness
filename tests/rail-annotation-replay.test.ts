import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContractEvent } from '../src/shared/events'
import type { ArtifactObservation, RailRow, RailSnapshot } from '../src/shared/rail'
import { EMPTY_ANNOTATIONS, annotationsOf, foldAnnotations } from '../src/main/fold/rail-annotations'
import { SETTLE_MS } from '../src/main/fold/rail-rows'
import { foldRunCard, startCard } from '../src/main/fold/run-card'
import { projectRelative } from '../src/main/fold/route-frame'
import { createProseStore } from '../src/renderer/ui/chat/prose-store'
import { progressWords } from '../src/renderer/ui/chat/run-status'

/**
 * Story 3.6's beat, replayed: `multi-file-sonnet` (an addendum, a pre-review
 * copy and a larger PRD, each by one `Write`, then the PRD revised by `Edit`s)
 * dispatched as a run through the real session bridge, sharing one window with
 * the real rail bridge, whose watcher is a fake. The watcher observes each file
 * when the tool call that wrote it comes back, never before, and the rail's
 * pushes are read as the window would read them.
 *
 * The stream says who is writing and where; the watcher alone says a file
 * exists, is changing or is saved. The window's own prose store, with a hand-cranked
 * frame, gives the card's head to hold the annotation's section against.
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

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})
afterEach(() => {
  vi.useRealTimers()
})

/** A step of the replay: the rows the window holds, and what the card's head says, after one recorded frame. */
type Step = {
  rows: RailRow[]
  /** The head's words for the PRD, when the PRD is the card's subject and its text is held. */
  head: string | undefined
  /** How many observations the watcher had made. */
  observed: number
  ended: boolean
}

type Replay = {
  steps: Step[]
  /** Every rail snapshot the window was pushed, in order. */
  pushed: RailSnapshot[]
  /** The rows as the window holds them when the run's terminal event has been told, and after the settle. */
  rowsAfterRun: RailRow[]
  rowsAfterSettle: RailRow[]
  personaStates: string[]
}

/** `scanFinds`: a file the watcher's initial scan finds saved, before the run starts. */
async function replay({ scanFinds }: { scanFinds?: string } = {}): Promise<Replay> {
  handlers.clear()
  const userData = mkdtempSync(join(tmpdir(), 'harness-rail-annotation-'))
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
            if (scanFinds !== undefined) onObservation({ type: 'artifact:found', path: scanFinds, size: 1, mtimeMs: 1 })
            resolveReady()
          }
        })
        return { ready, close: () => Promise.resolve() }
      }
    })
    const call = <T>(channel: string, ...args: unknown[]): T =>
      (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)

    const railReady = call<Promise<unknown>>(RAIL_GET_CHANNEL)
    finishScan()
    await railReady
    await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, PM)
    feed({ type: 'result', subtype: 'success', is_error: false })
    const dispatched = await call<Promise<{ ok: boolean }>>(MENU_DISPATCH_CHANNEL, 's1', 'GO')
    expect(dispatched.ok).toBe(true)
    // The rows as the window holds them: the baseline `rail:get` gave it, then each push.
    const baseline = ((await call<Promise<{ snapshot: RailSnapshot }>>(RAIL_GET_CHANNEL)).snapshot).rows
    pushed.length = 0

    // The window's own folds, over what main told it, with a hand-cranked frame.
    const store = createProseStore({ raf: (run) => run() })
    let from = 0
    const hasEnded = (): boolean =>
      told.some((event) => event.name === 'run:finished' || event.name === 'run:failed' || event.name === 'run:stopped')
    const writeTools = new Map(tools.filter((tool) => tool.name === 'Write' || tool.name === 'Edit').map((tool) => [tool.id, tool]))

    const steps: Step[] = []
    let observed = 0
    const current = (): RailRow[] => pushed.at(-1)?.rows ?? baseline
    /** What the window holds and the card's head says, as of now. */
    const record = (): void => {
      for (const event of told.slice(from)) {
        if (event.name === 'doc:prose') {
          store.append(event.payload.runId, event.payload.callId, event.payload.path, event.payload.text)
        } else if (event.name === 'doc:committed' && event.payload.ok) {
          store.commit(event.payload.runId, event.payload.path, event.payload.callId, event.payload.text)
        }
      }
      from = told.length
      const shown = store.get('run-1')
      steps.push({
        rows: current(),
        head: shown?.path === PRD && shown.text !== '' ? progressWords(store.progress('run-1')) : undefined,
        observed,
        ended: hasEnded()
      })
    }

    for (const frame of frames) {
      feed(frame)
      // What the stream said, before the watcher has seen the file the call wrote.
      record()
      // A write comes back: the file is on disk, and the watcher sees it a moment later.
      const results = frame.type === 'user' ? ((frame.message?.content ?? []) as { type: string; tool_use_id?: string }[]) : []
      for (const block of results) {
        const tool = block.type === 'tool_result' ? writeTools.get(block.tool_use_id ?? '') : undefined
        if (tool === undefined) continue
        vi.advanceTimersByTime(50)
        observed += 1
        emit({ type: 'artifact:written', path: relative(tool.input.file_path), size: observed, mtimeMs: Date.now() })
        record()
      }
      if (hasEnded()) break
    }
    const rowsAfterRun = current()
    vi.advanceTimersByTime(SETTLE_MS)
    const rowsAfterSettle = current()
    const personaStates = told.flatMap((event) => (event.name === 'persona:state' ? [event.payload.state] : []))
    return { steps, pushed, rowsAfterRun, rowsAfterSettle, personaStates }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
}

const annotationOf = (rows: RailRow[], path: string): string | undefined => rows.find((row) => row.path === path)?.annotation?.text

describe('multi-file-sonnet, replayed through the session and rail bridges', () => {
  it('is the recording it is named for: three Writes of three files, the PRD last, then Edits of the PRD', () => {
    expect([ADDENDUM, PRE_REVIEW, PRD]).toEqual([
      '_bmad/prds/tidewatch/addendum.md',
      '_bmad/prds/tidewatch/prd.pre-review.md',
      '_bmad/prds/tidewatch/prd.md'
    ])
    expect(tools.filter((tool) => tool.name === 'Edit').length).toBeGreaterThanOrEqual(2)
  })

  it('makes no row before the watcher has seen a file, and gives each file the watcher makes its own section and the persona', async () => {
    const { steps } = await replay()

    // The stream spoke long before the first observation: no row was made by it.
    const firstObservation = steps.findIndex((step) => step.observed > 0)
    expect(firstObservation).toBeGreaterThan(0)
    for (const step of steps.slice(0, firstObservation)) expect(step.rows).toEqual([])

    // Once the PRD is observed, its row carries the persona and a `writing`/`revising` section tag.
    const prdSteps = steps.filter((step) => annotationOf(step.rows, PRD) !== undefined)
    expect(prdSteps.length).toBeGreaterThan(0)
    for (const step of prdSteps) {
      expect(step.rows.find((row) => row.path === PRD)?.annotation?.owner).toEqual({ agentId: PM })
      expect(annotationOf(step.rows, PRD)).toMatch(/^(?:writing|revising)(?: · §\d+ .+)?$/)
    }
    // Each of the three files carried an annotation of its own at some step.
    for (const path of [ADDENDUM, PRE_REVIEW, PRD]) {
      expect(steps.some((step) => annotationOf(step.rows, path) !== undefined), path).toBe(true)
    }
    expect(steps.some((step) => annotationOf(step.rows, ADDENDUM)?.startsWith('writing · §'))).toBe(true)
    // The recording's Edits are revisions of the PRD, and say so.
    expect(steps.some((step) => annotationOf(step.rows, PRD)?.startsWith('revising · §'))).toBe(true)
  })

  it('says for the PRD, at every step the card shows it, exactly what the card’s head says', async () => {
    const { steps } = await replay()
    let compared = 0

    for (const step of steps) {
      const annotation = annotationOf(step.rows, PRD)
      if (step.head === undefined || annotation === undefined) continue
      // The head's words are the annotation's: one function, so the rail and the card cannot disagree.
      expect(annotation).toBe(step.head)
      compared += 1
    }
    expect(compared).toBeGreaterThan(2)
  })

  it('names no total in any annotation, and no section name past forty characters', async () => {
    const { pushed } = await replay()
    const texts = pushed.flatMap((snapshot) => snapshot.rows.flatMap((row) => (row.annotation === undefined ? [] : [row.annotation.text])))

    expect(texts.length).toBeGreaterThan(0)
    for (const text of texts) {
      expect(text).not.toMatch(/\bof \d|\/\s*\d|\btotal\b/i)
      const name = / · §\d+ (.*)$/.exec(text)?.[1]
      if (name !== undefined) expect(Array.from(name).length).toBeLessThanOrEqual(40)
    }
  })

  it('drops every annotation when the run ends, leaves the rows as the watcher says, and reaches saved only by the settle', async () => {
    const result = await replay()

    expect(result.steps.at(-1)?.ended).toBe(true)
    // The terminal event is not the stream saying saved: the rows are still changing, with no annotation.
    expect(result.rowsAfterRun.map((row) => row.path)).toEqual([ADDENDUM, PRE_REVIEW, PRD].sort())
    for (const row of result.rowsAfterRun) {
      expect(Object.keys(row), row.path).not.toContain('annotation')
      expect(row.state, row.path).toBe('changing')
    }
    // The settle timer, and nothing the run said, makes them saved.
    for (const row of result.rowsAfterSettle) {
      expect(Object.keys(row), row.path).not.toContain('annotation')
      expect(row.state, row.path).toBe('saved')
    }
  })

  it('raises no note for the persona whose own run is annotating', async () => {
    const { personaStates } = await replay()

    expect(personaStates).toContain('work')
    expect(personaStates).not.toContain('note')
    expect(personaStates.at(-1)).toBe('live')
  })

  it('reads a file the watcher already saved as `saved` in the watcher’s register while the run annotates it', async () => {
    const { steps } = await replay({ scanFinds: ADDENDUM })
    const before = steps.find((step) => step.observed === 0 && annotationOf(step.rows, ADDENDUM) !== undefined)

    // Both registers at once: the watcher's `saved` and its age, and the stream's words.
    expect(before).toBeDefined()
    const row = before?.rows.find((each) => each.path === ADDENDUM)
    expect(row).toMatchObject({ state: 'saved', savedAt: 1 })
    expect(row?.annotation?.text).toMatch(/^writing · §\d+ /)
    // Until the watcher observes a file, the run's words move nothing about it.
    for (const step of steps.filter((each) => each.observed === 0)) {
      expect(step.rows.map((each) => each.path)).toEqual([ADDENDUM])
      expect(step.rows.every((each) => each.state === 'saved')).toBe(true)
    }
  })

  it('adds a row only when the watcher observes a file', async () => {
    const { pushed } = await replay()
    const paths = new Set(pushed.flatMap((snapshot) => snapshot.rows.map((row) => row.path)))

    expect([...paths].sort()).toEqual([ADDENDUM, PRE_REVIEW, PRD].sort())
  })
})

describe('the section numbering across a second Write of one path', () => {
  const first = '## Vision\nA.\n## Goals\nB.\n'
  const second = '## Goals\nB.\n## Risks\nC.\n'

  it.each([
    ['with the first Write rejected', true],
    ['with the first Write confirmed', false]
  ])('says what the card head says, %s', (_name, rejects) => {
    const events: ContractEvent[] = [
      { name: 'run:started', payload: { runId: 'r1', sessionId: 's1', agentId: PM, code: 'CP', at: 1 } },
      { name: 'doc:prose', payload: { runId: 'r1', sessionId: 's1', callId: 'c1', path: PRD, text: first, at: 2 } },
      rejects
        ? { name: 'doc:committed', payload: { ok: false, runId: 'r1', sessionId: 's1', callId: 'c1', path: PRD, error: { code: 'doc/write-rejected', message: 'x' }, at: 3 } }
        : { name: 'doc:committed', payload: { ok: true, runId: 'r1', sessionId: 's1', callId: 'c1', path: PRD, sections: ['Vision', 'Goals'], at: 3 } },
      { name: 'doc:prose', payload: { runId: 'r1', sessionId: 's1', callId: 'c2', path: PRD, text: second, at: 4 } }
    ]
    // The card's head: the window's prose store, fed as the window feeds it (a confirmed commit only).
    const store = createProseStore({ raf: (run) => run() })
    // The rail: the card and the annotation fold, folded as main folds them.
    let card = startCard({ runId: 'r1', sessionId: 's1', agentId: PM, code: 'CP', at: 1 })
    let table = EMPTY_ANNOTATIONS
    for (const event of events) {
      if (event.name === 'run:started') card = startCard(event.payload)
      else card = foldRunCard(card, event)
      table = foldAnnotations(table, event, card)
      if (event.name === 'doc:prose') store.append('r1', event.payload.callId, event.payload.path, event.payload.text)
      if (event.name === 'doc:committed' && event.payload.ok) store.commit('r1', event.payload.path, event.payload.callId, event.payload.text)
    }

    expect(progressWords(store.progress('r1'))).toBe('writing · §3 Risks')
    expect(annotationsOf(table).get(PRD)?.text).toBe(progressWords(store.progress('r1')))
  })
})
