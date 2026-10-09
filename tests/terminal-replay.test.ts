import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createElement } from 'react'
import type { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ConversationReply, ConversationSnapshot, RunCardSnapshot } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'
import type { RailAnnotation, RailRow, RailSnapshot } from '../src/shared/rail'
import type { ProseStore } from '../src/renderer/ui/chat/prose-store'
import { createProseStore } from '../src/renderer/ui/chat/prose-store'
import type { RunProgress } from '../src/renderer/ui/chat/prose-store'
import { runLifecycleLine, runStatusText, subjectWritten } from '../src/renderer/ui/chat/run-status'
import type { RunCardEntry } from '../src/renderer/ui/chat/transcript-entry'

/**
 * Story 3.8's beat, replayed: the three recordings of a run that ended early —
 * an in-band interrupt, a `SIGINT` that took the session with it, and a
 * reviewer gate the CLI ended on a budget cap — each fed to its terminal event
 * through the real session bridge, registry and folds, with the real card drawn
 * from the snapshot main hands a window and, for the interrupt, the real rail
 * bridge beside it.
 *
 * Nothing live and no network: the recordings are the evidence. What each
 * scenario is named for is asserted against the frames themselves first
 * (`tests/replay-corpus.test.ts` holds the corpus-wide shape), so a fixture
 * that drifted fails here rather than quietly passing.
 *
 * The terminal state is read from the per-turn `result` row alone — `is_error`
 * and `subtype` — which is why the gate's two `result/success` rows with
 * background tasks live end no run, and why the `SIGINT` recording's final
 * `result` ends the run before the process exit is even heard of.
 */

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler)
  },
  BrowserWindow: { fromWebContents: () => null },
  app: { getPath: () => '/unused' }
}))

// The card is a `.tsx` module that needs the DOM lib, which the node program does not have, so it is
// loaded by a path the typechecker does not follow and drawn here with `createElement`.
const RUN_CARD = resolve(import.meta.dirname, '..', 'src', 'renderer', 'ui', 'chat', 'run-card.tsx')
const { RunCard } = (await import(/* @vite-ignore */ RUN_CARD)) as { RunCard: ComponentType<{ entry: RunCardEntry; prose: ProseStore }> }
const { createTranscriptRegistry } = await import('../src/main/projections/transcript')
const {
  CONVERSATION_GET_CHANNEL,
  MENU_DISPATCH_CHANNEL,
  RUN_STOP_CHANNEL,
  SESSION_EVENT_CHANNEL,
  SESSION_OPEN_CHANNEL,
  TURN_SEND_CHANNEL,
  registerSessionBridge
} = await import('../src/main/session-bridge')
const { RAIL_CHANGED_CHANNEL, RAIL_GET_CHANNEL, registerRailBridge } = await import('../src/main/rail-bridge')

const RUNS = resolve(import.meta.dirname, '..', 'fixtures', 'runs')
const PM = 'bmad-agent-pm'

type Frame = {
  type: string
  subtype?: string
  is_error?: boolean
  stop_reason?: string | null
  parent_tool_use_id?: string | null
  tasks?: unknown[]
  message?: { content?: { type: string; id?: string; name?: string; tool_use_id?: string; is_error?: boolean; input?: Record<string, unknown> }[] }
}

type Meta = { cwd: string; turns: { afterLine: number; text?: string }[]; exit: { code: number | null } }

const cache = new Map<string, { frames: Frame[]; meta: Meta }>()
function recording(scenario: string): { frames: Frame[]; meta: Meta } {
  let held = cache.get(scenario)
  if (held === undefined) {
    held = {
      frames: readFileSync(join(RUNS, `${scenario}.jsonl`), 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as Frame),
      meta: JSON.parse(readFileSync(join(RUNS, `${scenario}.meta.json`), 'utf8')) as Meta
    }
    cache.set(scenario, held)
  }
  return held
}

/** The recording's line `n`, counted from 1 as the metadata counts. */
const frameAt = (scenario: string, n: number): Frame => recording(scenario).frames[n - 1]

type Scene = {
  told: ContractEvent[]
  /** The names told, in order, with the persona's own state changes left out. */
  names: string[]
  snapshot: ConversationSnapshot
  card: RunCardSnapshot
  /** The rows the window holds, when the rail bridge was mounted too. */
  rows: RailRow[]
}

type Options = {
  /** Feed the recording up to this line, then press stop, then feed the rest. */
  stopAt?: number
  /** Let the process go once every frame has been fed, as a `SIGINT` does. */
  thenExits?: boolean
  /** Mount the rail bridge too, and have the watcher observe these paths once the stream names them. */
  observes?: readonly string[]
}

/**
 * One recording, dispatched as a run and fed frame by frame. The activation
 * turn is fed first and ends on its own `result`, as a window would have it
 * before any button is pressed; the recording's second turn is the run.
 */
async function replay(scenario: string, options: Options = {}): Promise<Scene> {
  handlers.clear()
  const { frames, meta } = recording(scenario)
  const dispatchAfter = meta.turns[1].afterLine
  const userData = mkdtempSync(join(tmpdir(), 'harness-terminal-replay-'))
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
    let exit: () => void = () => {}
    let observe: (path: string) => void = () => {}
    let finishScan: () => void = () => {}

    registerSessionBridge({
      transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
      projectPathFor: () => meta.cwd,
      now: () => 1_000,
      newSessionId: () => 's1',
      newRunId: () => 'run-1',
      agentName: () => 'John',
      writeDiagnostic: () => {},
      menuEntryFor: (_window, _agent, code) =>
        code === 'DP' ? { code: 'DP', description: 'Draft the PRD', action: { kind: 'skill', skill: 'bmad-prd' } } : undefined,
      readPlan: () => Promise.resolve(undefined),
      readText: () => Promise.resolve(undefined),
      schedule: () => () => {},
      spawn: (spawnOptions) => {
        feed = spawnOptions.onFrame
        exit = spawnOptions.onExit
        return Promise.resolve({
          ok: true,
          session: { write: () => Promise.resolve(true), interrupt: () => Promise.resolve(true), kill: () => {} }
        })
      }
    })
    if (options.observes !== undefined) {
      registerRailBridge({
        projectPathFor: () => meta.cwd,
        writeDiagnostic: () => {},
        watch: ({ onObservation }) => {
          observe = (path) => onObservation({ type: 'artifact:written', path, size: 1, mtimeMs: 1 })
          return { ready: new Promise<void>((ready) => void (finishScan = ready)), close: () => Promise.resolve() }
        }
      })
    }
    const call = <T>(channel: string, ...args: unknown[]): T =>
      (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)

    if (options.observes !== undefined) {
      const railReady = call<Promise<unknown>>(RAIL_GET_CHANNEL)
      finishScan()
      await railReady
    }
    await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, PM)
    for (let line = 1; line <= dispatchAfter; line += 1) feed(frames[line - 1])
    const dispatched = await call<Promise<{ ok: boolean }>>(MENU_DISPATCH_CHANNEL, 's1', 'DP')
    expect(dispatched.ok).toBe(true)

    const pending = new Set(options.observes ?? [])
    for (let line = dispatchAfter + 1; line <= frames.length; line += 1) {
      feed(frames[line - 1])
      // The watcher sees a file the moment the stream first names it, and never before.
      for (const path of [...pending]) {
        if (!told.some((event) => event.name === 'doc:prose' && event.payload.path === path)) continue
        pending.delete(path)
        observe(path)
      }
      if (line === options.stopAt) await call<Promise<unknown>>(RUN_STOP_CHANNEL, 'run-1')
      // The recorder's own turns after the run were sent by the recorder, as the user's: here the user sends them.
      const sent = meta.turns.find((each, index) => index > 1 && each.afterLine === line)
      if (sent?.text !== undefined && sent.text !== '') await call<Promise<unknown>>(TURN_SEND_CHANNEL, 's1', sent.text)
    }
    if (options.thenExits === true) exit()

    const reply = call<ConversationReply>(CONVERSATION_GET_CHANNEL)
    if (!reply.ok) throw new Error('no snapshot')
    return {
      told,
      names: told.flatMap((event) => (event.name === 'persona:state' ? [] : [event.name])),
      snapshot: reply.snapshot,
      card: reply.snapshot.runs[0],
      rows: pushed.at(-1)?.rows ?? []
    }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
}

/** The card as a window draws it: the real component over a store seeded with what main held. */
function drawn(card: RunCardSnapshot): { markup: string; head: string; written: readonly string[]; progress: RunProgress } {
  const prose = createProseStore({ raf: (run) => run() })
  prose.seed(card.runId, card.documents)
  const entry: RunCardEntry = {
    kind: 'run',
    id: card.runId,
    at: card.startedAt,
    runId: card.runId,
    sessionId: card.sessionId,
    status: card.status,
    notes: card.notes,
    steps: card.steps,
    documents: card.documents,
    ...(card.agentId === undefined ? {} : { agentId: card.agentId }),
    ...(card.endedAt === undefined ? {} : { endedAt: card.endedAt }),
    ...(card.error === undefined ? {} : { error: card.error })
  }
  const written = subjectWritten(entry, prose.get(card.runId)?.path)
  return {
    markup: renderToStaticMarkup(createElement(RunCard, { entry, prose })),
    head: runStatusText(entry, card.endedAt ?? card.startedAt, written),
    written,
    // What the streamed text had reached, which a terminal head never reads.
    progress: prose.progress(card.runId)
  }
}

const terminalEvents = (scene: Scene): string[] =>
  scene.names.filter((name) => name === 'run:finished' || name === 'run:stopped' || name === 'run:failed')
const annotationOf = (rows: RailRow[], path: string): RailAnnotation | undefined => rows.find((row) => row.path === path)?.annotation
const syslines = (scene: Scene): string[] =>
  scene.told.flatMap((event) => (event.name === 'harness:said' ? [event.payload.text] : []))

describe('interrupt-inband: a stop pressed mid-Write', () => {
  const SCENARIO = 'interrupt-inband'
  const INTERRUPT_AT = 2154

  it('is the recording it is named for: the activation result at 252, the interrupt at 2154, the interrupted result at 2157', () => {
    expect(recording(SCENARIO).meta.turns.map((turn) => turn.afterLine)).toEqual([0, 253, 2154, 2158])
    expect(frameAt(SCENARIO, 252)).toMatchObject({ type: 'result', is_error: false })
    expect(frameAt(SCENARIO, INTERRUPT_AT + 1)).toMatchObject({ type: 'control_response' })
    expect(frameAt(SCENARIO, INTERRUPT_AT + 3)).toMatchObject({ type: 'result', subtype: 'error_during_execution', is_error: true })
    // The session lived: the recording goes on past the interrupted result with a follow-up turn of its own.
    expect(recording(SCENARIO).frames.length).toBeGreaterThan(INTERRUPT_AT + 3)
    expect(frameAt(SCENARIO, 2159)).toMatchObject({ type: 'system', subtype: 'init' })
  })

  it('raises one run:stopped and no run:failed, says no failed line, and leaves the session open', async () => {
    const scene = await replay(SCENARIO, { stopAt: INTERRUPT_AT, observes: [] })

    expect(terminalEvents(scene)).toEqual(['run:stopped'])
    expect(syslines(scene)).toEqual([])
    expect(scene.snapshot.entries.filter((entry) => entry.kind === 'sysline')).toEqual([])
    expect(scene.snapshot.sessions).toEqual([{ agentId: PM, sessionId: 's1' }])
    expect(scene.card).toMatchObject({ runId: 'run-1', status: 'stopped' })
    expect(scene.card.error).toBeUndefined()
  })

  it('draws the card terminal with what the stop confirmed: the bare word, no foot, no caret, the error dot', async () => {
    const scene = await replay(SCENARIO, { stopAt: INTERRUPT_AT })
    const { markup, head, written } = drawn(scene.card)

    // The `Write` was still streaming: its `tool_result` never came, so nothing was confirmed.
    expect(scene.card.documents[0].sections).toEqual([])
    expect(scene.card.documents[0].text.length).toBeGreaterThan(1_000)
    expect(written).toEqual([])
    expect(head).toBe('stopped')
    expect(markup).toContain('<span class="run-card-status run-card-status--stopped">stopped</span>')
    expect(markup).not.toContain('§')
    expect(markup).not.toContain('run-card-foot')
    expect(markup).not.toContain('class="caret"')
    expect(markup).not.toContain('aria-busy')
    expect(markup).toContain('status-dot--error')
    // One announcement, word for word the head's, with the persona's name before it.
    expect(runLifecycleLine({ ...scene.card, kind: 'run', id: scene.card.runId, at: scene.card.startedAt } as RunCardEntry, 'John', written)).toBe(
      'John · stopped'
    )
  })

  it('survives the stop: the persona picks the run up in its own voice, with nothing of the harness standing in', async () => {
    const scene = await replay(SCENARIO, { stopAt: INTERRUPT_AT })
    const after = scene.names.slice(scene.names.indexOf('run:stopped'))
    const said = scene.told.flatMap((event) => (event.name === 'persona:said' ? [event.payload] : []))

    // The recording's own follow-up turn, into the same session, after the stop.
    expect(after).toContain('persona:said')
    expect(said.filter((payload) => payload.sessionId === 's1').length).toBeGreaterThan(0)
    expect(said.at(-1)?.text.length).toBeGreaterThan(0)
    // The persona's words reach the transcript as the persona's, and no harness line stands in for them.
    expect(scene.snapshot.entries.filter((entry) => entry.kind === 'persona').length).toBeGreaterThan(0)
    expect(syslines(scene)).toEqual([])
    // And main fabricates no second run: the follow-up turn is a turn, not a run.
    expect(after.filter((name) => name.startsWith('run:'))).toEqual(['run:stopped'])
    expect(scene.snapshot.runs).toHaveLength(1)
  })

  it('leaves the rail reading `stopped` on the path the run was writing, with the owner and no section', async () => {
    const path = '_bmad/planning-artifacts/prds/prd-bmad-harness-2026-10-01/prd.md'
    const scene = await replay(SCENARIO, { stopAt: INTERRUPT_AT, observes: [path] })

    expect(scene.rows.map((row) => row.path)).toEqual([path])
    expect(annotationOf(scene.rows, path)).toEqual({ text: 'stopped', owner: { agentId: PM } })
    // The stream never touched the row's disk state, and made or removed none.
    expect(scene.rows[0].state).toBe('changing')
  })
})

describe('interrupt-sigint: the process goes with the turn', () => {
  const SCENARIO = 'interrupt-sigint'

  it('is the recording it is named for: the activation result at 314, the last result at 2083, a rejected tool call at 199', () => {
    expect(recording(SCENARIO).meta.turns.map((turn) => turn.afterLine)).toEqual([0, 315])
    expect(frameAt(SCENARIO, 314)).toMatchObject({ type: 'result', is_error: false })
    expect(recording(SCENARIO).frames).toHaveLength(2083)
    expect(frameAt(SCENARIO, 2083)).toMatchObject({ type: 'result', subtype: 'error_during_execution', is_error: true })
    // The `result` carries a `stop_reason`, which nothing reads.
    expect(frameAt(SCENARIO, 2083).stop_reason).toBe('tool_use')
    expect(frameAt(SCENARIO, 199).message?.content?.some((block) => block.type === 'tool_result' && block.is_error === true)).toBe(true)
  })

  it('ends the run once from the result, and the process exit adds only the harness’s own line and the close', async () => {
    const scene = await replay(SCENARIO, { thenExits: true })

    expect(terminalEvents(scene)).toEqual(['run:failed'])
    expect(scene.card).toMatchObject({ status: 'failed' })
    expect(scene.card.error).toMatchObject({ code: 'run/failed', detail: 'error_during_execution' })
    // The exit says the harness's own line and closes the session, and raises no second terminal event.
    expect(scene.names.slice(-2)).toEqual(['harness:said', 'session:closed'])
    expect(syslines(scene).at(-1)).toBe('session ended · the process exited')
    expect(scene.snapshot.sessions).toEqual([])
  })

  it('never lets a persona have the last word: the transcript ends in the harness’s register', async () => {
    const scene = await replay(SCENARIO, { thenExits: true })
    const ended = scene.names.indexOf('run:failed')

    // After the run ended, main synthesises nothing in the persona's voice.
    expect(scene.names.slice(ended)).not.toContain('persona:said')
    const spoken = scene.snapshot.entries.filter((entry) => entry.kind === 'persona' || entry.kind === 'sysline')
    expect(spoken.at(-1)?.kind).toBe('sysline')
  })

  it('draws the card terminal on the bare word: 19 KB of prose streamed, and not one section was confirmed', async () => {
    const scene = await replay(SCENARIO, { thenExits: true })
    const { markup, head, written, progress } = drawn(scene.card)

    // The `Write` never closed, so its `tool_result` never came: the subject has a long text and no sections.
    expect(scene.card.documents).toHaveLength(1)
    expect(scene.card.documents[0].text.length).toBeGreaterThan(19_000)
    expect(scene.card.documents[0].sections).toEqual([])
    // The streamed text had run well past a dozen headings; the head names none of them.
    expect(progress.section?.n).toBeGreaterThan(1)
    expect(written).toEqual([])
    expect(head).toBe('failed')
    expect(markup).toContain('<span class="run-card-status run-card-status--failed">failed</span>')
    expect(markup).not.toContain('§')
    expect(markup).not.toContain('run-card-foot')
    expect(markup).not.toContain('aria-busy')
    expect(markup).toContain('status-dot--error')
  })
})

describe('reviewer-gate-failure-induced: a budget cap ends the gate', () => {
  const SCENARIO = 'reviewer-gate-failure-induced'

  it('is the recording it is named for: results at 906 and 940 with tasks live, the set emptied at 945, the failure at 950', () => {
    expect(recording(SCENARIO).meta.turns.map((turn) => turn.afterLine)).toEqual([0, 306])
    expect(frameAt(SCENARIO, 305)).toMatchObject({ type: 'result', is_error: false })
    expect(frameAt(SCENARIO, 906)).toMatchObject({ type: 'result', subtype: 'success', is_error: false })
    expect(frameAt(SCENARIO, 940)).toMatchObject({ type: 'result', subtype: 'success', is_error: false })
    expect(frameAt(SCENARIO, 945)).toMatchObject({ type: 'system', subtype: 'background_tasks_changed', tasks: [] })
    expect(frameAt(SCENARIO, 950)).toMatchObject({ type: 'result', subtype: 'error_max_budget_usd', is_error: true })
    // The budget failure carries no `stop_reason` at all, and nothing reads one.
    expect(frameAt(SCENARIO, 950).stop_reason).toBeNull()
    expect(frameAt(SCENARIO, 107).message?.content?.some((block) => block.type === 'tool_result' && block.is_error === true)).toBe(true)
  })

  it('ends the run once, on the row at 950, as failed with the CLI’s own subtype', async () => {
    const scene = await replay(SCENARIO)

    expect(terminalEvents(scene)).toEqual(['run:failed'])
    expect(scene.card).toMatchObject({ status: 'failed' })
    expect(scene.card.error).toEqual({ code: 'run/failed', message: 'run · the run failed', detail: 'error_max_budget_usd' })
    expect(syslines(scene)).toContain('turn failed · error_max_budget_usd')
  })

  it('ends no run on the two successful results that fell while the gate’s subagents were live', async () => {
    const { frames, meta } = recording(SCENARIO)
    const upTo = frames.length
    expect(meta.exit.code).toBe(1)
    const scene = await replay(SCENARIO)

    // One terminal event for the whole recording, however many `result` rows it holds.
    expect(frames.filter((frame) => frame.type === 'result')).toHaveLength(4)
    expect(terminalEvents(scene)).toHaveLength(1)
    expect(upTo).toBe(951)
    // And the process exit code, 1, never reached the card: the run ended on the row, with the session still open.
    expect(scene.snapshot.sessions).toEqual([{ agentId: PM, sessionId: 's1' }])
  })

  it('draws the card terminal with the error dot and no error text', async () => {
    const scene = await replay(SCENARIO)
    const { markup } = drawn(scene.card)

    expect(markup).toContain('status-dot--error')
    expect(markup).not.toContain('run · the run failed')
    expect(markup).not.toContain('error_max_budget_usd')
    expect(markup).not.toContain('run-card-foot')
  })
})
