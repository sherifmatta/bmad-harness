// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ContractEvent } from '../src/shared/events'
import type { TemplatePlan } from '../src/shared/section-plan'
import { foldEvent, initialConversation } from '../src/renderer/ui/chat/conversation-state'
import type { ConversationState } from '../src/renderer/ui/chat/conversation-state'
import { createProseStore } from '../src/renderer/ui/chat/prose-store'
import type { ProseStore } from '../src/renderer/ui/chat/prose-store'
import { RunCard } from '../src/renderer/ui/chat/run-card'
import { RunCardLine } from '../src/renderer/ui/chat/run-card-line'
import type { RunCardEntry } from '../src/renderer/ui/chat/transcript-entry'
import { ARBITRATION, DENOMINATOR, SPINNER_MARKUP, STAND_IN, spoken } from '../src/renderer/ui/testing/audit-patterns'
import { mount } from '../src/renderer/ui/testing/render-hook'
import type { Mounted } from '../src/renderer/ui/testing/render-hook'

/**
 * Story 3.15's card, audited (Story 3.11 extended). The recording
 * `interrupt-inband-tasks-live-mid-write` is replayed through the real session
 * bridge and registry: the run is stopped, and the turn the CLI then runs on its
 * own is a second run. Its events are folded as the window folds them (the
 * renderer's `foldEvent` and prose store), the continuation's card is mounted as
 * born, streaming, finished and, after a second stop, stopped, and each state is
 * held to what Epic 3 promised not to draw. A failing assertion is fixed in the
 * product; none may be loosened.
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
const {
  MENU_DISPATCH_CHANNEL,
  RUN_STOP_CHANNEL,
  SESSION_OPEN_CHANNEL,
  registerSessionBridge
} = await import('../src/main/session-bridge')

const RUNS = resolve(import.meta.dirname, '..', 'fixtures', 'runs')
const SCENARIO = 'interrupt-inband-tasks-live-mid-write'
const frames = readFileSync(join(RUNS, `${SCENARIO}.jsonl`), 'utf8')
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as unknown)
const { cwd } = JSON.parse(readFileSync(join(RUNS, `${SCENARIO}.meta.json`), 'utf8')) as { cwd: string }

const A = 'bmad-agent-pm'
const PLAN: TemplatePlan = { spine: ['Vision', 'Scope', 'Users'], menu: [] }
const NOW = 1_000_000_000_000

class FakeSender {
  sent: ContractEvent[] = []
  readonly id = 1
  send(_channel: string, event: ContractEvent): void {
    this.sent.push(event)
  }
  isDestroyed(): boolean {
    return false
  }
  once(): void {}
}

type Fake = { feed: (frame: unknown) => void; interrupts: ((acknowledged: boolean) => void)[] }

let userData: string
let clock: number
let timers: { at: number; run: () => void; cancelled: boolean }[]
let fake: Fake
let mounted: Mounted | null = null

beforeEach(() => {
  handlers.clear()
  userData = mkdtempSync(join(tmpdir(), 'harness-continuation-replay-'))
  clock = 1_000
  timers = []
  let runs = 0
  registerSessionBridge({
    transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
    projectPathFor: () => cwd,
    now: () => clock,
    newSessionId: () => 's1',
    newRunId: () => `r${(runs += 1)}`,
    agentName: () => 'John',
    writeDiagnostic: () => {},
    menuEntryFor: () => ({ code: 'CP', description: 'Create the PRD', action: { kind: 'skill', skill: 'bmad-prd' } }),
    readPlan: () => Promise.resolve(PLAN),
    readText: () => Promise.resolve(undefined),
    schedule: (run, ms) => {
      const timer = { at: clock + ms, run, cancelled: false }
      timers.push(timer)
      return () => void (timer.cancelled = true)
    },
    spawn: (options) => {
      const held: Fake = { feed: options.onFrame, interrupts: [] }
      fake = held
      return Promise.resolve({
        ok: true,
        session: {
          write: () => Promise.resolve(true),
          interrupt: () => new Promise<boolean>((resolve) => held.interrupts.push(resolve)),
          kill: () => {}
        }
      })
    }
  })
})

afterEach(() => {
  mounted?.unmount()
  mounted = null
  vi.useRealTimers()
  rmSync(userData, { recursive: true, force: true })
})

function advance(ms: number): void {
  clock += ms
  for (const timer of [...timers].sort((a, b) => a.at - b.at)) {
    if (!timer.cancelled && timer.at <= clock) {
      timer.cancelled = true
      timer.run()
    }
  }
}

const flush = async (): Promise<void> => {
  for (let at = 0; at < 5; at += 1) await Promise.resolve()
}

const call = <T,>(channel: string, sender: FakeSender, ...args: unknown[]): T =>
  (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)

/** Press stop on a run, have the CLI acknowledge it, and end its turn on the failed `result` the CLI writes for an interrupt. */
async function stop(sender: FakeSender, runId: string): Promise<void> {
  const reply = call<Promise<unknown>>(RUN_STOP_CHANNEL, sender, runId)
  await flush()
  fake.interrupts.at(-1)!(true)
  await reply
  fake.feed({ type: 'result', subtype: 'error_during_execution', is_error: true })
}

/**
 * The recording through the real bridge: a run dispatched, fed to frame 325 and stopped (the failed `result`
 * is frame 335), then the turns the CLI runs on its own, fed until `until` says what the window has been told is enough.
 */
async function replay(until: (told: ContractEvent[]) => boolean): Promise<FakeSender> {
  const sender = new FakeSender()
  await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, sender, A)
  fake.feed({ type: 'result', subtype: 'success', is_error: false })
  await call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, sender, 's1', 'CP')
  for (const frame of frames.slice(0, 325)) fake.feed(frame)
  const reply = call<Promise<unknown>>(RUN_STOP_CHANNEL, sender, 'r1')
  await flush()
  fake.interrupts[0](true)
  await reply
  for (const frame of frames.slice(325, 336)) fake.feed(frame)
  for (const frame of frames.slice(336)) {
    if (until(sender.sent)) break
    fake.feed(frame)
  }
  advance(1_000)
  return sender
}

/** What the window holds after the events, folded as `use-conversation` folds them. */
function window(events: ContractEvent[]): { state: ConversationState; store: ProseStore } {
  const store = createProseStore({ raf: (run) => run() })
  let state = initialConversation
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

const started = (told: ContractEvent[]): boolean => told.some((event) => event.name === 'run:started' && event.payload.runId === 'r2')
const writing = (told: ContractEvent[]): boolean => told.some((event) => event.name === 'doc:prose' && event.payload.runId === 'r2')
const finished = (told: ContractEvent[]): boolean => told.some((event) => event.name === 'run:finished')

function cardOf(state: ConversationState, runId: string): RunCardEntry {
  const entry = state.entries.find((each) => each.kind === 'run' && each.runId === runId)
  if (entry === undefined || entry.kind !== 'run') throw new Error(`no card for ${runId}`)
  return entry
}

/** The continuation's card, as the window draws it: the full card, and the collapsed line. */
function draw(entry: RunCardEntry, store: ProseStore, as: 'card' | 'line'): HTMLElement {
  vi.useFakeTimers({ now: NOW, toFake: ['setInterval', 'clearInterval', 'Date'] })
  const onStop = (): void => {}
  // The recording's clock is the test's own; the card is read against the audit's, as its own audit reads it.
  const read: RunCardEntry = { ...entry, at: NOW - 65_000, ...(entry.endedAt === undefined ? {} : { endedAt: NOW }) }
  mounted?.unmount()
  mounted = mount(
    as === 'card'
      ? createElement(RunCard, { entry: read, prose: store, onStop })
      : createElement(RunCardLine, { entry: read, name: 'John', prose: store, onExpand: () => {}, onStop })
  )
  return mounted.container
}

type Expected = { running: boolean; caret: boolean; head: RegExp | undefined }

/** What Epic 3 promised not to draw, read off the continuation's card: the audit's checks for every state. */
function audit(root: HTMLElement, as: 'card' | 'line', expected: Expected): void {
  // The card's own words, not the document's: the text the persona writes is the model's, and any word may be in it.
  const chrome = root.cloneNode(true) as HTMLElement
  chrome.querySelector('.run-card-text')?.replaceChildren()
  expect(chrome.innerHTML).not.toMatch(SPINNER_MARKUP)
  expect(spoken(chrome)).not.toMatch(STAND_IN)
  expect(spoken(chrome)).not.toMatch(DENOMINATOR)
  expect(spoken(chrome)).not.toMatch(ARBITRATION)
  expect(spoken(chrome)).not.toMatch(/nothing written|opens when|awaiting|yet to/i)
  // The card is the card of a run, and says nothing of how it came to start: no resume, no continue, no retry.
  expect(spoken(chrome)).not.toMatch(/\bresum\w*|\bcontinu\w*|\bretry|\btry again|carried on/i)
  expect(root.querySelector('dialog, [role$="dialog"], [aria-modal], [aria-haspopup], [popover]')).toBeNull()
  expect(root.querySelectorAll('a, input, select, textarea, [role="button"], [role="menuitem"], [role="link"]')).toHaveLength(0)
  const buttons = [...root.querySelectorAll('button')].map((button) => button.className.split(' ')[0])
  const own = as === 'line' ? ['run-card-line-button', 'run-stop'] : ['run-stop']
  expect(buttons).toEqual(expected.running ? own : as === 'line' ? ['run-card-line-button'] : [])
  if (expected.running) expect(root.querySelector('.run-stop')?.textContent).toBe('stop')
  expect(root.querySelectorAll('.run-card-caret')).toHaveLength(as === 'card' && expected.caret ? 1 : 0)
  expect(root.querySelector('[aria-busy="true"]') !== null).toBe(expected.running)
  expect(root.querySelector('.run-card-elapsed')?.textContent).toMatch(/^(?:\d+m )?\d+s$/)
  if (as === 'card') {
    expect(root.querySelector('.status-dot')?.getAttribute('aria-hidden')).toBe('true')
    const head = root.querySelector('.run-card-status')?.textContent ?? ''
    if (expected.head === undefined) expect(head).toBe('')
    else expect(head).toMatch(expected.head)
  }
}

describe('the continuation card, built from the recorded events by the folds, as Epic 3 promised', () => {
  it('is a second card for the same persona and session, with the stopped run’s plan, born with the body mounted and nothing drawn in its place', async () => {
    const sender = await replay(started)
    const { state, store } = window(sender.sent)
    const first = cardOf(state, 'r1')
    const second = cardOf(state, 'r2')

    expect(first.status).toBe('stopped')
    expect([second.status, second.agentId, second.sessionId, second.plan]).toEqual(['running', A, 's1', PLAN.spine])
    expect(state.entries.filter((entry) => entry.kind === 'sysline').map((entry) => entry.kind === 'sysline' ? entry.text : '')).toEqual([
      'carried on after the stop · a new run follows it'
    ])

    audit(draw(second, store, 'card'), 'card', { running: true, caret: false, head: undefined })
    audit(draw(second, store, 'line'), 'line', { running: true, caret: false, head: undefined })
  })

  it('draws the write as its own card streams: head and caret as the state is, one stop, and the first card still stopped with nothing on it', async () => {
    const sender = await replay(writing)
    const { state, store } = window(sender.sent)
    const second = cardOf(state, 'r2')

    expect(store.get('r2')?.path).toBe('notes.md')
    expect(store.get('r1')?.path).toBe('notes.md')
    audit(draw(second, store, 'card'), 'card', { running: true, caret: true, head: /^(?:writing|revising)(?: · §\d+ .+)?$/u })
    audit(draw(second, store, 'line'), 'line', { running: true, caret: false, head: undefined })
    // The stopped card beside it carries no stop and no caret, as any stopped card.
    audit(draw(cardOf(state, 'r1'), store, 'card'), 'card', { running: false, caret: false, head: /^stopped/ })
  })

  it('saves the document on the turn’s own result: finished, caret removed, no stop, the dot and the head agreeing', async () => {
    const sender = await replay(() => false)
    const { state, store } = window(sender.sent)
    const second = cardOf(state, 'r2')

    expect(second.status).toBe('finished')
    expect(second.documents.map((document) => document.path)).toEqual(['notes.md'])
    audit(draw(second, store, 'card'), 'card', { running: false, caret: false, head: /^saved · just now · \d+ sections?$/ })
  })

  it('is stopped like any card by a second stop: the head names where it got to, and no control, caret or word of the stop’s cause remains', async () => {
    const sender = await replay(writing)
    await stop(sender, 'r2')
    advance(1_000)
    const { state, store } = window(sender.sent)
    const second = cardOf(state, 'r2')

    expect(second.status).toBe('stopped')
    audit(draw(second, store, 'card'), 'card', { running: false, caret: false, head: /^stopped/ })
    expect(sender.sent.filter((event) => event.name === 'run:failed')).toEqual([])
  })

  it('is told in the window’s own folds as the main process holds it: one card per run, and no run:failed anywhere in the replay', async () => {
    const sender = await replay(() => false)
    const { state } = window(sender.sent)

    expect(state.entries.filter((entry) => entry.kind === 'run').map((entry) => entry.kind === 'run' ? [entry.runId, entry.status] : [])).toEqual([
      ['r1', 'stopped'],
      ['r2', 'finished']
    ])
    expect(finished(sender.sent)).toBe(true)
    expect(sender.sent.filter((event) => event.name === 'run:failed')).toEqual([])
  })
})
