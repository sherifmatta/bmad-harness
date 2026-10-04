import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { ConversationReply, RunCardSnapshot } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'
import { projectRelative } from '../src/main/fold/route-frame'
import { subjectOf } from '../src/main/fold/run-card'
import { sectionHeadings } from '../src/main/fold/section-headings'
import { foldEvent, initialConversation, runCardOf } from '../src/renderer/ui/chat/conversation-state'
import type { ConversationState } from '../src/renderer/ui/chat/conversation-state'
import { createProseStore } from '../src/renderer/ui/chat/prose-store'

/**
 * Story 3.12's beat, replayed: `multi-file-sonnet`, a real session that writes
 * an addendum, a pre-review copy and a larger PRD, each by one `Write`, then
 * revises the PRD by `Edit`, fed at full rate through the real session bridge,
 * registry and folds as a dispatched run, and what main told the window folded
 * by the window's own folds with a hand-cranked animation frame.
 *
 * The recording's one turn is sent as the run's dispatch: the session is opened
 * and its activation ended first, as a window would have it before a button is
 * pressed. At full rate no time passes between frames, so the prose timer never
 * runs and only other events release what main holds.
 */

const handlers = new Map<string, (...args: never[]) => unknown>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: never[]) => unknown) => handlers.set(channel, handler)
  },
  BrowserWindow: { fromWebContents: () => null },
  app: { getPath: () => '/unused' }
}))

const { createTranscriptRegistry } = await import('../src/main/projections/transcript')
const { CONVERSATION_GET_CHANNEL, MENU_DISPATCH_CHANNEL, SESSION_OPEN_CHANNEL, registerSessionBridge } = await import(
  '../src/main/session-bridge'
)

type ToolUse = { type: string; id: string; name: string; input: Record<string, unknown> }
type Frame = { type: string; parent_tool_use_id?: string | null; message?: { content?: unknown } }

const RUNS = resolve(import.meta.dirname, '..', 'fixtures', 'runs')
const meta = JSON.parse(readFileSync(join(RUNS, 'multi-file-sonnet.meta.json'), 'utf8')) as {
  cwd: string
  turns: { afterLine: number; text: string }[]
}
const frames = readFileSync(join(RUNS, 'multi-file-sonnet.jsonl'), 'utf8')
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as Frame)

/** The main thread's tool calls, in the order they were made. */
const tools: ToolUse[] = frames.flatMap((frame) =>
  frame.type === 'assistant' && !frame.parent_tool_use_id
    ? ((frame.message?.content ?? []) as ToolUse[]).filter((block) => block.type === 'tool_use')
    : []
)
/** A recorded `file_path` as the route fold names it. */
const relative = (path: unknown): string => projectRelative(String(path), meta.cwd) ?? ''

/** The PRD as the recorded calls built it: its one `Write`, then each `Edit` of it. */
function recordedPrd(): string {
  let prd = ''
  for (const tool of tools) {
    if (!String(tool.input.file_path).endsWith('/prd.md')) continue
    if (tool.name === 'Write') prd = String(tool.input.content)
    if (tool.name === 'Edit') prd = prd.split(String(tool.input.old_string)).join(String(tool.input.new_string))
  }
  return prd
}

type Replay = {
  told: ContractEvent[]
  /** The told events' count after each recorded frame was fed. */
  toldAfter: number[]
  runId: string
  /** The card as a window reloading just after the PRD's Write committed would be handed it. */
  reloaded: RunCardSnapshot | undefined
  final: RunCardSnapshot | undefined
}

async function replay(): Promise<Replay> {
  handlers.clear()
  const userData = mkdtempSync(join(tmpdir(), 'harness-multi-file-replay-'))
  try {
    let feed: (frame: unknown) => void = () => {}
    const told: ContractEvent[] = []
    const sender = { id: 1, send: (_channel: string, event: ContractEvent) => void told.push(event), isDestroyed: () => false, once: () => {} }
    registerSessionBridge({
      transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
      projectPathFor: () => meta.cwd,
      now: () => 1_000,
      newSessionId: () => 's1',
      newRunId: () => 'run-1',
      agentName: () => 'John',
      writeDiagnostic: () => {},
      menuEntryFor: (_window, _agent, code) =>
        code === 'MF' ? { code: 'MF', description: 'Write the PRD', action: { kind: 'prompt', prompt: meta.turns[0].text } } : undefined,
      readText: () => Promise.resolve(undefined),
      schedule: () => () => {},
      spawn: (options) => {
        feed = options.onFrame
        return Promise.resolve({ ok: true, session: { write: () => Promise.resolve(true), kill: () => {} } })
      }
    })
    const call = <T>(channel: string, ...args: unknown[]): T =>
      (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)
    const card = (): RunCardSnapshot | undefined => {
      const reply = call<ConversationReply>(CONVERSATION_GET_CHANNEL)
      return reply.ok ? reply.snapshot.runs[0] : undefined
    }
    await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, 'bmad-agent-pm')
    // The activation turn ends before any button is pressed.
    feed({ type: 'result', subtype: 'success', is_error: false })
    const reply = await call<Promise<{ ok: boolean; runId: string }>>(MENU_DISPATCH_CHANNEL, 's1', 'MF')
    expect(reply.ok).toBe(true)

    const prdWrite = tools.find((tool) => tool.name === 'Write' && relative(tool.input.file_path).endsWith('/prd.md'))
    const toldAfter: number[] = []
    let reloaded: RunCardSnapshot | undefined
    for (const frame of frames) {
      feed(frame)
      toldAfter.push(told.length)
      if (reloaded === undefined && told.some((event) => event.name === 'doc:committed' && event.payload.callId === prdWrite?.id)) {
        reloaded = card()
      }
    }
    return { told, toldAfter, runId: reply.runId, reloaded, final: card() }
  } finally {
    rmSync(userData, { recursive: true, force: true })
  }
}

/** The window's folds over `events`: prose and confirmed text to the store, everything else to the state. */
function windowFold(events: readonly ContractEvent[], store = createProseStore({ raf: (run) => run() }), from: ConversationState = initialConversation) {
  let state = from
  for (const event of events) {
    if (event.name === 'doc:prose') {
      store.append(event.payload.runId, event.payload.callId, event.payload.path, event.payload.text)
      continue
    }
    if (event.name === 'doc:committed' && event.payload.ok) {
      store.commit(event.payload.runId, event.payload.path, event.payload.callId, event.payload.text)
    }
    state = foldEvent(state, event, () => undefined).state
  }
  return { state, store }
}

describe('multi-file-sonnet, replayed at full rate as a dispatched run', () => {
  let result: Replay
  beforeAll(async () => {
    result = await replay()
  }, 60_000)

  const prd = recordedPrd()
  const paths = tools.filter((tool) => tool.name === 'Write').map((tool) => relative(tool.input.file_path))

  it('is the recording it is named for: three Writes of three paths, the PRD the largest and last, then Edits of the PRD', () => {
    expect(paths).toHaveLength(3)
    expect(paths.at(-1)).toMatch(/\/prd\.md$/)
    const sizes = tools.filter((tool) => tool.name === 'Write').map((tool) => String(tool.input.content).length)
    expect(Math.max(...sizes)).toBe(sizes.at(-1))
    expect(tools.filter((tool) => tool.name === 'Edit').length).toBeGreaterThanOrEqual(2)
  })

  it('ends with the PRD as the subject in main: its whole text and its sections, the other two files held beside it', () => {
    expect(result.final?.status).toBe('finished')
    const subject = subjectOf(result.final?.documents ?? [])
    expect(subject?.path).toMatch(/\/prd\.md$/)
    expect(subject?.text).toBe(prd)
    expect(subject?.sections).toEqual(sectionHeadings(prd))
    expect(result.final?.documents.map((document) => document.path)).toEqual(paths)
  })

  it('shows the PRD in the window’s head and body, the others in the foot, and counts its sections alone when saved', () => {
    const { state, store } = windowFold(result.told)
    const card = runCardOf(state, result.runId)
    const shown = store.get(result.runId)
    expect(shown?.path).toBe(paths.at(-1))
    expect(shown?.text).toBe(prd)
    expect(store.paths(result.runId).filter((path) => path !== shown?.path)).toEqual(paths.slice(0, 2))
    // What the head and the live region count (`subjectSections`): the subject's sections alone.
    expect(card?.status).toBe('finished')
    expect(card?.documents.find((document) => document.path === shown?.path)?.sections).toEqual(sectionHeadings(prd))
    expect(card?.documents).toHaveLength(3)
  })

  it('follows each file only until the next one’s Write passes it, never going back', () => {
    const store = createProseStore({ raf: (run) => run() })
    const subjects: string[] = []
    let state = initialConversation
    for (const event of result.told) {
      state = windowFold([event], store, state).state
      const path = store.get(result.runId)?.path
      if (path !== undefined && subjects.at(-1) !== path) subjects.push(path)
    }
    expect(subjects).toEqual(paths)
  })

  it('hands a window that reloads after the PRD’s Write every buffer, so it shows the same subject and head', () => {
    expect(result.reloaded?.documents.map((document) => document.path)).toEqual(paths)
    const cut = result.told.findIndex((event) => event.name === 'doc:committed' && event.payload.path === paths.at(-1))
    const live = windowFold(result.told.slice(0, cut + 1))
    const seeded = createProseStore({ raf: (run) => run() })
    seeded.seed(result.runId, result.reloaded?.documents ?? [])
    expect(seeded.get(result.runId)).toEqual(live.store.get(result.runId))
    expect(seeded.paths(result.runId)).toEqual(live.store.paths(result.runId))
  })

  it('streams no Edit, and tells the window each Write in far fewer pieces than it streamed', () => {
    const edits = new Set(tools.filter((tool) => tool.name === 'Edit').map((tool) => tool.id))
    const prose = result.told.flatMap((event) => (event.name === 'doc:prose' ? [event.payload] : []))
    expect(prose.some((piece) => edits.has(piece.callId))).toBe(false)
    for (const tool of tools.filter((each) => each.name === 'Write')) {
      expect(prose.filter((piece) => piece.callId === tool.id).map((piece) => piece.text).join('')).toBe(String(tool.input.content))
    }
  })

  it('at full rate, tells the card’s readers at most once a frame, and the frame’s text is the whole document so far', () => {
    const pending: (() => void)[] = []
    const store = createProseStore({ raf: (callback) => void pending.push(callback) })
    let calls = 0
    store.subscribe(result.runId, () => (calls += 1))
    let state = initialConversation
    let from = 0
    // One animation frame for every twenty recorded frames: many events land between two refreshes.
    for (let at = 0; at < result.toldAfter.length; at += 1) {
      state = windowFold(result.told.slice(from, result.toldAfter[at]), store, state).state
      from = result.toldAfter[at]
      if (at % 20 !== 19 && at !== result.toldAfter.length - 1) continue
      const before = calls
      for (const callback of pending.splice(0)) callback()
      expect(calls - before).toBeLessThanOrEqual(1)
    }
    expect(calls).toBeGreaterThan(1)
    expect(store.get(result.runId)?.text).toBe(prd)
  })
})
