// @vitest-environment jsdom
import { createElement } from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SyslineRecord } from '../../shared/conversation'
import type { ContractEvent } from '../../shared/events'
import type { AgentView, InstallSnapshot } from '../../shared/install'
import { App } from './app'
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
  preflight: []
}

let mounted: Mounted | null
let opened: string[]
/** The casts the window asked for a room of, in order. */
let roomCasts: (readonly string[])[]
let sent: [string, string][]
let ended: string[]
/** The runs the window asked main to stop, and what main answers a stop with (nothing: it took it). */
let stopped: string[]
let stopReply: (() => Promise<void>) | undefined
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
/** The sysline main answers the next open with, one per open, `undefined` for none. */
let handoffs: (SyslineRecord | undefined)[]

function installBridge(): void {
  const bridge = {
    getProjectPath: async () => '/work/falcon',
    getInstall: async () => snapshot,
    onInstallChanged: (listener: (next: InstallSnapshot) => void) => {
      installListeners.push(listener)
      return () => {}
    },
    getBranch: async () => 'main',
    getRail: async () => ({ revision: 1, rows: [] }),
    onRailChanged: () => () => {},
    openDoc: async (path: string) => {
      docsOpened.push(path)
    },
    onDocClosed: () => () => {},
    dispatchMenu: async (sessionId: string, code: string) => {
      dispatchedMenus.push([sessionId, code])
      return 'r-dispatched'
    },
    openSession: async (target: string | { room: readonly string[] }) => {
      if (typeof target !== 'string') {
        roomCasts.push(target.room)
        return { sessionId: 'session-of-the-room', room: { cast: [...target.room], openedAt: 1_700_000_000_000 } }
      }
      const agentId = target
      opened.push(agentId)
      const handoff = handoffs.shift()
      return handoff === undefined
        ? { sessionId: `session-of-${agentId}` }
        : { sessionId: `session-of-${agentId}`, handoff }
    },
    closeSession: async (sessionId: string) => {
      closedSessions.push(sessionId)
    },
    sendTurn: async (sessionId: string, text: string) => {
      sent.push([sessionId, text])
    },
    stopRun: async (runId: string) => {
      stopped.push(runId)
      await stopReply?.()
    },
    getConversation: async () => ({ entries: [], sessions: [], busy: [], personas: [], runs: [] }),
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
  stopReply = undefined
  closedSessions = []
  installListeners = []
  listeners = []
  revealListeners = []
  docsOpened = []
  dispatchedMenus = []
  handoffs = []
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

describe('App, the conversation glue', () => {
  it('opens the selected persona’s session, remounts the composer for them, and sends their text to their session', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()

    // The window opens on the topmost persona with a composer and no session.
    expect(tile('Mary').getAttribute('aria-current')).toBe('true')
    expect(opened).toEqual([])
    type(field(), 'a draft for Mary')

    act(() => tile('John').click())
    await settle()

    expect(opened).toEqual([john.id])
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

  it('opens the session on the first send to the current persona, and not before', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()

    type(field(), 'hello mary')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()

    expect(opened).toEqual([mary.id])
  })

  it('queues a message typed while the persona works, leaves focus and the composer alone, and un-dims it in place when the turn ends', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })

    const input = field()
    input.focus()
    type(input, 'while you work')
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()

    const turn = mounted.container.querySelector('.turn--user') as HTMLElement
    expect(turn.className).toContain('turn--queued')
    expect(turn.textContent).toContain('queued · sends when Mary finishes')
    expect(sent).toEqual([])
    expect(document.activeElement).toBe(field())
    expect(field().disabled).toBe(false)
    expect(field().readOnly).toBe(false)
    expect(field().hasAttribute('aria-disabled')).toBe(false)

    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 2 } })
    expect(sent).toEqual([['s-mary', 'while you work']])
    const same = mounted.container.querySelector('.turn--user') as HTMLElement
    expect(same).toBe(turn)
    expect(same.className).not.toContain('turn--queued')
    expect(same.textContent).not.toContain('queued')
    expect(document.activeElement).toBe(field())
  })

  it('takes a cancelled message out of the transcript and never sends it', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })

    type(field(), 'never mind')
    act(() => {
      field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    })
    await settle()
    const cancel = mounted.container.querySelector('button.turn-cancel') as HTMLButtonElement
    act(() => cancel.click())
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 2 } })

    expect(mounted.container.querySelector('.turn--user')).toBeNull()
    expect(sent).toEqual([])
  })

  it('shows what main reports on the tile and the chat header, with a counter for work and none after', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
    const container = mounted.container
    const header = (): Element => container.querySelector('.chat-head-state') as Element
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
    expect(container.querySelectorAll('.status-dot--work')).toHaveLength(2)

    push({ name: 'persona:state', payload: { agentId: mary.id, state: 'idle', at: Date.now() } })

    expect(tileState('Mary').textContent).toBe('idle')
    expect(header().textContent).toBe('idle')
    expect(container.querySelector('.state-elapsed')).toBeNull()
  })

  it('ends the conversation from the topbar: sends this window’s project, empties the thread, announces it once, and leaves no new live region', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({
      name: 'persona:said',
      payload: { sessionId: 's-mary', agentId: mary.id, messageId: 'm1', text: 'Hello', at: 2 }
    })
    expect(mounted.container.querySelectorAll('.turn')).toHaveLength(1)

    const buttons = [...mounted.container.querySelectorAll<HTMLButtonElement>('.topbar button')]
    expect(buttons.map((button) => button.textContent)).toEqual(['1:1 Conversation', 'Party Mode', 'End session'])
    const control = buttons[2]
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
    expect(mounted.container.querySelectorAll('.turn')).toHaveLength(0)
    expect(mounted.container.querySelectorAll('.visually-hidden')).toHaveLength(1)
    expect(mounted.container.querySelector('.visually-hidden')?.textContent).toBe('conversation · ended')
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
    mounted = mount(createElement(App))
    await settle()
    await settle()
    act(() =>
      listeners.forEach((listener) =>
        listener({
          name: 'persona:said',
          payload: { sessionId: 's', agentId: mary.id, messageId: 'm1', text: 'Hello', at: 2 }
        })
      )
    )

    const control = [...mounted.container.querySelectorAll<HTMLButtonElement>('.topbar button')][2]
    act(() => control.click())
    await settle()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    })

    expect(mounted.container.textContent).toContain('conversation · could not end the conversation')
    expect(mounted.container.querySelectorAll('.turn')).toHaveLength(1)
    expect(mounted.container.querySelector('.visually-hidden')?.textContent).toBe('')
  })
})

describe('App, handing the work to the next persona', () => {
  const handoff: SyslineRecord = {
    kind: 'sysline',
    id: 'm-1',
    at: 5,
    text: 'handed off · Mary → John · picking up from _bmad/prd.md, _bmad/epics.md'
  }
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
    mounted = mount(createElement(App))
    await settle()
    await settle()
  }

  it('a tile handoff puts the sysline in place after what was said, unattributed, and leaves focus on the tile that carries aria-current', async () => {
    handoffs = [undefined, handoff]
    await start()
    tile('Mary').focus()
    act(() => tile('Mary').click())
    await settle()
    push(maryWords)

    tile('John').focus()
    act(() => tile('John').click())
    await settle()

    expect(opened).toEqual([mary.id, john.id])
    expect(thread()).toEqual(['turn turn--persona', 'sysline'])
    const line = mounted!.container.querySelector('.sysline') as HTMLElement
    expect(line.textContent).toBe(handoff.text)
    expect(line.closest('.turn')).toBeNull()
    expect(line.querySelector('img, svg, .turn-name, .turn-time, button')).toBeNull()
    // Focus stayed where the user put it, and aria-current followed.
    expect(document.activeElement).toBe(tile('John'))
    expect(tile('John').getAttribute('aria-current')).toBe('true')
    expect(tile('Mary').hasAttribute('aria-current')).toBe(false)
    expect(tile('John').tabIndex).toBe(0)
    expect(tile('Mary').tabIndex).toBe(-1)
    expect(field().getAttribute('aria-label')).toBe('Message John')
    expect(field().value).toBe('')
  })

  it('announces the handoff once, with the sysline’s text, through the one live region', async () => {
    handoffs = [undefined, handoff]
    await start()
    act(() => tile('Mary').click())
    await settle()
    push(maryWords)
    act(() => tile('John').click())
    await settle()

    expect(await announced()).toBe(handoff.text)
    expect(mounted!.container.querySelectorAll('.visually-hidden')).toHaveLength(1)
  })

  it('writes and announces nothing when the current tile is activated again, though main is asked', async () => {
    await start()
    act(() => tile('Mary').click())
    await settle()
    push(maryWords)
    act(() => tile('Mary').click())
    await settle()

    expect(opened).toEqual([mary.id, mary.id])
    expect(mounted!.container.querySelector('.sysline')).toBeNull()
    expect(await announced()).toBe('')
  })

  it('shows the line once and in place however the window re-renders, and a later reply adds a second', async () => {
    const back: SyslineRecord = { kind: 'sysline', id: 'm-3', at: 9, text: 'handed off · John → Mary' }
    handoffs = [undefined, handoff, back]
    await start()
    act(() => tile('Mary').click())
    await settle()
    push(maryWords)
    act(() => tile('John').click())
    await settle()
    push({ name: 'persona:state', payload: { agentId: john.id, state: 'work', at: Date.now() } })
    act(() => tile('Mary').click())
    await settle()

    expect([...mounted!.container.querySelectorAll('.sysline')].map((node) => node.textContent)).toEqual([
      handoff.text,
      back.text
    ])
  })

  it('@<name> hands off: the session opens, the sysline lands, nothing of the token is echoed and focus lands in the new persona’s composer', async () => {
    handoffs = [handoff]
    await start()
    await say('@john')

    expect(opened).toEqual([john.id])
    expect(sent).toEqual([])
    expect(mounted!.container.querySelector('.turn--user')).toBeNull()
    expect(mounted!.container.textContent).not.toContain('@john')
    expect(mounted!.container.querySelector('.sysline')?.textContent).toBe(handoff.text)
    expect(field().getAttribute('aria-label')).toBe('Message John')
    expect(document.activeElement).toBe(field())
    // The roving tab stop and aria-current follow the new persona.
    expect(tile('John').getAttribute('aria-current')).toBe('true')
    expect(tile('John').tabIndex).toBe(0)
    expect(tile('Mary').hasAttribute('aria-current')).toBe(false)
    expect(tile('Mary').tabIndex).toBe(-1)
    expect(await announced()).toBe(handoff.text)
  })

  it('@<name> with text sends that text to the new persona as the user’s turn, after the handoff', async () => {
    handoffs = [handoff]
    await start()
    await say('@John write the brief')

    expect(opened).toEqual([john.id])
    expect(sent).toEqual([[`session-of-${john.id}`, 'write the brief']])
    expect(thread()).toEqual(['sysline', 'turn turn--user'])
    expect(mounted!.container.querySelector('.turn--user')?.textContent).toContain('write the brief')
    expect(mounted!.container.querySelector('.turn--user')?.textContent).not.toContain('@')
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

    expect(opened).toEqual([mary.id])
    expect(sent).toEqual([[`session-of-${mary.id}`, text]])
    expect(mounted!.container.querySelector('.sysline')).toBeNull()
    expect(mounted!.container.querySelector('.turn--user')?.textContent).toContain(text)
    expect(tile('Mary').getAttribute('aria-current')).toBe('true')
    expect(mounted!.container.textContent).not.toMatch(/no such|unknown|did you mean|try @/i)
  })

  it('leaves the composer hint as it was', async () => {
    await start()

    expect(mounted!.container.querySelector('.composer-hint')?.textContent).toBe('enter sends·shift+enter adds a line')
  })

  it('does not hand focus to the composer for a tile chosen after an @ handoff', async () => {
    handoffs = [handoff]
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
    mounted = mount(createElement(App))
    await settle()
    await settle()
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

  it('answers the persona who asked even when another tile is current, and lands focus in that persona’s composer', async () => {
    await asked()
    push({ name: 'session:awaiting-turn', payload: { sessionId: 's-mary', at: 3 } })
    act(() => tile('John').click())
    await settle()
    expect(field().getAttribute('aria-label')).toBe('Message John')
    expect(options()).toHaveLength(2)

    act(() => options()[0].click())
    await settle()

    expect(sent).toEqual([['s-mary', 'Postgres']])
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

  /** Mary's session is live and has spoken; John has one too, idle. */
  async function live(): Promise<void> {
    mounted = mount(createElement(App))
    await settle()
    await settle()
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
    expect(mounted!.container.querySelector('.turn--persona .turn-name, .turn--persona')?.textContent).toContain('Mary')
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
    expect(mounted!.container.textContent).toContain('Hello from Mary')
    expect(document.activeElement).toBe(field())
    expect(field().getAttribute('aria-label')).toBe('Message John')
    expect(closedSessions).toEqual(['s-mary'])
  })

  it('stacks one header per orphan in session order, each closing only its own', async () => {
    await live()
    reinstall([agent('bmad-agent-dev', 'Amelia')])

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
    mounted = mount(createElement(App))
    await settle()
    await settle()
  }

  it('is not there while the current persona has no session', async () => {
    await mountAndOpenMary()

    expect(field().getAttribute('aria-label')).toBe('Message Mary')
    expect(closeButtons()).toHaveLength(0)
  })

  it('is in the current persona’s header from session:opened, closes that session on the click, goes with session:closed, and lands focus in the composer', async () => {
    await mountAndOpenMary()
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })

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

  it('goes when the process exits on its own', async () => {
    await mountAndOpenMary()
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({ name: 'session:closed', payload: { sessionId: 's-mary', agentId: mary.id, reason: 'process-exited', at: 2 } })

    expect(closeButtons()).toHaveLength(0)
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

  it('shows the row once the persona is live, sends the code alone, and draws the run’s card as it writes', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    // No session yet: no row.
    expect(buttons()).toEqual([])

    act(() => tile('Mary').click())
    await settle()
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
    // Dead air: no status string, and the body opens with the run's own start row.
    expect(card?.querySelector('.run-card-status')).toBeNull()
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
    expect(card?.querySelector('.run-card-caret')).not.toBeNull()

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
    expect(saved?.querySelector('.run-card-caret')).toBeNull()
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

  it('holds the same path, text and busy state in the slot as the card has in the thread', async () => {
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

    // John viewed: Mary's card, still running, is a line in the thread (Story 3.5); once the
    // user expands it, it is the same card drawn full in the thread.
    act(() => tile('John').click())
    await settle()
    expect(slot()).toBeNull()
    expect(cards()).toHaveLength(0)
    expect(root().querySelectorAll('.thread .run-card-line')).toHaveLength(1)
    act(() => root().querySelector<HTMLButtonElement>('.run-card-line-button')?.click())
    expect(cards()).toHaveLength(1)
    const threaded = inThread()[0]
    expect({
      path: threaded.querySelector('.run-card-path')?.textContent,
      text: threaded.querySelector('.run-card-text')?.textContent,
      busy: threaded.getAttribute('aria-busy'),
      notes: threaded.querySelectorAll('.run-note').length
    }).toEqual(held)

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
          documents: [{ path: '_bmad/prd.md', callId: 'c9', text: 'so far', written: 6, sections: [] }]
        }
      ]
    })
    mounted = mount(createElement(App))
    await settle()
    await settle()
    await act(frame)

    expect(cards()).toHaveLength(1)
    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)
    expect(inThread()).toHaveLength(0)
    expect(root().querySelector('.chat')?.firstElementChild).toBe(slot())
  })

  it('draws no slot for another persona’s run, and moves the card with the switch, drawing it once either way', async () => {
    await open()
    started('r1', 's-John', john, 20)
    // Mary is viewed: John's run is one line in the thread, and no card.
    expect(slot()).toBeNull()
    expect(cards()).toHaveLength(0)
    expect(lines()).toHaveLength(1)

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
    expect(lines()).toHaveLength(1)
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

    // Never a viewed persona's, so never pinned: a line in the thread (Story 3.5).
    expect(slot()).toBeNull()
    expect(cards()).toHaveLength(0)
    expect(lines()).toHaveLength(1)
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

describe('App, the run you are not looking at (Story 3.5)', () => {
  const push = (event: ContractEvent): void => act(() => listeners.forEach((listener) => listener(event)))
  const root = (): HTMLElement => mounted!.container
  const cards = (): HTMLElement[] => [...root().querySelectorAll<HTMLElement>('.run-card')]
  const lines = (): HTMLElement[] => [...root().querySelectorAll<HTMLElement>('.run-card-line')]
  const slot = (): HTMLElement | null => root().querySelector<HTMLElement>('.chat > .pinned')
  const lineButton = (): HTMLButtonElement => root().querySelector('.run-card-line-button') as HTMLButtonElement
  const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))
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
    mounted = mount(createElement(App))
    await settle()
    await settle()
    push({ name: 'session:opened', payload: { sessionId: 's-Mary', agentId: mary.id, at: 1 } })
    push({ name: 'session:opened', payload: { sessionId: 's-John', agentId: john.id, at: 1 } })
  }

  it('draws another persona’s run as one line: the persona, the dot, the elapsed time, a button, and no card, slot or stop', async () => {
    await open()
    started('r1', 's-John', john, Date.now() - 65_000)

    expect(lines()).toHaveLength(1)
    expect(cards()).toHaveLength(0)
    expect(slot()).toBeNull()
    const line = lines()[0]
    expect(line.closest('.thread')).not.toBeNull()
    expect(line.getAttribute('aria-busy')).toBe('true')
    expect(line.querySelector('.status-dot--work')).not.toBeNull()
    expect(line.querySelector('.run-card-line-name')?.textContent).toBe('John')
    expect(line.querySelector('.run-card-elapsed')?.textContent).toMatch(/^1m 0[5-9]s$/)
    // The expanding button, expanded=false, and the stop beside it, outside the button: its own tab stop.
    expect([...line.querySelectorAll('button')].map((button) => button.className)).toEqual(['run-card-line-button', 'run-stop'])
    expect(lineButton().getAttribute('aria-expanded')).toBe('false')
    expect(lineButton().type).toBe('button')
    expect(lineButton().textContent).not.toMatch(/stop/i)
    expect(lineButton().querySelector('button')).toBeNull()
    expect(line.querySelector<HTMLButtonElement>('.run-stop')?.parentElement).toBe(line)
    // No reason yet: the field is absent, and nothing stands in for it.
    expect(line.querySelector('.run-card-line-reason')).toBeNull()
  })

  it('reads the reason of the last note, and not the section name beside it', async () => {
    await open()
    started('r1', 's-John', john, Date.now())
    prose('r1', 's-John', '## 1. Vision\n## 2. Context\n', Date.now())
    await act(frame)
    note('r1', 's-John', '- (decision) Fast path', Date.now())
    expect(lines()[0].querySelector('.run-card-line-reason')?.textContent).toBe('Fast path')
    note('r1', 's-John', '- (assumption) Two readers only', Date.now())
    expect(lines()[0].querySelector('.run-card-line-reason')?.textContent).toBe('Two readers only')
    expect(lines()[0].textContent).not.toContain('Context')
    expect(lines()).toHaveLength(1)
  })

  it('reads the section the text has shown before any note, and nothing before either', async () => {
    await open()
    started('r1', 's-John', john, Date.now())
    expect(lines()[0].querySelector('.run-card-line-reason')).toBeNull()

    prose('r1', 's-John', '## 1. Vision\n## 2. Context\n', Date.now())
    await act(frame)
    expect(lines()[0].querySelector('.run-card-line-reason')?.textContent).toBe('§2 Context')

    note('r1', 's-John', '- (decision) Fast path', Date.now())
    expect(lines()[0].querySelector('.run-card-line-reason')?.textContent).toBe('Fast path')
  })

  it('expands on a click into the full card, with focus on its container and not on a control, and spends the request', async () => {
    await open()
    started('r1', 's-John', john, Date.now())
    note('r1', 's-John', '- (decision) A long reason that the line cut off but the card keeps whole', Date.now())

    act(() => lineButton().click())
    expect(lines()).toHaveLength(0)
    expect(cards()).toHaveLength(1)
    const card = cards()[0]
    expect(card.closest('.thread')).not.toBeNull()
    expect(document.activeElement).toBe(card)
    expect(card.getAttribute('tabindex')).toBe('-1')
    expect(card.contains(document.activeElement) && document.activeElement?.tagName).toBe('SECTION')
    expect(card.querySelectorAll('.run-note-reason')[1]?.textContent).toContain('A long reason that the line cut off but the card keeps whole')
    expect(card.getAttribute('aria-busy')).toBe('true')

    // The card stays expanded for its run, and a later event moves no focus off it or onto anything.
    note('r1', 's-John', '- (note) Another', Date.now())
    expect(cards()).toHaveLength(1)
    expect(document.activeElement).toBe(cards()[0])
  })

  it('is one native button, so `Enter` and `Space` activate it as a click does: focused, it expands the same way', async () => {
    await open()
    started('r1', 's-John', john, Date.now())
    const button = lineButton()
    expect(button.tagName).toBe('BUTTON')
    button.focus()
    expect(document.activeElement).toBe(button)

    // A browser turns `Enter` and `Space` on a focused button into this click; no key code is handled by the line.
    act(() => button.click())
    expect(cards()).toHaveLength(1)
    expect(document.activeElement).toBe(cards()[0])
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

  it('draws the card as a line again when the persona is switched away from, unless the user expanded it', async () => {
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
    expect(lines()).toHaveLength(2)
    expect(cards()).toHaveLength(0)
    expect(document.activeElement).toBe(maryTile)
  })

  it('keeps a card the user expanded full when the persona is switched to and away from, taking no focus when it returns', async () => {
    await open()
    started('r1', 's-John', john, Date.now())
    act(() => lineButton().click())
    expect(document.activeElement).toBe(cards()[0])

    act(() => tile('John').click())
    await settle()
    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)
    expect(cards()).toHaveLength(1)

    const maryTile = tile('Mary')
    maryTile.focus()
    act(() => maryTile.click())
    await settle()
    expect(slot()).toBeNull()
    expect(lines()).toHaveLength(0)
    expect(cards()).toHaveLength(1)
    expect(cards()[0].closest('.thread')).not.toBeNull()
    // The card is drawn anew in the thread, and the request that expanded it is long spent.
    expect(document.activeElement).toBe(maryTile)
  })

  it('draws the terminal card in place of the line, with no focus moved, however the run ends', async () => {
    for (const name of ['run:finished', 'run:stopped', 'run:failed'] as const) {
      await open()
      started('r1', 's-John', john, Date.now())
      prose('r1', 's-John', '## 1. Vision\n', Date.now())
      expect(lines()).toHaveLength(1)
      field().focus()

      ended(name, 'r1', 's-John', Date.now())
      expect(lines()).toHaveLength(0)
      expect(cards()).toHaveLength(1)
      expect(cards()[0].closest('.thread')).not.toBeNull()
      expect(cards()[0].hasAttribute('aria-busy')).toBe(false)
      expect(cards()[0].querySelector('.run-card-status')?.textContent).toMatch(name === 'run:finished' ? /^saved/ : name === 'run:stopped' ? /^stopped$/ : /^failed$/)
      expect(document.activeElement).toBe(field())
      mounted?.unmount()
      mounted = null
      listeners = []
    }
  })

  it('names an orphan’s run by the id and draws a run with no agent id as a line without a name', async () => {
    await open()
    started('r1', 's-ghost', undefined, Date.now(), 'bmad-agent-ghost')
    started('r2', 's-none', undefined, Date.now())
    note('r2', 's-none', '- (note) Nobody’s run', Date.now())

    expect(lines()).toHaveLength(2)
    expect(cards()).toHaveLength(0)
    expect(lines()[0].querySelector('.run-card-line-name')?.textContent).toBe('bmad-agent-ghost')
    expect(lines()[1].querySelector('.run-card-line-name')).toBeNull()
    expect(lines()[1].querySelector('.run-card-line-reason')?.textContent).toBe('Nobody’s run')
    // Never pinned, since an orphan is never the current persona.
    expect(slot()).toBeNull()
  })

  it('names the run of a persona the roster lost by the name the transcript knew, and not by its id', async () => {
    await open()
    push({
      name: 'persona:said',
      payload: { sessionId: 's-Mary', agentId: mary.id, messageId: 'm1', text: 'Hello from Mary', at: 2 }
    })
    started('r1', 's-Mary', mary, Date.now())
    // Mary is viewed: her card is the pinned one.
    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)

    // The install loses her; her session and her run go on, and John is the viewed persona.
    act(() => installListeners.forEach((listener) => listener({ ...snapshot, revision: 2, agents: [john] })))
    expect(slot()).toBeNull()
    expect(cards()).toHaveLength(0)
    expect(lines()).toHaveLength(1)
    expect(lines()[0].querySelector('.run-card-line-name')?.textContent).toBe('Mary')
    expect(lines()[0].textContent).not.toContain(mary.id)
  })

  it('draws a run hydrated mid-flight as a line, or pinned, by the same rule', async () => {
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
          documents: []
        }
      ]
    })
    mounted = mount(createElement(App))
    await settle()
    await settle()

    expect(lines()).toHaveLength(1)
    expect(lines()[0].querySelector('.run-card-line-name')?.textContent).toBe('John')
    expect(lines()[0].querySelector('.run-card-line-reason')?.textContent).toBe('Hydrated reason')
    expect(cards()).toHaveLength(0)
    expect(slot()).toBeNull()

    act(() => tile('John').click())
    await settle()
    expect(slot()?.querySelectorAll('.run-card')).toHaveLength(1)
    expect(lines()).toHaveLength(0)
  })

  it('is no live region and carries no role, no title and no tooltip: its attributes are the section’s, the button’s and the hidden marks’', async () => {
    await open()
    started('r1', 's-John', john, Date.now())
    note('r1', 's-John', '- (decision) Fast path', Date.now())
    const line = lines()[0]
    expect(line.getAttributeNames().sort()).toEqual(['aria-busy', 'class'])
    const names = new Set([...line.querySelectorAll('*')].flatMap((element) => element.getAttributeNames()))
    expect([...names].sort()).toEqual(['aria-expanded', 'aria-hidden', 'aria-label', 'class', 'type'])

    act(() => lineButton().click())
    expect(cards()[0].querySelector('[role], [title]')).toBeNull()
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
    mounted = mount(createElement(App))
    await settle()
    await settle()
    push({ name: 'session:opened', payload: { sessionId: 's-Mary', agentId: mary.id, at: 1 } })
    push({ name: 'session:opened', payload: { sessionId: 's-John', agentId: john.id, at: 1 } })
  }

  it('draws one `stop` in the pinned card’s head and one on another persona’s line, each its own button named for what it stops', async () => {
    await open()
    started('r1', 's-Mary', mary, Date.now())
    started('r2', 's-John', john, Date.now())

    const pinned = stops(slot()!)
    expect(pinned).toHaveLength(1)
    expect(pinned[0].textContent).toBe('stop')
    expect(pinned[0].closest('.run-card-head')).not.toBeNull()
    expect(pinned[0].type).toBe('button')
    expect(pinned[0].disabled).toBe(false)
    const line = root().querySelector<HTMLElement>('.run-card-line')!
    expect(stops(line)).toHaveLength(1)
    expect(stops(line)[0].getAttribute('aria-label')).toBe('stop · John')
    // The line's stop is beside its expanding button, never inside it.
    expect(line.querySelector('.run-card-line-button .run-stop')).toBeNull()
    expect(stops()).toHaveLength(2)
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

  it('asks main to stop the run by its id from either control, and changes nothing on the screen', async () => {
    await open()
    started('r1', 's-Mary', mary, Date.now())
    started('r2', 's-John', john, Date.now())
    const before = root().innerHTML

    await act(async () => stops(slot()!)[0].click())
    await act(async () => stops(root().querySelector<HTMLElement>('.run-card-line')!)[0].click())

    expect(stopped).toEqual(['r1', 'r2'])
    // Nothing between the press and the run's own terminal event: no state, no line, no card change.
    expect(root().innerHTML).toBe(before)
    // The line's stop did not expand the line.
    expect(root().querySelectorAll('.run-card-line')).toHaveLength(1)
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
    expect(stops()).toHaveLength(3)

    push({ name: 'run:stopped', payload: { runId: 'r2', sessionId: 's-John', at: Date.now() } })
    push({ name: 'run:failed', payload: { runId: 'r1', sessionId: 's-Mary', error: { code: 'run/failed', message: 'failed' }, at: Date.now() } })
    expect(stops()).toHaveLength(1)
    push({ name: 'run:finished', payload: { runId: 'r3', sessionId: 's-Mary', at: Date.now() } })
    expect(stops()).toHaveLength(0)
    expect(root().querySelectorAll('.run-card')).toHaveLength(3)
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

  it('offers the stop on an orphan’s collapsed line and on its expanded card, found by run id, and leaves its header and close control in place', async () => {
    await open()
    push({
      name: 'persona:said',
      payload: { sessionId: 's-Mary', agentId: mary.id, messageId: 'm1', text: 'Hello from Mary', at: 2 }
    })
    started('r1', 's-Mary', mary, Date.now())
    // The install loses Mary: her session and her run go on, and John is the viewed persona.
    act(() => installListeners.forEach((listener) => listener({ ...snapshot, revision: 2, agents: [john] })))
    const line = root().querySelector<HTMLElement>('.run-card-line')!
    expect(line.querySelector('.run-card-line-name')?.textContent).toBe('Mary')
    expect(stops(line)).toHaveLength(1)
    expect(stops(line)[0].getAttribute('aria-label')).toBe('stop · Mary')

    await act(async () => stops(line)[0].click())
    expect(stopped).toEqual(['r1'])
    // A stop closes nothing: the header and its close control stay, and the line is still a line.
    expect(root().querySelectorAll('.orphan-head')).toHaveLength(1)
    expect(root().querySelectorAll('button.orphan-close')).toHaveLength(1)
    expect(closedSessions).toEqual([])
    expect(root().querySelectorAll('.run-card-line')).toHaveLength(1)

    // Expanded, the card carries it too, in its head, and it stops the same run.
    act(() => root().querySelector<HTMLButtonElement>('.run-card-line-button')?.click())
    expect(root().querySelectorAll('.run-card-line')).toHaveLength(0)
    const card = root().querySelector<HTMLElement>('.thread .run-card')!
    expect(stops(card)).toHaveLength(1)
    expect(stops(card)[0].closest('.run-card-head')).not.toBeNull()
    await act(async () => stops(card)[0].click())
    expect(stopped).toEqual(['r1', 'r1'])
    expect(root().querySelectorAll('.orphan-head')).toHaveLength(1)

    // The agent returns: the same session and card, the same control, and nothing else changed.
    act(() => installListeners.forEach((listener) => listener({ ...snapshot, revision: 3, agents: [mary, john] })))
    expect(root().querySelectorAll('.orphan-head')).toHaveLength(0)
    expect(root().querySelectorAll('.run-card')).toHaveLength(1)
    expect(stops()).toHaveLength(1)
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
      documents: [{ path: '_bmad/prd.md', callId: 'c', text: 'kept', written: 4, sections: [] }]
    })
    harness.getConversation = async () => ({
      entries: [],
      sessions: [],
      busy: [],
      personas: [],
      runs: [dead('d1', 'failed', mary), dead('d2', 'stopped', john), dead('d3', 'finished', mary)]
    })
    mounted = mount(createElement(App))
    await settle()
    await settle()

    expect(root().querySelectorAll('.run-card')).toHaveLength(3)
    expect(stops()).toHaveLength(0)
    expect(root().querySelectorAll('.run-card-line')).toHaveLength(0)
    expect(root().querySelector('.chat > .pinned')).toBeNull()
    expect([...root().querySelectorAll('.run-card-elapsed')].map((element) => element.textContent)).toEqual(['1m 05s', '1m 05s', '1m 05s'])
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

  /** Mary is current; John's run ran and ended, so its terminal card sits in the thread. */
  async function afterRun(runId = 'r1'): Promise<void> {
    mounted = mount(createElement(App))
    await settle()
    await settle()
    push({ name: 'session:opened', payload: { sessionId: 's-john', agentId: john.id, at: 1 } })
    push({ name: 'run:started', payload: { runId, sessionId: 's-john', agentId: john.id, code: 'CP', at: 2 } })
    push({ name: 'run:finished', payload: { runId, sessionId: 's-john', at: 3 } })
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
    push({ name: 'run:started', payload: { runId: 'r9', sessionId: 's-john', agentId: john.id, code: 'CP', at: 4 } })
    push({ name: 'run:finished', payload: { runId: 'r9', sessionId: 's-john', at: 5 } })
    expect(root().querySelectorAll('.thread .run-card')).toHaveLength(2)
    expect(scrolled).toEqual([])
  })

  it('scrolls the named card and no other when several have ended', async () => {
    await afterRun('r1')
    push({ name: 'run:started', payload: { runId: 'r2', sessionId: 's-john', agentId: john.id, code: 'CP', at: 4 } })
    push({ name: 'run:finished', payload: { runId: 'r2', sessionId: 's-john', at: 5 } })
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
    mounted = mount(createElement(App))
    await settle()
    await settle()
    push({ name: 'session:opened', payload: { sessionId: 's-mary', agentId: mary.id, at: 1 } })
    push({
      name: 'persona:said',
      payload: { sessionId: 's-mary', agentId: mary.id, messageId: 'm1', text: 'Hello', at: 2 }
    })

    click(partyButton())

    expect(party().hasAttribute('hidden')).toBe(false)
    expect(mounted.container.querySelector('.view-conversation')?.hasAttribute('hidden')).toBe(true)
    expect(party().querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
    expect(openButton()?.textContent).toBe('Open the room')
    // Both views stay mounted: the conversation is still there, and no session was closed by looking away.
    expect(mounted.container.querySelectorAll('.view-conversation .turn')).toHaveLength(1)
    expect(closedSessions).toEqual([])
  })

  it('asks for the room of the ticked cast when *Open the room* is pressed, and draws the room’s sysline in the party thread and never in the 1:1 thread', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
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
    expect(party().querySelector('.turn, .persona-tile')).toBeNull()
    // The cast the user chose is in the strip, one card each, nobody lit while the room awaits.
    expect([...party().querySelectorAll('.cast-card .cast-name')].map((name) => name.textContent)).toEqual(['Mary', 'John'])
    expect(party().querySelector('.cast-card--speaking')).toBeNull()
    expect(mounted.container.querySelector('.view-conversation')?.textContent).not.toContain('room opened by you')
    // The room has no tile, no state and no entry among the persona sessions.
    expect(mounted.container.querySelectorAll('.persona-tile')).toHaveLength(2)
    expect(opened).toEqual([])
  })

  it('lights the speaker’s card while the room is mid-turn, draws party turns for the room only, and takes a message with no gate (Story 4.2)', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
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
    expect(mounted.container.querySelector('.view-conversation')?.textContent ?? '').not.toContain('No.')

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

  it('wires the room’s topic, open time, turns and the rail’s rows into the header and the Room panel (Story 4.3)', async () => {
    const rows = [
      { path: '_bmad/planning-artifacts/prd.md', state: 'saved', savedAt: 1, owner: { agentId: john.id } },
      { path: '_bmad/party/earlier.md', state: 'saved', savedAt: 1, room: true }
    ]
    ;(window.harness as unknown as { getRail: () => Promise<unknown> }).getRail = async () => ({ revision: 2, rows })
    mounted = mount(createElement(App))
    await settle()
    await settle()
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
    mounted = mount(createElement(App))
    await settle()
    await settle()
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
    mounted = mount(createElement(App))
    await settle()
    await settle()
    push({ name: 'session:opened', payload: { sessionId: 'r1', at: 1 } })
    expect(openButton()).toBeNull()

    push({ name: 'session:closed', payload: { sessionId: 'r1', reason: 'process-exited', at: 2 } })

    expect(openButton()).not.toBeNull()
  })

  it('stops the room with `stop room`: the session closes, the thread stays with the stop line above the chooser, and only *End session* clears it (Story 4.5)', async () => {
    mounted = mount(createElement(App))
    await settle()
    await settle()
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
    const endButton = [...mounted.container.querySelectorAll('.topbar button')].find((button) => button.textContent === 'End session') as HTMLButtonElement
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
    mounted = mount(createElement(App))
    await settle()
    await settle()
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
    ;(window.harness as unknown as { getRail: () => Promise<unknown> }).getRail = async () => ({ revision: 2, rows })
    mounted.unmount()
    mounted = mount(createElement(App))
    await settle()
    await settle()

    const owners = [...mounted.container.querySelectorAll('.output-row-owner')]
    expect(owners.map((owner) => [owner.textContent, owner.classList.contains('output-row-owner--room')])).toEqual([
      ['the room', true],
      ['John', false]
    ])
  })
})
