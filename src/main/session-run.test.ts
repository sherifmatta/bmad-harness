import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationReply, ConversationSnapshot } from '../shared/conversation'
import type { ContractEvent, EventName, EventPayload } from '../shared/events'
import type { ArtifactObservation, RailAnnotation } from '../shared/rail'
import type { TemplatePlan } from '../shared/section-plan'
import { createTranscriptRegistry } from './projections/transcript'
import type { TranscriptRegistry } from './projections/transcript'
import { transcriptFilePath } from './sources/persistence/transcript-file'
import { railAnnotatorFor } from './rail-annotations'
import type { SessionBridge } from './session-bridge'
import type { ResolvedMenuEntry } from './sources/install/schema'
import type { SessionProcess, SpawnOutcome, SpawnSessionOptions } from './sources/session/session-process'

/**
 * Story 3.1's run, through the real session bridge and registry: a menu
 * dispatch, the run's routed events, its card, its notes and its end. The
 * process is a fake that is handed frames; time and timers are held still.
 */

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler)
  },
  BrowserWindow: { fromWebContents: () => null },
  app: { getPath: () => '/unused' }
}))

const { CONVERSATION_END_CHANNEL, CONVERSATION_GET_CHANNEL, MENU_DISPATCH_CHANNEL, RUN_STOP_CHANNEL, SESSION_CLOSE_CHANNEL, SESSION_OPEN_CHANNEL, TURN_SEND_CHANNEL, registerSessionBridge } =
  await import('./session-bridge')

const ROOT = '/work/project'
const A = 'bmad-agent-pm'
const B = 'bmad-agent-analyst'

class FakeSender {
  sent: ContractEvent[] = []
  constructor(readonly id = 1) {}
  send(_channel: string, event: ContractEvent): void {
    this.sent.push(event)
  }
  isDestroyed(): boolean {
    return false
  }
  once(): void {}
  get names(): string[] {
    return this.sent.map((event) => event.name)
  }
  of<N extends EventName>(name: N): EventPayload<N>[] {
    return this.sent.flatMap((event) => (event.name === name ? [event.payload as EventPayload<N>] : []))
  }
}

const MENU: Record<string, ResolvedMenuEntry> = {
  CP: { code: 'CP', description: 'Create the PRD', action: { kind: 'skill', skill: 'bmad-prd' } },
  VP: { code: 'VP', description: 'Validate it', action: { kind: 'prompt', prompt: 'Validate the PRD, please.' } }
}

let userData: string
let clock: number
let runs: number
let writes: string[]
/** What the next turn write answers: whether the process took it. */
let writeOk: boolean
let feed: (frame: unknown) => void
/** Each spawned session's frame feed, by agent id, for a window with more than one. */
let feeds: Map<string, (frame: unknown) => void>
let sessions: number
let exit: () => void
let timers: { at: number; run: () => void; cancelled: boolean }[]
let files: Map<string, string>
let bridge: SessionBridge
let transcriptEntries: () => unknown[]
/** The project's transcript registry, so a test can flush it and read what was kept of the run cards. */
let transcriptRegistry: TranscriptRegistry
/** What the plan read answers, by skill: a plan, nothing, or a failure. */
let plans: Map<string, TemplatePlan | 'fails'>
/** The skills whose plan was read, in order, and the project each was read for. */
let planReads: [string, string][]
/** How many turns had been written into sessions when each plan was read. */
let writesWhenPlanRead: number[]

beforeEach(() => {
  handlers.clear()
  userData = mkdtempSync(join(tmpdir(), 'harness-session-run-'))
  clock = 1_000
  runs = 0
  sessions = 0
  feeds = new Map()
  writes = []
  writeOk = true
  timers = []
  files = new Map()
  plans = new Map()
  planReads = []
  writesWhenPlanRead = []
  const transcripts = createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} })
  transcriptRegistry = transcripts
  transcriptEntries = () => [...transcripts.forProject(ROOT).entries()]
  bridge = registerSessionBridge({
    transcripts,
    projectPathFor: () => ROOT,
    now: () => clock,
    newSessionId: () => `s${(sessions += 1)}`,
    newRunId: () => `r${(runs += 1)}`,
    agentName: () => 'John',
    writeDiagnostic: () => {},
    menuEntryFor: (_window, agentId, code) => (agentId === A || agentId === B ? MENU[code] : undefined),
    readText: (path) => Promise.resolve(files.get(path)),
    readPlan: (projectRoot, skill) => {
      planReads.push([projectRoot, skill])
      writesWhenPlanRead.push(writes.length)
      const plan = plans.get(skill)
      return plan === 'fails' ? Promise.reject(new Error('unreadable')) : Promise.resolve(plan)
    },
    schedule: (run, ms) => {
      const timer = { at: clock + ms, run, cancelled: false }
      timers.push(timer)
      return () => void (timer.cancelled = true)
    },
    spawn: (options: SpawnSessionOptions) => {
      feed = options.onFrame
      feeds.set(options.agentId as string, options.onFrame)
      exit = options.onExit
      const session: SessionProcess = {
        write: (text) => {
          writes.push(text)
          return Promise.resolve(writeOk)
        },
        interrupt: () => Promise.resolve(true),
        kill: () => {}
      }
      return Promise.resolve<SpawnOutcome>({ ok: true, session })
    }
  })
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

/** Let time pass: run every timer due by then, in order. */
function advance(ms: number): void {
  clock += ms
  for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
    if (!timer.cancelled && timer.at <= clock) {
      timer.cancelled = true
      timer.run()
    }
  }
}

const call = <T>(channel: string, sender: FakeSender, ...args: unknown[]): T =>
  (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)

const snapshot = (sender: FakeSender): ConversationSnapshot => {
  const reply = call<ConversationReply>(CONVERSATION_GET_CHANNEL, sender)
  if (!reply.ok) throw new Error('no snapshot')
  return reply.snapshot
}

const stream = (event: unknown, parent: string | null = null) => ({ type: 'stream_event', parent_tool_use_id: parent, event })
const messageStart = (id: string) => stream({ type: 'message_start', message: { id } })
const toolStart = (index: number, name: string, id: string) =>
  stream({ type: 'content_block_start', index, content_block: { type: 'tool_use', id, name, input: {} } })
const jsonDelta = (index: number, partial: string) =>
  stream({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: partial } })
const stop = (index: number) => stream({ type: 'content_block_stop', index })
const toolResult = (id: string, isError = false) => ({
  type: 'user',
  parent_tool_use_id: null,
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: 'ok' }] }
})
const result = (subtype = 'success', isError = false) => ({ type: 'result', subtype, is_error: isError })

/** A tool input streamed as the CLI streams it: one JSON text in pieces of `size`. */
function writeFrames(name: string, id: string, input: Record<string, unknown>, size = 5): unknown[] {
  const json = JSON.stringify(input)
  const pieces: unknown[] = []
  for (let at = 0; at < json.length; at += size) pieces.push(jsonDelta(1, json.slice(at, at + size)))
  return [toolStart(1, name, id), ...pieces, stop(1)]
}

const DOC = '# PRD\n\n## Vision\nWords.\n\n## **Scope**\nMore words.\n'

/** A window with John's session open and its activation turn over. */
async function idle(): Promise<FakeSender> {
  const sender = new FakeSender()
  await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, sender, A)
  feed(result())
  return sender
}

async function dispatch(sender: FakeSender, code: unknown, sessionId: unknown = 's1'): Promise<unknown> {
  return call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, sender, sessionId, code)
}

const memlog = (type: ArtifactObservation['type'], path = '_bmad/prds/x/.memlog.md'): ArtifactObservation => ({
  type,
  path,
  size: 1,
  mtimeMs: 1
})

describe('menu.dispatch', () => {
  it('writes /<skill> as the turn, raises run:started first and replies with the run, recording no user turn', async () => {
    const sender = await idle()
    const before = transcriptEntries().length
    sender.sent = []

    await expect(dispatch(sender, 'CP')).resolves.toEqual({ ok: true, runId: 'r1' })
    expect(writes.at(-1)).toBe('/bmad-prd')
    expect(sender.sent[0]).toEqual({
      name: 'run:started',
      payload: { runId: 'r1', sessionId: 's1', agentId: A, code: 'CP', at: clock }
    })
    expect(transcriptEntries()).toHaveLength(before)
    expect(snapshot(sender)).toMatchObject({ busy: ['s1'], runs: [{ runId: 'r1', status: 'running', code: 'CP' }] })
  })

  it('writes a prompt entry verbatim', async () => {
    const sender = await idle()
    await dispatch(sender, 'VP')
    expect(writes.at(-1)).toBe('Validate the PRD, please.')
  })

  it('refuses an unknown code, a busy, unknown or closed session and a code that is not a string, writing nothing', async () => {
    const sender = await idle()
    const written = writes.length

    await expect(dispatch(sender, 'ZZ')).resolves.toMatchObject({ ok: false, error: { code: 'menu/unknown-entry' } })
    await expect(dispatch(sender, 7)).resolves.toMatchObject({ ok: false, error: { code: 'session/invalid-turn' } })
    await expect(dispatch(sender, 'CP', 'nope')).resolves.toMatchObject({ ok: false, error: { code: 'session/not-found' } })
    await dispatch(sender, 'CP')
    await expect(dispatch(sender, 'CP')).resolves.toMatchObject({ ok: false, error: { code: 'session/busy' } })
    expect(writes.length).toBe(written + 1)
    call(SESSION_CLOSE_CHANNEL, sender, 's1')
    await expect(dispatch(sender, 'CP')).resolves.toMatchObject({ ok: false, error: { code: 'session/not-found' } })
    expect(writes.length).toBe(written + 1)
  })

  it('starts no run when the turn could not be written: write-failed, no run:started, no card, and the session free', async () => {
    const sender = await idle()
    sender.sent = []
    writeOk = false

    await expect(dispatch(sender, 'CP')).resolves.toEqual({
      ok: false,
      error: { code: 'session/write-failed', message: 'session · the turn could not be written' }
    })
    expect(sender.of('run:started')).toEqual([])
    expect(snapshot(sender)).toMatchObject({ runs: [], busy: [] })
  })

  it('raises no run, document event or card for a plain chat turn that writes a document', async () => {
    const sender = await idle()
    sender.sent = []
    await call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, 's1', 'write it')
    for (const frame of [messageStart('m1'), ...writeFrames('Write', 't1', { file_path: `${ROOT}/prd.md`, content: DOC }), toolResult('t1'), result()]) {
      feed(frame)
    }
    advance(1000)
    expect(sender.names.filter((name) => /^(?:run|doc):/.test(name))).toEqual([])
    expect(snapshot(sender).runs).toEqual([])
  })
})

describe('a run that writes a document', () => {
  it('coalesces the write’s prose, preserving every byte, and commits it once on its tool_result', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    const frames = [messageStart('m1'), ...writeFrames('Write', 't1', { file_path: `${ROOT}/_bmad/prd.md`, content: DOC }, 2)]
    // The call's block stop is the last frame: it raises the call's step, which is another event and releases what is held.
    const blockStop = frames.pop()
    for (const frame of frames) feed(frame)

    // Nothing released yet: the timer has not run and nothing else came.
    expect(sender.of('doc:prose')).toEqual([])
    advance(99)
    expect(sender.of('doc:prose')).toEqual([])
    advance(1)
    const prose = sender.of('doc:prose')
    expect(prose).toHaveLength(1)
    expect(prose.map((piece) => piece.text).join('')).toBe(DOC)
    expect(prose[0]).toMatchObject({ runId: 'r1', callId: 't1', path: '_bmad/prd.md' })
    expect(sender.of('run:step')).toEqual([])
    feed(blockStop)
    expect(sender.of('run:step')).toEqual([{ runId: 'r1', sessionId: 's1', callId: 't1', status: 'running', label: 'write _bmad/prd.md', at: clock }])

    feed(toolResult('t1'))
    feed(toolResult('t1'))
    expect(sender.of('doc:committed')).toEqual([
      { ok: true, runId: 'r1', sessionId: 's1', callId: 't1', path: '_bmad/prd.md', sections: ['Vision', 'Scope'], at: clock }
    ])
  })

  it('releases held prose before any later event, so the window hears it in order', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    for (const frame of [messageStart('m1'), ...writeFrames('Write', 't1', { file_path: `${ROOT}/a.md`, content: DOC })]) feed(frame)
    feed(toolResult('t1'))

    const names = sender.names.filter((name) => name.startsWith('doc:'))
    expect(names).toEqual(['doc:prose', 'doc:committed'])
    expect(sender.of('doc:prose').map((piece) => piece.text).join('')).toBe(DOC)
  })

  it('commits a rejected write as the envelope and no sections', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    for (const frame of [messageStart('m1'), ...writeFrames('Write', 't1', { file_path: `${ROOT}/a.md`, content: DOC }), toolResult('t1', true)]) {
      feed(frame)
    }
    expect(sender.of('doc:committed')).toEqual([
      expect.objectContaining({ ok: false, callId: 't1', error: { code: 'doc/write-rejected', message: 'doc · the write was rejected' } })
    ])
    expect(snapshot(sender).runs[0].documents).toEqual([{ path: 'a.md', callId: 't1', text: DOC, written: DOC.length, sections: [] }])
  })

  it('commits an Edit that applied with the whole patched document, and streams none of it', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    for (const frame of [messageStart('m1'), ...writeFrames('Write', 't1', { file_path: `${ROOT}/a.md`, content: DOC }), toolResult('t1')]) feed(frame)
    for (const frame of [messageStart('m2'), ...writeFrames('Edit', 't2', { file_path: `${ROOT}/a.md`, old_string: 'Words.', new_string: '## Goals\nNew.' }), toolResult('t2')]) feed(frame)
    advance(100)
    const patched = DOC.replace('Words.', '## Goals\nNew.')
    expect(sender.of('doc:prose').map((piece) => piece.callId)).not.toContain('t2')
    expect(sender.of('doc:committed').at(-1)).toEqual({
      ok: true, runId: 'r1', sessionId: 's1', callId: 't2', path: 'a.md', sections: ['Vision', 'Goals', 'Scope'], text: patched, at: expect.any(Number)
    })
    expect(snapshot(sender).runs[0].documents).toEqual([{ path: 'a.md', callId: 't2', text: patched, written: DOC.length, sections: ['Vision', 'Goals', 'Scope'] }])
  })

  it('keeps no document buffer past its run: the next run’s Edit of the path patches nothing', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    for (const frame of [messageStart('m1'), ...writeFrames('Write', 't1', { file_path: `${ROOT}/a.md`, content: DOC }), toolResult('t1'), result()]) feed(frame)
    await dispatch(sender, 'CP')
    for (const frame of [messageStart('m2'), ...writeFrames('Edit', 't2', { file_path: `${ROOT}/a.md`, old_string: 'Words.', new_string: 'New.' }), toolResult('t2')]) feed(frame)
    const commit = sender.of('doc:committed').at(-1)
    expect(commit).toMatchObject({ ok: true, callId: 't2', path: 'a.md', sections: [] })
    expect(commit).not.toHaveProperty('text')
  })

  it('drops a write that never came back when the run ends: no commit, then or later', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    for (const frame of [messageStart('m1'), ...writeFrames('Write', 't1', { file_path: `${ROOT}/a.md`, content: DOC }).slice(0, -1), result()]) {
      feed(frame)
    }
    feed(toolResult('t1'))
    expect(sender.of('doc:committed')).toEqual([])
    expect(sender.names.filter((name) => name !== 'persona:state').slice(-2)).toEqual(['run:finished', 'session:awaiting-turn'])
  })

  it('sends nothing to the card for a write outside the project or to the memlog', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    for (const frame of [
      messageStart('m1'),
      ...writeFrames('Write', 't1', { file_path: '/elsewhere/a.md', content: DOC }),
      toolResult('t1'),
      ...writeFrames('Write', 't2', { file_path: `${ROOT}/_bmad/x/.memlog.md`, content: '- (event) x' }),
      toolResult('t2')
    ]) {
      feed(frame)
    }
    advance(100)
    expect(sender.names.filter((name) => name.startsWith('doc:') || name === 'run:note')).toEqual([])
  })
})

describe('the end of a run', () => {
  it('raises run:finished before the session is free, and the persona reads live once it is', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    sender.sent = []
    feed(result())

    expect(sender.names).toEqual(['run:finished', 'session:awaiting-turn', 'persona:state'])
    expect(sender.names.indexOf('run:finished')).toBeLessThan(sender.names.indexOf('session:awaiting-turn'))
    expect(sender.of('persona:state').at(-1)).toMatchObject({ agentId: A, state: 'live' })
    expect(snapshot(sender).personas).toEqual([expect.objectContaining({ agentId: A, state: 'live' })])
    expect(snapshot(sender).runs[0]).toMatchObject({ status: 'finished', endedAt: clock })
  })

  it('detaches when the next turn starts: work, then idle rather than live', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    feed(result())
    await call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, 's1', 'thanks')
    expect(sender.of('persona:state').at(-1)).toMatchObject({ state: 'work' })
    feed(result())
    expect(sender.of('persona:state').at(-1)).toMatchObject({ state: 'idle' })
  })

  it('detaches when a turn nobody sent wakes the session after a run: work, then idle rather than live', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    feed(result())
    expect(sender.of('persona:state').at(-1)).toMatchObject({ state: 'live' })

    // A background task finishing wakes the main thread: a turn nobody sent.
    feed(messageStart('m-wake'))
    expect(sender.of('persona:state').at(-1)).toMatchObject({ state: 'work' })
    feed(result())
    expect(sender.of('persona:state').at(-1)).toMatchObject({ state: 'idle' })
    expect(snapshot(sender).personas).toEqual([])
  })

  it('reads a result marked is_error as run:failed with the subtype, and the persona as error', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    feed(result('error_max_budget_usd', true))

    expect(sender.of('run:failed')).toEqual([
      {
        runId: 'r1',
        sessionId: 's1',
        error: { code: 'run/failed', message: 'run · the run failed', detail: 'error_max_budget_usd' },
        at: clock
      }
    ])
    expect(sender.of('run:finished')).toEqual([])
    expect(sender.of('persona:state').at(-1)).toMatchObject({ state: 'error' })
    expect(snapshot(sender).runs[0]).toMatchObject({ status: 'failed', error: { code: 'run/failed' } })
  })

  it('keeps the run through a result with a background task live, and ends it on the result that frees the session', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    feed({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'bg' }] })
    feed(result())
    expect(sender.of('run:finished')).toEqual([])
    feed({ type: 'system', subtype: 'background_tasks_changed', tasks: [] })
    feed(result())
    expect(sender.of('run:finished')).toHaveLength(1)
  })

  it('fails the run as session-ended before session:closed when the process exits', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    exit()
    const names = sender.names
    expect(sender.of('run:failed')).toEqual([expect.objectContaining({ error: { code: 'run/session-ended', message: 'run · the session ended' } })])
    expect(names.indexOf('run:failed')).toBeLessThan(names.indexOf('session:closed'))
  })

  it('fails the run as session-ended before session:closed when the session is closed by its command', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    expect(call(SESSION_CLOSE_CHANNEL, sender, 's1')).toEqual({ ok: true })
    const names = sender.names
    expect(sender.of('run:failed')).toEqual([
      expect.objectContaining({ runId: 'r1', error: { code: 'run/session-ended', message: 'run · the session ended' } })
    ])
    expect(names.indexOf('session:closed')).toBeGreaterThan(-1)
    expect(names.indexOf('run:failed')).toBeLessThan(names.indexOf('session:closed'))
    expect(snapshot(sender).runs[0]).toMatchObject({ status: 'failed' })
  })

  it('releases held prose before the terminal event', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    for (const frame of [messageStart('m1'), ...writeFrames('Write', 't1', { file_path: `${ROOT}/a.md`, content: DOC }), result()]) feed(frame)
    const names = sender.names.filter((name) => name === 'doc:prose' || name === 'run:finished')
    expect(names).toEqual(['doc:prose', 'run:finished'])
    expect(timers.every((timer) => timer.cancelled)).toBe(true)
  })
})

describe('the section plan, read at dispatch', () => {
  const TEMPLATE: TemplatePlan = {
    spine: ['Document Purpose', 'Vision', 'Target User'],
    menu: ['Labour Relations Posture', 'Business Case/Pricing Posture', 'Why Now']
  }
  const PATH = `${ROOT}/_bmad/prds/x/.memlog.md`

  it('puts the skill’s predicted sections on run:started, and in the card a reloading window is handed', async () => {
    plans.set('bmad-prd', TEMPLATE)
    const sender = await idle()
    await dispatch(sender, 'CP')

    expect(planReads).toEqual([[ROOT, 'bmad-prd']])
    expect(sender.of('run:started')[0].plan).toEqual(['Document Purpose', 'Vision', 'Target User'])
    expect(snapshot(sender).runs[0].plan).toEqual(['Document Purpose', 'Vision', 'Target User'])
  })

  it('reads the skill’s own template from the project by default, with no readPlan override', async () => {
    const project = mkdtempSync(join(tmpdir(), 'harness-plan-project-'))
    try {
      const assets = join(project, '.claude', 'skills', 'bmad-prd', 'assets')
      mkdirSync(assets, { recursive: true })
      writeFileSync(join(assets, 'prd-template.md'), '## Scaffolding\n\n```markdown\n## 0. Purpose\n## 1. Vision\n```\n')
      handlers.clear()
      registerSessionBridge({
        transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
        projectPathFor: () => project,
        now: () => clock,
        newSessionId: () => 's1',
        newRunId: () => 'r1',
        agentName: () => 'John',
        writeDiagnostic: () => {},
        menuEntryFor: (_window, _agent, code) => MENU[code],
        readText: () => Promise.resolve(undefined),
        schedule: () => () => {},
        spawn: (options: SpawnSessionOptions) => {
          feed = options.onFrame
          return Promise.resolve<SpawnOutcome>({ ok: true, session: { write: () => Promise.resolve(true), interrupt: () => Promise.resolve(true), kill: () => {} } })
        }
      })
      const sender = await idle()
      await dispatch(sender, 'CP')
      expect(sender.of('run:started')[0].plan).toEqual(['Purpose', 'Vision'])
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })

  it('reads the plan before the turn is written, so the run starts with it', async () => {
    plans.set('bmad-prd', TEMPLATE)
    const sender = await idle()
    const written = writes.length
    await dispatch(sender, 'CP')
    expect(writesWhenPlanRead).toEqual([written])
    expect(writes).toHaveLength(written + 1)
  })

  it('carries no plan for a skill with no template, for a plan that cannot be read, and for a prompt entry, and the run still starts', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    expect(sender.of('run:started')[0]).not.toHaveProperty('plan')
    expect(snapshot(sender).runs[0]).not.toHaveProperty('plan')
    feed(result())

    plans.set('bmad-prd', 'fails')
    await expect(dispatch(sender, 'CP')).resolves.toEqual({ ok: true, runId: 'r2' })
    expect(sender.of('run:started')[1]).not.toHaveProperty('plan')
    feed(result())

    plans.set('bmad-prd', TEMPLATE)
    await dispatch(sender, 'VP')
    expect(sender.of('run:started')[2]).not.toHaveProperty('plan')
    // Only a skill reads a template.
    expect(planReads.map(([, skill]) => skill)).toEqual(['bmad-prd', 'bmad-prd'])
  })

  it('carries no plan for a template that names no sections', async () => {
    plans.set('bmad-prd', { spine: [], menu: ['Why Now'] })
    const sender = await idle()
    await dispatch(sender, 'CP')
    expect(sender.of('run:started')[0]).not.toHaveProperty('plan')
  })

  it('lets one press start one turn: a second dispatch while the plan is being read is refused busy', async () => {
    plans.set('bmad-prd', TEMPLATE)
    const sender = await idle()
    const [first, second] = await Promise.all([dispatch(sender, 'CP'), dispatch(sender, 'CP')])
    expect([first, second].filter((reply) => (reply as { ok: boolean }).ok)).toHaveLength(1)
    expect(sender.of('run:started')).toHaveLength(1)
    expect(writes.filter((text) => text === '/bmad-prd')).toHaveLength(1)
  })

  it('tells the Adapt-In sections a concern-scan note names as pulled, in menu order, once, and none for other notes', async () => {
    plans.set('bmad-prd', TEMPLATE)
    const sender = await idle()
    files.set(PATH, '---\ntopic: x\n---\n\n')
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:found'))
    await dispatch(sender, 'CP')
    const append = async (line: string): Promise<void> => {
      files.set(PATH, `${files.get(PATH) ?? ''}${line}\n`)
      await bridge.observeArtifact(sender, ROOT, memlog('artifact:written'))
    }
    await append('- (event by john) Concern-Scan surfaced: labour relations posture and Why Now, and Something Else')
    await append('- (event by john) concern scan surfaced: Why Now again')
    await append('- (decision by john) we will mention Business Case/Pricing Posture')
    await append('- (event by john) concern scan: nothing from the menu')

    expect(sender.of('run:note').map((note) => note.pulled)).toEqual([
      ['Labour Relations Posture', 'Why Now'],
      undefined,
      undefined,
      undefined
    ])
    expect(sender.of('run:note')[1]).not.toHaveProperty('pulled')
    expect(snapshot(sender).runs[0].plan).toEqual(['Document Purpose', 'Vision', 'Target User', 'Labour Relations Posture', 'Why Now'])
  })

  it('pulls nothing for a run with no template', async () => {
    const sender = await idle()
    files.set(PATH, '---\n---\n')
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:found'))
    await dispatch(sender, 'CP')
    files.set(PATH, '---\n---\n- concern scan surfaced: Why Now\n')
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:written'))
    expect(sender.of('run:note')[0]).not.toHaveProperty('pulled')
    expect(snapshot(sender).runs[0]).not.toHaveProperty('plan')
  })
})

describe('the run’s notes, from its memlog', () => {
  const PATH = `${ROOT}/_bmad/prds/x/.memlog.md`
  const HEAD = '---\ntopic: x\n---\n\n'

  it('notes each entry appended after the count known at the run’s start, in file order, never the scan', async () => {
    const sender = await idle()
    files.set(PATH, `${HEAD}- (event) before one\n- (event) before two\n`)
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:found'))
    await dispatch(sender, 'CP')
    files.set(PATH, `${HEAD}- (event) before one\n- (event) before two\n- (decision) **first** note\n- second\n`)
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:written'))

    expect(sender.of('run:note')).toEqual([
      { runId: 'r1', sessionId: 's1', text: '- (decision) **first** note', at: clock },
      { runId: 'r1', sessionId: 's1', text: '- second', at: clock }
    ])
    expect(snapshot(sender).runs[0].notes.map((note) => note.text)).toEqual(['- (decision) **first** note', '- second'])
  })

  it('reads a memlog first seen during the run from its first entry, and an unreadable one as nothing', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:written'))
    expect(sender.of('run:note')).toEqual([])
    files.set(PATH, `${HEAD}- (event) one\n`)
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:written'))
    expect(sender.of('run:note').map((note) => note.text)).toEqual(['- (event) one'])
  })

  it('counts entries appended with no run in flight, and notes nothing for them', async () => {
    const sender = await idle()
    files.set(PATH, `${HEAD}- one\n`)
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:written'))
    await dispatch(sender, 'CP')
    files.set(PATH, `${HEAD}- one\n- two\n`)
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:written'))
    expect(sender.of('run:note').map((note) => note.text)).toEqual(['- two'])
  })

  it('attributes a note to neither run while two are in flight in the window, and to the one left once the other ends', async () => {
    const sender = await idle()
    await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, sender, B)
    feeds.get(B)?.(result())
    await expect(dispatch(sender, 'CP', 's1')).resolves.toEqual({ ok: true, runId: 'r1' })
    await expect(dispatch(sender, 'VP', 's2')).resolves.toEqual({ ok: true, runId: 'r2' })

    files.set(PATH, `${HEAD}- (event) whose\n`)
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:written'))
    expect(sender.of('run:note')).toEqual([])
    expect(snapshot(sender).runs.map((run) => run.notes)).toEqual([[], []])

    // The analyst's run ends: one run is left in flight, and the next append is its note.
    feeds.get(B)?.(result())
    expect(sender.of('run:finished')).toEqual([expect.objectContaining({ runId: 'r2', sessionId: 's2' })])
    files.set(PATH, `${HEAD}- (event) whose\n- (decision) john's\n`)
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:written'))
    expect(sender.of('run:note')).toEqual([{ runId: 'r1', sessionId: 's1', text: "- (decision) john's", at: clock }])
    expect(snapshot(sender).runs.map((run) => run.notes.map((note) => note.text))).toEqual([["- (decision) john's"], []])
  })

  it('ignores a file that is not a memlog', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    files.set(`${ROOT}/_bmad/prds/x/prd.md`, '- looks like an entry\n')
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:written', '_bmad/prds/x/prd.md'))
    expect(sender.of('run:note')).toEqual([])
  })

  it('releases held prose before a note, so the card’s order is the order things happened', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    for (const frame of [messageStart('m1'), ...writeFrames('Write', 't1', { file_path: `${ROOT}/a.md`, content: DOC })]) feed(frame)
    files.set(PATH, `${HEAD}- one\n`)
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:written'))
    expect(sender.names.filter((name) => name === 'doc:prose' || name === 'run:note')).toEqual(['doc:prose', 'run:note'])
  })
})

describe('a window that reloads mid-run', () => {
  it('is handed the card with its notes, every document, their sections and status', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    files.set(`${ROOT}/_bmad/x/.memlog.md`, '- (event) n\n')
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:written', '_bmad/x/.memlog.md'))
    for (const frame of [messageStart('m1'), ...writeFrames('Write', 't1', { file_path: `${ROOT}/a.md`, content: DOC }), toolResult('t1')]) feed(frame)
    for (const frame of writeFrames('Write', 't2', { file_path: `${ROOT}/b.md`, content: 'partial' })) feed(frame)
    advance(100)

    expect(snapshot(sender).runs).toEqual([
      {
        runId: 'r1',
        sessionId: 's1',
        agentId: A,
        code: 'CP',
        startedAt: expect.any(Number),
        status: 'running',
        notes: [{ text: '- (event) n', at: expect.any(Number) }],
        steps: [
          { callId: 't1', label: 'write a.md', status: 'done', startedAt: expect.any(Number), endedAt: expect.any(Number), notesBefore: 1 },
          { callId: 't2', label: 'write b.md', status: 'running', startedAt: expect.any(Number), notesBefore: 1 }
        ],
        documents: [
          { path: 'a.md', callId: 't1', text: DOC, written: DOC.length, sections: ['Vision', 'Scope'] },
          { path: 'b.md', callId: 't2', text: 'partial', written: 7, sections: [] }
        ]
      }
    ])
  })

  it('loses the cards when the conversation ends', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    feed(result())
    call(CONVERSATION_END_CHANNEL, sender, ROOT)
    expect(snapshot(sender).runs).toEqual([])
  })
})

describe('what the run says of the rail’s rows (Story 3.6)', () => {
  /** What a window's rail projection is told, in order: a path and its annotation, or `null` when it is dropped. */
  function railOf(sender: FakeSender): [string, RailAnnotation | null][] {
    const told: [string, RailAnnotation | null][] = []
    railAnnotatorFor(sender).bind({ annotate: (path, annotation) => void told.push([path, annotation]), markRoom: () => undefined, unmarkRoom: () => undefined, clearRoom: () => undefined })
    return told
  }
  const write = (id: string, path: string, content: string): unknown[] => [
    messageStart(`m-${id}`),
    ...writeFrames('Write', id, { file_path: `${ROOT}/${path}`, content }),
    toolResult(id)
  ]
  const owner = { agentId: A }

  it('tells the persona and the section in flight for each file a `Write` streams, and nothing before one does', async () => {
    const sender = await idle()
    const told = railOf(sender)
    await dispatch(sender, 'CP')
    expect(told).toEqual([])

    for (const frame of write('t1', '_bmad/addendum.md', '## Notes\nA.\n')) feed(frame)
    for (const frame of write('t2', '_bmad/prd.md', DOC)) feed(frame)

    expect(told).toEqual([
      ['_bmad/addendum.md', { text: 'writing · §1 Notes', owner }],
      ['_bmad/prd.md', { text: 'writing · §2 Scope', owner }]
    ])
  })

  it('says `revising` for an applied `Edit`, with the section of its first changed character, and `writing` again on the file’s next `Write`', async () => {
    const sender = await idle()
    const told = railOf(sender)
    await dispatch(sender, 'CP')
    for (const frame of write('t1', '_bmad/prd.md', DOC)) feed(frame)
    for (const frame of [messageStart('m2'), ...writeFrames('Edit', 't2', { file_path: `${ROOT}/_bmad/prd.md`, old_string: 'Words.', new_string: 'Changed.' }), toolResult('t2')]) feed(frame)
    expect(told.at(-1)).toEqual(['_bmad/prd.md', { text: 'revising · §1 Vision', owner }])

    for (const frame of write('t3', '_bmad/prd.md', '## Vision\nAgain.\n')) feed(frame)
    expect(told.at(-1)).toEqual(['_bmad/prd.md', { text: 'writing · §1 Vision', owner }])
  })

  it('drops a path’s annotation when its `Write` is rejected, and leaves another file’s', async () => {
    const sender = await idle()
    const told = railOf(sender)
    await dispatch(sender, 'CP')
    for (const frame of write('t1', '_bmad/addendum.md', '## Notes\nA.\n')) feed(frame)
    for (const frame of [messageStart('m2'), ...writeFrames('Write', 't2', { file_path: `${ROOT}/_bmad/prd.md`, content: DOC }), toolResult('t2', true)]) feed(frame)
    advance(100)

    expect(told.map(([path, annotation]) => [path, annotation?.text ?? null])).toEqual([
      ['_bmad/addendum.md', 'writing · §1 Notes'],
      ['_bmad/prd.md', 'writing · §2 Scope'],
      ['_bmad/prd.md', null]
    ])
  })

  it('says nothing for an `Edit` of a file no `Write` of the run started, a memlog, or a chat turn’s write', async () => {
    const sender = await idle()
    const told = railOf(sender)
    await dispatch(sender, 'CP')
    for (const frame of [messageStart('m1'), ...writeFrames('Edit', 't1', { file_path: `${ROOT}/_bmad/x.md`, old_string: 'a', new_string: 'b' }), toolResult('t1')]) feed(frame)
    for (const frame of [messageStart('m2'), ...writeFrames('Write', 't2', { file_path: `${ROOT}/_bmad/y/.memlog.md`, content: '- (event) x' }), toolResult('t2')]) feed(frame)
    advance(100)
    expect(told).toEqual([])
    feed(result())

    await call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, 's1', 'write it')
    for (const frame of write('t3', '_bmad/chat.md', DOC)) feed(frame)
    advance(100)
    expect(told).toEqual([])
  })

  it.each([
    ['finished', () => feed(result()), null],
    ['failed', () => feed(result('error_max_budget_usd', true)), 'stopped'],
    ['ended with its session', () => exit(), 'stopped']
  ] as const)('says what the run’s end left on every path it was showing, when it %s', async (_ending, end, left) => {
    const sender = await idle()
    const told = railOf(sender)
    await dispatch(sender, 'CP')
    for (const frame of write('t1', '_bmad/prd.md', DOC)) feed(frame)
    for (const frame of write('t2', '_bmad/addendum.md', '## Notes\nA.\n')) feed(frame)
    expect(told).toHaveLength(2)

    end()

    // A finished run drops its annotations; one that ended early leaves the one word, owner and all.
    expect(told.slice(2).map(([path, annotation]) => [path, annotation?.text ?? null])).toEqual([
      ['_bmad/prd.md', left],
      ['_bmad/addendum.md', left]
    ])
    for (const [, annotation] of told.slice(2)) {
      if (annotation !== null) expect(annotation.owner).toEqual({ agentId: A })
    }
  })

  it('keeps a run’s annotations to its own window', async () => {
    const sender = await idle()
    const other = new FakeSender(2)
    const told = railOf(other)
    await dispatch(sender, 'CP')
    for (const frame of write('t1', '_bmad/prd.md', DOC)) feed(frame)

    expect(told).toEqual([])
  })
})

describe('the run cards kept with the transcript (Story 3.7)', () => {
  /** What the transcript file holds of the run cards once it is flushed, as the quit flushes it. */
  const kept = (): { card: { runId: string; status: string; notes: unknown[] }; lastAt: number }[] => {
    transcriptRegistry.flushAll()
    return JSON.parse(readFileSync(transcriptFilePath(userData, ROOT), 'utf8')).runs ?? []
  }

  it('keeps the card after every run event, with the moment of that event', async () => {
    const sender = await idle()
    clock = 2_000
    await dispatch(sender, 'CP')
    expect(kept().map((run) => [run.card.runId, run.card.status, run.lastAt])).toEqual([['r1', 'running', 2_000]])

    clock = 2_500
    files.set(`${ROOT}/_bmad/prds/x/.memlog.md`, '- (decision) Fast path\n')
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:found'))
    files.set(`${ROOT}/_bmad/prds/x/.memlog.md`, '- (decision) Fast path\n- (assumption) Two readers\n')
    clock = 3_000
    await bridge.observeArtifact(sender, ROOT, memlog('artifact:written'))
    expect(kept()).toMatchObject([{ lastAt: 3_000, card: { runId: 'r1', status: 'running', notes: [{ text: '- (assumption) Two readers' }] } }])

    clock = 4_000
    for (const frame of [messageStart('m1'), ...writeFrames('Write', 't1', { file_path: `${ROOT}/_bmad/prd.md`, content: DOC })]) feed(frame)
    clock = 4_500
    feed(toolResult('t1'))
    expect(kept()[0]).toMatchObject({ lastAt: 4_500 })

    clock = 5_000
    feed(result())
    expect(kept()).toMatchObject([{ lastAt: 5_000, card: { runId: 'r1', status: 'finished' } }])
    // What is kept is the card the window is handed.
    expect(kept()[0].card).toEqual(snapshot(sender).runs[0])
  })

  it('keeps one card per run, replaced as the run goes on, in the order the runs started', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    feed(result())
    await dispatch(sender, 'VP')
    feed(result(undefined, true))

    expect(kept().map((run) => [run.card.runId, run.card.status])).toEqual([
      ['r1', 'finished'],
      ['r2', 'failed']
    ])
  })

  it('keeps a stopped run as stopped, and the moment of the result it ended on', async () => {
    const sender = await idle()
    clock = 2_000
    await dispatch(sender, 'CP')
    const reply = await call<Promise<unknown>>(RUN_STOP_CHANNEL, sender, 'r1')
    expect(reply).toEqual({ ok: true })
    clock = 2_600
    feed(result('error_during_execution', true))

    expect(kept()).toMatchObject([{ lastAt: 2_600, card: { runId: 'r1', status: 'stopped', endedAt: 2_600 } }])
  })

  it('keeps no card for a plain chat turn, and none of what a persona said among the cards', async () => {
    const sender = await idle()
    await call<Promise<unknown>>(TURN_SEND_CHANNEL, sender, 's1', 'write it')
    feed(messageStart('m1'))
    feed(result())

    expect(kept()).toEqual([])
  })

  it('keeps the cards of the runs of every session of the window, under the one project', async () => {
    const sender = await idle()
    await dispatch(sender, 'CP')
    await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, sender, B)
    feeds.get(B)?.(result())
    await dispatch(sender, 'CP', 's2')

    expect(kept().map((run) => run.card.runId)).toEqual(['r1', 'r2'])
  })
})
