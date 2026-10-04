import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationReply, ConversationSnapshot } from '../shared/conversation'
import type { ContractEvent, EventName, EventPayload } from '../shared/events'
import type { ArtifactObservation } from '../shared/rail'
import { createTranscriptRegistry } from './projections/transcript'
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

const { CONVERSATION_END_CHANNEL, CONVERSATION_GET_CHANNEL, MENU_DISPATCH_CHANNEL, SESSION_CLOSE_CHANNEL, SESSION_OPEN_CHANNEL, TURN_SEND_CHANNEL, registerSessionBridge } =
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
  const transcripts = createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} })
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
    schedule: (run, ms) => {
      const timer = { at: clock + ms, run, cancelled: false }
      timers.push(timer)
      return () => void (timer.cancelled = true)
    },
    spawn: (options: SpawnSessionOptions) => {
      feed = options.onFrame
      feeds.set(options.agentId, options.onFrame)
      exit = options.onExit
      const session: SessionProcess = {
        write: (text) => {
          writes.push(text)
          return Promise.resolve(writeOk)
        },
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
