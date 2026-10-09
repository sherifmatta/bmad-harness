// @vitest-environment jsdom
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { deadOf } from '../src/main/fold/stored-runs'
import type { ConversationReply, RunCardSnapshot } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'
import { foldEvent, hydrate, initialConversation } from '../src/renderer/ui/chat/conversation-state'
import type { ConversationState } from '../src/renderer/ui/chat/conversation-state'
import { createProseStore } from '../src/renderer/ui/chat/prose-store'
import type { ProseStore } from '../src/renderer/ui/chat/prose-store'
import { RunCard } from '../src/renderer/ui/chat/run-card'
import type { RunCardEntry } from '../src/renderer/ui/chat/transcript-entry'
import { DENOMINATOR, LIVE_REGIONS, SPINNER_MARKUP, STAND_IN, spoken } from '../src/renderer/ui/testing/audit-patterns'
import { mount } from '../src/renderer/ui/testing/render-hook'
import type { Mounted } from '../src/renderer/ui/testing/render-hook'

/**
 * Story 3.17's run list, audited from a recording. `fast-path-sonnet` is replayed through the real
 * session bridge and registry, its events folded as the window folds them (the renderer's `foldEvent`
 * and prose store), and the card is mounted in every state the epic's audit names: quiet, streaming,
 * finished, stopped, failed, a reload mid-run (the card as main's snapshot hands it) and a relaunch
 * (a stored card read back dead). Each is held to what Epic 3 promised not to draw, steps included.
 * A failing assertion is fixed in the product; none may be loosened.
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
const { CONVERSATION_GET_CHANNEL, MENU_DISPATCH_CHANNEL, RUN_STOP_CHANNEL, SESSION_OPEN_CHANNEL, registerSessionBridge } = await import(
  '../src/main/session-bridge'
)

const RUNS = resolve(import.meta.dirname, '..', 'fixtures', 'runs')
const SCENARIO = 'fast-path-sonnet'
const frames = readFileSync(join(RUNS, `${SCENARIO}.jsonl`), 'utf8')
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as unknown)
const { cwd } = JSON.parse(readFileSync(join(RUNS, `${SCENARIO}.meta.json`), 'utf8')) as { cwd: string }

type Frame = { type?: string; parent_tool_use_id?: string | null; message?: { content?: { type?: string; name?: string; input?: { content?: string } }[] } }

/**
 * Where the drafting turn begins: just after the last main-thread `result` before the recording's big `Write`.
 * Fed from the start the run would end with the first turn, which writes nothing; from here it holds the write.
 */
const FROM = ((): number => {
  const rows = frames as Frame[]
  const big = rows.findIndex(
    (frame) =>
      frame.type === 'assistant' &&
      !frame.parent_tool_use_id &&
      (frame.message?.content ?? []).some((block) => block.type === 'tool_use' && block.name === 'Write' && String(block.input?.content ?? '').length > 40_000)
  )
  const before = rows.flatMap((frame, at) => (frame.type === 'result' && !frame.parent_tool_use_id && at < big ? [at + 1] : []))
  return before.at(-1) ?? 0
})()

const A = 'bmad-agent-pm'
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
let fake: Fake
let mounted: Mounted | null = null

beforeEach(() => {
  handlers.clear()
  userData = mkdtempSync(join(tmpdir(), 'harness-run-list-replay-'))
  clock = 1_000
  registerSessionBridge({
    transcripts: createTranscriptRegistry({ userDataPath: () => userData, schedule: () => () => {}, log: () => {} }),
    projectPathFor: () => cwd,
    now: () => clock,
    newSessionId: () => 's1',
    newRunId: () => 'r1',
    agentName: () => 'John',
    writeDiagnostic: () => {},
    menuEntryFor: () => ({ code: 'CP', description: 'Create the PRD', action: { kind: 'skill', skill: 'bmad-prd' } }),
    readPlan: () => Promise.resolve(undefined),
    readText: () => Promise.resolve(undefined),
    schedule: () => () => {},
    spawn: (options) => {
      const held: Fake = { feed: options.onFrame, interrupts: [] }
      fake = held
      return Promise.resolve({
        ok: true,
        session: {
          write: () => Promise.resolve(true),
          interrupt: () => new Promise<boolean>((resolveInterrupt) => held.interrupts.push(resolveInterrupt)),
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

const flush = async (): Promise<void> => {
  for (let at = 0; at < 5; at += 1) await Promise.resolve()
}

const call = <T,>(channel: string, sender: FakeSender, ...args: unknown[]): T =>
  (handlers.get(channel) as unknown as (...a: unknown[]) => T)({ sender }, ...args)

const TERMINAL = new Set(['run:finished', 'run:stopped', 'run:failed'])
const steps = (told: ContractEvent[]): number => told.filter((event) => event.name === 'run:step').length
const prose = (told: ContractEvent[]): boolean => told.some((event) => event.name === 'doc:prose')

/** The recording through the real bridge, fed one frame at a time until `until` says the window has been told enough. */
async function replay(until: (told: ContractEvent[]) => boolean): Promise<FakeSender> {
  const sender = new FakeSender()
  await call<Promise<unknown>>(SESSION_OPEN_CHANNEL, sender, A)
  fake.feed({ type: 'result', subtype: 'success', is_error: false })
  await call<Promise<unknown>>(MENU_DISPATCH_CHANNEL, sender, 's1', 'CP')
  for (const frame of frames.slice(FROM)) {
    if (until(sender.sent) || sender.sent.some((event) => TERMINAL.has(event.name))) break
    clock += 1
    fake.feed(frame)
  }
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

function cardOf(state: ConversationState): RunCardEntry {
  const entry = state.entries.find((each) => each.kind === 'run')
  if (entry === undefined || entry.kind !== 'run') throw new Error('no card')
  return entry
}

/** The run's card as main's snapshot hands it to a window that connects (or after a relaunch), read through `hydrate`. */
function snapshotOf(sender: FakeSender): RunCardSnapshot {
  const reply = call<ConversationReply>(CONVERSATION_GET_CHANNEL, sender)
  if (!reply.ok) throw new Error('no snapshot')
  return reply.snapshot.runs[0]
}

function hydrated(card: RunCardSnapshot): RunCardEntry {
  const reply = { entries: [], runs: [card], sessions: [], busy: [], personas: [] }
  return cardOf(hydrate(initialConversation, reply as never, () => undefined).state)
}

/** The card as the window draws it: the recording's clock is its own, so the card is read against the audit's. */
function draw(entry: RunCardEntry, store: ProseStore): HTMLElement {
  vi.useFakeTimers({ now: NOW, toFake: ['setInterval', 'clearInterval', 'Date'] })
  mounted?.unmount()
  const read: RunCardEntry = { ...entry, at: NOW - 65_000, ...(entry.endedAt === undefined ? {} : { endedAt: NOW }) }
  mounted = mount(createElement(RunCard, { entry: read, prose: store, onStop: entry.status === 'running' ? () => {} : undefined }))
  return mounted.container
}

const rowsOf = (root: HTMLElement): string[] =>
  [...root.querySelectorAll('.run-note-feed > *')].map((row) => (row.classList.contains('run-step') ? `step:${row.className}` : 'note'))

/** What Epic 3 promised not to draw, read off the card's run list, and what a step row is never given. */
function audit(root: HTMLElement): void {
  // The card's own words, not the document's or a step's target: those are the recording's, and any word may be in them.
  const chrome = root.cloneNode(true) as HTMLElement
  chrome.querySelector('.run-card-text')?.replaceChildren()
  chrome.querySelectorAll('.run-step-label').forEach((label) => label.replaceChildren())
  expect(chrome.innerHTML).not.toMatch(SPINNER_MARKUP)
  expect(spoken(chrome)).not.toMatch(STAND_IN)
  expect(spoken(chrome)).not.toMatch(DENOMINATOR)
  expect(spoken(chrome)).not.toMatch(/nothing written|opens when|awaiting|yet to|earlier steps|more steps|\bpending\b|\bplanned\b|\bnext\b/i)
  for (const row of root.querySelectorAll('.run-step')) {
    // No tab stop, no role, nothing announced; a step is one short row of three cells in mono.
    expect(row.getAttribute('tabindex')).toBeNull()
    expect(row.getAttribute('role')).toBeNull()
    expect(row.querySelector(`[tabindex], [role], ${LIVE_REGIONS}, button, a, input`)).toBeNull()
    expect(row.children).toHaveLength(3)
    expect(row.querySelector('.run-step-elapsed')?.textContent).toMatch(/^(?:now|\d+:\d\d(?::\d\d)?)$/)
  }
  expect(root.querySelectorAll(`.run-card-body ${LIVE_REGIONS}`)).toHaveLength(0)
}

/** Every step row on a card that is not in flight is over: none pulses, none reads `now`, none is left running. */
function over(root: HTMLElement): void {
  expect(root.querySelectorAll('.run-step--running')).toHaveLength(0)
  expect(root.querySelectorAll('.run-step .status-dot')).toHaveLength(0)
  expect([...root.querySelectorAll('.run-step-elapsed')].map((cell) => cell.textContent)).not.toContain('now')
}

describe('the run list, built from a recording by the folds', () => {
  it('draws the steps among the notes while the run is quiet: a mark, a label and an elapsed on each, nothing standing in for the next', async () => {
    const sender = await replay((told) => steps(told) >= 1 && !prose(told))
    const { state, store } = window(sender.sent)
    const entry = cardOf(state)
    expect(entry.steps.length).toBeGreaterThanOrEqual(1)
    const root = draw(entry, store)
    audit(root)

    expect(root.querySelectorAll('.run-step')).toHaveLength(entry.steps.length)
    expect(rowsOf(root)[0]).toBe('note')
    // The head reads `run`, `working`, the elapsed and the stop, and the card has no foot.
    expect(root.querySelector('.run-card-path')?.textContent).toBe('run')
    expect(root.querySelector('.run-card-status')?.textContent).toBe('working')
    expect(root.querySelector('.run-card-foot')).toBeNull()
    expect(root.querySelector('.run-stop')).not.toBeNull()
    // Calls that have returned are done; the call in flight is the one pulsing dot and reads `now`.
    const running = root.querySelectorAll('.run-step--running')
    expect(running.length).toBe(entry.steps.filter((step) => step.status === 'running').length)
    expect(root.querySelectorAll('.status-dot--work')).toHaveLength(1 + running.length)
    for (const row of running) expect(row.querySelector('.run-step-elapsed')?.textContent).toBe('now')
  })

  it('keeps the rows above the prose in one scroll container once the document streams', async () => {
    const sender = await replay(prose)
    const { state, store } = window(sender.sent)
    const entry = cardOf(state)
    const root = draw(entry, store)
    audit(root)

    expect(entry.steps.length).toBeGreaterThan(0)
    const flow = root.querySelector('.run-card-flow')
    expect([...(flow?.children ?? [])].map((node) => node.className)).toEqual(['run-note-feed', 'run-card-prose'])
    expect(root.querySelector('.run-card-body')?.children).toHaveLength(1)
    expect(root.querySelectorAll('.run-step')).toHaveLength(entry.steps.length)
    expect(root.querySelector('.run-card-path')?.textContent).not.toBe('run')
  })

  it('draws a finished run with no step left running, pulsing or reading now', async () => {
    const sender = await replay(() => false)
    const { state, store } = window(sender.sent)
    expect(cardOf(state).status).toBe('finished')
    const root = draw(cardOf(state), store)
    audit(root)
    over(root)
    expect(root.querySelectorAll('.run-step').length).toBeGreaterThan(0)
  })

  it('draws a stopped run the same way, the step its stop cut off ending as failed', async () => {
    const sender = await replay(prose)
    const reply = call<Promise<unknown>>(RUN_STOP_CHANNEL, sender, 'r1')
    await flush()
    fake.interrupts.at(-1)!(true)
    await reply
    fake.feed({ type: 'result', subtype: 'error_during_execution', is_error: true })
    const { state, store } = window(sender.sent)
    expect(cardOf(state).status).toBe('stopped')
    const root = draw(cardOf(state), store)
    audit(root)
    over(root)
    expect(root.querySelectorAll('.run-step').length).toBeGreaterThan(0)
  })

  it('draws a failed run the same way, the call it was cut off in marked ✕', async () => {
    const sender = await replay(prose)
    // The run ends on an error `result` nobody asked for: failed, never stopped.
    fake.feed({ type: 'result', subtype: 'error_during_execution', is_error: true })
    const { state, store } = window(sender.sent)
    expect(cardOf(state).status).toBe('failed')
    const root = draw(cardOf(state), store)
    audit(root)
    over(root)
    expect(root.querySelectorAll('.run-step--failed').length).toBeGreaterThan(0)
  })
})

describe('the run list after a reload and after a relaunch', () => {
  it('draws the same list from main’s snapshot as from the folds, mid-run', async () => {
    const sender = await replay((told) => steps(told) >= 1 && !prose(told))
    const { state, store } = window(sender.sent)
    const folded = cardOf(state)
    const fromSnapshot = hydrated(snapshotOf(sender))

    expect(fromSnapshot.steps).toEqual(folded.steps)
    expect(fromSnapshot.notes).toEqual(folded.notes)
    const before = draw(folded, store).innerHTML
    expect(draw(fromSnapshot, store).innerHTML).toBe(before)
  })

  it('draws a stored card read back dead with a cut-off step as failed: nothing pulses, nothing reads now', async () => {
    const sender = await replay((told) => steps(told) >= 1 && !prose(told))
    const { store } = window(sender.sent)
    const live = snapshotOf(sender)
    expect(live.steps.some((step) => step.status === 'running')).toBe(true)
    const dead = hydrated(deadOf({ card: live, lastAt: clock }).card)

    expect(dead.status).toBe('failed')
    const root = draw(dead, store)
    audit(root)
    over(root)
    expect(root.querySelectorAll('.run-step--failed').length).toBeGreaterThan(0)
    expect(root.querySelector('.run-stop')).toBeNull()
    // The dead card draws the same rows as the live one, and no more.
    expect(root.querySelectorAll('.run-step')).toHaveLength(live.steps.length)
  })
})
