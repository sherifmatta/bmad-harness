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
const john: AgentView = {
  ...mary,
  id: 'bmad-agent-pm',
  name: 'John',
  title: 'Product Manager'
}
const agents = [mary, john]

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}
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
const busy = (): Promise<void> =>
  Promise.reject({ code: 'session/busy', message: 'session · busy' })

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
  return {
    conversation,
    published,
    failures,
    last: () => published[published.length - 1]
  }
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
      {
        code: 'session/spawn-failed',
        message: 'session · could not start the session',
        detail: 'ENOENT'
      }
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

const userTurns = (state: { entries: readonly unknown[] }) =>
  state.entries.filter((entry) => (entry as { kind: string }).kind === 'user')

describe('send to a persona whose session is idle', () => {
  it('shows a plain user turn at once, writes the text to that session, and makes it busy', () => {
    const { conversation, last, failures } = build()
    conversation.connect()
    bridge.push(opened('s1', mary.id))
    bridge.push(awaiting('s1'))
    conversation.send(mary.id, 'hello')

    expect(last().entries).toEqual([{ kind: 'user', id: 'entry-0', at: 101, text: 'hello' }])
    expect(bridge.sends).toEqual([['s1', 'hello']])
    expect(bridge.opens).toEqual([])

    conversation.send(mary.id, 'again')
    expect(bridge.sends).toEqual([['s1', 'hello']])
    expect(failures.filter((failure) => failure !== null)).toEqual([])
  })

  it('clears busy and shows the envelope when the write is refused, so the next send is written', async () => {
    const { conversation, failures, last } = build()
    conversation.connect()
    bridge.push(opened('s1', mary.id))
    bridge.push(awaiting('s1'))
    bridge.sendResults.push(
      Promise.reject({
        code: 'session/write-failed',
        message: 'session · the turn could not be written'
      })
    )
    conversation.send(mary.id, 'lost')
    await settle()

    expect(failures.filter((failure) => failure !== null)).toEqual([
      {
        code: 'session/write-failed',
        message: 'session · the turn could not be written'
      }
    ])
    conversation.send(mary.id, 'next')
    expect(bridge.sends).toEqual([
      ['s1', 'lost'],
      ['s1', 'next']
    ])
    expect(userTurns(last())).toHaveLength(2)
  })
})

describe('send while a turn is in flight', () => {
  it('shows a queued user turn in the same commit and transmits nothing', () => {
    const { conversation, published, last } = build()
    conversation.connect()
    bridge.push(opened('s1', mary.id))
    const before = published.length
    conversation.send(mary.id, 'too soon')

    // One commit carries the send: the entry is there, queued, in it.
    expect(published).toHaveLength(before + 1)
    expect(last().entries).toEqual([
      {
        kind: 'user',
        id: 'entry-0',
        at: 101,
        text: 'too soon',
        queuedFor: 'Mary'
      }
    ])
    expect(bridge.sends).toEqual([])
  })

  it('sends queued messages first in first, one per awaiting-turn, un-dimming each in place', () => {
    const { conversation, last } = build()
    conversation.connect()
    bridge.push(opened('s1', mary.id))
    conversation.send(mary.id, 'one')
    conversation.send(mary.id, 'two')

    bridge.push(awaiting('s1'))
    expect(bridge.sends).toEqual([['s1', 'one']])
    expect(last().entries).toMatchObject([
      { id: 'entry-0', text: 'one' },
      { id: 'entry-1', text: 'two', queuedFor: 'Mary' }
    ])
    expect(last().entries[0]).not.toHaveProperty('queuedFor')

    bridge.push(awaiting('s1'))
    expect(bridge.sends).toEqual([
      ['s1', 'one'],
      ['s1', 'two']
    ])
    bridge.push(awaiting('s1'))
    expect(bridge.sends).toHaveLength(2)
  })

  it('removes a cancelled message and never sends it, leaving later sends unaffected', () => {
    const { conversation, last } = build()
    conversation.connect()
    bridge.push(opened('s1', mary.id))
    conversation.send(mary.id, 'one')
    conversation.send(mary.id, 'two')
    conversation.cancel('entry-0')

    expect(last().entries).toMatchObject([{ id: 'entry-1', text: 'two' }])
    bridge.push(awaiting('s1'))
    expect(bridge.sends).toEqual([['s1', 'two']])
    expect(bridge.opens).toEqual([])
  })

  it('writes nothing to main when a message is cancelled', () => {
    const { conversation } = build()
    conversation.connect()
    bridge.push(opened('s1', mary.id))
    conversation.send(mary.id, 'one')
    conversation.cancel('entry-0')
    bridge.push(awaiting('s1'))

    expect(bridge.sends).toEqual([])
  })

  it('puts a message main refused as busy back at the head of the queue, queued again, with no error', async () => {
    const { conversation, failures, last } = build()
    conversation.connect()
    bridge.push(opened('s1', mary.id))
    conversation.send(mary.id, 'one')
    conversation.send(mary.id, 'two')
    bridge.sendResults.push(busy())
    bridge.push(awaiting('s1'))
    await settle()

    expect(failures.filter((failure) => failure !== null)).toEqual([])
    expect(last().entries).toMatchObject([
      { text: 'one', queuedFor: 'Mary' },
      { text: 'two', queuedFor: 'Mary' }
    ])
    bridge.push(awaiting('s1'))
    expect(bridge.sends).toEqual([
      ['s1', 'one'],
      ['s1', 'one']
    ])
    bridge.push(awaiting('s1'))
    expect(bridge.sends).toEqual([
      ['s1', 'one'],
      ['s1', 'one'],
      ['s1', 'two']
    ])
  })

  it('lets another persona’s idle session take a send at once', () => {
    const { conversation } = build()
    conversation.connect()
    bridge.push(opened('s1', mary.id))
    bridge.push(opened('s2', john.id))
    bridge.push(awaiting('s2'))
    conversation.send(mary.id, 'to mary')
    conversation.send(john.id, 'to john')

    expect(bridge.sends).toEqual([['s2', 'to john']])
  })
})

describe('send to a persona with no session', () => {
  it('opens the session, shows the turn queued, and writes it after the activation turn ends', async () => {
    const { conversation, last } = build()
    conversation.connect()
    conversation.send(john.id, 'hello john')

    expect(bridge.opens).toEqual([john.id])
    expect(last().entries).toMatchObject([{ kind: 'user', text: 'hello john', queuedFor: 'John' }])
    expect(bridge.sends).toEqual([])

    // The session comes up and its activation turn is in flight: nothing is
    // sent into it, so nothing is refused.
    bridge.push(opened('s7', john.id))
    bridge.openResult[0].resolve('s7')
    await settle()
    expect(bridge.sends).toEqual([])

    bridge.push(said(john.id, 'm1', 'Hi!'))
    bridge.push(awaiting('s7'))
    expect(bridge.sends).toEqual([['s7', 'hello john']])
    expect(last().entries[0]).not.toHaveProperty('queuedFor')
    bridge.push(awaiting('s7'))
    expect(bridge.sends).toHaveLength(1)
  })

  it('sends on awaiting-turn alone when the event beats the open reply', async () => {
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
    const { conversation, last } = build()
    conversation.connect()
    conversation.send(john.id, 'hello again')
    bridge.openResult[0].resolve('s7')
    await settle()

    expect(bridge.sends).toEqual([['s7', 'hello again']])
    expect(last().entries[0]).not.toHaveProperty('queuedFor')
  })

  it('queues a second message behind the first rather than refusing it', async () => {
    const { conversation, failures, last } = build()
    conversation.connect()
    conversation.send(john.id, 'one')
    conversation.send(john.id, 'two')

    expect(last().entries).toMatchObject([
      { text: 'one', queuedFor: 'John' },
      { text: 'two', queuedFor: 'John' }
    ])
    expect(failures.filter((failure) => failure !== null)).toEqual([])
    expect(bridge.opens).toEqual([john.id])

    bridge.push(opened('s7', john.id))
    bridge.push(awaiting('s7'))
    bridge.push(awaiting('s7'))
    expect(bridge.sends).toEqual([
      ['s7', 'one'],
      ['s7', 'two']
    ])
  })
})

describe('messages waiting on a session that is lost', () => {
  it('are dropped with their entries when the open is refused, and the failure still shows', async () => {
    const { conversation, failures, last } = build()
    conversation.connect()
    conversation.send(john.id, 'one')
    bridge.openResult[0].reject({
      code: 'session/spawn-failed',
      message: 'session · could not start the session'
    })
    await settle()

    expect(failures.at(-1)).toMatchObject({ code: 'session/spawn-failed' })
    expect(last().entries).toEqual([])
    conversation.send(john.id, 'two')

    expect(bridge.opens).toEqual([john.id, john.id])
    expect(failures.at(-1)).toBeNull()
    expect(last().entries).toMatchObject([{ text: 'two' }])
  })

  it('are dropped with their entries on session:closed, and never sent to a later session', async () => {
    const { conversation, last } = build()
    conversation.connect()
    conversation.send(john.id, 'stale')
    bridge.push(opened('s7', john.id))
    bridge.push({
      name: 'session:closed',
      payload: { sessionId: 's7', reason: 'process-exited', at: 3 }
    })
    expect(last().entries).toEqual([])
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
    Object.defineProperty(window, 'harness', {
      value,
      configurable: true,
      writable: true
    })
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
    expect(() => hook?.current.cancel('entry-0')).not.toThrow()
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
    expect(hook.current.entries[1]).toMatchObject({ queuedFor: 'John' })
    inAct(() => hook?.current.cancel(hook.current.entries[1].id))
    expect(hook.current.entries).toHaveLength(1)

    hook.unmount()
    expect(bridge.listeners.size).toBe(0)
    hook = null
  })
})
