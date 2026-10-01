// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ContractEvent } from '../../../shared/events'
import type { AgentView } from '../../../shared/install'
import { inAct, renderHook, settle } from '../testing/render-hook'
import type { MountedHook } from '../testing/render-hook'
import { createConversation, useConversation } from './use-conversation'
import type { ConversationBridge } from './use-conversation'

const mary: AgentView = {
  id: 'bmad-agent-analyst',
  module: 'bmm',
  name: 'Mary',
  title: 'Analyst',
  icon: 'i',
  description: 'd'
}
const john: AgentView = { ...mary, id: 'bmad-agent-pm', name: 'John', title: 'Product Manager' }
const agents = [mary, john]

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

class FakeBridge implements ConversationBridge {
  opens: string[] = []
  sends: [string, string][] = []
  listeners = new Set<(event: ContractEvent) => void>()
  openResult: Deferred<string>[] = []
  /** What the next send answers; one entry is consumed per send. */
  sendResults: (Promise<void> | undefined)[] = []

  openSession(agentId: string): Promise<string> {
    this.opens.push(agentId)
    const pending = deferred<string>()
    this.openResult.push(pending)
    return pending.promise
  }
  sendTurn(sessionId: string, text: string): Promise<void> {
    this.sends.push([sessionId, text])
    return this.sendResults.shift() ?? Promise.resolve()
  }
  onSessionEvent(listener: (event: ContractEvent) => void): () => void {
    this.listeners.add(listener)
    return () => void this.listeners.delete(listener)
  }
  push(event: ContractEvent): void {
    for (const listener of [...this.listeners]) listener(event)
  }
}

const opened = (sessionId: string, agentId: string): ContractEvent => ({
  name: 'session:opened',
  payload: { sessionId, agentId, at: 1 }
})
const awaiting = (sessionId: string): ContractEvent => ({
  name: 'session:awaiting-turn',
  payload: { sessionId, at: 2 }
})
const said = (agentId: string, messageId: string, text: string): ContractEvent => ({
  name: 'persona:said',
  payload: { sessionId: 's1', agentId, messageId, text, at: 3 }
})
const busy = (): Promise<void> => Promise.reject({ code: 'session/busy', message: 'session · busy' })

let bridge: FakeBridge
let clock: number

function build() {
  const published: { entries: readonly unknown[] }[] = []
  const failures: unknown[] = []
  const conversation = createConversation({
    bridge,
    agentOf: (id) => agents.find((agent) => agent.id === id),
    now: () => (clock += 1),
    publish: (state) => void published.push(state),
    onFailure: (error) => void failures.push(error)
  })
  return { conversation, published, failures, last: () => published[published.length - 1] }
}

beforeEach(() => {
  bridge = new FakeBridge()
  clock = 100
})

describe('activate', () => {
  it('opens the persona’s session once, however often the tile is selected while it opens or after', async () => {
    const { conversation } = build()
    conversation.connect()
    conversation.activate(mary.id)
    conversation.activate(mary.id)
    expect(bridge.opens).toEqual([mary.id])

    bridge.openResult[0].resolve('s1')
    await settle()
    conversation.activate(mary.id)
    expect(bridge.opens).toEqual([mary.id])

    conversation.activate(john.id)
    expect(bridge.opens).toEqual([mary.id, john.id])
  })

  it('shows a refused open as the envelope, and tries again on the next selection', async () => {
    const { conversation, failures } = build()
    conversation.activate(mary.id)
    bridge.openResult[0].reject({
      code: 'session/spawn-failed',
      message: 'session · could not start the session',
      detail: 'ENOENT'
    })
    await settle()

    expect(failures.filter((failure) => failure !== null)).toEqual([
      { code: 'session/spawn-failed', message: 'session · could not start the session', detail: 'ENOENT' }
    ])
    conversation.activate(mary.id)
    expect(bridge.opens).toEqual([mary.id, mary.id])
  })
})

describe('events', () => {
  it('turn persona:said into the persona’s own turns, joined by message', () => {
    const { conversation, last } = build()
    conversation.connect()
    bridge.push(said(mary.id, 'm1', 'Hel'))
    bridge.push(said(mary.id, 'm1', 'lo'))

    expect(last().entries).toMatchObject([{ kind: 'persona', agent: mary, text: 'Hello' }])
  })

  it('stop listening and publishing once disconnected', () => {
    const { conversation, published } = build()
    const disconnect = conversation.connect()
    disconnect()

    expect(bridge.listeners.size).toBe(0)
    conversation.send(mary.id, 'x')
    expect(published).toEqual([])
  })
})

describe('send to a persona with a session', () => {
  it('shows the user turn at once and writes the text to that session', async () => {
    const { conversation, last } = build()
    conversation.connect()
    bridge.push(opened('s1', mary.id))
    bridge.push(awaiting('s1'))
    conversation.send(mary.id, 'hello')

    expect(last().entries).toEqual([{ kind: 'user', id: 'entry-0', at: 101, text: 'hello' }])
    expect(bridge.sends).toEqual([['s1', 'hello']])
    expect(bridge.opens).toEqual([])
  })

  it('shows a send refused as busy as the envelope, without retrying it', async () => {
    const { conversation, failures } = build()
    conversation.connect()
    bridge.push(opened('s1', mary.id))
    bridge.sendResults.push(busy())
    conversation.send(mary.id, 'too soon')
    await settle()

    expect(failures.filter((failure) => failure !== null)).toEqual([
      { code: 'session/busy', message: 'session · busy' }
    ])
    expect(bridge.sends).toEqual([['s1', 'too soon']])
    bridge.push(awaiting('s1'))
    expect(bridge.sends).toEqual([['s1', 'too soon']])
  })
})

describe('send to a persona with no session', () => {
  it('opens the session, shows the turn, and writes the text after the activation turn ends', async () => {
    const { conversation, last } = build()
    conversation.connect()
    conversation.send(john.id, 'hello john')

    expect(bridge.opens).toEqual([john.id])
    expect(last().entries).toMatchObject([{ kind: 'user', text: 'hello john' }])
    expect(bridge.sends).toEqual([])

    // The session comes up and its activation turn is in flight: the open
    // reply tries the text, and the session says busy.
    bridge.push(opened('s7', john.id))
    bridge.sendResults.push(busy())
    bridge.openResult[0].resolve('s7')
    await settle()
    expect(bridge.sends).toEqual([['s7', 'hello john']])

    // The persona's greeting, then the end of that turn: the text goes now, once.
    bridge.push(said(john.id, 'm1', 'Hi!'))
    bridge.push(awaiting('s7'))
    expect(bridge.sends).toEqual([
      ['s7', 'hello john'],
      ['s7', 'hello john']
    ])
    bridge.push(awaiting('s7'))
    expect(bridge.sends).toHaveLength(2)
  })

  it('delivers on awaiting-turn alone when the event beats the open reply', async () => {
    const { conversation } = build()
    conversation.connect()
    conversation.send(john.id, 'hello john')
    bridge.push(opened('s7', john.id))
    bridge.push(awaiting('s7'))
    expect(bridge.sends).toEqual([['s7', 'hello john']])

    bridge.openResult[0].resolve('s7')
    await settle()
    expect(bridge.sends).toEqual([['s7', 'hello john']])
  })

  it('sends at once when the session was already live and idle, as after a window reload', async () => {
    const { conversation } = build()
    conversation.connect()
    conversation.send(john.id, 'hello again')
    bridge.openResult[0].resolve('s7')
    await settle()

    expect(bridge.sends).toEqual([['s7', 'hello again']])
  })

  it('refuses a second message while the first still waits, without showing it as a turn', async () => {
    const { conversation, failures, last } = build()
    conversation.connect()
    conversation.send(john.id, 'one')
    conversation.send(john.id, 'two')
    await settle()

    expect(last().entries).toMatchObject([{ text: 'one' }])
    expect(failures.at(-1)).toEqual({
      code: 'session/waiting',
      message: 'session · a message is already waiting'
    })
    expect(bridge.opens).toEqual([john.id])
  })
})

describe('a message waiting on a session that is lost', () => {
  it('is dropped when the open is refused, so the next send tries the open again, and the failure still shows', async () => {
    const { conversation, failures, last } = build()
    conversation.connect()
    conversation.send(john.id, 'one')
    bridge.openResult[0].reject({ code: 'session/spawn-failed', message: 'session · could not start the session' })
    await settle()

    expect(failures.at(-1)).toMatchObject({ code: 'session/spawn-failed' })
    conversation.send(john.id, 'two')

    expect(bridge.opens).toEqual([john.id, john.id])
    expect(failures.at(-1)).toBeNull()
    expect(last().entries).toMatchObject([{ text: 'one' }, { text: 'two' }])
  })

  it('is dropped on session:closed, and never sent to a later session', async () => {
    const { conversation } = build()
    conversation.connect()
    conversation.send(john.id, 'stale')
    bridge.push(opened('s7', john.id))
    bridge.push({ name: 'session:closed', payload: { sessionId: 's7', reason: 'process-exited', at: 3 } })
    bridge.push(opened('s8', john.id))
    bridge.push(awaiting('s8'))

    expect(bridge.sends).toEqual([])
    conversation.send(john.id, 'fresh')
    expect(bridge.sends).toEqual([['s8', 'fresh']])
  })
})

describe('useConversation', () => {
  let hook: MountedHook<ReturnType<typeof useConversation>> | null

  function install(value: unknown): void {
    Object.defineProperty(window, 'harness', { value, configurable: true, writable: true })
  }

  afterEach(() => {
    hook?.unmount()
    hook = null
    install(undefined)
  })

  it('does nothing and throws nothing when the preload has no session methods', () => {
    install({})
    hook = renderHook(() => useConversation(agents))

    expect(() => hook?.current.activate(mary.id)).not.toThrow()
    expect(() => hook?.current.send(mary.id, 'x')).not.toThrow()
    expect(hook.current.entries).toEqual([])
    expect(hook.current.failure).toBeNull()
  })

  it('subscribes on mount, renders pushed speech and sends, and unsubscribes on unmount', async () => {
    install(bridge)
    hook = renderHook(() => useConversation(agents))
    expect(bridge.listeners.size).toBe(1)

    inAct(() => bridge.push(said(mary.id, 'm1', 'Hello')))
    expect(hook.current.entries).toMatchObject([{ kind: 'persona', agent: mary, text: 'Hello' }])

    inAct(() => hook?.current.activate(john.id))
    expect(bridge.opens).toEqual([john.id])
    inAct(() => hook?.current.send(john.id, 'hi'))
    expect(hook.current.entries).toHaveLength(2)

    hook.unmount()
    expect(bridge.listeners.size).toBe(0)
    hook = null
  })
})
