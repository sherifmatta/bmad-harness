import { createElement } from 'react'
import type { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationReply, ConversationSnapshot, RunCardSnapshot, TranscriptFile } from '../src/shared/conversation'
import { hydrate, initialConversation } from '../src/renderer/ui/chat/conversation-state'
import { createProseStore } from '../src/renderer/ui/chat/prose-store'
import type { ProseStore } from '../src/renderer/ui/chat/prose-store'
import type { TranscriptEntry } from '../src/renderer/ui/chat/transcript-entry'

/**
 * Story 3.7's relaunch clause (Story 2.7's dead card, FR100): the cards of the
 * runs a conversation held are stored with its transcript, and a launch after
 * the app went away shows each one as a dead terminal card. The first launch is
 * the real session bridge over a fake process, a run recorded and flushed as the
 * app's quit flushes it; the second is a fresh bridge and registry on the same
 * data directory, which knows no session, no busy turn and no persona state of
 * the first. What it hands the window is then read by the renderer's own
 * hydration and drawn by its own cards (`src/renderer/ui/chat/dead-card.dom.test.tsx`
 * runs the same cards under a DOM with the clock held).
 */

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler)
  },
  BrowserWindow: { fromWebContents: () => null },
  app: { getPath: () => '/unused' }
}))

/** How the window has its cards drawn: the viewed persona, the runs expanded, and what a persona is called. */
type Collapse = {
  viewedId: string | undefined
  expanded: ReadonlySet<string>
  nameOf: (agentId: string | undefined) => string
  onExpand: (runId: string) => void
}

// The thread is a `.tsx` module that needs the DOM lib, which the node program does not have, so it is
// loaded by a path the typechecker does not follow and drawn here with `createElement`.
const TRANSCRIPT = resolve(import.meta.dirname, '..', 'src', 'renderer', 'ui', 'chat', 'transcript.tsx')
const { Turns } = (await import(/* @vite-ignore */ TRANSCRIPT)) as {
  Turns: ComponentType<{ entries: readonly TranscriptEntry[]; prose: ProseStore; onStop: (runId: string) => void; collapse: Collapse }>
}
const { createTranscriptRegistry } = await import('../src/main/projections/transcript')
const { transcriptFilePath } = await import('../src/main/sources/persistence/transcript-file')
const {
  CONVERSATION_END_CHANNEL,
  CONVERSATION_GET_CHANNEL,
  MENU_DISPATCH_CHANNEL,
  RUN_STOP_CHANNEL,
  SESSION_OPEN_CHANNEL,
  registerSessionBridge
} = await import('../src/main/session-bridge')

const ROOT = '/work/project'
const A = 'bmad-agent-pm'

class FakeSender {
  private gone: (() => void) | undefined
  constructor(readonly id = 1) {}
  send(): void {}
  isDestroyed(): boolean {
    return false
  }
  once(event: string, listener: () => void): void {
    if (event === 'destroyed') this.gone = listener
  }
  /** The window is closed: main hears `destroyed` once. */
  destroy(): void {
    this.gone?.()
  }
}

let userData: string
let clock: number
let sessions: number
let runs: number
/** The processes started, per launch: a relaunch finds none of the last launch's. */
let spawned: number
let feed: (frame: unknown) => void
/** What the transcript registry logged, as the app’s stderr would have it. */
let logs: string[]

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'harness-relaunch-'))
  clock = 1_000
  sessions = 0
  runs = 0
  spawned = 0
  logs = []
})

afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
  vi.useRealTimers()
})

/** The app, started over `userData`: a registry and a bridge with nothing carried over from the one before. */
function launch() {
  handlers.clear()
  const transcripts = createTranscriptRegistry({ userDataPath: () => userData, log: (line) => void logs.push(line), now: () => clock })
  registerSessionBridge({
    transcripts,
    projectPathFor: () => ROOT,
    now: () => clock,
    newSessionId: () => `s${(sessions += 1)}`,
    newRunId: () => `r${(runs += 1)}`,
    agentName: () => 'John',
    writeDiagnostic: () => {},
    menuEntryFor: (_window, _agent, code) =>
      code === 'CP' ? { code: 'CP', description: 'Create the PRD', action: { kind: 'skill', skill: 'bmad-prd' } } : undefined,
    readPlan: () => Promise.resolve(undefined),
    readText: () => Promise.resolve(undefined),
    schedule: () => () => {},
    spawn: (options) => {
      spawned += 1
      feed = options.onFrame
      return Promise.resolve({ ok: true, session: { write: () => Promise.resolve(true), interrupt: () => Promise.resolve(true), kill: () => {} } })
    }
  })
  /** A window of the app, by its sender: a second one, with its own id, is another window of the same project. */
  const windowOf = (sender: FakeSender) => {
    const call = <T>(channel: string, ...args: unknown[]): T =>
      (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)
    const snapshot = (): ConversationSnapshot => {
      const reply = call<ConversationReply>(CONVERSATION_GET_CHANNEL)
      if (!reply.ok) throw new Error('no snapshot')
      return reply.snapshot
    }
    return { call, snapshot }
  }
  const sender = new FakeSender()
  return { transcripts, sender, windowOf, ...windowOf(sender) }
}

const result = (isError = false) => ({ type: 'result', subtype: isError ? 'error_during_execution' : 'success', is_error: isError })
const stream = (event: unknown) => ({ type: 'stream_event', parent_tool_use_id: null, event })
const DOC = '# PRD\n\n## Vision\nWords.\n'

/** The writes of a document, frame by frame as the CLI streams them, and the result the call comes back with. */
function writing(id: string, path: string, content: string): unknown[] {
  const json = JSON.stringify({ file_path: `${ROOT}/${path}`, content })
  const pieces: unknown[] = []
  for (let at = 0; at < json.length; at += 7) {
    pieces.push(stream({ type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: json.slice(at, at + 7) } }))
  }
  return [
    stream({ type: 'message_start', message: { id: `m-${id}` } }),
    stream({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id, name: 'Write', input: {} } }),
    ...pieces,
    stream({ type: 'content_block_stop', index: 1 }),
    { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: false, content: 'ok' }] } }
  ]
}

/**
 * A first launch whose window had one run that finished and one still in flight
 * when the app went away: the second wrote a document and a note's worth of
 * time passed after its last event.
 */
async function firstLaunch() {
  const app = launch()
  await app.call<Promise<unknown>>(SESSION_OPEN_CHANNEL, A)
  feed(result())
  await app.call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, 's1', 'CP')
  clock = 2_000
  for (const frame of writing('t1', '_bmad/prd.md', DOC)) feed(frame)
  clock = 3_000
  feed(result())
  clock = 4_000
  await app.call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, 's1', 'CP')
  clock = 5_000
  for (const frame of writing('t2', '_bmad/addendum.md', DOC)) feed(frame)
  // The app goes away here, with the second run in flight and its last event at 5,000; the quit flushes the file.
  clock = 90_000
  app.transcripts.flushAll()
  return app
}

const fileOnDisk = (): TranscriptFile => JSON.parse(readFileSync(transcriptFilePath(userData, ROOT), 'utf8')) as TranscriptFile

describe('what the first launch kept', () => {
  it('writes each run’s card with the moment of its last event, beside the entries and at version 1', async () => {
    await firstLaunch()

    const file = fileOnDisk()
    expect(file.version).toBe(1)
    expect(file.projectPath).toBe(ROOT)
    expect(file.runs?.map((run) => [run.card.runId, run.card.status, run.lastAt])).toEqual([
      ['r1', 'finished', 3_000],
      ['r2', 'running', 5_000]
    ])
    expect(file.runs?.[1].card.documents[0]).toMatchObject({ path: '_bmad/addendum.md', text: DOC })
    // No session, busy set, persona state or queue of the first launch is in the file.
    expect(Object.keys(file).sort()).toEqual(['entries', 'projectPath', 'runs', 'version'])
  })
})

describe('a launch after the app went away', () => {
  it('hands the window each card dead: the finished one as it ended, the one in flight failed as the session ended, at its last event', async () => {
    await firstLaunch()

    const next = launch()
    const { runs: cards } = next.snapshot()

    expect(cards.map((card) => [card.runId, card.status, card.endedAt])).toEqual([
      ['r1', 'finished', 3_000],
      ['r2', 'failed', 5_000]
    ])
    expect(cards[1].error).toEqual({ code: 'run/session-ended', message: 'run · the session ended' })
    expect(cards[1].startedAt).toBe(4_000)
    expect(cards[1].documents[0]).toMatchObject({ path: '_bmad/addendum.md', text: DOC })
    expect(cards[0].error).toBeUndefined()
  })

  it('shows every persona idle, no live session, no busy turn, and starts no process: nothing is offered to resume', async () => {
    await firstLaunch()
    const startedBefore = spawned

    const next = launch()
    const snapshot = next.snapshot()

    expect(snapshot.personas).toEqual([])
    expect(snapshot.sessions).toEqual([])
    expect(snapshot.busy).toEqual([])
    expect(spawned).toBe(startedBefore)
  })

  it('has no run to stop: a stop for a stored card is run/not-found and writes to no process', async () => {
    await firstLaunch()
    const startedBefore = spawned
    const next = launch()

    for (const runId of ['r1', 'r2']) {
      expect(await next.call<Promise<unknown>>(RUN_STOP_CHANNEL, runId)).toEqual({
        ok: false,
        error: { code: 'run/not-found', message: 'run · no such run is in flight' }
      })
    }
    expect(spawned).toBe(startedBefore)
  })

  it('puts this launch’s runs after the stored ones, in the order they started, and keeps the stored ones in its own file', async () => {
    await firstLaunch()
    const next = launch()
    await next.call<Promise<unknown>>(SESSION_OPEN_CHANNEL, A)
    feed(result())
    clock = 100_000
    await next.call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, 's2', 'CP')

    expect(next.snapshot().runs.map((card) => [card.runId, card.status])).toEqual([
      ['r1', 'finished'],
      ['r2', 'failed'],
      ['r3', 'running']
    ])
    // The file now holds the dead card as it was read, and this launch’s run, and a third launch reads both.
    next.transcripts.flushAll()
    expect(fileOnDisk().runs?.map((run) => [run.card.runId, run.card.status, run.lastAt])).toEqual([
      ['r1', 'finished', 3_000],
      ['r2', 'failed', 5_000],
      ['r3', 'running', 100_000]
    ])
    expect(launch().snapshot().runs.map((card) => [card.runId, card.status])).toEqual([
      ['r1', 'finished'],
      ['r2', 'failed'],
      ['r3', 'failed']
    ])
  })

  it('gives a window that reloads inside the launch the same cards, once each, as the first launch recorded them', async () => {
    await firstLaunch()
    const recorded = fileOnDisk().runs ?? []
    const next = launch()

    const first = next.snapshot().runs
    const second = next.snapshot().runs

    expect(second).toEqual(first)
    expect(first.map((card) => card.runId)).toEqual(['r1', 'r2'])
    // The cards the first launch recorded, the one that was in flight read as the run its session ended.
    expect(first).toEqual(
      recorded.map(({ card, lastAt }) =>
        card.status === 'running'
          ? { ...card, status: 'failed', endedAt: lastAt, error: { code: 'run/session-ended', message: 'run · the session ended' } }
          : card
      )
    )
  })

  it('gives a window reopened for the project in the same launch the cards its first window recorded, once each, ahead of its own run', async () => {
    const app = launch()
    await app.call<Promise<unknown>>(SESSION_OPEN_CHANNEL, A)
    feed(result())
    clock = 2_000
    await app.call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, 's1', 'CP')
    clock = 3_000
    feed(result())
    clock = 4_000
    await app.call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, 's1', 'CP')
    // The window is closed with the second run in flight: its session goes with it, and the run ends.
    clock = 6_000
    app.sender.destroy()

    const second = app.windowOf(new FakeSender(2))
    expect(second.snapshot().runs.map((card) => [card.runId, card.status, card.endedAt])).toEqual([
      ['r1', 'finished', 3_000],
      ['r2', 'failed', 6_000]
    ])
    await second.call<Promise<unknown>>(SESSION_OPEN_CHANNEL, A)
    feed(result())
    clock = 8_000
    await second.call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, 's2', 'CP')

    const own = second.snapshot().runs
    expect(own.map((card) => [card.runId, card.status])).toEqual([
      ['r1', 'finished'],
      ['r2', 'failed'],
      ['r3', 'running']
    ])
    // A window that merely reloads, on the same sender, is handed each card once, as before.
    expect(second.snapshot().runs).toEqual(own)
    expect(second.snapshot().runs.map((card) => card.runId)).toEqual(['r1', 'r2', 'r3'])
  })

  it('is cleared by conversation.end together with the entries: the file holds neither, and the next launch shows none', async () => {
    await firstLaunch()
    const next = launch()
    expect(next.snapshot().runs).toHaveLength(2)

    expect(next.call(CONVERSATION_END_CHANNEL, ROOT)).toEqual({ ok: true })

    expect(next.snapshot().runs).toEqual([])
    expect(fileOnDisk()).toEqual({ version: 1, projectPath: ROOT, entries: [] })
    next.transcripts.flushAll()
    expect(fileOnDisk().runs).toBeUndefined()
    expect(launch().snapshot().runs).toEqual([])
    expect(readdirSync(join(userData, 'conversations'))).toHaveLength(1)
  })
})

describe('ending the conversation with a run in flight', () => {
  it('leaves no card of it behind: the closing of its session is not kept, now or in the launch after', async () => {
    const app = launch()
    await app.call<Promise<unknown>>(SESSION_OPEN_CHANNEL, A)
    feed(result())
    await app.call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, 's1', 'CP')
    app.transcripts.flushAll()
    expect(fileOnDisk().runs?.map((run) => run.card.status)).toEqual(['running'])

    expect(app.call(CONVERSATION_END_CHANNEL, ROOT)).toEqual({ ok: true })
    app.transcripts.flushAll()

    expect(fileOnDisk()).toEqual({ version: 1, projectPath: ROOT, entries: [] })
    expect(app.snapshot().runs).toEqual([])
    expect(launch().snapshot().runs).toEqual([])
  })
})

describe('a launch after an older file, and after a damaged one', () => {
  it('loads a file written before the cards were kept with none, at the same version', () => {
    const app = launch()
    app.transcripts.forProject(ROOT).recordUserTurn('hello', 1)
    app.transcripts.flushAll()
    expect(fileOnDisk().runs).toBeUndefined()

    expect(launch().snapshot()).toMatchObject({ entries: [{ kind: 'user', text: 'hello' }], runs: [] })
  })

  it('drops a stored run that is not a run card, counts it with the dropped entries, and loads the rest', async () => {
    await firstLaunch()
    const path = transcriptFilePath(userData, ROOT)
    const file = fileOnDisk()
    writeFileSync(path, JSON.stringify({ ...file, runs: [file.runs?.[0], { card: 'not a card', lastAt: 1 }, 'junk', null] }))
    logs.length = 0

    // The conversation is read from its file when the window first asks for it.
    const next = launch()
    const { runs } = next.snapshot()

    expect(logs).toEqual(['persist/entries-dropped · 3'])
    expect(runs.map((card) => card.runId)).toEqual(['r1'])
    // The damaged file is kept whole beside the one this launch writes.
    expect(readdirSync(join(userData, 'conversations')).sort()).toEqual([`${path.split('/').pop()}.aside`])
  })
})

describe('the window, reading what the relaunched main hands it', () => {
  /** The window's own hydration over a snapshot, and the thread drawn from it with a stop handed down, as the window does. */
  function drawn(snapshot: ConversationSnapshot) {
    const prose = createProseStore({ raf: (callback) => callback() })
    const { state } = hydrate(initialConversation, snapshot, () => undefined)
    for (const run of snapshot.runs) prose.seed(run.runId, run.documents)
    const collapse: Collapse = { viewedId: A, expanded: new Set(), nameOf: () => 'John', onExpand: () => {} }
    const markup = renderToStaticMarkup(createElement(Turns, { entries: state.entries, prose, onStop: () => {}, collapse }))
    return { state, markup }
  }

  it('draws each card dead: no stop control, no button at all, no caret and no busy card, with the words and elapsed time it ended with', async () => {
    await firstLaunch()
    const { state, markup } = drawn(launch().snapshot())

    expect(markup.match(/class="run-card"/g)).toHaveLength(2)
    expect(markup).not.toMatch(/run-stop|<button/)
    expect(markup).not.toMatch(/class="caret"|aria-busy|run-card-line/)
    expect(markup.match(/class="run-card-elapsed">([^<]*)</g)).toEqual(['class="run-card-elapsed">2s<', 'class="run-card-elapsed">1s<'])
    // The run that was in flight ended failed with its session, and names the section its last confirmed write reached.
    expect(markup).toContain('class="run-card-status run-card-status--failed">failed · §1 Vision<')
    expect(state.entries.filter((entry) => entry.kind === 'run').map((entry) => entry.kind === 'run' && entry.status)).toEqual(['finished', 'failed'])
  })

  it('holds every persona idle and no session: nothing to resume and nothing in flight', async () => {
    await firstLaunch()
    const { state } = drawn(launch().snapshot())

    expect(state.personas.size).toBe(0)
    expect(state.sessions.size).toBe(0)
    expect(state.busy.size).toBe(0)
  })

  it('draws the dead card the same from a stopped card: stopped is a status it ended with, and it asks to stop nothing', () => {
    const stopped: RunCardSnapshot = {
      runId: 'r9',
      sessionId: 'gone',
      agentId: A,
      code: 'CP',
      startedAt: 1_000,
      status: 'stopped',
      endedAt: 66_000,
      notes: [],
      steps: [],
      documents: []
    }
    const { markup } = drawn({ entries: [], sessions: [], busy: [], personas: [], runs: [stopped] })

    // Nothing was confirmed written, so the head is the bare word.
    expect(markup).toContain('class="run-card-status run-card-status--stopped">stopped<')
    expect(markup).not.toMatch(/run-stop|<button/)
  })

  it('names the section a stored stopped card’s subject had confirmed, and nothing when it had none', () => {
    const stopped = (documents: RunCardSnapshot['documents']): RunCardSnapshot => ({
      runId: 'r9',
      sessionId: 'gone',
      agentId: A,
      code: 'CP',
      startedAt: 1_000,
      status: 'stopped',
      endedAt: 66_000,
      notes: [],
      steps: [],
      documents
    })
    const confirmed = drawn({
      entries: [],
      sessions: [],
      busy: [],
      personas: [],
      runs: [stopped([{ path: '_bmad/prd.md', callId: 't1', text: DOC, written: DOC.length, sections: ['Vision', 'Goals'] }])]
    })

    expect(confirmed.markup).toContain('class="run-card-status run-card-status--stopped">stopped · §2 Goals<')
    expect(confirmed.markup).not.toMatch(/run-stop|<button/)
    // A card whose subject streamed but never committed reads the bare word after a relaunch too.
    const uncommitted = drawn({
      entries: [],
      sessions: [],
      busy: [],
      personas: [],
      runs: [stopped([{ path: '_bmad/prd.md', callId: 't1', text: DOC, written: DOC.length, sections: [] }])]
    })
    expect(uncommitted.markup).toContain('class="run-card-status run-card-status--stopped">stopped<')
  })
})
