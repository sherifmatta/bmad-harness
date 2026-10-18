// @vitest-environment jsdom
import { createElement } from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ContractEvent } from '../../shared/events'
import type { AgentView, InstallSnapshot } from '../../shared/install'
import type { RailSnapshot } from '../../shared/rail'
import { App } from './app'
import { LIVE_REGIONS } from './testing/audit-patterns'
import { installFakeScroll } from './testing/fake-scroll'
import type { FakeScroll } from './testing/fake-scroll'
import { mount, settle } from './testing/render-hook'
import type { Mounted } from './testing/render-hook'

/**
 * The glue `App` owns and nothing else holds: selecting a tile opens that
 * persona's session, the composer is keyed by the current persona and sends to
 * theirs. Rendered against a fake `window.harness`, so removing or mis-wiring
 * `onActivate`, the composer's `onSend` agent id, or its `key` fails here.
 */

const agent = (id: string, name: string): AgentView => ({
  id,
  module: 'bmm',
  name,
  title: 'Role',
  icon: 'i',
  description: 'd'
})
const mary = agent('bmad-agent-analyst', 'Mary')
const john = agent('bmad-agent-pm', 'John')

const snapshot: InstallSnapshot = {
  revision: 1,
  agents: [mary, john],
  menus: {},
  errors: [],
  preflight: [],
  skills: []
}

let mounted: Mounted | null
let opened: string[]
/** The casts the window asked for a room of, in order. */
let roomCasts: (readonly string[])[]
let sent: ([string, string] | [string, string, string])[]
let ended: string[]
/** The runs the window asked main to stop, and what main answers a stop with (nothing: it took it). */
let stopped: string[]
let stopReply: (() => Promise<void>) | undefined
/** The sessions the window asked main to stop the turn of. */
let turnStopped: string[]
/** The sessions the window asked main to close. */
let closedSessions: string[]
/** Who `onInstallChanged` subscribed, to be pushed a new install snapshot. */
let installListeners: ((next: InstallSnapshot) => void)[]
let listeners: ((event: ContractEvent) => void)[]
/** Who `onRunRevealed` subscribed, to be told which run's card main raised the window for. */
let revealListeners: ((runId: string) => void)[]
/** The documents the window asked main to open, and the menu entries it dispatched. */
let docsOpened: string[]
let dispatchedMenus: [string, string][]
/** The rail as `getRail` answers it, who `onRailChanged` subscribed, and how often `change…` asked for the chooser. */
let railNow: RailSnapshot
let railListeners: ((next: RailSnapshot) => void)[]
let chooseCalls: number
/** The first messages the New session chat sent (Story 7.5), and what main answers each with: an opened session, or a thrown refusal. */
let firsts: string[]
let firstAnswer: (text: string) => unknown
/** What `getConversation` answers with, and a refusal `sendTurn` throws for a session, if any (Story 7.5). */
let conversationNow: () => unknown
let sendRefusal: ((sessionId: string) => unknown) | undefined
/** What `getBoard` answers with, or a rejection; and who `onBoardChanged` subscribed. */
let boardNow: () => Promise<unknown>
let boardListeners: ((next: unknown) => void)[]

function installBridge(): void {
  const bridge = {
    getProjectPath: async () => '/work/falcon',
    getInstall: async () => snapshot,
    onInstallChanged: (listener: (next: InstallSnapshot) => void) => {
      installListeners.push(listener)
      return () => {}
    },
    getBranch: async () => 'main',
    getRail: async () => railNow,
    getBoard: () => boardNow(),
    onBoardChanged: (listener: (next: unknown) => void) => {
      boardListeners.push(listener)
      return () => {}
    },
    onRailChanged: (listener: (next: RailSnapshot) => void) => {
      railListeners.push(listener)
      return () => {}
    },
    chooseOutputFolder: async () => {
      chooseCalls += 1
      return { kind: 'cancelled' }
    },
    openDoc: async (path: string) => {
      docsOpened.push(path)
    },
    onDocClosed: () => () => {},
    dispatchMenu: async (sessionId: string, code: string) => {
      dispatchedMenus.push([sessionId, code])
      return 'r-dispatched'
    },
    openSession: async (target: string | { room: readonly string[] } | { first: string }) => {
      if (typeof target !== 'string' && 'first' in target) {
        firsts.push(target.first)
        return firstAnswer(target.first)
      }
      if (typeof target !== 'string') {
        roomCasts.push(target.room)
        return { sessionId: 'session-of-the-room', room: { cast: [...target.room], openedAt: 1_700_000_000_000 } }
      }
      const agentId = target
      opened.push(agentId)
      // Main answers an open with the session alone: a switch writes no line (Story 7.4).
      return { sessionId: `session-of-${agentId}` }
    },
    closeSession: async (sessionId: string) => {
      closedSessions.push(sessionId)
    },
    sendTurn: async (sessionId: string, text: string, mention?: string) => {
      const refused = sendRefusal?.(sessionId)
      if (refused !== undefined) {
        throw refused
      }
      sent.push(mention === undefined ? [sessionId, text] : [sessionId, text, mention])
    },
    stopRun: async (runId: string) => {
      stopped.push(runId)
      await stopReply?.()
    },
    stopTurn: async (sessionId: string) => {
      turnStopped.push(sessionId)
    },
    getConversation: async () => conversationNow(),
    endConversation: async (projectId: string) => {
      ended.push(projectId)
    },
    onSessionEvent: (listener: (event: ContractEvent) => void) => {
      listeners.push(listener)
      return () => {}
    },
    onRunRevealed: (listener: (runId: string) => void) => {
      revealListeners.push(listener)
      return () => {}
    }
  }
  Object.defineProperty(window, 'harness', { value: bridge, configurable: true, writable: true })
}

beforeEach(() => {
  mounted = null
  opened = []
  roomCasts = []
  sent = []
  ended = []
  stopped = []
  turnStopped = []
  stopReply = undefined
  closedSessions = []
  installListeners = []
  listeners = []
  revealListeners = []
  docsOpened = []
  dispatchedMenus = []
  railNow = { revision: 1, folder: '_bmad/', rows: [] }
  railListeners = []
  chooseCalls = 0
  boardNow = async () => ({ revision: 1, kind: 'none', code: 'board/absent', message: 'board · no sprint status' })
  boardListeners = []
  firsts = []
  // Main's own refusal: the first word as typed, the leading slash removed (Story 7.5).
  firstAnswer = (text: string) => {
    throw { code: 'session/no-skill', message: `no skill named ${text.split(/\s+/)[0].replace(/^\//, '')}` }
  }
  conversationNow = () => ({ entries: [], sessions: [], busy: [], personas: [], runs: [] })
  sendRefusal = undefined
  installBridge()
})

afterEach(() => {
  mounted?.unmount()
  Object.defineProperty(window, 'harness', { value: undefined, configurable: true, writable: true })
})

function field(): HTMLTextAreaElement {
  return mounted!.container.querySelector('textarea') as HTMLTextAreaElement
}

/** React's controlled input listens for the native setter, not for `.value =`. */
function type(element: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function tile(name: string): HTMLButtonElement {
  const found = [...mounted!.container.querySelectorAll<HTMLButtonElement>('button.persona-tile')].find(
    (button) => button.getAttribute('aria-label')?.startsWith(`${name},`)
  )
  if (found === undefined) throw new Error(`no tile for ${name}`)
  return found
}

/**
 * A window opens on the New session chat (Story 7.5), with no persona current. Most of what follows is about a
 * persona, so it turns to Mary's tile first; the open that asks of main is the setup, not what is under test, and
 * is not counted in `opened`.
 */
async function mountOn(name: string): Promise<void> {
  mounted = mount(createElement(App))
  await settle()
  await settle()
  act(() => tile(name).click())
  await settle()
  opened.length = 0
}

const mountOnMary = (): Promise<void> => mountOn('Mary')

describe('App, the Board', () => {
  const boardSection = (): HTMLElement => mounted!.container.querySelector('.view-board') as HTMLElement
  const pressBoard = (): void =>
    act(() =>
      [...mounted!.container.querySelectorAll<HTMLButtonElement>('.view-switch button')]
        .find((button) => button.textContent === 'Board')
        ?.click()
    )

  it('hands the Board the snapshot getBoard answered, and shows it when Board is pressed', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()

    expect(boardSection().hidden).toBe(true)
    pressBoard()

    expect(boardSection().hidden).toBe(false)
    expect(boardSection().textContent).toContain('no sprint status')
    expect(boardListeners).toHaveLength(1)
  })

  it('moves a card to its new column in the same render, without moving focus or scroll', async () => {
    const snapshotOf = (revision: number, status: string): unknown => ({
      revision,
      kind: 'read',
      epics: [
        {
          key: 'epic-6',
          number: 6,
          title: 'Board',
          status: 'in-progress',
          known: true,
          stories: [{ key: '6-4-every-story-in-its-column', number: '6.4', title: 'Every story, in its column', status, known: true }]
        }
      ],
      others: []
    })
    boardNow = async () => snapshotOf(1, 'in-progress')
    mounted = mount(createElement(App))
    await settle()
    await settle()
    pressBoard()

    const columnOf = (): string | null =>
      boardSection().querySelector('.board-card')?.closest('.board-column')?.querySelector('.board-column-head')?.textContent ?? null
    expect(columnOf()).toBe('in-progress')

    const input = field()
    input.focus()
    boardSection().scrollTop = 40
    const focused = document.activeElement
    const stories = boardSection().querySelector('.board-stories')
    const heading = boardSection().querySelector('.board-column-head')
    act(() => boardListeners.forEach((listener) => listener(snapshotOf(2, 'review'))))

    expect(columnOf()).toBe('review')
    expect(boardSection().querySelectorAll('.board-card')).toHaveLength(1)
    expect(document.activeElement).toBe(focused)
    expect(boardSection().scrollTop).toBe(40)
    // The columns are updated in place, not remounted.
    expect(boardSection().querySelector('.board-stories')).toBe(stories)
    expect(boardSection().querySelector('.board-column-head')).toBe(heading)
    expect([...boardSection().querySelectorAll('.board-stories, .board-stories *')].some((el) => el.getAttributeNames().some((name) => name.startsWith('aria-')))).toBe(false)
  })

  it('moves the first figure when a persona goes to work, in the same render and in the same nodes, with no announcement', async () => {
    boardNow = async () => ({
      revision: 1,
      kind: 'read',
      epics: [
        {
          key: 'epic-6',
          number: 6,
          title: 'Board',
          status: 'in-progress',
          known: true,
          stories: [{ key: '6-5-x', number: '6.5', title: 'T', status: 'in-progress', known: true }]
        }
      ],
      others: []
    })
    mounted = mount(createElement(App))
    await settle()
    await settle()
    pressBoard()

    const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
    const figures = (): string[] => [...boardSection().querySelectorAll('.board-figure-value')].map((node) => node.textContent ?? '')
    const lines = (): string[] => [...boardSection().querySelectorAll('.board-figure-line')].map((node) => node.textContent ?? '')
    expect(figures()).toEqual(['0', '1'])
    expect(lines()[0]).toBe(`of ${snapshot.agents.length} installed`)
    expect(boardSection().querySelector('.board-epic-progress')?.textContent).toBe('0 of 1 stories done')

    const first = boardSection().querySelector('.board-figure-value')
    const input = field()
    input.focus()
    const focused = document.activeElement
    push({ name: 'persona:state', payload: { agentId: mary.id, state: 'work', at: Date.now() } })

    expect(figures()).toEqual(['1', '1'])
    expect(boardSection().querySelector('.board-figure-value')).toBe(first)
    expect(document.activeElement).toBe(focused)
    expect([...boardSection().querySelectorAll('.board-overview, .board-overview *, .board-epics, .board-epics *')].filter((el) => el.closest('.board-epic-track') === null).some((el) => el.getAttributeNames().some((name) => name.startsWith('aria-') || name === 'role' || name === 'tabindex'))).toBe(false)

    push({ name: 'persona:state', payload: { agentId: mary.id, state: 'live', at: Date.now() } })
    expect(figures()).toEqual(['0', '1'])
  })

  it('says nothing in the window’s one live region when a new Board revision arrives and a persona changes state (Story 6.9)', async () => {
    const epic = (status: string): unknown => ({
      key: 'epic-6',
      number: 6,
      title: 'Board',
      status: 'in-progress',
      known: true,
      stories: [{ key: '6-9-x', number: '6.9', title: 'T', status, known: true }]
    })
    boardNow = async () => ({ revision: 1, kind: 'read', epics: [epic('in-progress')], others: [] })
    mounted = mount(createElement(App))
    await settle()
    await settle()
    pressBoard()

    const region = (): HTMLElement[] => [...mounted!.container.querySelectorAll<HTMLElement>(LIVE_REGIONS)]
    const said = (): string => region().map((node) => node.textContent ?? '').join('')
    // The one region is the window's own, drawn outside the Board.
    expect(region()).toHaveLength(1)
    expect(boardSection().contains(region()[0])).toBe(false)
    expect(said()).toBe('')

    act(() => boardListeners.forEach((listener) => listener({ revision: 2, kind: 'read', epics: [epic('review')], others: [] })))
    act(() => listeners.forEach((listener) => listener({ name: 'persona:state', payload: { agentId: mary.id, state: 'work', at: Date.now() } })))
    expect(boardSection().querySelector('.board-card')?.closest('.board-column')?.querySelector('.board-column-head')?.textContent).toBe('review')
    expect([...boardSection().querySelectorAll('.board-figure-value')].map((node) => node.textContent)).toEqual(['1', '0'])

    // Longer than the region's drain interval and the announcer's throttle: anything queued would have been said by now.
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 2500))))
    expect(said()).toBe('')
  })

  it('moves a persona’s Agents row with its state: the run line while `work` with a run in flight, `in a turn` without one, and nothing back at idle (Story 6.6)', async () => {
    boardNow = async () => ({ revision: 1, kind: 'read', epics: [], others: [] })
    mounted = mount(createElement(App))
    await settle()
    await settle()
    pressBoard()

    const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
    const row = (): HTMLElement =>
      [...boardSection().querySelectorAll<HTMLElement>('.board-agent')].find((el) => el.querySelector('.board-agent-name')?.textContent === 'Mary')!
    const run = (): string | null => row().querySelector('.board-agent-run')?.textContent ?? null
    const names = (): string[] => [...boardSection().querySelectorAll('.board-agent-name')].map((el) => el.textContent ?? '')
    const order = names()
    expect(order).toEqual(snapshot.agents.map((member) => member.name))
    expect(run()).toBeNull()
    expect(row().className).toContain('board-agent--idle')

    // In a turn that is not a run: the words and nothing of what.
    push({ name: 'persona:state', payload: { agentId: mary.id, state: 'work', at: Date.now() } })
    expect(run()).toBe('in a turn')
    expect(row().className).not.toContain('board-agent--idle')
    const node = row()

    // A run starts: the code, the subject path and the run's elapsed.
    push({ name: 'run:started', payload: { runId: 'r1', sessionId: 's-Mary', agentId: mary.id, code: 'CP', at: Date.now() - 7_000 } })
    push({ name: 'doc:prose', payload: { runId: 'r1', sessionId: 's-Mary', callId: 'c1', path: 'a/b.md', text: '## A\n', at: Date.now() } })
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    expect(run()).toMatch(/^CP a\/b\.md \d+s$/)
    expect(row()).toBe(node)
    expect([...boardSection().querySelectorAll('.board-agent-run')]).toHaveLength(1)
    expect(names()).toEqual(order)
    expect([...boardSection().querySelectorAll('.board-agents, .board-agents *')].filter((el) => el.closest('svg') === null).some((el) => el.getAttributeNames().some((name) => name === 'role' || name === 'tabindex' || name === 'title' || (name.startsWith('aria-') && name !== 'aria-hidden')))).toBe(false)

    // Back from work: the run line is gone in the same render.
    push({ name: 'run:finished', payload: { runId: 'r1', sessionId: 's-Mary', at: Date.now() } })
    push({ name: 'persona:state', payload: { agentId: mary.id, state: 'idle', at: Date.now() } })
    expect(run()).toBeNull()
    expect(row().className).toContain('board-agent--idle')
  })

  it('puts a run’s end row at the top in the render that changed the entries, with no announcement (Story 6.7)', async () => {
    boardNow = async () => ({ revision: 1, kind: 'read', epics: [], others: [] })
    mounted = mount(createElement(App))
    await settle()
    await settle()
    pressBoard()

    const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
    const feed = (): string[] =>
      [...boardSection().querySelectorAll('.board-activity-row')].map(
        (row) => `${row.querySelector('.board-activity-who')?.textContent} ${row.querySelector('.board-activity-did')?.textContent}`
      )
    expect(feed()).toEqual([])
    expect(boardSection().querySelector('.board-activity-head')?.textContent).toBe('recent activity')

    push({ name: 'run:started', payload: { runId: 'r1', sessionId: 's-Mary', agentId: mary.id, code: 'CP', at: Date.now() - 5_000 } })
    expect(feed()).toEqual(['Mary started CP'])
    expect(boardSection().querySelector('.board-activity-row .status-dot--work')).not.toBeNull()
    expect(boardSection().querySelector('.board-activity-row')?.classList.contains('board-activity-still')).toBe(false)

    push({ name: 'run:finished', payload: { runId: 'r1', sessionId: 's-Mary', at: Date.now() } })
    expect(feed()).toEqual(['Mary finished CP', 'Mary started CP'])
    expect([...boardSection().querySelectorAll('.board-activity-row')].every((row) => row.classList.contains('board-activity-still'))).toBe(true)
    expect([...boardSection().querySelectorAll('.board-activity, .board-activity *')].filter((el) => el.closest('svg') === null).some((el) => el.getAttributeNames().some((name) => name === 'role' || name === 'tabindex' || name === 'title' || (name.startsWith('aria-') && name !== 'aria-hidden')))).toBe(false)
  })

  it('reads the same when getBoard rejects', async () => {
    boardNow = async () => {
      throw { code: 'board/unexpected', message: 'board · unexpected failure' }
    }
    mounted = mount(createElement(App))
    await settle()
    await settle()
    pressBoard()

    expect(boardSection().textContent).toContain('no sprint status')
    expect(boardSection().textContent).not.toContain('unexpected')
  })
})

describe('App, the conversation glue', () => {
  it('turns to the selected persona without opening a session, remounts the composer for them, and a first message opens theirs', async () => {
    await mountOnMary()

    // The window opens on the topmost persona with a composer and no session.
    expect(tile('Mary').getAttribute('aria-current')).toBe('true')
    expect(opened).toEqual([])
    type(field(), 'a draft for Mary')

    act(() => tile('John').click())
    await settle()

    expect(opened).toEqual([])
    expect(tile('John').getAttribute('aria-current')).toBe('true')
    // Keyed by agent id: the other persona's draft did not come along.
    expect(field().value).toBe('')
    expect(field().getAttribute('aria-label')).toBe('Message John')

    type(field(), 'hello john')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()

    expect(opened).toEqual([john.id])
    expect(sent).toEqual([[`session-of-${john.id}`, 'hello john']])
  })

  it('opens no session until a first message, and a send to the persona chosen opens no other (Story 7.5)', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    // The window opens on the New session chat: nobody is current and nothing is open.
    expect(opened).toEqual([])
    expect(mounted.container.querySelector('.chat-head-name')?.textContent).toBe('New session')

    act(() => tile('Mary').click())
    await settle()
    expect(opened).toEqual([])

    type(field(), 'hello mary')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()

    expect(opened).toEqual([mary.id])
    expect(sent).toEqual([[`session-of-${mary.id}`, 'hello mary']])
  })

  it('queues a message typed while the persona works, leaves focus and the composer alone, and un-dims it in place when the turn ends', async () => {
    await mountOnMary()
    const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })

    const input = field()
    input.focus()
    type(input, 'while you work')
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()

    const turn = mounted!.container.querySelector('.turn--user') as HTMLElement
    expect(turn.className).toContain('turn--queued')
    expect(turn.textContent).toContain('queued · sends when Mary finishes')
    expect(sent).toEqual([])
    expect(document.activeElement).toBe(field())
    expect(field().disabled).toBe(false)
    expect(field().readOnly).toBe(false)
    expect(field().hasAttribute('aria-disabled')).toBe(false)

    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 2 } })
    expect(sent).toEqual([['s-mary', 'while you work']])
    const same = mounted!.container.querySelector('.turn--user') as HTMLElement
    expect(same).toBe(turn)
    expect(same.className).not.toContain('turn--queued')
    expect(same.textContent).not.toContain('queued')
    expect(document.activeElement).toBe(field())
  })

  it('takes a cancelled message out of the transcript and never sends it', async () => {
    await mountOnMary()
    const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })

    type(field(), 'never mind')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()
    const cancel = mounted!.container.querySelector('button.turn-cancel') as HTMLButtonElement
    act(() => cancel.click())
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 2 } })

    expect(mounted!.container.querySelector('.turn--user')).toBeNull()
    expect(sent).toEqual([])
  })

  it('shows what main reports on the tile and the chat header, with a counter for work and none after', async () => {
    await mountOnMary()
    const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
    const container = mounted!.container
    // The state line alone: Mary's seat is open (her tile was chosen), so the header carries its close control as well.
    const header = (): Element => container.querySelector('.chat-head-state .state-line') as Element
    const tileState = (name: string): Element => tile(name).querySelector('.tile-state') as Element

    // Nothing reported: every dot reads idle and nothing counts.
    expect(tileState('Mary').textContent).toBe('idle')
    expect(header().textContent).toBe('idle')
    expect(container.querySelector('.state-elapsed')).toBeNull()

    push({
      name: 'persona:state',
      payload: { agentId: mary.id, state: 'work', at: Date.now() - 65_000 }
    })

    expect(tileState('Mary').textContent).toMatch(/^working · 1m 0\ds$/)
    expect(header().textContent).toMatch(/^working · 1m 0\ds$/)
    expect(tileState('John').textContent).toBe('idle')
    expect(tile('Mary').getAttribute('aria-label')).toBe('Mary, Role, working')
    // The tile, the chat header and the turn in flight at the thread's foot: the same state, counted from the same moment.
    expect(container.querySelectorAll('.status-dot--work')).toHaveLength(3)
    const pending = container.querySelector('.thread .turn--pending') as Element
    expect(pending.querySelector('.turn-name')?.textContent).toBe('Mary')
    expect(pending.querySelector('.state-text')?.textContent).toMatch(/^working · 1m 0\ds$/)

    push({ name: 'persona:state', payload: { agentId: mary.id, state: 'idle', at: Date.now() } })

    expect(tileState('Mary').textContent).toBe('idle')
    expect(header().textContent).toBe('idle')
    expect(container.querySelector('.state-elapsed')).toBeNull()
    expect(container.querySelector('.turn--pending, .caret, .turn-state')).toBeNull()
  })

  it('ends the conversation from the topbar: sends this window’s project, empties the thread, announces it once, and leaves no new live region', async () => {
    await mountOnMary()
    const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({
      name: 'persona:said',
      payload: { sessionId: 's-mary', agentId: mary.id, messageId: 'm1', text: 'Hello', at: 2 }
    })
    expect(mounted!.container.querySelectorAll('.turn')).toHaveLength(1)

    const buttons = [...mounted!.container.querySelectorAll<HTMLButtonElement>('.topbar button')]
    expect(buttons.map((button) => button.textContent)).toEqual(['1:1 Conversation', 'Party Mode', 'Board', 'End session'])
    const control = buttons[3]
    expect(control.type).toBe('button')
    expect(control.disabled).toBe(false)
    expect(control.hasAttribute('title')).toBe(false)

    act(() => control.click())
    // Main closes the sessions before it replies.
    push({
      name: 'session:closed',
      payload: { sessionId: 's-mary', agentId: mary.id, reason: 'closed', at: 3 }
    })
    await settle()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    expect(ended).toEqual(['/work/falcon'])
    expect(mounted!.container.querySelectorAll('.turn')).toHaveLength(0)
    expect(mounted!.container.querySelectorAll('.visually-hidden')).toHaveLength(1)
    expect(mounted!.container.querySelector('.visually-hidden')?.textContent).toBe('conversation · ended')
    // Nothing else changed: the composer is there and the next message opens a fresh session.
    type(field(), 'new start')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()
    expect(opened).toEqual([mary.id])
  })

  it('shows a refused end as an error line, announces nothing, and keeps the thread', async () => {
    const harness = window.harness as unknown as { endConversation: (id: string) => Promise<void> }
    harness.endConversation = async () =>
      Promise.reject({
        code: 'conversation/end-failed',
        message: 'conversation · could not end the conversation',
        detail: 'EACCES'
      })
    await mountOnMary()
    act(() =>
      listeners.forEach((listener) =>
        listener({
          name: 'persona:said',
          payload: { sessionId: 's', agentId: mary.id, messageId: 'm1', text: 'Hello', at: 2 }
        })
      )
    )

    const control = [...mounted!.container.querySelectorAll<HTMLButtonElement>('.topbar button')][3]
    act(() => control.click())
    await settle()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    expect(mounted!.container.textContent).toContain('conversation · could not end the conversation')
    expect(mounted!.container.querySelectorAll('.turn')).toHaveLength(1)
    expect(mounted!.container.querySelector('.visually-hidden')?.textContent).toBe('')
  })
})

describe('App, a thread for each persona (Story 8.1)', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const thread = (): HTMLElement => mounted!.container.querySelector('.thread') as HTMLElement
  const words = (): string => thread().textContent ?? ''
  const stored = (): void => {
    conversationNow = () => ({
      entries: [
        { kind: 'user', id: 'm-0', at: 1_700_000_000_001, text: 'ask-mary-one', agentId: mary.id },
        { kind: 'persona', id: 'm-1', at: 1_700_000_000_002, agentId: mary.id, messageId: 'x1', text: 'mary-answer' },
        { kind: 'sysline', id: 'm-2', at: 1_700_000_000_003, text: 'mary-line', agentId: mary.id },
        { kind: 'user', id: 'm-3', at: 1_700_000_000_004, text: 'ask-john-one', agentId: john.id },
        { kind: 'persona', id: 'm-4', at: 1_700_000_000_005, agentId: john.id, messageId: 'x2', text: 'john-answer' },
        { kind: 'user', id: 'm-5', at: 1_700_000_000_006, text: 'unplaced-user' },
        { kind: 'sysline', id: 'm-6', at: 1_700_000_000_007, text: 'unplaced-line' }
      ],
      sessions: [],
      busy: [],
      personas: [],
      runs: []
    })
  }

  it('draws each persona’s chat from its own records only, in both directions, and changes no stored record by switching', async () => {
    stored()
    await mountOnMary()
    expect(words()).toContain('ask-mary-one')
    expect(words()).toContain('mary-answer')
    expect(words()).toContain('mary-line')
    for (const other of ['ask-john-one', 'john-answer']) expect(words()).not.toContain(other)
    const marys = thread().innerHTML

    act(() => tile('John').click())
    await settle()
    expect(words()).toContain('ask-john-one')
    expect(words()).toContain('john-answer')
    for (const other of ['ask-mary-one', 'mary-answer', 'mary-line']) expect(words()).not.toContain(other)
    const johns = thread().innerHTML

    act(() => tile('Mary').click())
    await settle()
    act(() => tile('John').click())
    await settle()
    expect(thread().innerHTML).toBe(johns)
    act(() => tile('Mary').click())
    await settle()
    expect(thread().innerHTML).toBe(marys)
    // Switching sends nothing and ends nothing: the stored thread is the main process's, and it was not touched.
    expect(sent).toEqual([])
    expect(ended).toEqual([])
  })

  it('draws a record with no persona in no persona’s chat, however many others have spoken', async () => {
    stored()
    await mountOnMary()
    for (const name of ['Mary', 'John']) {
      act(() => tile(name).click())
      await settle()
      expect(words()).not.toContain('unplaced-user')
      expect(words()).not.toContain('unplaced-line')
    }
  })

  it('reads a persona whose others have turns but not itself as an empty chat that shows the thread introduction', async () => {
    stored()
    await mountOnMary()
    act(() => tile('John').click())
    await settle()
    expect(mounted!.container.querySelector('.thread-intro')).toBeNull()

    conversationNow = () => ({
      entries: [{ kind: 'persona', id: 'm-1', at: 1_700_000_000_002, agentId: mary.id, messageId: 'x1', text: 'mary-answer' }],
      sessions: [],
      busy: [],
      personas: [],
      runs: []
    })
    mounted?.unmount()
    mounted = null
    await mountOn('John')
    expect(mounted!.container.querySelector('.thread-intro')).not.toBeNull()
    expect(words()).not.toContain('mary-answer')
  })

  it('keeps a message queued for one persona in that persona’s chat, and never drains it into another’s session', async () => {
    // Mary's turn is in flight and John's seat is idle, both as main's snapshot says (the ids are those the fake bridge opens with).
    const maryId = `session-of-${mary.id}`
    const johnId = `session-of-${john.id}`
    conversationNow = () => ({
      entries: [],
      sessions: [
        { agentId: mary.id, sessionId: maryId },
        { agentId: john.id, sessionId: johnId }
      ],
      busy: [maryId],
      personas: [],
      runs: []
    })
    await mountOnMary()
    type(field(), 'for mary only')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()
    expect(thread().querySelector('.turn--queued')?.textContent).toContain('for mary only')

    act(() => tile('John').click())
    await settle()
    expect(words()).not.toContain('for mary only')
    expect(thread().querySelector('.turn--queued')).toBeNull()
    // John's session is idle, and Mary's queued message is not drained into it.
    push({ name: 'session:awaiting-turn', payload: { sessionId: johnId, at: 3 } })
    expect(sent).toEqual([])

    act(() => tile('Mary').click())
    await settle()
    expect(thread().querySelector('.turn--queued')?.textContent).toContain('for mary only')
    push({ name: 'session:awaiting-turn', payload: { sessionId: maryId, at: 4 } })
    expect(sent).toEqual([[maryId, 'for mary only']])
    expect(thread().querySelector('.turn--queued')).toBeNull()
  })

  it('draws a message sent to John in John’s chat alone', async () => {
    await mountOn('John')
    push({ name: 'session:opened', payload: { sessionId: 's-john', agentId: john.id, at: 1 } })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-john', at: 2 } })
    type(field(), 'hello john')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()
    expect(words()).toContain('hello john')
    expect(mounted!.container.querySelector('.thread-intro')).toBeNull()

    act(() => tile('Mary').click())
    await settle()
    expect(words()).not.toContain('hello john')
    expect(mounted!.container.querySelector('.thread-intro')).not.toBeNull()
  })
})

describe('App, turning to the next persona', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const maryWords: ContractEvent = {
    name: 'persona:said',
    payload: { sessionId: 'session-of-bmad-agent-analyst', agentId: mary.id, messageId: 'm1', text: 'Here is the draft', at: 2 }
  }
  const enter = (): void =>
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
  const say = async (text: string): Promise<void> => {
    type(field(), text)
    enter()
    await settle()
  }
  const thread = (): string[] =>
    [...mounted!.container.querySelectorAll('.thread > *')].map((node) => node.className)
  const announced = async (): Promise<string> => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    return mounted!.container.querySelector('.visually-hidden')?.textContent ?? ''
  }

  async function start(): Promise<void> {
    await mountOnMary()
  }

  it('turning to a tile writes nothing into the thread, and leaves focus on the tile that carries aria-current', async () => {
    await start()
    tile('Mary').focus()
    act(() => tile('Mary').click())
    await settle()
    push(maryWords)

    tile('John').focus()
    act(() => tile('John').click())
    await settle()

    expect(opened).toEqual([])
    // John's chat holds none of Mary's words (Story 8.1): it is his own, and empty.
    expect(thread()).toEqual(['thread-intro'])
    expect(mounted!.container.querySelector('.sysline')).toBeNull()
    // Focus stayed where the user put it, and aria-current followed.
    expect(document.activeElement).toBe(tile('John'))
    expect(tile('John').getAttribute('aria-current')).toBe('true')
    expect(tile('Mary').hasAttribute('aria-current')).toBe(false)
    expect(tile('John').tabIndex).toBe(0)
    expect(tile('Mary').tabIndex).toBe(-1)
    expect(field().getAttribute('aria-label')).toBe('Message John')
    expect(field().value).toBe('')
    // Turning back finds Mary's words where they were, and writes nothing there either.
    act(() => tile('Mary').click())
    await settle()
    expect(thread()).toEqual(['turn turn--persona'])
    expect(mounted!.container.querySelector('.sysline')).toBeNull()
  })

  it('announces nothing for a switch, and keeps the one live region', async () => {
    await start()
    act(() => tile('Mary').click())
    await settle()
    push(maryWords)
    act(() => tile('John').click())
    await settle()

    expect(await announced()).toBe('')
    expect(mounted!.container.querySelectorAll('.visually-hidden')).toHaveLength(1)
  })

  it('writes and announces nothing when the current tile is activated again, and asks nothing of main', async () => {
    await start()
    act(() => tile('Mary').click())
    await settle()
    push(maryWords)
    act(() => tile('Mary').click())
    await settle()

    expect(opened).toEqual([])
    expect(mounted!.container.querySelector('.sysline')).toBeNull()
    expect(await announced()).toBe('')
  })

  it('@<name> turns to the persona: the seat opens, no line is written, nothing of the token is echoed and focus lands in the new persona’s composer', async () => {
    await start()
    await say('@john')

    expect(opened).toEqual([john.id])
    expect(sent).toEqual([])
    expect(mounted!.container.querySelector('.turn--user')).toBeNull()
    expect(mounted!.container.textContent).not.toContain('@john')
    expect(mounted!.container.querySelector('.sysline')).toBeNull()
    expect(field().getAttribute('aria-label')).toBe('Message John')
    expect(document.activeElement).toBe(field())
    // The roving tab stop and aria-current follow the new persona.
    expect(tile('John').getAttribute('aria-current')).toBe('true')
    expect(tile('John').tabIndex).toBe(0)
    expect(tile('Mary').hasAttribute('aria-current')).toBe(false)
    expect(tile('Mary').tabIndex).toBe(-1)
    expect(await announced()).toBe('')
  })

  it('@<name> with text sends the stripped text and the typed token to the new persona, and the turn reads the chip then the text', async () => {
    await start()
    await say('@John write the brief')

    expect(opened).toEqual([john.id])
    // The text without the name is what is sent; the token as typed (case kept) rides beside it (AD-25).
    expect(sent).toEqual([[`session-of-${john.id}`, 'write the brief', '@John']])
    expect(thread()).toEqual(['turn turn--user'])
    const turn = mounted!.container.querySelector('.turn--user')!
    expect(turn.querySelector('.turn-mention')?.textContent).toBe('@John')
    expect(turn.querySelector('.turn-words')?.textContent).toBe('write the brief')
    expect(turn.querySelector('.turn-mention')?.nextElementSibling).toBe(turn.querySelector('.turn-words'))
    expect(document.activeElement).toBe(field())
  })

  it.each([
    ['an unresolved name', '@zed write the brief'],
    ['a name that is the current persona', '@mary write the brief'],
    ['an @ in the middle', 'hi @john'],
    ['an agent id', '@bmad-agent-pm hello']
  ])('sends %s to the current persona unchanged, with no refusal and no hint', async (_why, text) => {
    await start()
    await say(text)

    // The first message opens Mary's seat (turning to her tile did not); the text asks for no other.
    expect(opened).toEqual([mary.id])
    expect(sent).toEqual([[`session-of-${mary.id}`, text]])
    expect(mounted!.container.querySelector('.sysline')).toBeNull()
    expect(mounted!.container.querySelector('.turn--user')?.textContent).toContain(text)
    // Not a handoff: a plain turn, with no mention argument and no chip.
    expect(sent[0]).toHaveLength(2)
    expect(mounted!.container.querySelector('.turn-mention')).toBeNull()
    expect(tile('Mary').getAttribute('aria-current')).toBe('true')
    expect(mounted!.container.textContent).not.toMatch(/no such|unknown|did you mean|try @/i)
  })

  it('leaves the composer hint as it was', async () => {
    await start()

    expect(mounted!.container.querySelector('.composer-hint')?.textContent).toBe('enter sends·shift+enter adds a line')
  })

  it('does not hand focus to the composer for a tile chosen after an @name', async () => {
    await start()
    await say('@john')
    expect(document.activeElement).toBe(field())

    tile('Mary').focus()
    act(() => tile('Mary').click())
    await settle()

    expect(document.activeElement).toBe(tile('Mary'))
    expect(field().getAttribute('aria-label')).toBe('Message Mary')
  })
})

describe('App, when a persona stops to ask', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const QUESTION = 'Which one?\n\nA. Postgres\nB. SQLite (I lean here)'
  const options = (): HTMLButtonElement[] => [
    ...mounted!.container.querySelectorAll<HTMLButtonElement>('button.decision-option')
  ]

  /** Mary's session is open and idle after she asked. */
  async function asked(): Promise<void> {
    await mountOnMary()
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({
      name: 'persona:said',
      payload: { sessionId: 's-mary', agentId: mary.id, messageId: 'm1', text: QUESTION, at: 2 }
    })
  }

  it('shows no block while her turn is in flight, and the block once she awaits the user', async () => {
    await asked()
    expect(options()).toHaveLength(0)

    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 3 } })

    expect(mounted!.container.querySelector('.turn--persona .turn-body .decision')).not.toBeNull()
    expect(options().map((button) => button.textContent)).toEqual(['APostgres', 'BSQLite (I lean here)'])
  })

  it('sends the option as typed, removes the block in the same render, and puts focus in her composer', async () => {
    await asked()
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 3 } })
    const sqlite = options()[1]
    sqlite.focus()

    act(() => sqlite.click())

    expect(sent).toEqual([['s-mary', 'SQLite (I lean here)']])
    expect(mounted!.container.querySelector('.decision')).toBeNull()
    const user = mounted!.container.querySelector('.turn--user') as HTMLElement
    expect(user.textContent).toContain('SQLite (I lean here)')
    expect(user.className).not.toContain('queued')
    expect(document.activeElement).toBe(field())
    // Nothing is left of the block but the persona's own words and the answer.
    expect(mounted!.container.querySelectorAll('.turn')).toHaveLength(2)
    expect(mounted!.container.querySelector('.turn--persona')?.textContent).toContain('A. Postgres')
  })

  it('is gone the same way when the user types an answer instead', async () => {
    await asked()
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 3 } })
    expect(options()).toHaveLength(2)

    type(field(), 'Neither')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()

    expect(mounted!.container.querySelector('.decision')).toBeNull()
    expect(sent).toEqual([['s-mary', 'Neither']])
  })

  it('puts focus back in her composer on every answer, not only the first', async () => {
    await asked()
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 3 } })
    act(() => options()[0].click())
    push({
      name: 'persona:said',
      payload: { sessionId: 's-mary', agentId: mary.id, messageId: 'm2', text: QUESTION, at: Date.now() + 60_000 }
    })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 6 } })
    const again = options()[1]
    again.focus()
    expect(document.activeElement).toBe(again)

    act(() => again.click())

    expect(sent[sent.length - 1]).toEqual(['s-mary', 'SQLite (I lean here)'])
    expect(document.activeElement).toBe(field())
  })

  it('is gone while her next turn runs, and does not come back with nothing new said', async () => {
    await asked()
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 3 } })
    act(() => options()[0].click())
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 4 } })

    expect(mounted!.container.querySelector('.decision')).toBeNull()
  })

  it('is absent when the session is gone, as after a relaunch', async () => {
    await asked()
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 3 } })
    expect(options()).toHaveLength(2)

    push({ name: 'session:closed', payload: { sessionId: 's-mary', reason: 'process-exited', at: 4 } })

    expect(mounted!.container.querySelector('.decision')).toBeNull()
  })

  it('answers the persona who asked from her own chat, and lands focus in her composer', async () => {
    await asked()
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 3 } })
    act(() => tile('John').click())
    await settle()
    expect(field().getAttribute('aria-label')).toBe('Message John')
    // Her question is in her own chat (Story 8.1): John's draws no options, and turning to Mary finds them.
    expect(options()).toHaveLength(0)
    act(() => tile('Mary').click())
    await settle()
    expect(options()).toHaveLength(2)

    act(() => options()[0].click())
    await settle()

    // Her seat was live from session:opened, and turning to her tile opened nothing more.
    expect(sent).toEqual([['s-mary', 'Postgres']])
    expect(opened).toEqual([])
    expect(field().getAttribute('aria-label')).toBe('Message Mary')
    expect(tile('Mary').getAttribute('aria-current')).toBe('true')
    expect(document.activeElement).toBe(field())
  })

  it('adds no live region and no announcement for the block', async () => {
    await asked()
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 3 } })

    expect(mounted!.container.querySelectorAll('.visually-hidden')).toHaveLength(1)
    expect(mounted!.container.querySelector('.decision [role="status"], .decision .visually-hidden')).toBeNull()
  })
})

describe('App, a session that outlives the install changing under it', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  let revision = 1
  const reinstall = (agents: AgentView[]): void => {
    revision += 1
    act(() => installListeners.forEach((listener) => listener({ ...snapshot, revision, agents })))
  }
  const headers = (): HTMLElement[] => [...mounted!.container.querySelectorAll<HTMLElement>('.orphan-head')]
  const closeButtons = (): HTMLButtonElement[] => [
    ...mounted!.container.querySelectorAll<HTMLButtonElement>('button.orphan-close')
  ]
  const tiles = (): string[] =>
    [...mounted!.container.querySelectorAll('button.persona-tile')].map((button) =>
      (button.getAttribute('aria-label') ?? '').split(',')[0]
    )

  /** Mary's session is live and has spoken; John has one too, idle, and John is the persona the window is turned to. */
  async function live(): Promise<void> {
    await mountOn('John')
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({ name: 'session:opened', payload: { sessionId: 's-john', agentId: john.id, at: 1 } })
    push({
      name: 'persona:said',
      payload: { sessionId: 's-mary', agentId: mary.id, messageId: 'm1', text: 'Hello from Mary', at: 2 }
    })
    push({
      name: 'persona:said',
      payload: { sessionId: 's-john', agentId: john.id, messageId: 'm2', text: 'Hello from John', at: 2 }
    })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-john', at: 3 } })
  }

  it('shows no orphan header while the roster names every live session', async () => {
    await live()

    expect(headers()).toHaveLength(0)
    expect(tiles()).toEqual(['Mary', 'John'])
  })

  it('changes the roster alone: the tile goes, the turns, the busy flag and the sessions stay, and a header appears', async () => {
    await live()
    const turnsBefore = mounted!.container.querySelector('.thread')?.textContent

    reinstall([john])

    expect(tiles()).toEqual(['John'])
    expect(mounted!.container.querySelector('.thread')?.textContent).toBe(turnsBefore)
    // John is the viewed persona: Mary's words are in her own chat, which is not drawn here (Story 8.1).
    expect(mounted!.container.querySelector('.turn--persona .turn-name, .turn--persona')?.textContent).toContain('John')
    expect(mounted!.container.querySelector('.thread')?.textContent).not.toContain('Hello from Mary')
    expect(closedSessions).toEqual([])
    const [header] = headers()
    expect(headers()).toHaveLength(1)
    expect(header.querySelector('.chat-head-name')?.textContent).toBe('Mary')
    expect(header.textContent).toContain('no longer in the install · session still open')
    expect(closeButtons()).toHaveLength(1)
    expect(closeButtons()[0].getAttribute('aria-label')).toBe('close session · Mary')
    expect(closeButtons()[0].textContent).toBe('close session')
    // Above the current persona's own header.
    const heads = [...mounted!.container.querySelectorAll('.chat-head')]
    expect(heads[0]).toBe(header)
    expect(heads).toHaveLength(2)
    // John, still rostered, still takes a message in his live session.
    type(field(), 'hi john')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    expect(sent).toEqual([['s-john', 'hi john']])
  })

  it('shows her header again as a rostered persona with the same session when the agent returns', async () => {
    await live()
    reinstall([john])
    expect(headers()).toHaveLength(1)

    reinstall([mary, john])

    expect(headers()).toHaveLength(0)
    expect(tiles()).toEqual(['Mary', 'John'])
    expect(closedSessions).toEqual([])
  })

  it('closes only that session on the button, keeps the transcript, and lands focus in the current persona’s composer', async () => {
    await live()
    reinstall([john])
    const button = closeButtons()[0]
    button.focus()
    expect(document.activeElement).toBe(button)

    act(() => button.click())
    await settle()
    expect(closedSessions).toEqual(['s-mary'])
    // The header goes with main's report, not with the click.
    push({ name: 'session:closed', payload: { sessionId: 's-mary', agentId: mary.id, reason: 'closed', at: 5 } })

    expect(headers()).toHaveLength(0)
    expect(mounted!.container.textContent).toContain('Hello from John')
    expect(document.activeElement).toBe(field())
    expect(field().getAttribute('aria-label')).toBe('Message John')
    expect(closedSessions).toEqual(['s-mary'])
    // Her thread is kept: it is in her own chat when the agent is back and she is turned to.
    reinstall([mary, john])
    act(() => tile('Mary').click())
    await settle()
    expect(mounted!.container.textContent).toContain('Hello from Mary')
    expect(mounted!.container.textContent).not.toContain('Hello from John')
  })

  it('stacks one header per orphan in session order, each closing only its own', async () => {
    await live()
    reinstall([agent('bmad-agent-dev', 'Amelia')])

    // In the order their sessions were opened: Mary's was the first.
    expect(headers().map((header) => header.querySelector('.chat-head-name')?.textContent)).toEqual(['Mary', 'John'])

    act(() => closeButtons()[1].click())
    await settle()
    expect(closedSessions).toEqual(['s-john'])
  })

  it('keeps a header, and its failure line off the orphan, when main refuses the close', async () => {
    await live()
    reinstall([john])
    ;(window.harness as unknown as { closeSession: (id: string) => Promise<void> }).closeSession = async () => {
      throw { code: 'session/not-found', message: 'session · no such session is open' }
    }

    act(() => closeButtons()[0].click())
    await settle()

    expect(headers()).toHaveLength(1)
    expect(mounted!.container.textContent).toContain('session · no such session is open')
  })

  it('shows no orphan header for a window that has no sessions, as after a relaunch', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    reinstall([john])

    expect(headers()).toHaveLength(0)
  })
})

describe('App, the current persona’s close control', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const closeButtons = (): HTMLButtonElement[] => [
    ...mounted!.container.querySelectorAll<HTMLButtonElement>('button.chat-close')
  ]

  async function mountAndOpenMary(): Promise<void> {
    await mountOnMary()
  }

  it('is not there while the current persona has no session, nor in the New session chat', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    // A window opens on the New session chat, whose header has no control (Story 7.5).
    expect(closeButtons()).toHaveLength(0)

    await mountAndOpenMary()
    // Turning to her tile opened her seat; once it is closed she has none, and the control goes with it.
    push({ name: 'session:closed', payload: { sessionId: 'session-of-bmad-agent-analyst', agentId: mary.id, reason: 'closed', at: 3 } })

    expect(field().getAttribute('aria-label')).toBe('Message Mary')
    expect(closeButtons()).toHaveLength(0)
  })

  it('is in the current persona’s header from session:opened, closes that session on the click, goes with session:closed, and lands focus in the composer', async () => {
    await mountAndOpenMary()
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    // The activation turn is in flight until it ends, and the one control reads Stop meanwhile.
    expect(closeButtons()[0].getAttribute('aria-label')).toBe('Stop · Mary')
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 2 } })

    expect(closeButtons()).toHaveLength(1)
    expect(closeButtons()[0].getAttribute('aria-label')).toBe('close session · Mary')
    expect(closeButtons()[0].closest('.chat-head')).not.toBeNull()
    expect(mounted!.container.querySelector('.orphan-head')).toBeNull()
    const button = closeButtons()[0]
    button.focus()
    expect(document.activeElement).toBe(button)

    act(() => button.click())
    await settle()
    expect(closedSessions).toEqual(['s-mary'])
    // The button goes with main's report, not with the click.
    expect(closeButtons()).toHaveLength(1)
    push({ name: 'session:closed', payload: { sessionId: 's-mary', agentId: mary.id, reason: 'closed', at: 5 } })

    expect(closeButtons()).toHaveLength(0)
    expect(document.activeElement).toBe(field())
    expect(field().getAttribute('aria-label')).toBe('Message Mary')
  })

  it('is drawn for the persona who is current and for no other, and follows the tile', async () => {
    await mountAndOpenMary()
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({ name: 'session:opened', payload: { sessionId: 's-john', agentId: john.id, at: 1 } })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 2 } })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-john', at: 2 } })
    expect(closeButtons().map((button) => button.getAttribute('aria-label'))).toEqual(['close session · Mary'])

    act(() => tile('John').click())
    await settle()

    expect(closeButtons().map((button) => button.getAttribute('aria-label'))).toEqual(['close session · John'])
    act(() => closeButtons()[0].click())
    await settle()
    // Activating the tile asked main for John's session, whose id the fake bridge answers; Mary's is untouched.
    expect(closedSessions).toHaveLength(1)
    expect(closedSessions).not.toContain('s-mary')
  })

  it('leaves each seat’s dot as it is: two live tiles both show the dot and the word, and ending one through the header leaves the other’s (Story 7.4)', async () => {
    await mountAndOpenMary()
    const stateOf = (name: string): Element => tile(name).querySelector('.tile-state') as Element
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({ name: 'session:opened', payload: { sessionId: 's-john', agentId: john.id, at: 1 } })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 2 } })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-john', at: 2 } })
    push({ name: 'persona:state', payload: { agentId: mary.id, state: 'live', at: 2 } })
    push({ name: 'persona:state', payload: { agentId: john.id, state: 'live', at: 2 } })

    for (const name of ['Mary', 'John']) {
      expect(stateOf(name).querySelector('.status-dot--live')).not.toBeNull()
      expect(stateOf(name).textContent).toBe('live')
      expect(stateOf(name).querySelector('.state-elapsed')).toBeNull()
    }
    // No count, no second live region, no announcement for either seat: the dot is the whole mark.
    expect(mounted!.container.querySelectorAll('.visually-hidden')).toHaveLength(1)

    act(() => closeButtons()[0].click())
    await settle()
    push({ name: 'session:closed', payload: { sessionId: 's-mary', agentId: mary.id, reason: 'closed', at: 5 } })
    push({ name: 'persona:state', payload: { agentId: mary.id, state: 'idle', at: 5 } })

    expect(closedSessions).toEqual(['s-mary'])
    expect(stateOf('Mary').querySelector('.status-dot--live')).toBeNull()
    expect(stateOf('John').querySelector('.status-dot--live')).not.toBeNull()
    expect(stateOf('John').textContent).toBe('live')
    expect(mounted!.container.querySelectorAll('.visually-hidden')).toHaveLength(1)
  })

  it('goes when the process exits on its own', async () => {
    await mountAndOpenMary()
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({ name: 'session:closed', payload: { sessionId: 's-mary', agentId: mary.id, reason: 'process-exited', at: 2 } })

    expect(closeButtons()).toHaveLength(0)
  })

  it('reads Stop while a turn is in flight and close session otherwise: the same element, focus kept, and Stop asks main to stop the turn of that session only (Story 3.19)', async () => {
    await mountAndOpenMary()
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 2 } })
    const button = closeButtons()[0]
    expect(button.textContent).toBe('close session')
    button.focus()

    // A send into the idle session begins a turn: the control reads Stop on the same element, still focused.
    type(field(), 'tell me more')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()
    expect(closeButtons()).toHaveLength(1)
    expect(closeButtons()[0]).toBe(button)
    expect(button.textContent).toBe('Stop')
    expect(button.getAttribute('aria-label')).toBe('Stop · Mary')
    expect(button.hasAttribute('disabled')).toBe(false)
    expect(button.hasAttribute('title')).toBe(false)
    button.focus()
    expect(document.activeElement).toBe(button)

    act(() => button.click())
    await settle()
    expect(turnStopped).toEqual(['s-mary'])
    expect(closedSessions).toEqual([])
    expect(stopped).toEqual([])
    // Nothing is drawn between the press and the turn's end: the label, the element and the focus stay.
    expect(closeButtons()[0]).toBe(button)
    expect(button.textContent).toBe('Stop')
    expect(document.activeElement).toBe(button)

    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 9 } })
    expect(closeButtons()[0]).toBe(button)
    expect(button.textContent).toBe('close session')
    expect(button.getAttribute('aria-label')).toBe('close session · Mary')
    expect(document.activeElement).toBe(button)
  })

  it('reads Stop for a run in flight, even before it has said a word (Story 3.19)', async () => {
    await mountAndOpenMary()
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 2 } })
    push({ name: 'run:started', payload: { runId: 'r1', sessionId: 's-mary', agentId: mary.id, code: 'CP', at: 3 } })

    expect(closeButtons()[0].textContent).toBe('Stop')
  })
})

describe('App, pressing a skill button (Story 3.1)', () => {
  let dispatched: [string, string][]
  const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const buttons = (): HTMLButtonElement[] => [...mounted!.container.querySelectorAll<HTMLButtonElement>('button.skill-button')]

  beforeEach(() => {
    dispatched = []
    const harness = window.harness as unknown as Record<string, unknown>
    harness.getInstall = async () => ({
      ...snapshot,
      menus: { [mary.id]: [{ code: 'CP', description: 'Create the PRD' }, { code: 'VP', description: 'Validate a PRD' }] }
    })
    harness.dispatchMenu = async (sessionId: string, code: string) => {
      dispatched.push([sessionId, code])
      return 'r1'
    }
  })

  it('draws the row disabled on an empty chat, enables it once the persona is live, sends the code alone, and draws the run’s card as it writes', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    // The New session chat: no persona, no row.
    expect(buttons()).toEqual([])

    act(() => tile('Mary').click())
    await settle()
    // An empty chat with no session: the row is drawn and held, and pressing a button starts nothing (Story 8.2).
    expect(buttons().every((button) => button.disabled)).toBe(true)
    act(() => buttons()[0].click())
    await settle()
    expect(dispatched).toEqual([])
    expect(opened).toEqual([])

    push({ name: 'session:opened', payload: { sessionId: `session-of-${mary.id}`, agentId: mary.id, at: 1 } })
    push({ name: 'session:awaiting-turn', payload: { sessionId: `session-of-${mary.id}`, at: 2 } })
    const row = mounted.container.querySelector('.skill-row')
    expect(row?.querySelector('.skill-row-label')?.textContent).toBe('Mary can')
    expect(buttons().map((button) => button.textContent)).toEqual(['CPCreate the PRD', 'VPValidate a PRD'])
    expect(row?.closest('.composer')).not.toBeNull()

    act(() => buttons()[0].click())
    await settle()
    expect(dispatched).toEqual([[`session-of-${mary.id}`, 'CP']])
    expect(sent).toEqual([])
    // Held while the turn is in flight; the composer is not.
    expect(buttons().every((button) => button.disabled)).toBe(true)
    expect(field().disabled).toBe(false)

    const R = { runId: 'r1', sessionId: `session-of-${mary.id}` }
    push({ name: 'run:started', payload: { ...R, agentId: mary.id, code: 'CP', at: Date.now() } })
    const card = mounted.container.querySelector('.run-card')
    expect(card?.getAttribute('aria-busy')).toBe('true')
    // A run that writes no document: the head reads `run` and `working`, and the body opens with the run's own start row.
    expect(card?.querySelector('.run-card-path')?.textContent).toBe('run')
    expect(card?.querySelector('.run-card-status')?.textContent).toBe('working')
    expect(card?.querySelector('.run-card-foot')).toBeNull()
    expect(card?.querySelector('.run-note-reason')?.textContent).toBe('run started')
    // No user turn was recorded for the dispatch.
    expect(mounted.container.querySelector('.turn--user')).toBeNull()

    push({ name: 'run:note', payload: { ...R, text: '- (decision) Fast path', at: Date.now() } })
    expect(card?.querySelectorAll('.run-note')).toHaveLength(2)

    push({ name: 'doc:prose', payload: { ...R, callId: 'c1', path: '_bmad/prd.md', text: '## Vision\n', at: Date.now() } })
    push({ name: 'doc:prose', payload: { ...R, callId: 'c1', path: '_bmad/prd.md', text: 'words', at: Date.now() } })
    await act(frame)
    expect(card?.querySelector('.run-card-text')?.textContent).toBe('## Vision\nwords')
    expect(card?.querySelector('.run-card-path')?.textContent).toBe('_bmad/prd.md')
    expect(card?.querySelector('.caret')).not.toBeNull()

    push({ name: 'doc:committed', payload: { ...R, ok: true, callId: 'c1', path: '_bmad/prd.md', sections: ['Vision'], at: Date.now() } })
    push({ name: 'run:finished', payload: { ...R, at: Date.now() } })
    push({ name: 'session:awaiting-turn', payload: { sessionId: R.sessionId, at: Date.now() } })
    // The card moved from the pinned slot into the thread, so it is a new element.
    const saved = mounted.container.querySelector('.run-card')
    expect(mounted.container.querySelectorAll('.run-card')).toHaveLength(1)
    expect(saved?.closest('.thread')).not.toBeNull()
    expect(saved?.querySelector('.run-card-status')?.textContent).toBe('saved · just now · 1 section')
    // The remount kept the document: path and text come from the prose store, not from the old element.
    expect(saved?.querySelector('.run-card-path')?.textContent).toBe('_bmad/prd.md')
    expect(saved?.querySelector('.run-card-text')?.textContent).toBe('## Vision\nwords')
    expect(saved?.querySelector('.caret')).toBeNull()
    expect(saved?.hasAttribute('aria-busy')).toBe(false)
    expect(buttons().every((button) => !button.disabled)).toBe(true)
  })
})

describe('App, the whole menu and only the menu (Story 3.2)', () => {
  let dispatched: [string, string][]
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const buttons = (): HTMLButtonElement[] => [...mounted!.container.querySelectorAll<HTMLButtonElement>('button.skill-button')]
  const toggle = (): HTMLButtonElement | null => mounted!.container.querySelector<HTMLButtonElement>('button.skill-more')
  const ten = Array.from({ length: 10 }, (_, at) => ({ code: `C${at}`, description: `Entry ${at}` }))
  const sessionOf = (id: string): string => `session-of-${id}`

  function install(extra: Partial<InstallSnapshot> = {}): void {
    const harness = window.harness as unknown as Record<string, unknown>
    harness.getInstall = async () => ({
      ...snapshot,
      menus: { [mary.id]: ten, [john.id]: [{ code: 'CP', description: 'Create the PRD' }] },
      ...extra
    })
    harness.dispatchMenu = async (sessionId: string, code: string) => {
      dispatched.push([sessionId, code])
      return 'r1'
    }
  }

  async function openMary(): Promise<void> {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    act(() => tile('Mary').click())
    await settle()
  }

  beforeEach(() => {
    dispatched = []
    install()
  })

  it('shows five of ten and `+5 more`; expanding adds nothing to the transcript and calls no bridge command', async () => {
    await openMary()
    expect(buttons()).toHaveLength(5)
    expect(toggle()?.textContent).toBe('+5 more')
    const before = mounted!.container.querySelectorAll('.turn').length

    act(() => toggle()?.click())
    expect(buttons()).toHaveLength(10)
    expect(toggle()?.textContent).toBe('fewer')
    expect(mounted!.container.querySelectorAll('.turn')).toHaveLength(before)
    expect(mounted!.container.querySelector('.run-card')).toBeNull()
    expect(dispatched).toEqual([])
    expect(sent).toEqual([])

    act(() => toggle()?.click())
    expect(buttons()).toHaveLength(5)
    expect(toggle()?.textContent).toBe('+5 more')
  })

  it('rebuilds the row collapsed for a persona that is switched back to, and shows no toggle for one entry', async () => {
    await openMary()
    act(() => toggle()?.click())
    expect(buttons()).toHaveLength(10)

    act(() => tile('John').click())
    await settle()
    expect(buttons().map((button) => button.textContent)).toEqual(['CPCreate the PRD'])
    expect(toggle()).toBeNull()

    act(() => tile('Mary').click())
    await settle()
    expect(buttons()).toHaveLength(5)
    expect(toggle()?.getAttribute('aria-expanded')).toBe('false')
  })

  it('holds every skill button for a turn in flight and not the toggle or the composer, and not for a live persona', async () => {
    await openMary()
    const session = sessionOf(mary.id)
    push({ name: 'session:opened', payload: { sessionId: session, agentId: mary.id, at: 0 } })
    push({ name: 'session:awaiting-turn', payload: { sessionId: session, at: 1 } })
    push({ name: 'persona:state', payload: { agentId: mary.id, state: 'live', at: 2 } })
    expect(buttons().every((button) => !button.disabled)).toBe(true)

    act(() => buttons()[0].click())
    await settle()
    expect(buttons().every((button) => button.disabled)).toBe(true)
    expect(toggle()?.disabled).toBe(false)
    expect(field().disabled).toBe(false)

    act(() => toggle()?.click())
    expect(buttons()).toHaveLength(10)
    expect(buttons().every((button) => button.disabled)).toBe(true)
    expect(toggle()?.disabled).toBe(false)
    expect(field().disabled).toBe(false)
  })

  it('draws a malformed entry as one harness error line naming its code and what is missing, with no button and no persona turn', async () => {
    install({
      errors: [
        {
          code: 'menu/entry-malformed',
          message: 'menu · Mary · entry ZZ has neither skill nor prompt'
        }
      ]
    })
    await openMary()
    const lines = [...mounted!.container.querySelectorAll('.error-line')]
    expect(lines).toHaveLength(1)
    expect(lines[0].querySelector('.error-line-message')?.textContent).toBe('menu · Mary · entry ZZ has neither skill nor prompt')
    expect(buttons().map((button) => button.querySelector('.skill-code')?.textContent)).not.toContain('ZZ')
    expect(mounted!.container.querySelector('.turn')).toBeNull()
  })

  it('gives a skill no title and no word for what it is, expanded or not', async () => {
    await openMary()
    act(() => toggle()?.click())
    const row = mounted!.container.querySelector('.skill-row') as HTMLElement
    expect(row.querySelector('[title]')).toBeNull()
    expect(row.textContent).not.toMatch(/skill|prompt|action/i)
  })
})

describe('App, the running card stays in view (Story 3.14)', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const root = (): HTMLElement => mounted!.container
  const cards = (): HTMLElement[] => [...root().querySelectorAll<HTMLElement>('.run-card')]
  const slot = (): HTMLElement | null => root().querySelector<HTMLElement>('.chat > .pinned')
  const inThread = (): HTMLElement[] => cards().filter((card) => card.closest('.thread') !== null)
  const lines = (): HTMLElement[] => [...root().querySelectorAll<HTMLElement>('.run-card-line')]
  const started = (runId: string, sessionId: string, agent: AgentView, at: number): void =>
    push({ name: 'run:started', payload: { runId, sessionId, agentId: agent.id, code: 'CP', at } })
  const finished = (runId: string, sessionId: string, at: number): void =>
    push({ name: 'run:finished', payload: { runId, sessionId, at } })
  const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))
  const prose = (runId: string, sessionId: string, path: string, text: string, at: number): void =>
    push({ name: 'doc:prose', payload: { runId, sessionId, callId: `c-${runId}`, path, text, at } })
  const said = (agent: AgentView, messageId: string, text: string, at: number): void =>
    push({ name: 'persona:said', payload: { sessionId: `s-${agent.name}`, agentId: agent.id, messageId, text, at } })

  async function open(): Promise<void> {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    // The window opens on the New session chat (Story 7.5): the run is Mary's to be viewed, so it turns to her tile first.
    act(() => tile('Mary').click())
    await settle()
    push({ name: 'session:opened', payload: { sessionId: 's-Mary', agentId: mary.id, at: 1 } })
    push({ name: 'session:opened', payload: { sessionId: 's-John', agentId: john.id, at: 1 } })
  }

  it('draws a viewed run’s card in the slot that is the chat column’s first child, and not in the thread', async () => {
    await open()
    started('r1', 's-Mary', mary, 20)

    expect(cards()).toHaveLength(1)
    expect(slot()).not.toBeNull()
    expect(slot()?.querySelector('.run-card')).toBe(cards()[0])
    expect(inThread()).toHaveLength(0)
    expect(root().querySelector('.chat')?.firstElementChild).toBe(slot())
  })

  it('draws no slot for a plain chat turn', async () => {
    await open()
    said(mary, 'm1', 'Hello', 10)

    expect(slot()).toBeNull()
    expect(cards()).toHaveLength(0)
  })

  it('moves the card into the thread at its time position on the terminal event, drawing exactly one card at each step', async () => {
    await open()
    said(mary, 'm1', 'before', 10)
    started('r1', 's-Mary', mary, 20)
    said(mary, 'm2', 'during', 30)
    prose('r1', 's-Mary', '_bmad/prd.md', '## Vision\nwords', 35)
    await act(frame)
    expect(cards()).toHaveLength(1)
    expect(slot()).not.toBeNull()
    expect(slot()?.querySelector('.run-card-text')?.textContent).toBe('## Vision\nwords')

    finished('r1', 's-Mary', 40)

    expect(slot()).toBeNull()
    expect(cards()).toHaveLength(1)
    // The same document, drawn by the remounted card at its place in the thread.
    expect(inThread()[0].querySelector('.run-card-path')?.textContent).toBe('_bmad/prd.md')
    expect(inThread()[0].querySelector('.run-card-text')?.textContent).toBe('## Vision\nwords')
    const order = [...root().querySelectorAll('.thread .turn, .thread .run-card')].map((node) =>
      node.classList.contains('run-card') ? 'card' : (node.textContent ?? '')
    )
    expect(order).toHaveLength(3)
    expect(order[0]).toContain('before')
    expect(order[1]).toBe('card')
    expect(order[2]).toContain('during')
  })

  it('does the same for a stopped and a failed run', async () => {
    await open()
    started('r1', 's-Mary', mary, 20)
    push({ name: 'run:stopped', payload: { runId: 'r1', sessionId: 's-Mary', at: 30 } })
    expect(slot()).toBeNull()
    expect(inThread()).toHaveLength(1)

    started('r2', 's-Mary', mary, 40)
    expect(slot()).not.toBeNull()
    expect(cards()).toHaveLength(2)
    push({
      name: 'run:failed',
      payload: { runId: 'r2', sessionId: 's-Mary', error: { code: 'run/failed', message: 'failed' }, at: 50 }
    })
    expect(slot()).toBeNull()
    expect(inThread()).toHaveLength(2)
  })

  it('holds the path, text, busy state and notes in the slot, and draws the card nowhere in another persona’s chat (Story 8.1)', async () => {
    await open()
    started('r1', 's-Mary', mary, 20)
    push({ name: 'run:note', payload: { runId: 'r1', sessionId: 's-Mary', text: '- (decision) Fast path', at: 25 } })
    prose('r1', 's-Mary', '_bmad/prd.md', '## Vision\nwords', 26)
    await act(frame)
    const pinned = slot()?.querySelector('.run-card')
    expect(pinned).not.toBeNull()
    const held = {
      path: pinned?.querySelector('.run-card-path')?.textContent,
      text: pinned?.querySelector('.run-card-text')?.textContent,
      busy: pinned?.getAttribute('aria-busy'),
      notes: pinned?.querySelectorAll('.run-note').length
    }
    expect(held).toEqual({ path: '_bmad/prd.md', text: '## Vision\nwords', busy: 'true', notes: 2 })

    // John viewed: Mary's card, still running, is in Mary's chat alone (Story 8.1): no slot, no card, no line.
    act(() => tile('John').click())
    await settle()
    expect(slot()).toBeNull()
    expect(cards()).toHaveLength(0)
    expect(lines()).toHaveLength(0)

    act(() => tile('Mary').click())
    await settle()
    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)
    expect(inThread()).toHaveLength(0)
    expect(slot()?.querySelector('.run-card-text')?.textContent).toBe('## Vision\nwords')
  })

  it('pins a card hydrated running for the viewed persona on reload, once, and not in the thread', async () => {
    const harness = window.harness as unknown as Record<string, unknown>
    harness.getConversation = async () => ({
      entries: [],
      sessions: [{ agentId: mary.id, sessionId: 's-Mary' }],
      busy: ['s-Mary'],
      personas: [],
      runs: [
        {
          runId: 'r9',
          sessionId: 's-Mary',
          agentId: mary.id,
          code: 'CP',
          startedAt: 40,
          status: 'running',
          notes: [],
          steps: [],
          documents: [{ path: '_bmad/prd.md', callId: 'c9', text: 'so far', written: 6, sections: [] }]
        }
      ]
    })
    await mountOnMary()
    await act(frame)

    expect(cards()).toHaveLength(1)
    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)
    expect(inThread()).toHaveLength(0)
    expect(root().querySelector('.chat')?.firstElementChild).toBe(slot())
  })

  it('draws no slot for another persona’s run, and moves the card with the switch, drawing it once either way', async () => {
    await open()
    started('r1', 's-John', john, 20)
    // Mary is viewed: John's run is in John's chat alone (Story 8.1), so no card and no line here.
    expect(slot()).toBeNull()
    expect(cards()).toHaveLength(0)
    expect(lines()).toHaveLength(0)

    act(() => tile('John').click())
    await settle()
    expect(slot()?.querySelector('.run-card')).not.toBeNull()
    expect(cards()).toHaveLength(1)
    expect(lines()).toHaveLength(0)
    expect(inThread()).toHaveLength(0)

    act(() => tile('Mary').click())
    await settle()
    expect(slot()).toBeNull()
    expect(cards()).toHaveLength(0)
    expect(lines()).toHaveLength(0)
  })

  it('pins the newest of two runs of the viewed persona and leaves the other in the thread', async () => {
    await open()
    started('r1', 's-Mary', mary, 20)
    expect(inThread()).toHaveLength(0)
    started('r2', 's-Mary-2', mary, 30)

    expect(cards()).toHaveLength(2)
    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)
    expect(inThread()).toHaveLength(1)

    // When the pinned one ends, the other is pinned.
    finished('r2', 's-Mary-2', 40)
    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)
    expect(inThread()).toHaveLength(1)
    expect(cards()).toHaveLength(2)
  })

  it('never pins a running card with no agent id', async () => {
    await open()
    push({ name: 'run:started', payload: { runId: 'r1', sessionId: 's-Mary', code: 'CP', at: 20 } })

    // Never a viewed persona's, so never pinned; and in no persona's thread, so drawn in none (Story 8.1).
    expect(slot()).toBeNull()
    expect(cards()).toHaveLength(0)
    expect(lines()).toHaveLength(0)
  })

  it('takes no focus when it pins or unpins, and is no live region', async () => {
    await open()
    const input = field()
    input.focus()
    started('r1', 's-Mary', mary, 20)
    expect(document.activeElement).toBe(field())
    // The slot carries a class and nothing else, and holds no tab stop or role: not a live region.
    expect(slot()?.getAttributeNames()).toEqual(['class'])
    expect(slot()?.querySelector('[tabindex], [role]')).toBeNull()

    finished('r1', 's-Mary', 30)
    expect(document.activeElement).toBe(field())
  })

  it('offers no jump-to-card control, badge or toast beside the slot', async () => {
    await open()
    started('r1', 's-Mary', mary, 20)
    const around = `${slot()?.outerHTML ?? ''}${slot()?.parentElement?.className ?? ''}`
    expect(around).not.toMatch(/jump|badge|toast/i)
    // The one button in the slot is the card's stop (Story 3.7).
    expect([...(slot()?.querySelectorAll('button') ?? [])].map((button) => button.className)).toEqual(['run-stop'])
  })
})

describe('App, the run you are not looking at (Story 3.5, drawn in its own chat only since Story 8.1)', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const root = (): HTMLElement => mounted!.container
  const cards = (): HTMLElement[] => [...root().querySelectorAll<HTMLElement>('.run-card')]
  const lines = (): HTMLElement[] => [...root().querySelectorAll<HTMLElement>('.run-card-line')]
  const slot = (): HTMLElement | null => root().querySelector<HTMLElement>('.chat > .pinned')
  const started = (runId: string, sessionId: string, agent: AgentView | undefined, at: number, agentId?: string): void =>
    push({ name: 'run:started', payload: { runId, sessionId, ...(agent === undefined && agentId === undefined ? {} : { agentId: agent?.id ?? agentId }), code: 'CP', at } })
  const note = (runId: string, sessionId: string, text: string, at: number): void =>
    push({ name: 'run:note', payload: { runId, sessionId, text, at } })
  const prose = (runId: string, sessionId: string, text: string, at: number): void =>
    push({ name: 'doc:prose', payload: { runId, sessionId, callId: `c-${runId}`, path: '_bmad/prd.md', text, at } })
  const ended = (name: 'run:finished' | 'run:stopped' | 'run:failed', runId: string, sessionId: string, at: number): void =>
    push(
      name === 'run:failed'
        ? { name, payload: { runId, sessionId, error: { code: 'run/failed', message: 'failed' }, at } }
        : { name, payload: { runId, sessionId, at } }
    )

  async function open(): Promise<void> {
    await mountOnMary()
    push({ name: 'session:opened', payload: { sessionId: 's-Mary', agentId: mary.id, at: 1 } })
    push({ name: 'session:opened', payload: { sessionId: 's-John', agentId: john.id, at: 1 } })
  }

  // Story 8.1: a persona's run card is in that persona's thread alone. Another persona's running card is
  // drawn in the viewed chat neither as a line nor as a card, nor in the slot; turning to its persona shows it.
  it('draws another persona’s run nowhere in the viewed chat: no line, no card, no slot and no stop', async () => {
    await open()
    started('r1', 's-John', john, Date.now() - 65_000)

    expect(lines()).toHaveLength(0)
    expect(cards()).toHaveLength(0)
    expect(slot()).toBeNull()
    expect(root().querySelectorAll('.run-stop')).toHaveLength(0)

    act(() => tile('John').click())
    await settle()
    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)
    expect(lines()).toHaveLength(0)
  })

  it('pins the card, full, when the persona is switched to, and moves no focus', async () => {
    await open()
    started('r1', 's-John', john, Date.now())
    const johnTile = tile('John')
    johnTile.focus()
    act(() => johnTile.click())
    await settle()

    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)
    expect(lines()).toHaveLength(0)
    expect(document.activeElement).toBe(johnTile)
    expect(slot()?.querySelector('.run-card')?.hasAttribute('tabindex')).toBe(false)
  })

  it('draws the card nowhere once the persona is switched away from, with focus left on the tile', async () => {
    await open()
    started('r1', 's-John', john, Date.now())
    started('r2', 's-John-2', john, Date.now())
    const maryTile = tile('Mary')
    act(() => tile('John').click())
    await settle()
    // The newest is pinned; the other is the viewed persona's too, and stays a full card in the thread.
    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)
    expect(lines()).toHaveLength(0)

    maryTile.focus()
    act(() => maryTile.click())
    await settle()
    expect(slot()).toBeNull()
    expect(lines()).toHaveLength(0)
    expect(cards()).toHaveLength(0)
    expect(document.activeElement).toBe(maryTile)
  })

  it('draws the terminal card in its own persona’s thread only, with no focus moved, however the run ends', async () => {
    for (const name of ['run:finished', 'run:stopped', 'run:failed'] as const) {
      await open()
      started('r1', 's-John', john, Date.now())
      prose('r1', 's-John', '## 1. Vision\n', Date.now())
      field().focus()

      ended(name, 'r1', 's-John', Date.now())
      // Mary is viewed: John's ended card is not in her chat.
      expect(lines()).toHaveLength(0)
      expect(cards()).toHaveLength(0)
      expect(document.activeElement).toBe(field())

      act(() => tile('John').click())
      await settle()
      expect(lines()).toHaveLength(0)
      expect(cards()).toHaveLength(1)
      expect(cards()[0].closest('.thread')).not.toBeNull()
      expect(cards()[0].hasAttribute('aria-busy')).toBe(false)
      expect(cards()[0].querySelector('.run-card-status')?.textContent).toMatch(name === 'run:finished' ? /^saved/ : name === 'run:stopped' ? /^stopped$/ : /^failed$/)
      mounted?.unmount()
      mounted = null
      listeners = []
    }
  })

  it('draws an orphan’s run and a run with no agent id in no persona’s chat', async () => {
    await open()
    started('r1', 's-ghost', undefined, Date.now(), 'bmad-agent-ghost')
    started('r2', 's-none', undefined, Date.now())
    note('r2', 's-none', '- (note) Nobody’s run', Date.now())

    expect(lines()).toHaveLength(0)
    expect(cards()).toHaveLength(0)
    // Never pinned, since an orphan is never the current persona.
    expect(slot()).toBeNull()
    act(() => tile('John').click())
    await settle()
    expect(lines()).toHaveLength(0)
    expect(cards()).toHaveLength(0)
  })

  it('keeps the run of a persona the roster lost out of the viewed chat, and the viewed persona’s own pinned', async () => {
    await open()
    push({
      name: 'persona:said',
      payload: { sessionId: 's-Mary', agentId: mary.id, messageId: 'm1', text: 'Hello from Mary', at: 2 }
    })
    started('r1', 's-Mary', mary, Date.now())
    // Mary is viewed: her card is the pinned one.
    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)

    // The window is turned to John, and the install loses her: her session and her run go on, and John is the viewed persona.
    act(() => tile('John').click())
    await settle()
    act(() => installListeners.forEach((listener) => listener({ ...snapshot, revision: 2, agents: [john] })))
    expect(slot()).toBeNull()
    expect(cards()).toHaveLength(0)
    expect(lines()).toHaveLength(0)
  })

  it('draws a run hydrated mid-flight in its own persona’s chat only: pinned when viewed, nowhere else', async () => {
    const harness = window.harness as unknown as Record<string, unknown>
    harness.getConversation = async () => ({
      entries: [],
      sessions: [{ agentId: john.id, sessionId: 's-John' }],
      busy: ['s-John'],
      personas: [],
      runs: [
        {
          runId: 'r9',
          sessionId: 's-John',
          agentId: john.id,
          code: 'CP',
          startedAt: Date.now() - 5_000,
          status: 'running',
          notes: [{ text: '- (decision) Hydrated reason', at: Date.now() - 4_000 }],
          steps: [],
          documents: []
        }
      ]
    })
    await mountOnMary()

    expect(lines()).toHaveLength(0)
    expect(cards()).toHaveLength(0)
    expect(slot()).toBeNull()

    act(() => tile('John').click())
    await settle()
    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)
    expect(lines()).toHaveLength(0)
  })
})

describe('App, stopping a run (Story 3.7)', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const root = (): HTMLElement => mounted!.container
  const slot = (): HTMLElement | null => root().querySelector<HTMLElement>('.chat > .pinned')
  const stops = (within: ParentNode = root()): HTMLButtonElement[] => [...within.querySelectorAll<HTMLButtonElement>('.run-stop')]
  const started = (runId: string, sessionId: string, agent: AgentView, at: number): void =>
    push({ name: 'run:started', payload: { runId, sessionId, agentId: agent.id, code: 'CP', at } })

  async function open(): Promise<void> {
    await mountOnMary()
    push({ name: 'session:opened', payload: { sessionId: 's-Mary', agentId: mary.id, at: 1 } })
    push({ name: 'session:opened', payload: { sessionId: 's-John', agentId: john.id, at: 1 } })
  }

  it('draws one `stop` in the pinned card’s head, and none for another persona’s run, which is reached by turning to that persona (Story 8.1)', async () => {
    await open()
    started('r1', 's-Mary', mary, Date.now())
    started('r2', 's-John', john, Date.now())

    const pinned = stops(slot()!)
    expect(pinned).toHaveLength(1)
    expect(pinned[0].textContent).toBe('stop')
    expect(pinned[0].closest('.run-card-head')).not.toBeNull()
    expect(pinned[0].type).toBe('button')
    expect(pinned[0].disabled).toBe(false)
    expect(root().querySelector('.run-card-line')).toBeNull()
    expect(stops()).toHaveLength(1)

    act(() => tile('John').click())
    await settle()
    expect(stops(slot()!)).toHaveLength(1)
    expect(stops()).toHaveLength(1)
  })

  it('names the card’s stop for its document once the card holds a path, and plain `stop` before', async () => {
    await open()
    started('r1', 's-Mary', mary, Date.now())
    expect(stops(slot()!)[0].getAttribute('aria-label')).toBeNull()

    push({
      name: 'doc:prose',
      payload: { runId: 'r1', sessionId: 's-Mary', callId: 'c1', path: '_bmad/prd.md', text: '## Vision\n', at: Date.now() }
    })
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    expect(stops(slot()!)[0].getAttribute('aria-label')).toBe('stop · _bmad/prd.md')
  })

  it('asks main to stop the run by its id from the control of the chat it is in, and changes nothing on the screen', async () => {
    await open()
    started('r1', 's-Mary', mary, Date.now())
    started('r2', 's-John', john, Date.now())
    const before = root().innerHTML

    await act(async () => stops(slot()!)[0].click())
    expect(stopped).toEqual(['r1'])
    // Nothing between the press and the run's own terminal event: no state, no line, no card change.
    expect(root().innerHTML).toBe(before)

    act(() => tile('John').click())
    await settle()
    const johns = root().innerHTML
    await act(async () => stops(slot()!)[0].click())

    expect(stopped).toEqual(['r1', 'r2'])
    expect(root().innerHTML).toBe(johns)
    expect(sent).toEqual([])
  })

  it('takes no focus when drawn, and leaves it where it was when the run ends and the control goes', async () => {
    await open()
    const input = field()
    input.focus()
    started('r1', 's-Mary', mary, Date.now())
    expect(document.activeElement).toBe(field())

    push({ name: 'run:stopped', payload: { runId: 'r1', sessionId: 's-Mary', at: Date.now() } })
    expect(document.activeElement).toBe(field())
    expect(stops()).toHaveLength(0)
  })

  it('removes the control with the run’s terminal event, whichever it is, and draws none on an ended card', async () => {
    await open()
    started('r1', 's-Mary', mary, Date.now())
    started('r2', 's-John', john, Date.now())
    started('r3', 's-Mary', mary, Date.now() + 1)
    // Mary is viewed: her two running cards have one each, and John's run is in John's chat (Story 8.1).
    expect(stops()).toHaveLength(2)

    push({ name: 'run:stopped', payload: { runId: 'r2', sessionId: 's-John', at: Date.now() } })
    expect(stops()).toHaveLength(2)
    push({ name: 'run:failed', payload: { runId: 'r1', sessionId: 's-Mary', error: { code: 'run/failed', message: 'failed' }, at: Date.now() } })
    expect(stops()).toHaveLength(1)
    push({ name: 'run:finished', payload: { runId: 'r3', sessionId: 's-Mary', at: Date.now() } })
    expect(stops()).toHaveLength(0)
    expect(root().querySelectorAll('.run-card')).toHaveLength(2)
    act(() => tile('John').click())
    await settle()
    expect(root().querySelectorAll('.run-card')).toHaveLength(1)
    expect(stops()).toHaveLength(0)
  })

  it('says nothing when main says the run is not in flight, and shows any other refusal as the failure line', async () => {
    await open()
    started('r1', 's-Mary', mary, Date.now())

    stopReply = () => Promise.reject({ code: 'run/not-found', message: 'run · no such run is in flight' })
    await act(async () => stops(slot()!)[0].click())
    await settle()
    expect(root().querySelector('.error-line')).toBeNull()

    stopReply = () => Promise.reject({ code: 'bridge/unexpected', message: 'bridge · something went wrong' })
    await act(async () => stops(slot()!)[0].click())
    await settle()
    expect(root().querySelector('.error-line')?.textContent).toContain('something went wrong')
  })

  it('draws no stop for an orphan’s run in the viewed chat, leaves its header and close control in place, and offers the stop again when the agent returns', async () => {
    await open()
    push({
      name: 'persona:said',
      payload: { sessionId: 's-Mary', agentId: mary.id, messageId: 'm1', text: 'Hello from Mary', at: 2 }
    })
    started('r1', 's-Mary', mary, Date.now())
    // The window is turned to John, and the install loses Mary: her session and her run go on, and John is the viewed persona.
    act(() => tile('John').click())
    await settle()
    act(() => installListeners.forEach((listener) => listener({ ...snapshot, revision: 2, agents: [john] })))
    // Her run is in her thread alone (Story 8.1): no line, no card and no stop in John's chat.
    expect(root().querySelector('.run-card-line')).toBeNull()
    expect(stops()).toHaveLength(0)
    expect(stopped).toEqual([])
    // Her header and its close control stay, and nothing was closed.
    expect(root().querySelectorAll('.orphan-head')).toHaveLength(1)
    expect(root().querySelectorAll('button.orphan-close')).toHaveLength(1)
    expect(closedSessions).toEqual([])

    // The agent returns: the same session and card, and turning to her draws the stop, which stops the same run.
    act(() => installListeners.forEach((listener) => listener({ ...snapshot, revision: 3, agents: [mary, john] })))
    expect(root().querySelectorAll('.orphan-head')).toHaveLength(0)
    act(() => tile('Mary').click())
    await settle()
    expect(root().querySelectorAll('.run-card')).toHaveLength(1)
    expect(stops()).toHaveLength(1)
    await act(async () => stops(slot()!)[0].click())
    expect(stopped).toEqual(['r1'])
    expect(closedSessions).toEqual([])
  })

  it('draws a conversation read back after a relaunch dead: no stop, no ticking elapsed, whatever the card ended as', async () => {
    const harness = window.harness as unknown as Record<string, unknown>
    const dead = (runId: string, status: 'finished' | 'stopped' | 'failed', agent: AgentView) => ({
      runId,
      sessionId: `gone-${runId}`,
      agentId: agent.id,
      code: 'CP',
      startedAt: 1_000,
      status,
      endedAt: 66_000,
      ...(status === 'failed' ? { error: { code: 'run/session-ended', message: 'run · the session ended' } } : {}),
      notes: [],
      steps: [],
      documents: [{ path: '_bmad/prd.md', callId: 'c', text: 'kept', written: 4, sections: [] }]
    })
    harness.getConversation = async () => ({
      entries: [],
      sessions: [],
      busy: [],
      personas: [],
      runs: [dead('d1', 'failed', mary), dead('d2', 'stopped', john), dead('d3', 'finished', mary)]
    })
    await mountOnMary()

    // Mary is viewed: her two cards, and John's is in John's chat (Story 8.1).
    expect(root().querySelectorAll('.run-card')).toHaveLength(2)
    expect(stops()).toHaveLength(0)
    expect(root().querySelectorAll('.run-card-line')).toHaveLength(0)
    expect(root().querySelector('.chat > .pinned')).toBeNull()
    expect([...root().querySelectorAll('.run-card-elapsed')].map((element) => element.textContent)).toEqual(['1m 05s', '1m 05s'])

    act(() => tile('John').click())
    await settle()
    expect(root().querySelectorAll('.run-card')).toHaveLength(1)
    expect(stops()).toHaveLength(0)
  })
})

describe('App, told once when elsewhere (Story 3.10)', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const reveal = (runId: string): void => act(() => revealListeners.forEach((listener) => listener(runId)))
  const root = (): HTMLElement => mounted!.container
  // jsdom has no scrollIntoView: the stub records the element it was called on and with what.
  let scrolled: [Element, unknown[]][]
  beforeEach(() => {
    scrolled = []
    Element.prototype.scrollIntoView = function (this: Element, ...args: unknown[]) {
      scrolled.push([this, args])
    }
  })
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  /** Mary is current; her own run ran and ended, so its terminal card sits in her thread (another persona's is in hers alone, Story 8.1). */
  async function afterRun(runId = 'r1'): Promise<void> {
    await mountOnMary()
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({ name: 'run:started', payload: { runId, sessionId: 's-mary', agentId: mary.id, code: 'CP', at: 2 } })
    push({ name: 'run:finished', payload: { runId, sessionId: 's-mary', at: 3 } })
  }

  it('subscribes once to what main reveals, through the bridge', async () => {
    await afterRun()

    expect(revealListeners).toHaveLength(1)
  })

  it('scrolls the revealed run’s card into view once, to its start, and spends the request: a second activation scrolls again', async () => {
    await afterRun()
    const card = root().querySelector('.thread .run-card') as Element
    expect(card).not.toBeNull()
    expect(scrolled).toEqual([])

    reveal('r1')

    expect(scrolled).toEqual([[card, [{ block: 'start' }]]])

    reveal('r1')

    expect(scrolled).toHaveLength(2)
    expect(scrolled[1][0]).toBe(card)
  })

  it('leaves the current persona, the documents, the sessions and the composer as they were: nothing is sent', async () => {
    await afterRun()
    tile('Mary').focus()
    const before = { opened: [...opened], sent: [...sent], docs: [...docsOpened], dispatched: [...dispatchedMenus], closed: [...closedSessions] }

    reveal('r1')

    expect(tile('Mary').getAttribute('aria-current')).toBe('true')
    expect(tile('John').hasAttribute('aria-current')).toBe(false)
    expect(field().getAttribute('aria-label')).toBe('Message Mary')
    expect(document.activeElement).toBe(tile('Mary'))
    expect({ opened, sent, docs: docsOpened, dispatched: dispatchedMenus, closed: closedSessions }).toEqual(before)
    expect(stopped).toEqual([])
    expect(ended).toEqual([])
  })

  it('drops a reveal for a run the conversation does not hold, and holds nothing for later', async () => {
    await afterRun()

    reveal('r9')
    expect(scrolled).toEqual([])

    // The run arrives afterwards: the dropped request does not wake for it.
    push({ name: 'run:started', payload: { runId: 'r9', sessionId: 's-mary', agentId: mary.id, code: 'CP', at: 4 } })
    push({ name: 'run:finished', payload: { runId: 'r9', sessionId: 's-mary', at: 5 } })
    expect(root().querySelectorAll('.thread .run-card')).toHaveLength(2)
    expect(scrolled).toEqual([])
  })

  it('scrolls nothing for a run of another persona, which is in that persona’s thread alone (Story 8.1)', async () => {
    await afterRun()
    push({ name: 'session:opened', payload: { sessionId: 's-john', agentId: john.id, at: 1 } })
    push({ name: 'run:started', payload: { runId: 'r5', sessionId: 's-john', agentId: john.id, code: 'CP', at: 4 } })
    push({ name: 'run:finished', payload: { runId: 'r5', sessionId: 's-john', at: 5 } })
    expect(root().querySelectorAll('.thread .run-card')).toHaveLength(1)

    reveal('r5')

    expect(scrolled).toEqual([])
    expect(tile('Mary').getAttribute('aria-current')).toBe('true')
  })

  it('scrolls the named card and no other when several have ended', async () => {
    await afterRun('r1')
    push({ name: 'run:started', payload: { runId: 'r2', sessionId: 's-mary', agentId: mary.id, code: 'CP', at: 4 } })
    push({ name: 'run:finished', payload: { runId: 'r2', sessionId: 's-mary', at: 5 } })
    const cards = [...root().querySelectorAll('.thread .run-card')]
    expect(cards).toHaveLength(2)

    reveal('r2')

    expect(scrolled.map(([element]) => element)).toEqual([cards[1]])
  })
})

describe('the party view (Story 4.1)', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const click = (element: Element | null | undefined): void => act(() => (element as HTMLElement).click())
  const partyButton = (): Element | undefined =>
    [...mounted!.container.querySelectorAll('.topbar button')].find((button) => button.textContent === 'Party Mode')
  const party = (): Element => mounted!.container.querySelector('.view-party') as Element
  const openButton = (): HTMLButtonElement | null =>
    party().querySelector<HTMLButtonElement>('.cast-chooser-open')

  it('shows the chooser under Party Mode while a persona session in the 1:1 view keeps running', async () => {
    await mountOnMary()
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({
      name: 'persona:said',
      payload: { sessionId: 's-mary', agentId: mary.id, messageId: 'm1', text: 'Hello', at: 2 }
    })

    click(partyButton())

    expect(party().hasAttribute('hidden')).toBe(false)
    expect(mounted!.container.querySelector('.view-conversation')?.hasAttribute('hidden')).toBe(true)
    expect(party().querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
    expect(openButton()?.textContent).toBe('Open the room')
    // Both views stay mounted: the conversation is still there, and no session was closed by looking away.
    expect(mounted!.container.querySelectorAll('.view-conversation .turn')).toHaveLength(1)
    expect(closedSessions).toEqual([])
  })

  it('asks for the room of the ticked cast when *Open the room* is pressed, and draws the room’s sysline in the party thread and never in the 1:1 thread', async () => {
    await mountOnMary()
    click(partyButton())

    // Mary and John are two of the five core personas, so both start ticked.
    click(openButton())
    await settle()
    expect(roomCasts).toEqual([[mary.id, john.id]])

    push({ name: 'session:opened', payload: { sessionId: 'session-of-the-room', at: 1 } })
    push({
      name: 'harness:said',
      payload: {
        sessionId: 'session-of-the-room',
        id: 'm-0',
        text: 'room opened by you · present · Mary · John',
        at: 2,
        room: true
      }
    })

    expect(openButton()).toBeNull()
    expect([...party().querySelectorAll('.sysline')].map((line) => line.textContent)).toEqual([
      'room opened by you · present · Mary · John'
    ])
    // No one has spoken: the room's greeting turn is in flight, so its foot holds the state line alone.
    expect(party().querySelector('.turn:not(.turn--pending), .persona-tile')).toBeNull()
    expect(party().querySelectorAll('.turn--pending')).toHaveLength(1)
    expect(party().querySelector('.turn--pending .caret')).toBeNull()
    // The cast the user chose is in the strip, one card each, nobody lit while the room awaits.
    expect([...party().querySelectorAll('.cast-card .cast-name')].map((name) => name.textContent)).toEqual(['Mary', 'John'])
    expect(party().querySelector('.cast-card--speaking')).toBeNull()
    expect(mounted!.container.querySelector('.view-conversation')?.textContent).not.toContain('room opened by you')
    // The room has no tile, no state and no entry among the persona sessions.
    expect(mounted!.container.querySelectorAll('.persona-tile')).toHaveLength(2)
    expect(opened).toEqual([])
  })

  it('lights the speaker’s card while the room is mid-turn, draws party turns for the room only, and takes a message with no gate (Story 4.2)', async () => {
    await mountOnMary()
    click(partyButton())
    click(openButton())
    await settle()
    push({ name: 'session:opened', payload: { sessionId: 'session-of-the-room', at: 1 } })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 'session-of-the-room', at: 2 } })
    expect(party().querySelector('.cast-card--speaking')).toBeNull()

    push({
      name: 'persona:said',
      payload: { sessionId: 'session-of-the-room', agentId: john.id, messageId: 'm#1', text: 'No.', at: 3, room: true }
    })

    expect([...party().querySelectorAll('.cast-card--speaking .cast-name')].map((name) => name.textContent)).toEqual(['John'])
    expect(party().querySelectorAll('.cast-card')).toHaveLength(2)
    expect(party().querySelector('.cast-eq')).not.toBeNull()
    expect([...party().querySelectorAll('.turn-name')].map((name) => name.textContent)).toEqual(['John'])
    expect(party().querySelector('.turn--party-live')).not.toBeNull()
    // The 1:1 thread shows none of the room.
    expect(mounted!.container.querySelector('.view-conversation')?.textContent ?? '').not.toContain('No.')

    // No gate: the composer takes a message mid-turn, and it goes to the room.
    const field = party().querySelector('textarea') as HTMLTextAreaElement
    expect(field.disabled).toBe(false)
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(field, 'hold on')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()

    expect(sent).toEqual([['session-of-the-room', 'hold on']])
    expect([...party().querySelectorAll('.turn--user .turn-words')].map((words) => words.textContent)).toEqual(['hold on'])
    expect(party().querySelector('.turn--queued')).toBeNull()

    push({ name: 'session:awaiting-turn', payload: { sessionId: 'session-of-the-room', at: 4 } })
    expect(party().querySelector('.cast-card--speaking')).toBeNull()
    expect(party().querySelector('.cast-eq')).toBeNull()
    expect(party().querySelector('.turn--party-live')).toBeNull()
    expect(party().querySelectorAll('.cast-card')).toHaveLength(2)
  })

  it('takes a message main refused as busy back out of the thread, says so once in the room, and hands the words back to the composer (Story 4.8)', async () => {
    await mountOnMary()
    click(partyButton())
    click(openButton())
    await settle()
    push({ name: 'session:opened', payload: { sessionId: 'session-of-the-room', at: 1 } })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 'session-of-the-room', at: 2 } })
    push({
      name: 'persona:said',
      payload: { sessionId: 'session-of-the-room', agentId: john.id, messageId: 'm#1', text: 'No.', at: 3, room: true }
    })
    ;(window.harness as unknown as { sendTurn: (sessionId: string, text: string) => Promise<void> }).sendTurn = async (
      sessionId: string,
      text: string
    ) => {
      sent.push([sessionId, text])
      throw { code: 'session/busy', message: 'session · busy' }
    }

    const field = party().querySelector('textarea') as HTMLTextAreaElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(field, 'hold on')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()

    expect(sent).toEqual([['session-of-the-room', 'hold on']])
    expect((party().querySelector('textarea') as HTMLTextAreaElement).value).toBe('hold on')
    expect(party().querySelector('.turn--user')).toBeNull()
    expect([...party().querySelectorAll('.party-thread .sysline')].map((line) => line.textContent)).toContain(
      'not sent · the room is still speaking'
    )
  })

  it('wires the room’s topic, open time, turns and the rail’s rows into the header and the Room panel (Story 4.3)', async () => {
    const rows = [
      { path: '_bmad/planning-artifacts/prd.md', state: 'saved', savedAt: 1, owner: { agentId: john.id } },
      { path: '_bmad/party/earlier.md', state: 'saved', savedAt: 1, room: true }
    ]
    ;(window.harness as unknown as { getRail: () => Promise<unknown> }).getRail = async () => ({ revision: 2, folder: '_bmad/', rows })
    await mountOnMary()
    click(partyButton())
    click(openButton())
    // The event is the first of the two to reach the window, so its time is the room's open time.
    const openedAt = new Date(2026, 9, 8, 14, 31).getTime()
    push({ name: 'session:opened', payload: { sessionId: 'session-of-the-room', at: openedAt } })
    await settle()
    push({ name: 'session:awaiting-turn', payload: { sessionId: 'session-of-the-room', at: openedAt + 1 } })

    const head = (): string => party().querySelector('.party-head')?.textContent ?? ''
    const panel = (): string => party().querySelector('.party-side')?.textContent ?? ''
    expect(head()).toContain('no topic yet')
    expect(head()).toContain('turn 0 · ')
    expect(panel()).toContain('none yet')
    expect(panel()).toContain('14:31 by you')
    expect(panel()).toContain('_bmad/party/2026-10-08-<topic>.md')

    const field = party().querySelector('textarea') as HTMLTextAreaElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(field, '  Payouts —\nmore  ')
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()
    push({
      name: 'persona:said',
      payload: { sessionId: 'session-of-the-room', agentId: john.id, messageId: 'm#1', text: 'No.', at: openedAt + 2000, room: true }
    })

    expect(party().querySelector('.party-head-topic')?.textContent).toBe('Payouts —')
    expect(head()).toContain('turn 1 · ')
    expect(panel()).toContain('Payouts —')
    expect(panel()).toContain('_bmad/planning-artifacts/prd.md')
    expect(panel()).not.toContain('_bmad/party/earlier.md')
    expect(panel()).toContain('_bmad/party/2026-10-08-payouts.md')
  })

  it('asks the room’s session to write its summary when *Write summary to _bmad/* is pressed, and writes nothing itself (Story 4.4)', async () => {
    await mountOnMary()
    click(partyButton())
    click(openButton())
    const openedAt = new Date(2026, 9, 8, 14, 31).getTime()
    push({ name: 'session:opened', payload: { sessionId: 'session-of-the-room', at: openedAt } })
    await settle()
    push({ name: 'session:awaiting-turn', payload: { sessionId: 'session-of-the-room', at: openedAt + 1 } })

    const write = party().querySelector<HTMLButtonElement>('.party-write') as HTMLButtonElement
    expect(write.disabled).toBe(false)
    const destination = '_bmad/party/2026-10-08-<topic>.md'
    expect(party().querySelector('.party-side')?.textContent).toContain(destination)

    click(write)
    await settle()

    expect(sent).toHaveLength(1)
    expect(sent[0][0]).toBe('session-of-the-room')
    expect(sent[0][1]).toContain(`Write a summary of this conversation to ${destination}. Cover`)
    expect([...party().querySelectorAll('.turn--user .turn-words')].map((words) => words.textContent)).toEqual([sent[0][1]])
    // The ask is not the topic.
    expect(party().querySelector('.party-head-topic')?.textContent).toBe('no topic yet')
  })

  it('returns the chooser when the room closes, and leaves the old line where it fell', async () => {
    await mountOnMary()
    push({ name: 'session:opened', payload: { sessionId: 'r1', at: 1 } })
    expect(openButton()).toBeNull()

    push({ name: 'session:closed', payload: { sessionId: 'r1', reason: 'process-exited', at: 2 } })

    expect(openButton()).not.toBeNull()
  })

  it('stops the room with `stop room`: the session closes, the thread stays with the stop line above the chooser, and only *End session* clears it (Story 4.5)', async () => {
    await mountOnMary()
    click(partyButton())
    click(openButton())
    await settle()
    push({ name: 'session:opened', payload: { sessionId: 'session-of-the-room', at: 1 } })
    push({
      name: 'harness:said',
      payload: { sessionId: 'session-of-the-room', id: 'm-0', text: 'room opened by you · present · Mary · John', at: 2, room: true }
    })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 'session-of-the-room', at: 3 } })
    push({
      name: 'persona:said',
      payload: { sessionId: 'session-of-the-room', agentId: mary.id, messageId: 'm#1', text: 'Hello room', at: 4, room: true }
    })
    const stop = party().querySelector<HTMLButtonElement>('button.party-stop') as HTMLButtonElement
    expect(stop.textContent).toBe('stop room')
    const endButton = [...mounted!.container.querySelectorAll('.topbar button')].find((button) => button.textContent === 'End session') as HTMLButtonElement
    expect(endButton.disabled).toBe(false)

    click(stop)
    await settle()

    expect(closedSessions).toEqual(['session-of-the-room'])
    expect(ended).toEqual([])
    // Main says its line, then closes; the room is gone only on session:closed.
    push({
      name: 'harness:said',
      payload: { sessionId: 'session-of-the-room', id: 'm-1', text: 'room stopped · session released', at: 5, room: true }
    })
    push({ name: 'session:closed', payload: { sessionId: 'session-of-the-room', reason: 'closed', at: 6 } })

    expect(party().querySelector('.party-head, .cast-strip, .party-side, textarea')).toBeNull()
    expect(party().querySelector('button.party-stop')).toBeNull()
    expect(openButton()).not.toBeNull()
    expect(party().querySelector('.party-thread')?.textContent).toContain('Hello room')
    expect([...party().querySelectorAll('.sysline')].map((line) => line.textContent)).toEqual([
      'room opened by you · present · Mary · John',
      'room stopped · session released'
    ])
    expect(party().querySelector('.turn--party-live')).toBeNull()
    expect(endButton.disabled).toBe(false)

    click(endButton)
    await settle()

    expect(ended).toEqual(['/work/falcon'])
    expect(party().querySelector('.party-thread')).toBeNull()
    expect(openButton()).not.toBeNull()
  })

  it('shows the same stopped view when the room’s process exits on its own (Story 4.5)', async () => {
    await mountOnMary()
    push({ name: 'session:opened', payload: { sessionId: 'r1', at: 1 } })
    push({ name: 'harness:said', payload: { sessionId: 'r1', id: 'm-0', text: 'session ended · the process exited', at: 2, room: true } })
    push({ name: 'session:closed', payload: { sessionId: 'r1', reason: 'process-exited', at: 3 } })

    expect([...party().querySelectorAll('.party-thread .sysline')].map((line) => line.textContent)).toEqual([
      'session ended · the process exited'
    ])
    expect(openButton()).not.toBeNull()
  })

  it('shows a file the room wrote as owned by the room, apart from a persona’s', async () => {
    mounted = mount(createElement(App))
    await settle()
    const rows = [
      { path: '_bmad/party/note.md', state: 'saved', savedAt: Date.now(), room: true },
      { path: '_bmad/planning-artifacts/prd.md', state: 'saved', savedAt: Date.now(), owner: { agentId: john.id } }
    ]
    ;(window.harness as unknown as { getRail: () => Promise<unknown> }).getRail = async () => ({ revision: 2, folder: '_bmad/', rows })
    mounted.unmount()
    await mountOnMary()

    const owners = [...mounted.container.querySelectorAll('.output-row-owner')]
    expect(owners.map((owner) => [owner.textContent, owner.classList.contains('output-row-owner--room')])).toEqual([
      ['the room', true],
      ['John', false]
    ])
  })
})

describe('following the thread, in the window (Story 5.3)', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const click = (element: Element | null | undefined): void => act(() => (element as HTMLElement).click())
  const root = (): HTMLElement => mounted!.container
  const control = (view: string): HTMLButtonElement | null =>
    root().querySelector<HTMLButtonElement>(`${view} button.follow-latest`)
  const enter = (element: HTMLTextAreaElement): void =>
    act(() => void element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
  let fake: FakeScroll
  beforeEach(() => {
    fake = installFakeScroll({ client: 400, height: 1000, top: 0 })
    Element.prototype.scrollIntoView = function () {
      fake.metrics.top = 250
    }
  })
  afterEach(() => {
    fake.restore()
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  /** What a paused thread draws: one button, one literal string, between the thread and the composer, announcing nothing. */
  function auditPaused(view: string, scrollerClass: string): void {
    const button = control(view) as HTMLButtonElement
    const frame = button.closest('.follow') as HTMLElement
    const edge = button.parentElement as HTMLElement
    expect(button.textContent).toBe('↓ latest')
    expect(edge.children).toHaveLength(1)
    expect(edge.textContent).toBe('↓ latest')
    expect(button.attributes).toHaveLength(2)
    expect([...button.attributes].map((attribute) => attribute.name).sort()).toEqual(['class', 'type'])
    expect(frame.children).toHaveLength(2)
    expect(frame.children[0].classList.contains(scrollerClass)).toBe(true)
    expect(frame.children[1]).toBe(edge)
    // The scroller takes no tab stop, role or live region of its own, and the composer follows the frame.
    expect(frame.children[0].hasAttribute('tabindex')).toBe(false)
    expect(frame.children[0].hasAttribute('role')).toBe(false)
    expect(frame.querySelectorAll(LIVE_REGIONS)).toHaveLength(0)
    expect(frame.nextElementSibling?.classList.contains('composer')).toBe(true)
    // The window's one polite live region is still the only one.
    expect(root().querySelectorAll(LIVE_REGIONS)).toHaveLength(1)
  }

  /** The user scrolls a thread: the browser moved it, then said so. */
  function userScrolls(selector: string, top: number): void {
    fake.metrics.top = top
    act(() => void root().querySelector(selector)?.dispatchEvent(new Event('scroll')))
  }

  /** The window opens on the New session chat (Story 7.5), which has no thread to follow: turn to Mary's first. */
  async function opened(): Promise<void> {
    await mountOnMary()
  }

  it('opens at the bottom with no control, and puts the thread there after a send, a persona selected and the room opened', async () => {
    await opened()
    expect(fake.metrics.top).toBe(600)
    expect(control('.view-conversation')).toBeNull()

    userScrolls('.view-conversation .scroll', 100)
    expect(control('.view-conversation')?.textContent).toBe('↓ latest')
    auditPaused('.view-conversation', 'scroll')

    type(field(), 'hello mary')
    enter(field())
    await settle()
    expect(fake.metrics.top).toBe(600)
    expect(control('.view-conversation')).toBeNull()

    userScrolls('.view-conversation .scroll', 100)
    act(() => tile('John').click())
    await settle()
    expect(fake.metrics.top).toBe(600)
    expect(control('.view-conversation')).toBeNull()
  })

  it('pauses on a reveal, draws the control, and puts the user back at the bottom with focus in the composer only when they ask', async () => {
    await opened()
    // Mary is viewed, so the card is her own: another persona's is in its own chat alone (Story 8.1).
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({ name: 'run:started', payload: { runId: 'r1', sessionId: 's-mary', agentId: mary.id, code: 'CP', at: 2 } })
    push({ name: 'run:finished', payload: { runId: 'r1', sessionId: 's-mary', at: 3 } })
    expect(control('.view-conversation')).toBeNull()

    act(() => revealListeners.forEach((listener) => listener('r1')))

    expect(fake.metrics.top).toBe(250)
    expect(control('.view-conversation')).not.toBeNull()
    // The scroll the reveal made delivers its event; it resumes nothing.
    act(() => void root().querySelector('.view-conversation .scroll')?.dispatchEvent(new Event('scroll')))
    expect(control('.view-conversation')).not.toBeNull()
    // Anything arriving while paused moves nothing.
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 4 } })
    push({ name: 'persona:said', payload: { sessionId: 's-mary', agentId: mary.id, messageId: 'm1', text: 'More', at: 5 } })
    expect(fake.metrics.top).toBe(250)

    click(control('.view-conversation'))

    expect(fake.metrics.top).toBe(600)
    expect(control('.view-conversation')).toBeNull()
    expect(document.activeElement).toBe(field())
  })

  it('does the same in the room: paused by the user, back by a send or by the control', async () => {
    await opened()
    click([...root().querySelectorAll('.topbar button')].find((button) => button.textContent === 'Party Mode'))
    click(root().querySelector('.cast-chooser-open'))
    await settle()
    push({ name: 'session:opened', payload: { sessionId: 'session-of-the-room', at: 1 } })
    const party = (): HTMLElement => root().querySelector('.view-party') as HTMLElement
    const roomField = (): HTMLTextAreaElement => party().querySelector('textarea') as HTMLTextAreaElement
    expect(fake.metrics.top).toBe(600)

    userScrolls('.party-scroll', 100)
    expect(control('.view-party')?.textContent).toBe('↓ latest')
    auditPaused('.view-party', 'party-scroll')
    expect(control('.view-conversation')).toBeNull()

    type(roomField(), 'hold on')
    enter(roomField())
    await settle()
    expect(fake.metrics.top).toBe(600)
    expect(control('.view-party')).toBeNull()

    userScrolls('.party-scroll', 100)
    click(control('.view-party'))
    expect(fake.metrics.top).toBe(600)
    expect(document.activeElement).toBe(roomField())
  })
})

describe('App, the output folder (Story 5.4)', () => {
  const head = (): HTMLElement => mounted!.container.querySelectorAll<HTMLElement>('.rail-head')[1]
  const state = (): string | null => mounted!.container.querySelector('.outputs-state')?.textContent ?? null
  const live = (): string => mounted!.container.querySelector('.visually-hidden')?.textContent ?? ''
  const pushRail = (next: RailSnapshot): void => act(() => railListeners.forEach((listener) => listener(next)))
  /** The live region speaks when its clock says it is due: let it. */
  const spoken = async (): Promise<string> => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })
    return live()
  }
  const start = async (): Promise<void> => {
    await mountOnMary()
  }

  it('shows the folder and `change…` in the Outputs head, and no state line while there is none', async () => {
    await start()

    expect(head().querySelector('.outputs-where')?.textContent).toBe('_bmad/')
    expect(head().querySelector<HTMLButtonElement>('button.outputs-change')?.textContent).toBe('change…')
    expect(state()).toBeNull()
  })

  it('asks main for the chooser when `change…` is pressed, and for nothing else', async () => {
    await start()

    act(() => head().querySelector<HTMLButtonElement>('button.outputs-change')?.click())
    await settle()

    expect(chooseCalls).toBe(1)
    expect(docsOpened).toEqual([])
    expect(opened).toEqual([])
  })

  it('moves the head, the group heading and the state line in one render when a snapshot re-points the rail', async () => {
    railNow = {
      revision: 1,
      folder: '_bmad/',
      rows: [{ path: '_bmad/old.md', state: 'saved', savedAt: Date.now() }]
    }
    await start()
    expect([...mounted!.container.querySelectorAll('.folder-heading-path')].map((group) => group.textContent)).toContain('_bmad/')

    pushRail({
      revision: 2,
      folder: 'docs/out/',
      chosen: 'docs/out/',
      bmadFolder: '_bmad/',
      state: 'different',
      rows: [{ path: 'docs/out/prd.md', state: 'saved', savedAt: Date.now() }]
    })

    expect(head().querySelector('.outputs-where')?.textContent).toBe('docs/out/')
    expect(state()).toBe('bmad writes to · _bmad/')
    expect(mounted!.container.querySelector('.outputs')?.textContent).toContain('docs/out/')
    expect(mounted!.container.querySelector('.outputs')?.textContent).not.toContain('_bmad/old.md')
    expect(mounted!.container.querySelectorAll('.output-row')).toHaveLength(1)
  })

  it('names a missing choice on the line, and the empty state names the folder watched with its full path', async () => {
    await start()

    pushRail({ revision: 2, folder: '_bmad/', chosen: 'docs/out/', state: 'missing', rows: [] })

    expect(state()).toBe('docs/out/ · folder missing')
    expect(mounted!.container.querySelector('.outputs-empty-line')?.textContent).toBe('no files under _bmad/ yet')
    expect(mounted!.container.querySelector('.outputs-empty-path')?.textContent).toBe('/work/falcon/_bmad')

    pushRail({ revision: 3, folder: 'docs/out/', chosen: 'docs/out/', rows: [] })

    expect(state()).toBeNull()
    expect(mounted!.container.querySelector('.outputs-empty-line')?.textContent).toBe('no files under docs/out/ yet')
    expect(mounted!.container.querySelector('.outputs-empty-path')?.textContent).toBe('/work/falcon/docs/out')
  })

  it('says a refusal on the line and announces it once, politely, through the one live region', async () => {
    await start()

    pushRail({ revision: 2, folder: '_bmad/', rows: [], refusal: { reason: 'outside this project', seq: 1 } })

    expect(state()).toBe('not changed · outside this project')
    expect(await spoken()).toBe('not changed · outside this project')
    expect(mounted!.container.querySelectorAll('.visually-hidden')).toHaveLength(1)

    // The same snapshot again says nothing more; a new refusal is a new announcement, in its turn (the region speaks once every two seconds).
    pushRail({ revision: 3, folder: '_bmad/', rows: [], refusal: { reason: 'outside this project', seq: 1 } })
    pushRail({ revision: 4, folder: '_bmad/', rows: [], refusal: { reason: 'inside .git', seq: 2 } })
    expect(state()).toBe('not changed · inside .git')
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2300))
    })
    expect(live()).toBe('not changed · inside .git')
  }, 10_000)

  it('clears the line at the next choice, and announces nothing for it', async () => {
    await start()
    pushRail({ revision: 2, folder: '_bmad/', rows: [], refusal: { reason: 'the project folder itself', seq: 1 } })
    await spoken()

    pushRail({ revision: 3, folder: '_bmad/', rows: [] })

    expect(state()).toBeNull()
    expect(await spoken()).toBe('not changed · the project folder itself')
  })

  it('does not announce a refusal a window finds on connecting: it was said when it was made', async () => {
    railNow = { revision: 5, folder: '_bmad/', rows: [], refusal: { reason: 'inside node_modules', seq: 3 } }
    await start()

    expect(state()).toBe('not changed · inside node_modules')
    expect(await spoken()).toBe('')
  })

  it('writes the summary ask under the folder the rail says, and shows it in the header and the panel', async () => {
    railNow = { revision: 2, folder: 'docs/out/', chosen: 'docs/out/', rows: [] }
    await start()
    const partyView = (): HTMLElement => mounted!.container.querySelector('.view-party') as HTMLElement
    act(() => [...mounted!.container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Party Mode')?.click())
    act(() => partyView().querySelector<HTMLButtonElement>('button.cast-chooser-open')?.click())
    const openedAt = new Date(2026, 9, 8, 14, 31).getTime()
    act(() => listeners.forEach((listener) => listener({ name: 'session:opened', payload: { sessionId: 'session-of-the-room', at: openedAt } })))
    await settle()
    act(() => listeners.forEach((listener) => listener({ name: 'session:awaiting-turn', payload: { sessionId: 'session-of-the-room', at: openedAt + 1 } })))

    const write = partyView().querySelector<HTMLButtonElement>('.party-write') as HTMLButtonElement
    expect(write.textContent).toBe('Write summary to docs/out/')
    expect(partyView().querySelector('.party-side')?.textContent).toContain('docs/out/party/2026-10-08-<topic>.md')

    act(() => write.click())
    await settle()

    expect(sent).toHaveLength(1)
    expect(sent[0][1]).toContain('docs/out/party/2026-10-08-<topic>.md')
    expect(sent[0][1]).not.toContain('_bmad')
  })
})

describe('App, the layout (Story 5.5)', () => {
  const start = async (): Promise<void> => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
  }

  it('provides the stored layout to the sidebar, the rail and the Outputs list, and keeps a fold through the bridge', async () => {
    const setFolded: string[][] = []
    const setPanelWidth: [string, number | null][] = []
    railNow = {
      revision: 1,
      folder: '_bmad/',
      rows: [
        { path: '_bmad/epics.md', state: 'saved', savedAt: 1 },
        { path: '_bmad/ux/design.md', state: 'saved', savedAt: 1 }
      ]
    }
    Object.assign(window.harness, {
      getLayout: () => ({ sidebar: 300, rail: 400, room: null, folded: ['_bmad/'] }),
      setFolded: (dirs: string[]) => void setFolded.push([...dirs]),
      setPanelWidth: (panel: string, width: number | null) => void setPanelWidth.push([panel, width])
    })

    await start()

    const rail = mounted!.container.querySelector('.rail') as HTMLElement
    expect(rail.style.getPropertyValue('--rail')).toBe('400px')
    // The Team sidebar is a panel of its own, with its own stored width.
    const sidebar = mounted!.container.querySelector('.sidebar') as HTMLElement
    expect(sidebar.style.getPropertyValue('--sidebar')).toBe('300px')
    expect(sidebar.querySelector('.persona-tile')).not.toBeNull()
    expect(rail.querySelector('.persona-tile')).toBeNull()
    const headings = [...mounted!.container.querySelectorAll<HTMLButtonElement>('.folder-heading')]
    expect(headings.map((heading) => heading.textContent)).toEqual(['_bmad/', '_bmad/ux/'])
    expect(headings[0].getAttribute('aria-expanded')).toBe('false')
    expect(headings[1].getAttribute('aria-expanded')).toBe('true')
    expect([...mounted!.container.querySelectorAll('.output-row-name')].map((name) => name.textContent)).toEqual(['design.md'])

    act(() => headings[1].click())

    expect(setFolded).toEqual([['_bmad/', '_bmad/ux/']])
    expect(setPanelWidth).toEqual([])
  })
})

describe('App, the `/` list (Story 7.3)', () => {
  const SKILLS = [
    { name: 'bmad-agent-analyst', description: 'Business analyst' },
    { name: 'bmad-party-mode', description: 'Group discussions' }
  ]
  const enter = (): void =>
    act(() => void field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
  const rows = (): (string | null | undefined)[] =>
    [...mounted!.container.querySelectorAll('[role="option"]')].map((row) => row.querySelector('.skill-list-name')?.textContent)

  async function start(): Promise<void> {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    act(() => installListeners.forEach((listener) => listener({ ...snapshot, revision: 2, skills: SKILLS })))
    await settle()
  }

  it('lists the skills of the install snapshot above a persona’s composer when the text begins with a slash', async () => {
    await start()
    expect(mounted!.container.querySelector('[role="listbox"]')).toBeNull()

    type(field(), '/')

    expect(rows()).toEqual(['bmad-agent-analyst', 'bmad-party-mode'])
    type(field(), '/bmad-pa')
    expect(rows()).toEqual(['bmad-party-mode'])
  })

  it('follows a new snapshot’s skills with no reload', async () => {
    await start()
    type(field(), '/')
    act(() => installListeners.forEach((listener) => listener({ ...snapshot, revision: 3, skills: [SKILLS[1]] })))

    expect(rows()).toEqual(['bmad-party-mode'])
  })

  it('sends a chosen name with its text as typed, opens no session of its own, and leaves an `@name` handoff as it was', async () => {
    await start()
    act(() => tile('Mary').click())
    await settle()
    type(field(), '/bmad-pa')
    act(() => void field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })))

    expect(field().value).toBe('/bmad-party-mode ')
    expect(sent).toEqual([])
    expect(mounted!.container.querySelector('[role="listbox"]')).toBeNull()

    type(field(), '@John hello')
    enter()
    await settle()

    expect(mounted!.container.querySelector('[role="listbox"]')).toBeNull()
    // Choosing Mary's tile opened nothing; the `@John` handoff opened John's.
    expect(opened).toEqual([john.id])
    expect(sent).toEqual([['session-of-bmad-agent-pm', 'hello', '@John']])
  })
})

describe('App, the New session chat and a skill-first session (Story 7.5)', () => {
  const SKILLS = [
    { name: 'bmad-build', description: 'Build a thing' },
    { name: 'bmad-agent-pm', description: 'John' },
    { name: 'bmad-party-mode', description: 'The room' }
  ]
  const root = (): HTMLElement => mounted!.container
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const enter = (): void =>
    act(() => void field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
  const say = async (text: string): Promise<void> => {
    type(field(), text)
    enter()
    await settle()
  }
  const button = (label: string): HTMLButtonElement | undefined =>
    [...root().querySelectorAll<HTMLButtonElement>('button')].find((candidate) => candidate.textContent === label)
  const header = (): HTMLElement => root().querySelector('.chat-head') as HTMLElement
  const thread = (): HTMLElement => root().querySelector('.thread') as HTMLElement
  const seats = (): HTMLButtonElement[] =>
    [...root().querySelectorAll<HTMLButtonElement>('.team-group:last-child button.persona-tile')].filter((tileButton) =>
      tileButton.querySelector('.initials--skill') !== null
    )
  const said = (text: string, messageId = 'a1', sessionId = 'sk1', at = 20): void =>
    push({ name: 'persona:said', payload: { sessionId, messageId, text, at, skillSession: sessionId } })
  const live = (): string => root().querySelector(LIVE_REGIONS)?.textContent ?? ''
  const boardOf = (): HTMLElement => root().querySelector('.view-board') as HTMLElement
  const pressView = (label: string): void =>
    act(() => [...root().querySelectorAll<HTMLButtonElement>('.view-switch button')].find((candidate) => candidate.textContent === label)?.click())

  /** A window with the install's skills, on the New session chat as every window opens. */
  async function start(): Promise<void> {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    act(() => installListeners.forEach((listener) => listener({ ...snapshot, revision: 2, skills: SKILLS })))
    await settle()
  }
  /** `bmad-build` started from the chat: the session is up and its first turn is in flight. */
  async function building(text = '/bmad-build make a thing', sessionId = 'sk1'): Promise<void> {
    firstAnswer = () => ({ sessionId, skill: 'bmad-build' })
    await start()
    await say(text)
    push({ name: 'session:opened', payload: { sessionId, skill: 'bmad-build', at: Date.now() } })
  }

  describe('the New session chat', () => {
    it('is what a window opens on: the `/` disc and `New session` in the header, no pill, Stop or close, an empty thread', async () => {
      await start()

      expect(header().querySelector('h2')?.textContent).toBe('New session')
      const disc = header().querySelector('.initials--header.initials--skill')
      expect(disc?.textContent).toBe('/')
      expect(disc?.getAttribute('aria-hidden')).toBe('true')
      expect(header().querySelector('.state-line, button')).toBeNull()
      expect(thread().textContent).toBe('')
      expect(root().querySelector('.persona-tile[aria-current]')).toBeNull()
    })

    it('has a composer that is empty, focused, with no placeholder and the accessible name `message`', async () => {
      await start()

      expect(field().value).toBe('')
      expect(field().hasAttribute('placeholder')).toBe(false)
      expect(field().getAttribute('aria-label')).toBe('message')
      expect(document.activeElement).toBe(field())
      expect(field().disabled).toBe(false)
    })

    it('gives that composer the `/` list and no skill row, and lists nothing in the persona’s composer beside it', async () => {
      await start()
      type(field(), '/')

      expect([...root().querySelectorAll('[role="option"] .skill-list-name')].map((row) => row.textContent)).toEqual(
        SKILLS.map(({ name }) => name)
      )
      expect(root().querySelector('.skill-row')).toBeNull()
    })

    it('has the `Skill Session` button: a native button, pressed while the chat is in view, in the Team half before the tiles', async () => {
      await start()
      const pressed = button('Skill Session') as HTMLButtonElement

      expect(pressed.tagName).toBe('BUTTON')
      expect(pressed.getAttribute('aria-pressed')).toBe('true')
      expect(pressed.hasAttribute('disabled')).toBe(false)
      expect(pressed.querySelector('svg, img, .icon')).toBeNull()
      expect(pressed.getAttributeNames().sort()).toEqual(['aria-pressed', 'class', 'type'])
      expect(pressed.closest('.skill-session-row')?.parentElement?.closest('.sidebar')).not.toBeNull()
      const order = [...root().querySelectorAll('.sidebar button')]
      expect(order.indexOf(pressed)).toBeLessThan(order.indexOf(tile('Mary')))

      act(() => tile('Mary').click())
      await settle()
      expect(pressed.getAttribute('aria-pressed')).toBe('false')
      expect(header().querySelector('h2')?.textContent).toBe('Mary')
    })

    it('is kept, with its half-typed text and its lines, while a tile is chosen, and returned to by the button', async () => {
      await start()
      await say('hello there')
      type(field(), 'half of a mess')

      act(() => tile('John').click())
      await settle()
      expect(header().querySelector('h2')?.textContent).toBe('John')
      expect(thread().textContent).not.toContain('no skill named')

      act(() => button('Skill Session')?.click())
      await settle()

      expect(header().querySelector('h2')?.textContent).toBe('New session')
      expect(field().value).toBe('half of a mess')
      expect([...thread().querySelectorAll('.sysline')].map((line) => line.textContent)).toEqual(['no skill named hello'])
      expect(document.activeElement).toBe(field())
    })

    it('is left kept, too, for the Party view and the Board, and the button reads unpressed there', async () => {
      await start()
      type(field(), 'kept')
      pressView('Board')

      expect(button('Skill Session')?.getAttribute('aria-pressed')).toBe('false')
      pressView('1:1 Conversation')
      expect(button('Skill Session')?.getAttribute('aria-pressed')).toBe('true')
      expect(field().value).toBe('kept')
    })
  })

  describe('a first message that names no skill', () => {
    it.each([
      ['text with no slash', 'hello there', 'no skill named hello'],
      ['an @name', '@Mary hi', 'no skill named @Mary'],
      ['a name that is no skill', '/nope', 'no skill named nope']
    ])('refuses %s with one line, no user turn, no persona and the text kept', async (_why, text, line) => {
      await start()
      await say(text)

      expect(firsts).toEqual([text])
      expect([...thread().querySelectorAll('.sysline')].map((node) => node.textContent)).toEqual([line])
      expect(thread().querySelector('.turn')).toBeNull()
      expect(field().value).toBe(text)
      expect(opened).toEqual([])
      expect(sent).toEqual([])
      expect(root().querySelectorAll('.persona-tile[aria-current]')).toHaveLength(0)
    })

    it('announces the line once, politely, and sends nothing of a message that is only whitespace', async () => {
      await start()
      await say('   ')
      expect(firsts).toEqual([])

      await say('hello')
      await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 300))))
      expect(live()).toBe('no skill named hello')
      expect(root().querySelectorAll(LIVE_REGIONS)).toHaveLength(1)
    })

    it('shows main’s other refusal as the failure line, with the text kept and no line of the chat’s own', async () => {
      firstAnswer = () => {
        throw { code: 'session/spawn-failed', message: 'session · could not start the session' }
      }
      await start()
      await say('/bmad-build go')

      expect(root().querySelector('.error-line')?.textContent).toContain('could not start the session')
      expect(thread().querySelector('.sysline')).toBeNull()
      expect(field().value).toBe('/bmad-build go')
    })
  })

  describe('a first message that names a skill', () => {
    it('sends only the text as typed, starts the session and turns the chat to it: its header, its first turn, its seat', async () => {
      await building()

      expect(firsts).toEqual(['/bmad-build make a thing'])
      expect(header().querySelector('h2')?.textContent).toBe('bmad-build')
      expect(header().querySelector('.chat-head-name--skill')).not.toBeNull()
      expect(header().querySelector('.initials--header.initials--skill')?.textContent).toBe('/')
      expect([...thread().querySelectorAll('.turn--user .turn-words')].map((node) => node.textContent)).toEqual(['/bmad-build make a thing'])
      expect(button('Skill Session')?.getAttribute('aria-pressed')).toBe('false')
      expect(opened).toEqual([])
      expect(sent).toEqual([])
    })

    it('puts keyboard focus in the new session’s composer, as a turn to a seat does, and not on the page', async () => {
      await building()

      expect(document.activeElement).toBe(field())
      expect(field().getAttribute('aria-label')).toBe('Message bmad-build')
    })

    it('puts the seat in a `Skill sessions` group below every persona group, with the `/` disc and the name in mono', async () => {
      await building()

      const team = root().querySelector('.team-list') as HTMLElement
      const groups = [...team.querySelectorAll('.team-group')]
      expect(groups.at(-1)?.querySelector('.rail-group')?.textContent).toBe('Skill sessions')
      expect(groups.slice(0, -1).some((group) => group.querySelector('.initials--skill') !== null)).toBe(false)
      const [seat] = seats()
      expect(seat.querySelector('.initials--thread.initials--skill')?.textContent).toBe('/')
      expect(seat.querySelector('.tile-name--skill')?.textContent).toBe('bmad-build')
      expect(seat.getAttribute('aria-current')).toBe('true')
      expect(seat.querySelector('.tile-title')).toBeNull()
      expect(seat.querySelector('.menu-hint')).toBeNull()
      expect(seat.querySelector('button, input, [role]')).toBeNull()
    })

    it('reads working with the counter, then live, in the seat and the header; ended has no dot', async () => {
      await building()
      const state = (): string => seats()[0].querySelector('.tile-state')?.textContent ?? ''

      expect(state()).toMatch(/^working · /)
      expect(seats()[0].querySelector('.status-dot--work')).not.toBeNull()
      expect(header().querySelector('.state-line--work')).not.toBeNull()
      expect(header().querySelector('button.chat-close')?.textContent).toBe('Stop')

      push({ name: 'session:awaiting-turn', payload: { sessionId: 'sk1', at: Date.now() } })
      expect(state()).toBe('live')
      expect(seats()[0].querySelector('.status-dot--live')).not.toBeNull()
      expect(header().querySelector('button.chat-close')?.textContent).toBe('close session')

      push({ name: 'session:closed', payload: { sessionId: 'sk1', skill: 'bmad-build', reason: 'process-exited', at: Date.now() } })
      expect(state()).toBe('ended')
      expect(seats()[0].querySelector('.status-dot')).toBeNull()
      expect(header().querySelector('.status-dot')).toBeNull()
      expect(header().querySelector('button.chat-close')?.textContent).toBe('close session')
    })

    it('shows the start time after the name only while two seats share it', async () => {
      await building()
      expect(seats()[0].querySelector('.tile-title')).toBeNull()

      push({ name: 'session:opened', payload: { sessionId: 'sk2', skill: 'bmad-build', at: Date.now() } })

      expect(seats().map((seat) => seat.querySelector('.tile-title')?.textContent)).toEqual([
        expect.stringMatching(/^\d\d:\d\d$/),
        expect.stringMatching(/^\d\d:\d\d$/)
      ])
    })

    it('speaks as the skill in mono beside the `/` disc, with the time and no role, and nowhere else', async () => {
      await building()
      said('Working on it.')

      const turn = thread().querySelector('.turn:not(.turn--user)') as HTMLElement
      expect(turn.querySelector('.initials--thread.initials--skill')?.textContent).toBe('/')
      expect(turn.querySelector('.turn-name--mono')?.textContent).toBe('bmad-build')
      expect(turn.querySelector('.turn-role')).toBeNull()
      expect(turn.querySelector('.turn-time')?.textContent).toMatch(/^\d\d:\d\d$/)
      expect(turn.textContent).toContain('Working on it.')

      // The shared thread of a persona draws none of it.
      act(() => tile('Mary').click())
      await settle()
      expect(thread().textContent).not.toContain('Working on it.')
      expect(thread().textContent).not.toContain('bmad-build')
    })

    it('draws the first message’s run card in its own thread, headed `<skill> run`, and raises one activity line per run event with no code', async () => {
      await building()
      push({ name: 'run:started', payload: { runId: 'r1', sessionId: 'sk1', code: 'bmad-build', skill: 'bmad-build', at: Date.now() } })

      const card = thread().querySelector('.run-card') as HTMLElement
      expect(card.querySelector('.run-card-head')?.textContent).toMatch(/^bmad-build run/)
      expect(thread().querySelector('.run-card-line')).toBeNull()
      expect(root().querySelector('.chat > .pinned')).toBeNull()
      // Another chat does not draw it.
      act(() => tile('Mary').click())
      await settle()
      expect(root().querySelector('.run-card')).toBeNull()
    })

    it('raises a Recent activity row from the card’s skill: the skill’s name and the bare verb, no code, and no Board card or agent row', async () => {
      boardNow = async () => ({ revision: 1, kind: 'read', epics: [], others: [] })
      await building()
      pressView('Board')
      const feed = (): string[] =>
        [...boardOf().querySelectorAll('.board-activity-row')].map(
          (row) => `${row.querySelector('.board-activity-who')?.textContent} ${row.querySelector('.board-activity-did')?.textContent}`
        )
      push({ name: 'run:started', payload: { runId: 'r1', sessionId: 'sk1', code: 'bmad-build', skill: 'bmad-build', at: Date.now() - 5_000 } })

      expect(feed()).toEqual(['bmad-build started'])
      expect(boardOf().querySelector('.board-activity-row .status-dot--work')).not.toBeNull()

      push({ name: 'run:finished', payload: { runId: 'r1', sessionId: 'sk1', at: Date.now() } })
      expect(feed()).toEqual(['bmad-build finished', 'bmad-build started'])
      expect(boardOf().querySelector('.board-card')).toBeNull()
      expect([...boardOf().querySelectorAll('.board-agent-name')].map((node) => node.textContent)).not.toContain('bmad-build')
    })

    it('sends a plain message to the same session, and queues one typed in flight as the skill’s', async () => {
      await building()
      await say('and then this')

      expect(sent).toEqual([])
      expect(thread().querySelector('.turn--queued')?.textContent).toContain('queued · sends when bmad-build finishes')

      push({ name: 'session:awaiting-turn', payload: { sessionId: 'sk1', at: Date.now() } })
      expect(sent).toEqual([['sk1', 'and then this']])
      expect(thread().querySelector('.turn--queued')).toBeNull()
      expect(field().getAttribute('aria-label')).toBe('Message bmad-build')
    })

    it('has no `/` list and no skill row in its composer: nothing inside a session suggests starting another', async () => {
      await building()
      type(field(), '/')

      expect(root().querySelector('[role="listbox"]')).toBeNull()
      expect(root().querySelector('.skill-row')).toBeNull()
    })

    it('stops its turn from the header’s Stop, asking main for that session alone', async () => {
      await building()

      act(() => (header().querySelector('button.chat-close') as HTMLButtonElement).click())
      await settle()

      expect(turnStopped).toEqual(['sk1'])
      expect(closedSessions).toEqual([])
    })

    it('counts no persona anywhere: the strip, the Agents panel and the thread of a persona are as they were', async () => {
      const strip = (): string => root().querySelector('.team-strip')?.textContent ?? ''
      await start()
      const before = strip()
      firstAnswer = () => ({ sessionId: 'sk1', skill: 'bmad-build' })
      await say('/bmad-build go')
      push({ name: 'session:opened', payload: { sessionId: 'sk1', skill: 'bmad-build', at: Date.now() } })
      push({ name: 'run:started', payload: { runId: 'r1', sessionId: 'sk1', code: 'bmad-build', skill: 'bmad-build', at: Date.now() } })

      expect(strip()).toBe(before)
      expect(root().querySelectorAll('.team-strip .status-dot')).toHaveLength(0)
    })

    it('offers nothing about who to talk to next when its run ends: no suggestion, persona, handoff, button or line', async () => {
      await building()
      push({ name: 'run:started', payload: { runId: 'r1', sessionId: 'sk1', code: 'bmad-build', skill: 'bmad-build', at: Date.now() } })
      said('All done.')
      const before = thread().innerHTML
      push({ name: 'run:finished', payload: { runId: 'r1', sessionId: 'sk1', at: Date.now() } })
      push({ name: 'session:awaiting-turn', payload: { sessionId: 'sk1', at: Date.now() } })

      expect(thread().querySelector('.sysline, .decision-block, .turn-mention')).toBeNull()
      expect(thread().querySelectorAll('button')).toHaveLength(0)
      expect(thread().textContent).not.toMatch(/Mary|John|talk to|next|suggest|hand/i)
      expect(thread().querySelectorAll('.turn:not(.turn--user)')).toHaveLength(1)
      expect(thread().innerHTML).not.toBe('')
      expect(before).not.toBe('')
    })
  })

  describe('ending it', () => {
    it('kills nothing here: it asks main for that session, then removes its seat, thread and cards and lands on the New session chat with focus in its composer, saying nothing', async () => {
      await building()
      push({ name: 'run:started', payload: { runId: 'r1', sessionId: 'sk1', code: 'bmad-build', skill: 'bmad-build', at: Date.now() } })
      said('Words.')
      push({ name: 'session:awaiting-turn', payload: { sessionId: 'sk1', at: Date.now() } })
      push({ name: 'run:finished', payload: { runId: 'r1', sessionId: 'sk1', at: Date.now() } })
      const close = header().querySelector('button.chat-close') as HTMLButtonElement
      expect(close.textContent).toBe('close session')

      act(() => close.click())
      push({ name: 'session:closed', payload: { sessionId: 'sk1', skill: 'bmad-build', reason: 'closed', at: Date.now() } })
      await settle()

      expect(closedSessions).toEqual(['sk1'])
      expect(seats()).toHaveLength(0)
      expect(root().querySelector('.rail-group')).toBeNull()
      expect(header().querySelector('h2')?.textContent).toBe('New session')
      expect(thread().textContent).toBe('')
      expect(root().querySelector('.run-card')).toBeNull()
      expect(document.activeElement).toBe(field())
      expect(button('Skill Session')?.getAttribute('aria-pressed')).toBe('true')
      await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 300))))
      // Ending says no line and announces nothing of its own (what the run's end said was said then).
      expect(live()).not.toMatch(/closed|ended|session/)
    })

    it('touches no persona seat, no room and nothing in the shared thread', async () => {
      await start()
      act(() => tile('Mary').click())
      await settle()
      push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
      push({ name: 'persona:said', payload: { sessionId: 's-mary', agentId: mary.id, messageId: 'p1', text: 'Mary speaks', at: 2 } })
      act(() => button('Skill Session')?.click())
      firstAnswer = () => ({ sessionId: 'sk1', skill: 'bmad-build' })
      await say('/bmad-build go')
      push({ name: 'session:opened', payload: { sessionId: 'sk1', skill: 'bmad-build', at: Date.now() } })
      push({ name: 'session:awaiting-turn', payload: { sessionId: 'sk1', at: Date.now() } })

      act(() => (header().querySelector('button.chat-close') as HTMLButtonElement).click())
      await settle()

      expect(closedSessions).toEqual(['sk1'])
      act(() => tile('Mary').click())
      await settle()
      expect(thread().textContent).toContain('Mary speaks')
      expect(closedSessions).not.toContain('s-mary')
      expect(tile('Mary').getAttribute('aria-label')).toContain('Mary, Role')
    })

    it('keeps the session and shows main’s refusal as the failure line when the end is refused', async () => {
      await building()
      push({ name: 'session:awaiting-turn', payload: { sessionId: 'sk1', at: Date.now() } })
      ;(window.harness as unknown as { closeSession: (id: string) => Promise<void> }).closeSession = async () => {
        throw { code: 'session/not-found', message: 'session · no such session is open' }
      }

      act(() => (header().querySelector('button.chat-close') as HTMLButtonElement).click())
      await settle()

      expect(seats()).toHaveLength(1)
      expect(root().querySelector('.error-line')?.textContent).toContain('no such session is open')
    })

    it('leaves the New session chat as it was kept: its text is there on landing', async () => {
      await start()
      type(field(), 'half')
      firstAnswer = () => ({ sessionId: 'sk1', skill: 'bmad-build' })
      await say('/bmad-build go')
      // The chat that sent was spent; the window lands on a fresh, empty one.
      push({ name: 'session:opened', payload: { sessionId: 'sk1', skill: 'bmad-build', at: Date.now() } })
      push({ name: 'session:awaiting-turn', payload: { sessionId: 'sk1', at: Date.now() } })
      act(() => (header().querySelector('button.chat-close') as HTMLButtonElement).click())
      await settle()

      expect(field().value).toBe('')
      expect(thread().textContent).toBe('')
    })
  })

  describe('after a relaunch', () => {
    const stored = (live: boolean): void => {
      conversationNow = () => ({
        entries: [
          { kind: 'user', id: 'm-0', at: 1_700_000_000_000, text: '/bmad-build make a thing', skillSession: 'sk1' },
          { kind: 'skill', id: 'm-1', at: 1_700_000_001_000, messageId: 'x', text: 'It was done.', skillSession: 'sk1' },
          { kind: 'user', id: 'm-2', at: 1_700_000_002_000, text: 'a shared message', agentId: mary.id }
        ],
        sessions: [],
        busy: [],
        personas: [],
        runs: [],
        skillSessions: [{ sessionId: 'sk1', skill: 'bmad-build', live }]
      })
    }

    it('lists it ended with its thread as it was and a header with `close session` only, and the shared thread draws none of it', async () => {
      stored(false)
      await start()
      expect(seats()).toHaveLength(1)
      expect(seats()[0].querySelector('.tile-state')?.textContent).toBe('ended')
      expect(seats()[0].querySelector('.status-dot')).toBeNull()

      act(() => seats()[0].click())
      await settle()
      expect(header().querySelector('h2')?.textContent).toBe('bmad-build')
      expect([...header().querySelectorAll('button')].map((node) => node.textContent)).toEqual(['close session'])
      expect(thread().textContent).toContain('It was done.')
      expect(thread().textContent).not.toContain('a shared message')
      expect(opened).toEqual([])

      act(() => tile('Mary').click())
      await settle()
      expect(thread().textContent).toContain('a shared message')
      expect(thread().textContent).not.toContain('It was done.')
    })

    it('answers a message to it `session ended` as one line in its thread, drawing no turn and keeping the text', async () => {
      stored(false)
      sendRefusal = () => ({ code: 'session/ended', message: 'session ended' })
      await start()
      act(() => seats()[0].click())
      await settle()
      const turns = thread().querySelectorAll('.turn').length

      await say('are you there')

      expect(sent).toEqual([])
      expect([...thread().querySelectorAll('.sysline')].map((node) => node.textContent)).toEqual(['session ended'])
      expect(thread().querySelectorAll('.turn')).toHaveLength(turns)
      expect(field().value).toBe('are you there')
      await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 300))))
      expect(live()).toBe('session ended')
    })

    it('removes what it kept when it is ended, and the window lands on the New session chat', async () => {
      stored(false)
      await start()
      act(() => seats()[0].click())
      await settle()

      act(() => (header().querySelector('button.chat-close') as HTMLButtonElement).click())
      await settle()

      expect(closedSessions).toEqual(['sk1'])
      expect(seats()).toHaveLength(0)
      expect(header().querySelector('h2')?.textContent).toBe('New session')
    })

    it('lists one main still holds as live, and nothing else of a persona or a room changed', async () => {
      stored(true)
      conversationNow = () => ({
        entries: [],
        sessions: [],
        busy: [],
        personas: [],
        runs: [],
        skillSessions: [{ sessionId: 'sk1', skill: 'bmad-build', live: true }]
      })
      await start()

      expect(seats()[0].querySelector('.tile-state')?.textContent).toBe('live')
      expect(root().querySelectorAll('.team-strip .status-dot')).toHaveLength(0)
    })
  })

  describe('a first message that names a persona or the room', () => {
    it('turns to the persona’s seat with the words after the name sent to it, and starts no skill-first session', async () => {
      firstAnswer = () => ({ sessionId: 'session-of-bmad-agent-pm', seat: john.id, rest: 'draft it' })
      await start()
      await say('/bmad-agent-pm draft it')
      await settle()

      expect(header().querySelector('h2')?.textContent).toBe('John')
      expect(tile('John').getAttribute('aria-current')).toBe('true')
      expect(sent).toEqual([['session-of-bmad-agent-pm', 'draft it']])
      expect(seats()).toHaveLength(0)
      expect(button('Skill Session')?.getAttribute('aria-pressed')).toBe('false')
      expect(field().getAttribute('aria-label')).toBe('Message John')
    })

    it('opens the room and sends the words after the name as a room turn, and the empty chat is spent', async () => {
      firstAnswer = () => ({ sessionId: 'session-of-the-room', room: { cast: [mary.id, john.id], openedAt: 1_700_000_000_000 }, rest: 'let us begin' })
      await start()
      await say('/bmad-party-mode let us begin')
      await settle()

      expect(sent).toEqual([['session-of-the-room', 'let us begin']])
      expect((root().querySelector('.view-party') as HTMLElement).hidden).toBe(false)
      expect(seats()).toHaveLength(0)
      expect(button('Skill Session')?.getAttribute('aria-pressed')).toBe('false')
    })

    it('has a fresh, empty chat for the button after the first message was sent', async () => {
      firstAnswer = () => ({ sessionId: 'session-of-bmad-agent-pm', seat: john.id })
      await start()
      // A trailing space closes the `/` list, so Enter sends what was typed.
      await say('/bmad-agent-pm ')
      await settle()

      act(() => button('Skill Session')?.click())
      await settle()

      expect(header().querySelector('h2')?.textContent).toBe('New session')
      expect(field().value).toBe('')
      expect(thread().textContent).toBe('')
    })
  })
})

describe('App, selecting a persona gives an empty chat (Story 8.2)', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const thread = (): string[] => [...mounted!.container.querySelectorAll('.thread > *')].map((node) => node.className)
  const buttons = (): HTMLButtonElement[] => [...mounted!.container.querySelectorAll<HTMLButtonElement>('button.skill-button')]
  const arrow = (key: string): void =>
    act(() => void document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
  const sysline = (): Element | null => mounted!.container.querySelector('.sysline')

  /** A click, or the native button's own activation by a key: `Enter` or `Space` fires the click the key down was not stopped from. */
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

  beforeEach(() => {
    const harness = window.harness as unknown as Record<string, unknown>
    harness.getInstall = async () => ({
      ...snapshot,
      menus: { [mary.id]: [{ code: 'CP', description: 'Create the PRD' }], [john.id]: [{ code: 'CP', description: 'Create the PRD' }] }
    })
  })

  async function mountApp(): Promise<void> {
    mounted = mount(createElement(App))
    await settle()
    await settle()
  }

  it('opens on the New session chat with no persona current and nothing open', async () => {
    await mountApp()

    expect(mounted!.container.querySelector('.chat-head-name')?.textContent).toBe('New session')
    expect(mounted!.container.querySelector('button.persona-tile[aria-current]')).toBeNull()
    expect(opened).toEqual([])
  })

  it.each(['click', 'Enter', 'Space'] as const)(
    'selecting every persona by %s opens nothing, writes nothing and shows no live dot',
    async (how) => {
      await mountApp()
      const before = mounted!.container.querySelectorAll('.thread .turn, .thread .sysline').length

      for (const [name, title] of [['Mary', 'Role'], ['John', 'Role']] as const) {
        choose(name, how)
        await settle()

        expect(tile(name).getAttribute('aria-current')).toBe('true')
        expect(tile(name).getAttribute('aria-label')).toBe(`${name}, ${title}, idle`)
        expect(mounted!.container.querySelector('.chat-head-name')?.textContent).toBe(name)
        expect(mounted!.container.querySelector('.chat-head-title')?.textContent).toBe(title)
        expect(mounted!.container.querySelector('.chat-head .initials')).not.toBeNull()
        // The introduction alone: no turn, no greeting, no line.
        expect(thread()).toEqual(['thread-intro'])
        expect(sysline()).toBeNull()
        expect(mounted!.container.querySelectorAll('.thread .turn, .thread .sysline')).toHaveLength(before)
        // The introduction carries no button, and the chat has no close control (no session, no thread).
        expect(mounted!.container.querySelector('.thread-intro button, .thread-intro [tabindex], .thread-intro a')).toBeNull()
        expect(mounted!.container.querySelector('.chat-head button.chat-close')).toBeNull()
        // The skill row is drawn and held; the composer is not.
        expect(buttons()).toHaveLength(1)
        expect(buttons().every((button) => button.disabled)).toBe(true)
        expect(field().disabled).toBe(false)
        expect(field().getAttribute('aria-label')).toBe(`Message ${name}`)
        // Focus stays on the tile that was activated.
        expect(document.activeElement).toBe(tile(name))
      }

      expect(opened).toEqual([])
      expect(sent).toEqual([])
      expect(dispatchedMenus).toEqual([])
      expect(roomCasts).toEqual([])
      expect(firsts).toEqual([])
      expect(mounted!.container.querySelectorAll('.visually-hidden')).toHaveLength(1)
      expect(mounted!.container.querySelector('.visually-hidden')?.textContent).toBe('')
    }
  )

  it('does nothing when a held skill button is pressed, and the composer takes typing without taking focus', async () => {
    await mountApp()
    choose('Mary', 'click')
    await settle()

    act(() => buttons()[0].click())
    await settle()
    expect(dispatchedMenus).toEqual([])
    expect(opened).toEqual([])
    expect(sent).toEqual([])
    expect(thread()).toEqual(['thread-intro'])

    tile('Mary').focus()
    type(field(), 'a draft')
    expect(field().value).toBe('a draft')
    expect(document.activeElement).toBe(tile('Mary'))
    expect(opened).toEqual([])
  })

  it('leaves focus on the tile when a composer focus request for that persona is still pending', async () => {
    await mountApp()
    choose('Mary', 'click')
    await settle()
    // An `@John` handoff from Mary's chat leaves a focus request pending for John's composer.
    type(field(), '@John')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()

    choose('Mary', 'click')
    await settle()
    choose('John', 'click')
    await settle()

    expect(document.activeElement).toBe(tile('John'))
    expect(document.activeElement).not.toBe(field())
  })

  it('moves focus alone on the arrow keys, selecting nothing', async () => {
    await mountApp()
    choose('Mary', 'click')
    await settle()
    tile('Mary').focus()

    arrow(['Arrow', 'Down'].join(''))
    await settle()

    expect(document.activeElement).toBe(tile('John'))
    expect(tile('Mary').getAttribute('aria-current')).toBe('true')
    expect(tile('John').hasAttribute('aria-current')).toBe(false)
    expect(mounted!.container.querySelector('.chat-head-name')?.textContent).toBe('Mary')
    expect(opened).toEqual([])
  })

  it('shows a live persona’s existing thread and dot on selection, with no second open and the row enabled', async () => {
    await mountApp()
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({
      name: 'persona:said',
      payload: { sessionId: 's-mary', agentId: mary.id, messageId: 'm1', text: 'Hello from Mary', at: 2 }
    })
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 3 } })
    push({ name: 'persona:state', payload: { agentId: mary.id, state: 'live', at: 4 } })

    choose('John', 'click')
    await settle()
    expect(thread()).toEqual(['thread-intro'])
    choose('Mary', 'click')
    await settle()

    expect(opened).toEqual([])
    expect(tile('Mary').getAttribute('aria-label')).toBe('Mary, Role, live')
    expect(mounted!.container.querySelector('.thread')?.textContent).toContain('Hello from Mary')
    expect(mounted!.container.querySelector('.thread-intro')).toBeNull()
    expect(buttons()).toHaveLength(1)
    expect(buttons().every((button) => !button.disabled)).toBe(true)
  })

  it('draws a stored thread with no introduction, no live dot and no skill row when there is no session', async () => {
    conversationNow = () => ({
      entries: [{ kind: 'persona', id: 'e1', agentId: mary.id, messageId: 'm1', text: 'From before', at: 1 }],
      sessions: [],
      busy: [],
      personas: [],
      runs: []
    })
    await mountApp()

    choose('Mary', 'click')
    await settle()

    expect(opened).toEqual([])
    expect(mounted!.container.querySelector('.thread')?.textContent).toContain('From before')
    expect(mounted!.container.querySelector('.thread-intro')).toBeNull()
    expect(tile('Mary').getAttribute('aria-label')).toBe('Mary, Role, idle')
    expect(buttons()).toEqual([])
  })

  it('still opens the seat on a first message and delivers it', async () => {
    await mountApp()
    choose('Mary', 'click')
    await settle()
    expect(opened).toEqual([])

    type(field(), 'hello mary')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()

    expect(opened).toEqual([mary.id])
    expect(sent).toEqual([[`session-of-${mary.id}`, 'hello mary']])
  })
})
