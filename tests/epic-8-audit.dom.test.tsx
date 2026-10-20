// @vitest-environment jsdom
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { App } from '../src/renderer/ui/app'
import { LIVE_REGIONS, spoken } from '../src/renderer/ui/testing/audit-patterns'
import { createFakeBridge } from '../src/renderer/ui/testing/fake-bridge'
import type { FakeBridge } from '../src/renderer/ui/testing/fake-bridge'
import { installFakeScroll } from '../src/renderer/ui/testing/fake-scroll'
import type { FakeScroll } from '../src/renderer/ui/testing/fake-scroll'
import { mount, settle } from '../src/renderer/ui/testing/render-hook'
import type { Mounted } from '../src/renderer/ui/testing/render-hook'
import type { ConversationSnapshot, RunCardSnapshot, TranscriptRecord } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'
import type { AgentView, InstallSnapshot } from '../src/shared/install'
import { threadAgentOf } from '../src/shared/thread'

/**
 * Story 8.7, the mounted half (Epic 8's closing audit): what a chat per persona promised not to do, read off the
 * real `App` over a conversation main might hold, with every persona, the room and skill-first sessions in it.
 * Each story of the epic pinned its own prohibition where it built it; this file reads the whole shell at once:
 *
 * - selecting any persona, by click, Enter or Space, starts, writes, records and lights nothing;
 * - every record is drawn in exactly one thread, the one the shared predicate (`shared/thread.ts`) puts it in,
 *   and many switches change none of them;
 * - closing a persona's chat from a stored thread, then from a live one, takes that persona's thread alone;
 * - a chat in the background carries no unread mark, count, badge, preview, recency order, suggested next persona
 *   or `handed to` line, and the window keeps its one polite live region.
 *
 * It is in `tests/` beside Epic 7's audit, where the audits that read the whole shell at once live. The static halves are
 * `negative-surface.test.ts` and `contract.test.ts`; the real-bridge half is `epic-8-audit.test.ts`. A failing
 * assertion is fixed in the product only if it is a prohibition the epic kept; none is loosened.
 */

const NOW = new Date(2026, 9, 20, 11, 30).getTime()
const T0 = NOW - 3_600_000

const agent = (id: string, name: string, title: string): AgentView => ({ id, module: 'bmm', name, title, icon: 'i', description: 'd' })
const MARY = agent('bmad-agent-analyst', 'Mary', 'Analyst')
const JOHN = agent('bmad-agent-pm', 'John', 'Product Manager')
const SALLY = agent('bmad-agent-ux-designer', 'Sally', 'UX Designer')
const ROSTER = [MARY, JOHN, SALLY]
const MENUS = {
  [MARY.id]: [
    { code: 'BP', description: 'Brainstorm the project' },
    { code: 'MR', description: 'Research the market' }
  ],
  [JOHN.id]: [{ code: 'CP', description: 'Create the plan' }],
  [SALLY.id]: [{ code: 'UX', description: 'Design the experience' }]
}
const INSTALL: InstallSnapshot = { revision: 1, agents: ROSTER, menus: MENUS, errors: [], preflight: [], skills: [] }

/** What each thread says, each with a word no other thread has: a thread that draws another's shows the word. */
const WORDS = {
  mary: ['marymark-user', 'marymark-said', 'marymark-sysline'],
  john: ['johnmark-user', 'johnmark-said', 'johnmark-sysline'],
  room: ['roommark-user', 'roommark-john', 'roommark-sysline'],
  a: ['skillamark-user', 'skillamark-said', 'skillamark-sysline'],
  b: ['skillbmark-user', 'skillbmark-said', 'skillbmark-sysline']
}
const SALLYS = ['sallymark-user', 'sallymark-said', 'sallymark-sysline']

const record = <T extends TranscriptRecord>(one: T): T => one
const card = (over: Partial<RunCardSnapshot>): RunCardSnapshot => ({
  runId: 'run',
  sessionId: 's',
  code: 'BP',
  startedAt: T0 + 5000,
  status: 'finished',
  endedAt: T0 + 6000,
  notes: [],
  steps: [],
  documents: [],
  ...over
})

/**
 * Three personas with turns, a room and two skill-first sessions, each with records and run cards: Mary live with a
 * finished run, John working with a running one, Sally holding a stored thread and no seat.
 */
function world(over: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    entries: [
      record({ kind: 'user', id: 'm-0', at: T0 + 1, text: WORDS.mary[0], agentId: MARY.id }),
      record({ kind: 'persona', id: 'm-1', at: T0 + 2, agentId: MARY.id, messageId: 'x1', text: WORDS.mary[1] }),
      record({ kind: 'sysline', id: 'm-2', at: T0 + 3, text: WORDS.mary[2], agentId: MARY.id }),
      record({ kind: 'user', id: 'm-3', at: T0 + 5, text: WORDS.john[0], agentId: JOHN.id }),
      record({ kind: 'persona', id: 'm-4', at: T0 + 6, agentId: JOHN.id, messageId: 'x2', text: WORDS.john[1] }),
      record({ kind: 'sysline', id: 'm-5', at: T0 + 7, text: WORDS.john[2], agentId: JOHN.id }),
      record({ kind: 'user', id: 'm-6', at: T0 + 8, text: SALLYS[0], agentId: SALLY.id }),
      record({ kind: 'persona', id: 'm-7', at: T0 + 9, agentId: SALLY.id, messageId: 'x3', text: SALLYS[1] }),
      record({ kind: 'sysline', id: 'm-8', at: T0 + 9, text: SALLYS[2], agentId: SALLY.id }),
      record({ kind: 'user', id: 'm-9', at: T0 + 10, text: WORDS.room[0], room: true }),
      record({ kind: 'persona', id: 'm-10', at: T0 + 11, agentId: JOHN.id, messageId: 'x4', text: WORDS.room[1], room: true }),
      record({ kind: 'sysline', id: 'm-11', at: T0 + 12, text: WORDS.room[2], room: true }),
      record({ kind: 'user', id: 'm-12', at: T0 + 20, text: WORDS.a[0], skillSession: 'sk-a' }),
      record({ kind: 'skill', id: 'm-13', at: T0 + 21, messageId: 'x5', text: WORDS.a[1], skillSession: 'sk-a' }),
      record({ kind: 'sysline', id: 'm-14', at: T0 + 22, text: WORDS.a[2], skillSession: 'sk-a' }),
      record({ kind: 'user', id: 'm-15', at: T0 + 30, text: WORDS.b[0], skillSession: 'sk-b' }),
      record({ kind: 'skill', id: 'm-16', at: T0 + 31, messageId: 'x6', text: WORDS.b[1], skillSession: 'sk-b' }),
      record({ kind: 'sysline', id: 'm-17', at: T0 + 32, text: WORDS.b[2], skillSession: 'sk-b' })
    ],
    sessions: [
      { agentId: MARY.id, sessionId: 's-mary' },
      { agentId: JOHN.id, sessionId: 's-john' }
    ],
    room: { sessionId: 's-room', cast: [MARY.id, JOHN.id], openedAt: T0 + 9 },
    busy: ['s-john', 'sk-a'],
    personas: [
      { agentId: MARY.id, state: 'live', at: T0 },
      { agentId: JOHN.id, state: 'work', at: NOW - 5_000 }
    ],
    runs: [
      card({ runId: 'run-mary', sessionId: 's-mary', agentId: MARY.id, code: 'BP' }),
      card({ runId: 'run-john', sessionId: 's-john', agentId: JOHN.id, code: 'CP', startedAt: NOW - 7_000, status: 'running', endedAt: undefined }),
      card({ runId: 'run-a', sessionId: 'sk-a', skill: 'bmad-build', code: 'bmad-build', startedAt: T0 + 23 }),
      card({ runId: 'run-b', sessionId: 'sk-b', skill: 'bmad-build-auto', code: 'bmad-build-auto', startedAt: T0 + 33 })
    ],
    skillSessions: [
      { sessionId: 'sk-a', skill: 'bmad-build', live: true },
      { sessionId: 'sk-b', skill: 'bmad-build', live: false }
    ],
    ...over
  }
}

/** The same conversation with no seat live at all: John and Mary hold stored threads only (the closable orphan state). */
function stored(): ConversationSnapshot {
  return world({ sessions: [], room: undefined, busy: [], personas: [] })
}

let mounted: Mounted | null
let bridge: FakeBridge
let fake: FakeScroll

const all = (selector: string, within: ParentNode = document.body): HTMLElement[] => [...within.querySelectorAll<HTMLElement>(selector)]
const text = (node: Element | null | undefined): string => node?.textContent ?? ''

beforeEach(() => {
  mounted = null
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  fake = installFakeScroll({ client: 400, height: 1000, top: 0 })
})

afterEach(() => {
  mounted?.unmount()
  bridge?.uninstall()
  fake.restore()
  vi.useRealTimers()
})

/**
 * The run cards a chat draws: in its thread, and its own running run in the shell's pinned slot above the thread
 * (Story 3.14), which is part of the same chat. The room's view has neither.
 */
const cardsDrawn = (within: HTMLElement): string[] => {
  const chat = within.closest('.chat') ?? within
  return all('.run-card, .run-card-line', chat).map((one) => text(one.querySelector('.run-card-head') ?? one))
}

async function start(snapshot: ConversationSnapshot = world()): Promise<void> {
  bridge = createFakeBridge(INSTALL)
  bridge.conversation = () => snapshot
  bridge.install()
  mounted = mount(createElement(App))
  await settle()
  await settle()
}

const root = (): HTMLElement => mounted!.container
const thread = (): HTMLElement => root().querySelector('.thread') as HTMLElement
const party = (): HTMLElement => root().querySelector('.view-party .party-thread') as HTMLElement
const header = (): HTMLElement => root().querySelector('.chat-head') as HTMLElement
const stateOf = (button: HTMLElement): string => text(button.querySelector('.state-text')).replace(/ · .*$/, '')
const rail = (): HTMLElement => root().querySelector('.team-list') as HTMLElement
const tiles = (): HTMLButtonElement[] => all('button.persona-tile', rail()) as HTMLButtonElement[]
const seats = (): HTMLButtonElement[] => tiles().filter((button) => button.querySelector('.initials--skill') !== null)
const view = (label: string): void => act(() => void all('.view-switch button', root()).find((button) => text(button) === label)?.click())

function tile(name: string): HTMLButtonElement {
  const found = tiles().find((button) => button.getAttribute('aria-label')?.startsWith(`${name},`))
  if (found === undefined) throw new Error(`no tile for ${name}`)
  return found
}

/** A click, or the native button's own activation by a key: Enter or Space fires the click the key down was not stopped from. */
function choose(name: string, how: 'click' | 'Enter' | 'Space'): void {
  const target = tile(name)
  target.focus()
  act(() => {
    if (how === 'click') {
      target.click()
      return
    }
    const down = new KeyboardEvent('keydown', { key: how === 'Space' ? ' ' : 'Enter', bubbles: true, cancelable: true })
    target.dispatchEvent(down)
    if (!down.defaultPrevented) target.click()
  })
}

async function selectTile(name: string): Promise<void> {
  choose(name, 'click')
  await settle()
}
async function selectSeat(at: number): Promise<void> {
  act(() => seats()[at].click())
  await settle()
}

/** Everything the window asked main to do, which a selection and a switch must leave empty. */
function nothingAsked(): void {
  expect(bridge.opened).toEqual([])
  expect(bridge.seatStarts).toEqual([])
  expect(bridge.sent).toEqual([])
  expect(bridge.firsts).toEqual([])
  expect(bridge.closed).toEqual([])
  expect(bridge.closedAgents).toEqual([])
  expect(bridge.stopped).toEqual([])
  expect(bridge.ended).toEqual([])
  expect(bridge.docs).toEqual([])
  // The window only read: every bridge method it called is one that reads or subscribes.
  const READS = ['getProjectPath', 'getInstall', 'onInstallChanged', 'getBranch', 'getRail', 'onRailChanged', 'getBoard', 'onBoardChanged', 'onDocClosed', 'getConversation', 'onSessionEvent', 'onRunRevealed']
  expect(bridge.calls.filter((call) => !READS.includes(call))).toEqual([])
}

describe('selecting a persona, in the whole App with every persona in it (Story 8.2, audited by Story 8.7)', () => {
  it.each(['click', 'Enter', 'Space'] as const)(
    'by %s opens nothing, starts nothing, writes nothing and records nothing for each of the three personas, Sally with no thread included',
    async (how) => {
      await start()
      const before = tiles().map((button) => [button.getAttribute('aria-label'), all('.status-dot--live', button).length])
      expect(before.map(([label]) => label)).toEqual(['Mary, Analyst, live', 'John, Product Manager, working', 'Sally, UX Designer, idle', expect.any(String), expect.any(String)])
      const drawn: Record<string, string> = {}

      for (const persona of ROSTER) {
        choose(persona.name, how)
        await settle()
        expect(tile(persona.name).getAttribute('aria-current')).toBe('true')
        expect(text(header().querySelector('.chat-head-name'))).toBe(persona.name)
        drawn[persona.name] = thread().innerHTML
        // Focus stays on the tile that was activated, and the window's one live region says nothing.
        expect(document.activeElement).toBe(tile(persona.name))
        expect(all(LIVE_REGIONS, root())).toHaveLength(1)
        expect(text(root().querySelector(LIVE_REGIONS))).toBe('')
      }
      // Sally’s thread was hers from the conversation, and a persona with no thread at all draws the introduction alone.
      for (const persona of ROSTER) {
        choose(persona.name, how)
        await settle()
        expect(thread().innerHTML, persona.name).toBe(drawn[persona.name])
      }

      nothingAsked()
      // No dot lit that was not lit: Mary's live dot, John's work dot, Sally's none; the header says the same.
      expect(tiles().map((button) => [button.getAttribute('aria-label'), all('.status-dot--live', button).length])).toEqual(before)
      expect(all('.status-dot--live', rail())).toHaveLength(1)
      expect(all('.status-dot--live', tile('Mary'))).toHaveLength(1)
      expect(all('.status-dot--live', tile('Sally'))).toEqual([])
      expect(all('.chat-head .status-dot--live', root())).toEqual([])
    }
  )

  it('selects a persona with no thread and no seat into an empty chat that draws the introduction alone and offers no close', async () => {
    await start(world({ entries: world().entries.filter((entry) => threadAgentOf(entry) !== SALLY.id) }))
    for (const how of ['click', 'Enter', 'Space'] as const) {
      choose('Sally', how)
      await settle()
      expect([...thread().children].map((child) => child.className)).toEqual(['thread-intro'])
      expect(all('.turn, .sysline, .run-card', thread())).toEqual([])
      expect(all('.chat-head button', root())).toEqual([])
      expect(all('.status-dot--live, .status-dot--work', tile('Sally'))).toEqual([])
      expect(stateOf(tile('Sally'))).toBe('idle')
    }
    nothingAsked()
  })
})

describe('the threads, in the whole App, with every persona, the room and two skill-first sessions in it (Stories 8.1 and 8.4, audited by Story 8.7)', () => {
  /** The drawn thread of each: a persona's by its tile, the room's by its view, a skill-first session's by its seat. */
  type Drawn = { key: string; text: string; cards: string[] }

  async function visit(): Promise<Drawn[]> {
    const found: Drawn[] = []
    const snap = (key: string, within: HTMLElement): void =>
      void found.push({ key, text: text(within), cards: cardsDrawn(within) })
    view('1:1 Conversation')
    for (const persona of ROSTER) {
      await selectTile(persona.name)
      snap(persona.id, thread())
    }
    view('Party Mode')
    snap('room', party())
    view('1:1 Conversation')
    await selectSeat(0)
    snap('sk-a', thread())
    await selectSeat(1)
    snap('sk-b', thread())
    return found
  }

  /** The thread each record belongs to, by the shared predicate for a persona's and by its own flag for the other two. */
  const ownerOf = (entry: TranscriptRecord): string =>
    entry.kind !== 'persona' && entry.kind !== 'user' && entry.kind !== 'sysline'
      ? entry.skillSession
      : entry.room === true
        ? 'room'
        : (entry.skillSession ?? threadAgentOf(entry) ?? 'none')

  it('draws every stored record in exactly one thread, the one the shared predicate puts it in, and in no other', async () => {
    const snapshot = world()
    await start(snapshot)
    const threads = await visit()

    expect(threads.map(({ key }) => key)).toEqual([MARY.id, JOHN.id, SALLY.id, 'room', 'sk-a', 'sk-b'])
    expect(snapshot.entries.map(ownerOf)).not.toContain('none')
    for (const entry of snapshot.entries) {
      const holders = threads.filter(({ text: drawn }) => drawn.includes(entry.text)).map(({ key }) => key)
      expect(holders, entry.text).toEqual([ownerOf(entry)])
    }
    // Eighteen records, each drawn once among the six threads.
    expect(threads.flatMap(({ text: drawn }) => snapshot.entries.filter((entry) => drawn.includes(entry.text)))).toHaveLength(snapshot.entries.length)
  })

  it('draws each run card in its own thread alone: a persona’s by its agent, a skill session’s by its session, none in the room', async () => {
    await start()
    const threads = await visit()
    const cardsOf = (key: string): string[] => threads.find((one) => one.key === key)?.cards ?? []

    // Mary's finished run is hers, and John's running one is his and is drawn in no other persona's chat (Story 8.4).
    expect(cardsOf(MARY.id)).toHaveLength(1)
    expect(cardsOf(JOHN.id)).toHaveLength(1)
    expect(cardsOf(SALLY.id)).toEqual([])
    expect(cardsOf('room')).toEqual([])
    expect(cardsOf('sk-a')).toEqual([expect.stringMatching(/^bmad-build run/)])
    expect(cardsOf('sk-b')).toEqual([expect.stringMatching(/^bmad-build-auto/)])
    expect(cardsOf(MARY.id)[0]).not.toBe(cardsOf(JOHN.id)[0])
    // Seen from Mary's chat, John's running card is not drawn, not even collapsed.
    await selectTile('Mary')
    expect(cardsDrawn(thread())).toHaveLength(1)
    expect(text(root().querySelector('.chat'))).not.toContain('CP')
  })

  it('leaves every drawn thread as it was, and asks main for nothing, after many switches in every order', async () => {
    await start()
    const first = await visit()
    for (let round = 0; round < 3; round += 1) {
      for (const name of ['Sally', 'Mary', 'John', 'Sally', 'John', 'Mary']) {
        await selectTile(name)
      }
      view('Party Mode')
      view('1:1 Conversation')
      await selectSeat(1)
      await selectSeat(0)
    }
    const again = await visit()

    expect(again.map(({ key }) => key)).toEqual(first.map(({ key }) => key))
    for (const [at, one] of again.entries()) {
      expect(one.text, one.key).toBe(first[at].text)
      expect(one.cards, one.key).toEqual(first[at].cards)
    }
    nothingAsked()
  })

  it('keeps the one polite live region, and keeps it silent, through every switch', async () => {
    await start()
    await visit()
    expect(all(LIVE_REGIONS, root())).toHaveLength(1)
    expect(root().querySelector(LIVE_REGIONS)?.getAttribute('aria-live')).toBe('polite')
    expect(text(root().querySelector(LIVE_REGIONS))).toBe('')
  })
})

describe('the first message to a persona, in the whole App (Story 8.3, audited by Story 8.7)', () => {
  const push = (event: ContractEvent): void => act(() => bridge.push(event))
  /** Sally without a thread or a seat, in a conversation that holds the others' threads. */
  const sallyFresh = (): ConversationSnapshot =>
    world({ entries: world().entries.filter((entry) => threadAgentOf(entry) !== SALLY.id), runs: world().runs.filter((run) => run.agentId !== SALLY.id) })

  async function say(words: string): Promise<void> {
    await selectTile('Sally')
    const field = root().querySelector('.chat textarea') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    act(() => {
      setter?.call(field, words)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => void field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    await settle()
    await settle()
  }

  it('draws the user’s turn as sent in her chat alone, asks main once, and draws the greeting and the answer as one persona turn, no word edited', async () => {
    await start(sallyFresh())
    await say('hello sally')

    expect(bridge.seatStarts).toEqual([{ seat: SALLY.id, message: 'hello sally' }])
    expect(bridge.sent).toEqual([])
    expect(bridge.opened).toEqual([SALLY.id])
    expect(all('.turn--user', thread()).map(text)).toEqual([expect.stringContaining('hello sally')])
    expect(all('.turn--queued', thread())).toEqual([])
    // Mary's and John's chats gained nothing from it.
    for (const persona of [MARY, JOHN]) {
      await selectTile(persona.name)
      expect(all('.turn--user', thread())).toHaveLength(1)
      expect(text(thread())).not.toContain('hello sally')
    }

    await selectTile('Sally')
    const sessionId = `session-of-${SALLY.id}`
    push({ name: 'session:opened', payload: { sessionId, agentId: SALLY.id, at: NOW } })
    push({ name: 'persona:said', payload: { sessionId, agentId: SALLY.id, messageId: 'g', text: 'Hi, I am ', at: NOW + 1, activation: true } })
    push({ name: 'persona:said', payload: { sessionId, agentId: SALLY.id, messageId: 'g', text: '**Sally**.', at: NOW + 2, activation: true } })
    push({ name: 'persona:said', payload: { sessionId, agentId: SALLY.id, messageId: 'a', text: 'Here is the answer.', at: NOW + 3 } })
    await settle()

    const turns = all('.turn--persona', thread())
    expect(turns).toHaveLength(1)
    const body = text(turns[0])
    expect(body.indexOf('Hi, I am Sally.')).toBeGreaterThanOrEqual(0)
    expect(body.indexOf('Here is the answer.')).toBeGreaterThan(body.indexOf('Hi, I am Sally.'))
    expect(bridge.seatStarts).toHaveLength(1)
  })

  it('shows main’s refusal as the one failure line, keeps the user’s turn, and starts nothing again', async () => {
    await start(sallyFresh())
    ;(window.harness as unknown as Record<string, unknown>).openSession = async (target: { seat?: string }) => {
      if (target.seat !== undefined) throw { code: 'session/spawn-failed', message: 'session · could not start the session' }
      return { sessionId: 'unexpected' }
    }
    await say('hello sally')
    await settle()

    expect(all('.error-line', root())).toHaveLength(1)
    expect(text(root().querySelector('.error-line'))).toContain('could not start the session')
    expect(all('.turn--user', thread()).map(text)).toEqual([expect.stringContaining('hello sally')])
    expect(all('.turn--persona, .sysline', thread())).toEqual([])
    expect(bridge.seatStarts).toEqual([])
    expect(bridge.sent).toEqual([])
    expect(all('.status-dot--live', tile('Sally'))).toEqual([])
  })
})

describe('closing one chat, in the whole App (Story 8.5, audited by Story 8.7)', () => {
  const closeControl = (): HTMLButtonElement | null => header().querySelector('button.chat-close')

  it('offers close on a stored thread with no seat, and on a live one, and on a persona with neither offers nothing', async () => {
    await start(world({ entries: world().entries.filter((entry) => threadAgentOf(entry) !== SALLY.id), sessions: [{ agentId: MARY.id, sessionId: 's-mary' }] }))
    await selectTile('Sally')
    expect(closeControl()).toBeNull()
    await selectTile('John')
    expect(closeControl()).not.toBeNull()
    expect(closeControl()?.getAttribute('aria-label')).toBe('close session · John')
    await selectTile('Mary')
    expect(closeControl()?.getAttribute('aria-label')).toBe('close session · Mary')
    nothingAsked()
  })

  it('closes a stored thread by `{ agentId }` at once, deleting that persona’s thread and drawing nothing in its place, with every other thread as it was', async () => {
    await start(stored())
    const otherwise = async (): Promise<Record<string, string>> => {
      const found: Record<string, string> = {}
      for (const persona of [MARY, SALLY]) {
        await selectTile(persona.name)
        found[persona.id] = thread().innerHTML
      }
      view('Party Mode')
      found.room = party().innerHTML
      view('1:1 Conversation')
      await selectSeat(0)
      found['sk-a'] = thread().innerHTML
      await selectSeat(1)
      found['sk-b'] = thread().innerHTML
      return found
    }
    const before = await otherwise()

    await selectTile('John')
    expect(text(thread())).toContain(WORDS.john[1])
    act(() => closeControl()!.click())
    await settle()

    // By agent id, once, with no confirmation between the press and the command; no session id, no stop.
    expect(bridge.closedAgents).toEqual([JOHN.id])
    expect(bridge.closed).toEqual([])
    expect(bridge.stopped).toEqual([])
    expect(bridge.sent).toEqual([])
    expect(bridge.opened).toEqual([])
    expect(bridge.ended).toEqual([])
    expect(root().querySelector('[role=dialog], dialog, [role=alertdialog]')).toBeNull()
    // His chat is the empty chat again: the introduction, no record, no run, no line written in their place, no close.
    expect([...thread().children].map((child) => child.className)).toEqual(['thread-intro'])
    expect(all('.turn, .sysline, .run-card, .run-card-line', thread())).toEqual([])
    expect(cardsDrawn(thread())).toEqual([])
    expect(closeControl()).toBeNull()
    for (const word of WORDS.john) expect(root().textContent).not.toContain(word)
    expect(text(thread())).not.toMatch(/closed|ended|deleted|cleared|undo/i)
    // The other threads draw exactly what they drew.
    expect(await otherwise()).toEqual(before)
  })

  it('closes a live persona by its session id and takes that persona’s thread and run alone', async () => {
    await start()
    await selectTile('Mary')
    expect(text(thread())).toContain(WORDS.mary[1])
    act(() => closeControl()!.click())
    await settle()

    expect(bridge.closed).toEqual(['s-mary'])
    expect(bridge.closedAgents).toEqual([])
    await selectTile('Mary')
    for (const word of WORDS.mary) expect(root().textContent).not.toContain(word)
    expect(cardsDrawn(thread())).toEqual([])
    // John’s, Sally’s, the room’s and the seats’ threads are whole.
    await selectTile('John')
    for (const word of WORDS.john) expect(text(thread())).toContain(word)
    await selectTile('Sally')
    for (const word of SALLYS) expect(text(thread())).toContain(word)
    view('Party Mode')
    for (const word of WORDS.room) expect(text(party())).toContain(word)
    view('1:1 Conversation')
    await selectSeat(0)
    for (const word of WORDS.a) expect(text(thread())).toContain(word)
    expect(text(thread())).toContain('bmad-build run')
    await selectSeat(1)
    for (const word of WORDS.b) expect(text(thread())).toContain(word)
    expect(bridge.ended).toEqual([])
  })
})

describe('what is never suggested, in the whole App (Stories 8.4 and 8.6, audited by Story 8.7)', () => {
  /** Main speaks for the chats in the background: John answers, Sally's seat comes up and answers. */
  const speech = (): void => {
    act(() => bridge.push({ name: 'persona:said', payload: { sessionId: 's-john', agentId: JOHN.id, messageId: 'bg1', text: 'bgmark-said', at: NOW } }))
    act(() => bridge.push({ name: 'session:opened', payload: { sessionId: 's-sally', agentId: SALLY.id, at: NOW } }))
    act(() => bridge.push({ name: 'session:awaiting-turn', payload: { sessionId: 's-sally', at: NOW } }))
    act(() => bridge.push({ name: 'persona:said', payload: { sessionId: 's-sally', agentId: SALLY.id, messageId: 'bg2', text: 'bgmark-sally', at: NOW + 1 } }))
  }
  /** John's run in the background ends, which the window's one live region may say (run completion), and the rail says nothing more of. */
  const runEnds = (): void => {
    act(() => bridge.push({ name: 'run:finished', payload: { runId: 'run-john', sessionId: 's-john', at: NOW } } as never))
  }

  it('carries no unread mark, count, badge, preview, recency order or suggested persona, in the rail, the header or the thread in view', async () => {
    await start()
    await selectTile('Mary')
    const roster = tiles().map((button) => text(button.querySelector('.tile-name')))
    speech()
    runEnds()
    await settle()

    // The rail's order is the roster's and the seats' own, however recently a chat spoke.
    expect(tiles().map((button) => text(button.querySelector('.tile-name')))).toEqual(roster)
    expect(roster.slice(0, 3)).toEqual(['Mary', 'John', 'Sally'])
    const leaves = [rail(), ...all('*', rail())].filter((node) => node.children.length === 0).map(text)
    for (const words of [...leaves, ...all('[aria-label]', root()).map((node) => node.getAttribute('aria-label') ?? '')]) {
      expect(words).not.toMatch(/^\d+$|\+\d|\b\d+\s+(?:new|unread|live|seats?|sessions?|open|active|running|messages?)\b|recommend|\bnext\b|needs you|badge|unread|suggest|preview/i)
    }
    expect(all('*', root()).filter((node) => /recommend|next|needs|badge|unread|count|preview|recent|highlight|suggest/.test(node.className.toString()))).toEqual([])
    // A seat's line is the dot's word and the counter of a working one, never a message or a time of the last word.
    for (const button of tiles()) {
      expect(text(button.querySelector('.state-text'))).toMatch(/^(?:idle|live|ended|working(?: · (?:\d+m )?\d+s)?)$/)
      expect(text(button)).not.toContain('bgmark')
    }
    // The chat in view draws nothing of the chats behind it, and the background words are only in their own chats.
    expect(text(thread())).not.toContain('bgmark')
    expect(text(thread())).not.toContain('CP')
    // Nor does the header or the thread in view suggest a persona to talk to next, in words of its own.
    expect(`${text(header())} ${text(thread())}`).not.toMatch(/recommend|\bnext\b|suggest|talk to/i)
    await selectTile('John')
    expect(text(thread())).toContain('bgmark-said')
    expect(text(thread())).not.toContain('bgmark-sally')
    await selectTile('Sally')
    expect(text(thread())).toContain('bgmark-sally')
  })

  it('says nothing aloud for a switch or a background chat’s words, and writes no `handed to` line in any thread, by switch or by `@name`', async () => {
    await start()
    await selectTile('Mary')
    speech()
    await settle()
    expect(all(LIVE_REGIONS, root())).toHaveLength(1)
    expect(text(root().querySelector(LIVE_REGIONS))).toBe('')

    // A bare `@name` turns the view and writes nothing anywhere (Story 8.6).
    const field = root().querySelector('.chat textarea') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    act(() => {
      setter?.call(field, '@John')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => void field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
    await settle()

    expect(text(header().querySelector('.chat-head-name'))).toBe('John')
    expect(bridge.sent).toEqual([])
    expect(bridge.seatStarts).toEqual([])
    expect(bridge.opened).toEqual([])
    for (const persona of ROSTER) {
      await selectTile(persona.name)
      expect(`${root().innerHTML} ${spoken(root())}`).not.toMatch(/handed to|hand-?off|handoff/i)
    }
    view('Party Mode')
    expect(text(party())).not.toMatch(/handed to/i)
    // The region throttles what it says, so a late word would be there by now.
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 300))))
    expect(all(LIVE_REGIONS, root())).toHaveLength(1)
    expect(text(root().querySelector(LIVE_REGIONS))).toBe('')
  })
})
