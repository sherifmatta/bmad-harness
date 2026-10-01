// @vitest-environment jsdom
import { createElement } from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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
      return `session-of-${agentId}`
    },
    sendTurn: async (sessionId: string, text: string) => {
      sent.push([sessionId, text])
    },
    onSessionEvent: () => () => {}
  }
  Object.defineProperty(window, 'harness', { value: bridge, configurable: true, writable: true })
}

beforeEach(() => {
  mounted = null
  opened = []
  sent = []
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
})
