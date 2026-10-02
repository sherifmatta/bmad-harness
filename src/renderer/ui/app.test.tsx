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
let sent: [string, string][]
let ended: string[]
let listeners: ((event: ContractEvent) => void)[]
/** The sysline main answers the next open with, one per open, `undefined` for none. */
let handoffs: (SyslineRecord | undefined)[]

function installBridge(): void {
  const bridge = {
    getProjectPath: async () => '/work/falcon',
    getInstall: async () => snapshot,
    onInstallChanged: () => () => {},
    getBranch: async () => 'main',
    getRail: async () => ({ revision: 1, rows: [] }),
    onRailChanged: () => () => {},
    openDoc: async () => {},
    onDocClosed: () => () => {},
    openSession: async (agentId: string) => {
      opened.push(agentId)
      const handoff = handoffs.shift()
      return handoff === undefined
        ? { sessionId: `session-of-${agentId}` }
        : { sessionId: `session-of-${agentId}`, handoff }
    },
    sendTurn: async (sessionId: string, text: string) => {
      sent.push([sessionId, text])
    },
    getConversation: async () => ({ entries: [], sessions: [], busy: [], personas: [] }),
    endConversation: async (projectId: string) => {
      ended.push(projectId)
    },
    onSessionEvent: (listener: (event: ContractEvent) => void) => {
      listeners.push(listener)
      return () => {}
    }
  }
  Object.defineProperty(window, 'harness', { value: bridge, configurable: true, writable: true })
}

beforeEach(() => {
  mounted = null
  opened = []
  sent = []
  ended = []
  listeners = []
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
