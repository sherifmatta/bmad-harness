// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ConversationSnapshot, OpenedSession, SyslineRecord } from '../../../shared/conversation'
import type { ContractEvent } from '../../../shared/events'
import type { AgentView } from '../../../shared/install'
import { inAct, renderHook, settle } from '../testing/render-hook'
import type { MountedHook } from '../testing/render-hook'
import { createProseStore } from './prose-store'
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

const EMPTY: ConversationSnapshot = { entries: [], sessions: [], busy: [], personas: [], runs: [] }

class FakeBridge implements ConversationBridge {
  opens: string[] = []
  sends: [string, string][] = []
  listeners = new Set<(event: ContractEvent) => void>()
  openResult: Deferred<string>[] = []
  /** What the next send answers; one entry is consumed per send. */
  sendResults: (Promise<void> | undefined)[] = []
  /** What the connecting read answers: the empty conversation unless a test says otherwise. */
  conversation: Promise<ConversationSnapshot> = Promise.resolve(EMPTY)
  reads = 0
  ends: string[] = []
  /** What the next end answers; one entry is consumed per end. */
  endResults: (Promise<void> | undefined)[] = []

  /** The sysline the open at this position answers with, if any; one entry is read per open. */
  handoffs: (SyslineRecord | undefined)[] = []

  openSession(agentId: string): Promise<OpenedSession> {
    const handoff = this.handoffs[this.opens.length]
    this.opens.push(agentId)
    const pending = deferred<string>()
    this.openResult.push(pending)
    return pending.promise.then((sessionId) =>
      handoff === undefined ? { sessionId } : { sessionId, handoff }
    )
  }
  closed: string[] = []
  /** What the next close answers; one entry is consumed per close. */
  closeResults: (Promise<void> | undefined)[] = []
  closeSession(sessionId: string): Promise<void> {
    this.closed.push(sessionId)
    return this.closeResults.shift() ?? Promise.resolve()
  }
  sendTurn(sessionId: string, text: string): Promise<void> {
    this.sends.push([sessionId, text])
    return this.sendResults.shift() ?? Promise.resolve()
  }
  dispatches: [string, string][] = []
  /** What the next dispatch answers; one entry is consumed per dispatch. */
  dispatchResults: (Promise<string> | undefined)[] = []
  dispatchMenu(sessionId: string, code: string): Promise<string> {
    this.dispatches.push([sessionId, code])
    return this.dispatchResults.shift() ?? Promise.resolve('r1')
  }
  getConversation(): Promise<ConversationSnapshot> {
    this.reads += 1
    return this.conversation
  }
  endConversation(projectId: string): Promise<void> {
    this.ends.push(projectId)
    return this.endResults.shift() ?? Promise.resolve()
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
const personaState = (agentId: string, state: 'work' | 'idle', at: number): ContractEvent => ({
  name: 'persona:state',
  payload: { agentId, state, at }
})
const busy = (): Promise<void> =>
  Promise.reject({ code: 'session/busy', message: 'session · busy' })

let bridge: FakeBridge
let clock: number

function build() {
  const published: {
    entries: readonly unknown[]
    personas: ReadonlyMap<string, { state: string; at: number }>
  }[] = []
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

/** Connect and let main's snapshot arrive, as every window does before it is used. */
async function connected(conversation: { connect(): () => void }): Promise<() => void> {
  const stop = conversation.connect()
  await settle()
  return stop
}

beforeEach(() => {
  bridge = new FakeBridge()
  clock = 100
})

describe('activate', () => {
  it('opens idempotently, with one open in flight per persona, and asks main again for a persona that is already live', async () => {
    const { conversation } = build()
    await connected(conversation)
    conversation.activate(mary.id)
    conversation.activate(mary.id)
    expect(bridge.opens).toEqual([mary.id])

    bridge.openResult[0].resolve('s1')
    await settle()
    // Live now, and still an open: main is what notices a switch back to a persona.
    conversation.activate(mary.id)
    expect(bridge.opens).toEqual([mary.id, mary.id])
    bridge.openResult[1].resolve('s1')
    await settle()

    conversation.activate(john.id)
    expect(bridge.opens).toEqual([mary.id, mary.id, john.id])
  })

  it('resolves once the open has settled, whether it opened or was refused', async () => {
    const { conversation } = build()
    await connected(conversation)
    const settled: string[] = []
    void conversation.activate(mary.id).then(() => settled.push('mary'))
    void conversation.activate(john.id).then(() => settled.push('john'))
    await settle()
    expect(settled).toEqual([])

    bridge.openResult[0].resolve('s1')
    bridge.openResult[1].reject({ code: 'session/spawn-failed', message: 'session · could not start the session' })
    await settle()
    expect(settled).toEqual(['mary', 'john'])
  })

  it('waits for the snapshot before asking, then asks, and resolves after', async () => {
    const pending = deferred<ConversationSnapshot>()
    bridge.conversation = pending.promise
    const { conversation } = build()
    conversation.connect()
    const settled: string[] = []
    void conversation.activate(mary.id).then(() => settled.push('mary'))
    expect(bridge.opens).toEqual([])

    pending.resolve(EMPTY)
    await settle()
    expect(bridge.opens).toEqual([mary.id])
    expect(settled).toEqual([])
    bridge.openResult[0].resolve('s1')
    await settle()
    expect(settled).toEqual(['mary'])
  })

  it('folds the handoff the open answers with once, after what came before, and announces it once', async () => {
    const handoff: SyslineRecord = { kind: 'sysline', id: 'm-4', at: 150, text: 'handed off · Mary → John' }
    bridge.handoffs = [undefined, handoff]
    const announced: SyslineRecord[] = []
    const published: { entries: readonly unknown[] }[] = []
    const conversation = createConversation({
      bridge,
      agentOf: (id) => agents.find((agent) => agent.id === id),
      now: () => (clock += 1),
      publish: (state) => void published.push(state),
      onFailure: () => {},
      onHandoff: (record) => void announced.push(record)
    })
    await connected(conversation)
    void conversation.activate(mary.id)
    bridge.openResult[0].resolve('s1')
    await settle()
    bridge.push(said(mary.id, 'm1', 'Hello'))

    void conversation.activate(john.id)
    bridge.openResult[1].resolve('s2')
    await settle()

    const entries = published[published.length - 1].entries
    expect(entries).toMatchObject([
      { kind: 'persona', text: 'Hello' },
      { kind: 'sysline', id: 'm-4', at: 150, text: 'handed off · Mary → John' }
    ])
    expect(announced).toEqual([handoff])
  })

  it('does not fold or announce a handoff for an open that outlived the conversation', async () => {
    const handoff: SyslineRecord = { kind: 'sysline', id: 'm-4', at: 150, text: 'handed off · Mary → John' }
    bridge.handoffs = [handoff]
    const announced: SyslineRecord[] = []
    const published: { entries: readonly unknown[] }[] = []
    const conversation = createConversation({
      bridge,
      agentOf: (id) => agents.find((agent) => agent.id === id),
      now: () => (clock += 1),
      publish: (state) => void published.push(state),
      onFailure: () => {},
      onHandoff: (record) => void announced.push(record)
    })
    await connected(conversation)
    void conversation.activate(john.id)
    await conversation.end('/work/falcon')
    bridge.openResult[0].resolve('s2')
    await settle()

    expect(published[published.length - 1].entries).toEqual([])
    expect(announced).toEqual([])
  })

  it('shows a refused open as the envelope, and tries again on the next selection', async () => {
    const { conversation, failures } = build()
    await connected(conversation)
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
  it('turn persona:said into the persona’s own turns, joined by message', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    bridge.push(said(mary.id, 'm1', 'Hel'))
    bridge.push(said(mary.id, 'm1', 'lo'))

    expect(last().entries).toMatchObject([{ kind: 'persona', agent: mary, text: 'Hello' }])
  })

  it('keep the last persona:state per persona, as main reported it, and leave the transcript alone', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    bridge.push(personaState(mary.id, 'work', 100))
    bridge.push(personaState(john.id, 'work', 110))
    bridge.push(personaState(mary.id, 'idle', 120))

    expect([...last().personas]).toEqual([
      [mary.id, { state: 'idle', at: 120 }],
      [john.id, { state: 'work', at: 110 }]
    ])
    expect(last().entries).toEqual([])
  })

  it('set no state of their own: opening, sending and activating report nothing until main does', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    conversation.activate(mary.id)
    bridge.push(opened('s1', mary.id))
    conversation.send(mary.id, 'hi')

    expect(last().personas.size).toBe(0)
  })

  it('stop listening and publishing once disconnected', async () => {
    const { conversation, published } = build()
    const disconnect = await connected(conversation)
    const before = published.length
    disconnect()

    expect(bridge.listeners.size).toBe(0)
    conversation.send(mary.id, 'x')
    expect(published).toHaveLength(before)
  })
})

const userTurns = (state: { entries: readonly unknown[] }) =>
  state.entries.filter((entry) => (entry as { kind: string }).kind === 'user')

describe('send to a persona whose session is idle', () => {
  it('shows a plain user turn at once, writes the text to that session, and makes it busy', async () => {
    const { conversation, last, failures } = build()
    await connected(conversation)
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
    await connected(conversation)
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
  it('shows a queued user turn in the same commit and transmits nothing', async () => {
    const { conversation, published, last } = build()
    await connected(conversation)
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

  it('sends queued messages first in first, one per awaiting-turn, un-dimming each in place', async () => {
    const { conversation, last } = build()
    await connected(conversation)
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

  it('removes a cancelled message and never sends it, leaving later sends unaffected', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    bridge.push(opened('s1', mary.id))
    conversation.send(mary.id, 'one')
    conversation.send(mary.id, 'two')
    conversation.cancel('entry-0')

    expect(last().entries).toMatchObject([{ id: 'entry-1', text: 'two' }])
    bridge.push(awaiting('s1'))
    expect(bridge.sends).toEqual([['s1', 'two']])
    expect(bridge.opens).toEqual([])
  })

  it('writes nothing to main when a message is cancelled', async () => {
    const { conversation } = build()
    await connected(conversation)
    bridge.push(opened('s1', mary.id))
    conversation.send(mary.id, 'one')
    conversation.cancel('entry-0')
    bridge.push(awaiting('s1'))

    expect(bridge.sends).toEqual([])
  })

  it('puts a message main refused as busy back at the head of the queue, queued again, with no error', async () => {
    const { conversation, failures, last } = build()
    await connected(conversation)
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

  it('lets another persona’s idle session take a send at once', async () => {
    const { conversation } = build()
    await connected(conversation)
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
    await connected(conversation)
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
    await connected(conversation)
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
    await connected(conversation)
    conversation.send(john.id, 'hello again')
    bridge.openResult[0].resolve('s7')
    await settle()

    expect(bridge.sends).toEqual([['s7', 'hello again']])
    expect(last().entries[0]).not.toHaveProperty('queuedFor')
  })

  it('queues a second message behind the first rather than refusing it', async () => {
    const { conversation, failures, last } = build()
    await connected(conversation)
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
    await connected(conversation)
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

  it('are dropped with their entries when the user closes the session, and never sent to a later session', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    conversation.send(john.id, 'stale')
    bridge.push(opened('s7', john.id))
    bridge.push({
      name: 'session:closed',
      payload: { sessionId: 's7', reason: 'closed', at: 3 }
    })
    expect(last().entries).toEqual([])
    bridge.push(opened('s8', john.id))
    bridge.push(awaiting('s8'))

    expect(bridge.sends).toEqual([])
    conversation.send(john.id, 'fresh')
    expect(bridge.sends).toEqual([['s8', 'fresh']])
  })

  it('are kept when the process exits on its own, shown as queued, and sent first to the next session', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    conversation.send(john.id, 'kept')
    bridge.push(opened('s7', john.id))
    bridge.push({
      name: 'session:closed',
      payload: { sessionId: 's7', reason: 'process-exited', at: 3 }
    })
    expect(last().entries).toMatchObject([{ kind: 'user', text: 'kept', queuedFor: expect.any(String) }])
    expect(bridge.sends).toEqual([])

    bridge.push(opened('s8', john.id))
    bridge.push(awaiting('s8'))
    expect(bridge.sends).toEqual([['s8', 'kept']])
  })
})

describe('connecting to a conversation that already exists', () => {
  const snapshotOf = (over: Partial<ConversationSnapshot>): ConversationSnapshot => ({ ...EMPTY, ...over })
  const stored: ConversationSnapshot['entries'] = [
    { kind: 'user', id: 'm-0', at: 5, text: 'hello' },
    { kind: 'persona', id: 'm-1', at: 6, agentId: mary.id, messageId: 'msg_1', text: 'Hel' }
  ]

  it('shows a turn that was in flight, joins what follows to it, reads the persona as working and ends as normal', async () => {
    bridge.conversation = Promise.resolve(
      snapshotOf({
        entries: stored,
        sessions: [{ agentId: mary.id, sessionId: 's1' }],
        busy: ['s1'],
        personas: [{ agentId: mary.id, state: 'work', at: 40 }]
      })
    )
    const { conversation, last } = build()
    await connected(conversation)

    expect(last().entries).toMatchObject([
      { kind: 'user', text: 'hello' },
      { kind: 'persona', text: 'Hel', agent: mary }
    ])
    expect(last().personas.get(mary.id)).toEqual({ state: 'work', at: 40 })

    bridge.push(said(mary.id, 'msg_1', 'lo'))
    expect(last().entries[1]).toMatchObject({ text: 'Hello' })

    conversation.send(mary.id, 'meanwhile')
    expect(last().entries[2]).toMatchObject({ queuedFor: 'Mary' })
    expect(bridge.sends).toEqual([])
    expect(bridge.opens).toEqual([])

    bridge.push(awaiting('s1'))
    expect(bridge.sends).toEqual([['s1', 'meanwhile']])
    expect(last().entries[2]).not.toHaveProperty('queuedFor')
  })

  it('drops what arrives before the snapshot, which already holds it', async () => {
    const pending = deferred<ConversationSnapshot>()
    bridge.conversation = pending.promise
    const { conversation, last } = build()
    conversation.connect()

    bridge.push(said(mary.id, 'msg_1', 'Hel'))
    bridge.push(personaState(mary.id, 'work', 3))
    pending.resolve(snapshotOf({ entries: stored }))
    await settle()
    bridge.push(said(mary.id, 'msg_1', 'lo'))

    expect(last().entries).toMatchObject([{ text: 'hello' }, { text: 'Hello' }])
    expect(last().personas.size).toBe(0)
  })

  it('keeps a message typed before the snapshot queued, then sends it after, in order', async () => {
    const pending = deferred<ConversationSnapshot>()
    bridge.conversation = pending.promise
    const { conversation, last } = build()
    conversation.connect()
    conversation.activate(mary.id)
    conversation.send(mary.id, 'one')
    conversation.send(mary.id, 'two')

    expect(last().entries).toMatchObject([
      { text: 'one', queuedFor: 'Mary' },
      { text: 'two', queuedFor: 'Mary' }
    ])
    expect(bridge.sends).toEqual([])
    expect(bridge.opens).toEqual([])

    pending.resolve(snapshotOf({ entries: stored, sessions: [{ agentId: mary.id, sessionId: 's1' }] }))
    await settle()

    expect(last().entries).toMatchObject([
      { text: 'hello' },
      { text: 'Hel' },
      { text: 'one' },
      { text: 'two' }
    ])
    expect(bridge.sends).toEqual([['s1', 'one']])
    // The activation is still an open: main answers it with the session it already holds.
    expect(bridge.opens).toEqual([mary.id])
    bridge.push(awaiting('s1'))
    expect(bridge.sends).toEqual([['s1', 'one'], ['s1', 'two']])
  })

  it('opens the session for what was typed before the snapshot when none is live', async () => {
    const pending = deferred<ConversationSnapshot>()
    bridge.conversation = pending.promise
    const { conversation } = build()
    conversation.connect()
    conversation.send(john.id, 'hi')
    expect(bridge.opens).toEqual([])

    pending.resolve(snapshotOf({}))
    await settle()

    expect(bridge.opens).toEqual([john.id])
  })

  it('sends into a session that is busy only after its turn ends', async () => {
    bridge.conversation = Promise.resolve(
      snapshotOf({ sessions: [{ agentId: mary.id, sessionId: 's1' }], busy: ['s1'] })
    )
    const { conversation } = build()
    await connected(conversation)
    conversation.send(mary.id, 'x')

    expect(bridge.sends).toEqual([])
    bridge.push(awaiting('s1'))
    expect(bridge.sends).toEqual([['s1', 'x']])
  })

  it('carries on from an empty conversation, and shows the failure, when the read is refused', async () => {
    bridge.conversation = Promise.reject({
      code: 'conversation/no-project',
      message: 'conversation · no project is open for this window'
    })
    const { conversation, failures, last } = build()
    await connected(conversation)

    expect(failures.at(-1)).toMatchObject({ code: 'conversation/no-project' })
    bridge.push(said(mary.id, 'm1', 'Hello'))
    expect(last().entries).toMatchObject([{ text: 'Hello' }])
  })
})

describe('a window that goes before main answers', () => {
  it('opens nothing for a persona asked for meanwhile when the read is then refused', async () => {
    const refused = deferred<ConversationSnapshot>()
    bridge.conversation = refused.promise
    const { conversation } = build()
    const stop = conversation.connect()
    conversation.activate(mary.id)
    stop()

    refused.reject({ code: 'conversation/no-project', message: 'conversation · none' })
    await settle()

    expect(bridge.opens).toEqual([])
  })
})

const closed = (sessionId: string, agentId: string): ContractEvent => ({
  name: 'session:closed',
  payload: { sessionId, agentId, reason: 'closed', at: 9 }
})

describe('close', () => {
  it('sends the persona’s session to main and resolves true; the session is removed by main’s session:closed, not by the call', async () => {
    const { conversation, last, failures } = build()
    await connected(conversation)
    bridge.push(opened('s1', mary.id))
    bridge.push(opened('s2', john.id))
    bridge.push(said(mary.id, 'm1', 'Hello'))

    expect(await conversation.close(mary.id)).toBe(true)
    expect(bridge.closed).toEqual(['s1'])
    expect(failures.filter((failure) => failure !== null)).toEqual([])

    bridge.push(closed('s1', mary.id))
    // Its turns stay and the other persona’s session is untouched.
    expect(last().entries).toMatchObject([{ text: 'Hello' }])
    bridge.push(awaiting('s2'))
    conversation.send(john.id, 'still here')
    expect(bridge.sends).toEqual([['s2', 'still here']])
  })

  it('shows a refusal as the failure line and keeps the session', async () => {
    const { conversation, failures } = build()
    await connected(conversation)
    bridge.push(opened('s1', mary.id))
    bridge.closeResults.push(
      Promise.reject({ code: 'session/not-found', message: 'session · no such session is open' })
    )

    expect(await conversation.close(mary.id)).toBe(false)

    expect(failures.at(-1)).toMatchObject({ code: 'session/not-found' })
    bridge.push(awaiting('s1'))
    conversation.send(mary.id, 'still here')
    expect(bridge.sends).toEqual([['s1', 'still here']])
  })

  it('resolves true and shows no failure when main refuses as not-found after its session:closed was folded', async () => {
    const { conversation, failures } = build()
    await connected(conversation)
    bridge.push(opened('s1', mary.id))
    const refused = deferred<void>()
    bridge.closeResults.push(refused.promise)

    const result = conversation.close(mary.id)
    bridge.push(closed('s1', mary.id))
    refused.reject({ code: 'session/not-found', message: 'session · no such session is open' })

    expect(await result).toBe(true)
    expect(failures.filter((failure) => failure !== null)).toEqual([])
  })

  it('asks main for nothing when the persona has no session', async () => {
    const { conversation } = build()
    await connected(conversation)

    expect(await conversation.close(mary.id)).toBe(false)
    expect(bridge.closed).toEqual([])
  })
})

describe('end', () => {
  it('sends the project id, and on the reply the window holds no entries, queue, sessions or busy set', async () => {
    const { conversation, last, failures } = build()
    await connected(conversation)
    bridge.push(opened('s1', mary.id))
    bridge.push(said(mary.id, 'm1', 'Hello'))
    bridge.push(personaState(mary.id, 'work', 4))
    conversation.send(mary.id, 'queued while busy')
    expect(last().entries).toHaveLength(2)

    // Main closes the sessions before it replies, and the window folds that first.
    bridge.push(closed('s1', mary.id))
    bridge.push(personaState(mary.id, 'idle', 10))
    const result = conversation.end('/work/falcon')
    await settle()

    expect(await result).toBe(true)
    expect(bridge.ends).toEqual(['/work/falcon'])
    expect(last().entries).toEqual([])
    expect([...last().personas]).toEqual([[mary.id, { state: 'idle', at: 10 }]])
    expect(failures.filter((failure) => failure !== null)).toEqual([])

    // A next message opens a fresh session rather than waiting on the old one.
    conversation.send(mary.id, 'again')
    expect(bridge.opens).toEqual([mary.id])
    expect(last().entries).toMatchObject([{ text: 'again', queuedFor: 'Mary' }])
  })

  it('shows a refusal as the failure line and leaves everything as it was', async () => {
    const { conversation, last, failures } = build()
    await connected(conversation)
    bridge.push(opened('s1', mary.id))
    bridge.push(said(mary.id, 'm1', 'Hello'))
    bridge.endResults.push(
      Promise.reject({
        code: 'conversation/end-failed',
        message: 'conversation · could not end the conversation',
        detail: 'EACCES'
      })
    )

    expect(await conversation.end('/work/falcon')).toBe(false)

    expect(failures.at(-1)).toMatchObject({ code: 'conversation/end-failed', detail: 'EACCES' })
    expect(last().entries).toMatchObject([{ text: 'Hello' }])
    // The session is still the persona’s: a send is written to it.
    bridge.push(awaiting('s1'))
    conversation.send(mary.id, 'still here')
    expect(bridge.sends).toEqual([['s1', 'still here']])
  })

  it('clears an earlier failure line when it starts', async () => {
    const { conversation, failures } = build()
    await connected(conversation)
    await conversation.end('/work/falcon')

    expect(failures).toEqual([null])
  })

  it('does not show an open still in flight at the end as a failure, and loses nothing sent afterwards', async () => {
    const { conversation, failures, last } = build()
    await connected(conversation)
    conversation.activate(mary.id)
    bridge.push(closed('s-pending', mary.id))
    const result = conversation.end('/work/falcon')
    await settle()
    await result

    // Main kills the process that finishes starting after the end: its open is answered not-found.
    bridge.openResult[0].reject({ code: 'session/not-found', message: 'session · no such session is open' })
    await settle()

    expect(failures.filter((failure) => failure !== null)).toEqual([])
    // The stale open is not what a send after the end waits on.
    conversation.send(mary.id, 'fresh')
    expect(bridge.opens).toEqual([mary.id, mary.id])
    bridge.openResult[1].resolve('s2')
    await settle()
    expect(bridge.sends).toEqual([['s2', 'fresh']])
    expect(last().entries).toMatchObject([{ text: 'fresh' }])
  })

  it('keeps a second open tracked as in flight when the first, begun before the end, settles after it', async () => {
    const { conversation } = build()
    await connected(conversation)
    conversation.activate(mary.id)
    await conversation.end('/work/falcon')
    conversation.send(mary.id, 'fresh')
    expect(bridge.opens).toEqual([mary.id, mary.id])

    bridge.openResult[0].reject({ code: 'session/not-found', message: 'session · no such session is open' })
    await settle()
    conversation.send(mary.id, 'more')

    // The first open's settling did not forget the second: no third open starts.
    expect(bridge.opens).toEqual([mary.id, mary.id])
  })

  it('opens nothing for a persona asked for before the snapshot when the conversation ends before it arrives', async () => {
    const pending = deferred<ConversationSnapshot>()
    bridge.conversation = pending.promise
    const { conversation } = build()
    conversation.connect()
    conversation.activate(mary.id)
    await conversation.end('/work/falcon')

    pending.resolve(EMPTY)
    await settle()

    expect(bridge.opens).toEqual([])
  })

  it('still shows an open that fails after the end for an open begun after it', async () => {
    const { conversation, failures } = build()
    await connected(conversation)
    await conversation.end('/work/falcon')
    conversation.activate(mary.id)
    bridge.openResult[0].reject({ code: 'session/spawn-failed', message: 'session · could not start the session' })
    await settle()

    expect(failures.at(-1)).toMatchObject({ code: 'session/spawn-failed' })
  })

  it('changes nothing once disconnected', async () => {
    const { conversation, published } = build()
    const disconnect = await connected(conversation)
    disconnect()
    const before = published.length

    expect(await conversation.end('/work/falcon')).toBe(true)
    expect(published).toHaveLength(before)
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

  it('does nothing and throws nothing when the preload has no session methods', async () => {
    install({})
    hook = renderHook(() => useConversation(agents))

    expect(() => hook?.current.activate(mary.id)).not.toThrow()
    expect(() => hook?.current.send(mary.id, 'x')).not.toThrow()
    expect(() => hook?.current.cancel('entry-0')).not.toThrow()
    await expect(hook.current.end('/work/falcon')).resolves.toBe(false)
    expect(hook.current.entries).toEqual([])
    expect(hook.current.failure).toBeNull()
  })

  it('names a stored persona turn from the roster as it is now, and by id until the roster is read', async () => {
    bridge.conversation = Promise.resolve({
      ...EMPTY,
      entries: [{ kind: 'persona', id: 'm-0', at: 6, agentId: mary.id, messageId: 'msg_1', text: 'Hi' }]
    })
    install(bridge)
    let roster: readonly AgentView[] = []
    hook = renderHook(() => useConversation(roster))
    await settle()
    expect(hook.current.entries[0]).toMatchObject({ agent: { id: mary.id, name: mary.id } })

    // The roster is read: the next render names the persona, with no new transcript.
    roster = agents
    inAct(() => bridge.push(personaState(mary.id, 'work', 9)))
    expect(hook.current.entries[0]).toMatchObject({ agent: mary })
  })

  it('subscribes on mount, renders pushed speech and sends, and unsubscribes on unmount', async () => {
    install(bridge)
    hook = renderHook(() => useConversation(agents))
    expect(bridge.listeners.size).toBe(1)
    await settle()

    inAct(() => bridge.push(said(mary.id, 'm1', 'Hello')))
    expect(hook.current.entries).toMatchObject([{ kind: 'persona', agent: mary, text: 'Hello' }])

    inAct(() => void hook?.current.activate(john.id))
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

  it('ends the conversation through the hook: the entries go and it resolves true', async () => {
    install(bridge)
    hook = renderHook(() => useConversation(agents))
    await settle()
    inAct(() => bridge.push(said(mary.id, 'm1', 'Hello')))
    expect(hook.current.entries).toHaveLength(1)

    let ended: boolean | undefined
    await act(async () => {
      ended = await hook?.current.end('/work/falcon')
    })

    expect(ended).toBe(true)
    expect(bridge.ends).toEqual(['/work/falcon'])
    expect(hook.current.entries).toEqual([])
  })

  it('derives an orphan from the sessions and the roster: a live session whose agent the roster lacks, and not once it returns', async () => {
    install(bridge)
    let roster: readonly AgentView[] = agents
    hook = renderHook(() => useConversation(roster))
    await settle()
    inAct(() => bridge.push(opened('s1', mary.id)))
    inAct(() => bridge.push(opened('s2', john.id)))
    inAct(() => bridge.push(said(mary.id, 'm1', 'Hello')))
    expect(hook.current.orphans).toEqual([])

    roster = [john]
    inAct(() => bridge.push(awaiting('s2')))
    expect(hook.current.orphans).toEqual([mary])
    // Nothing else changed: the turns, the sessions and the busy flag stay as they were.
    expect(hook.current.entries).toMatchObject([{ kind: 'persona', text: 'Hello' }])
    expect(hook.current.canAnswer(john.id)).toBe(true)
    expect(hook.current.canAnswer(mary.id)).toBe(false)

    roster = agents
    inAct(() => bridge.push(awaiting('s1')))
    expect(hook.current.orphans).toEqual([])
    expect(hook.current.canAnswer(mary.id)).toBe(true)
  })

  it('closes an orphan through the hook, after which main’s session:closed removes it and the turns stay', async () => {
    install(bridge)
    hook = renderHook(() => useConversation([john]))
    await settle()
    inAct(() => bridge.push(opened('s1', mary.id)))
    inAct(() => bridge.push(said(mary.id, 'm1', 'Hello')))
    expect(hook.current.orphans).toHaveLength(1)

    let closedOk: boolean | undefined
    await act(async () => {
      closedOk = await hook?.current.close(mary.id)
    })
    expect(closedOk).toBe(true)
    expect(bridge.closed).toEqual(['s1'])
    inAct(() => bridge.push(closed('s1', mary.id)))

    expect(hook.current.orphans).toEqual([])
    expect(hook.current.entries).toMatchObject([{ text: 'Hello' }])
  })

  it('holds the agent ids that have a live session, from session:opened to session:closed, current or not', async () => {
    install(bridge)
    hook = renderHook(() => useConversation(agents))
    await settle()
    expect([...hook.current.live]).toEqual([])

    inAct(() => bridge.push(opened('s1', mary.id)))
    expect([...hook.current.live]).toEqual([mary.id])
    inAct(() => bridge.push(opened('s2', john.id)))
    expect([...hook.current.live].sort()).toEqual([john.id, mary.id].sort())

    inAct(() => bridge.push(closed('s1', mary.id)))
    expect([...hook.current.live]).toEqual([john.id])
  })

  it('says a persona can answer only while it has a live session with no turn in flight', async () => {
    install(bridge)
    hook = renderHook(() => useConversation(agents))
    await settle()
    expect(hook.current.canAnswer(mary.id)).toBe(false)

    inAct(() => bridge.push(opened('s1', mary.id)))
    expect(hook.current.canAnswer(mary.id)).toBe(false)
    inAct(() => bridge.push(awaiting('s1')))
    expect(hook.current.canAnswer(mary.id)).toBe(true)
    expect(hook.current.canAnswer(john.id)).toBe(false)

    inAct(() => hook?.current.send(mary.id, 'Postgres'))
    expect(hook.current.canAnswer(mary.id)).toBe(false)
    expect(bridge.sends).toEqual([['s1', 'Postgres']])
  })

  it('does nothing when the preload lacks endConversation', async () => {
    install({
      openSession: bridge.openSession.bind(bridge),
      sendTurn: bridge.sendTurn.bind(bridge),
      getConversation: bridge.getConversation.bind(bridge),
      onSessionEvent: bridge.onSessionEvent.bind(bridge)
    })
    hook = renderHook(() => useConversation(agents))

    await expect(hook.current.end('/work/falcon')).resolves.toBe(false)
  })
})

describe('a run, through the conversation (Story 3.1)', () => {
  const started = (runId = 'r1'): ContractEvent => ({
    name: 'run:started',
    payload: { runId, sessionId: 's1', agentId: mary.id, code: 'CP', at: 50 }
  })
  const prose = (text: string): ContractEvent => ({
    name: 'doc:prose',
    payload: { runId: 'r1', sessionId: 's1', callId: 'c1', path: 'prd.md', text, at: 51 }
  })

  async function live(extra: Partial<Parameters<typeof createConversation>[0]> = {}) {
    const published: { entries: readonly unknown[]; busy: ReadonlySet<string> }[] = []
    const failures: unknown[] = []
    const lines: string[] = []
    const store = createProseStore({ raf: (callback) => callback() })
    const conversation = createConversation({
      bridge,
      agentOf: (id) => agents.find((agent) => agent.id === id),
      now: () => (clock += 1),
      publish: (state) => void published.push(state),
      onFailure: (error) => void failures.push(error),
      prose: store,
      onLifecycle: (line) => void lines.push(line),
      ...extra
    })
    await connected(conversation)
    void conversation.activate(mary.id)
    bridge.openResult[0].resolve('s1')
    await settle()
    return { conversation, published, failures, lines, store }
  }

  it('sends the code alone to the persona’s session, and holds the row while the dispatch is in flight', async () => {
    const { conversation, published } = await live()
    conversation.runSkill(mary.id, 'CP')
    conversation.runSkill(mary.id, 'CP')

    expect(bridge.dispatches).toEqual([['s1', 'CP']])
    expect(published.at(-1)?.busy.has('s1')).toBe(true)
  })

  it('does nothing for a persona with no session, and frees the row with the failure line on a refusal', async () => {
    const { conversation, published, failures } = await live()
    conversation.runSkill(john.id, 'CP')
    expect(bridge.dispatches).toEqual([])

    const refusal = { code: 'menu/unknown-entry', message: 'menu · this persona has no such entry' }
    bridge.dispatchResults = [Promise.reject(refusal)]
    conversation.runSkill(mary.id, 'ZZ')
    await settle()
    expect(published.at(-1)?.busy.has('s1')).toBe(false)
    expect(failures.at(-1)).toEqual(refusal)
  })

  it('keeps the row held and shows no failure when main answers busy: its turn’s end frees the session', async () => {
    const { conversation, published, failures } = await live()
    bridge.dispatchResults = [Promise.reject({ code: 'session/busy', message: 'session · a turn is already in flight' })]
    conversation.runSkill(mary.id, 'CP')
    await settle()

    expect(bridge.dispatches).toEqual([['s1', 'CP']])
    expect(published.at(-1)?.busy.has('s1')).toBe(true)
    expect(failures.filter((failure) => failure !== null)).toEqual([])
    bridge.push(awaiting('s1'))
    expect(published.at(-1)?.busy.has('s1')).toBe(false)
  })

  it('keeps prose out of the state: a piece goes to the prose store and publishes nothing', async () => {
    const { published, store } = await live()
    bridge.push(started())
    const count = published.length
    bridge.push(prose('## Vi'))
    bridge.push(prose('sion'))

    expect(published.length).toBe(count)
    expect(store.get('r1')).toEqual({ callId: 'c1', path: 'prd.md', text: '## Vision' })
  })

  it('announces the run’s start and end once each, with the persona’s name, and never its prose or notes', async () => {
    const { lines } = await live()
    bridge.push(started())
    bridge.push(prose('text'))
    bridge.push({ name: 'run:note', payload: { runId: 'r1', sessionId: 's1', text: '- note', at: 52 } })
    bridge.push({
      name: 'doc:committed',
      payload: { ok: true, runId: 'r1', sessionId: 's1', callId: 'c1', path: 'prd.md', sections: ['A', 'B'], at: 53 }
    })
    bridge.push({ name: 'run:finished', payload: { runId: 'r1', sessionId: 's1', at: 54 } })

    expect(lines).toEqual(['Mary · writing', 'Mary · saved · 2 sections'])
  })

  it('takes the cards and their prose from the snapshot a window reads on connecting', async () => {
    bridge.conversation = Promise.resolve({
      ...EMPTY,
      runs: [
        {
          runId: 'r9',
          sessionId: 's1',
          agentId: mary.id,
          code: 'CP',
          startedAt: 40,
          status: 'running',
          notes: [{ text: '- n', at: 41 }],
          sections: ['A'],
          prose: { callId: 'c9', path: 'prd.md', text: 'so far' }
        }
      ]
    })
    const store = createProseStore({ raf: (callback) => callback() })
    const published: { entries: readonly unknown[] }[] = []
    const conversation = createConversation({
      bridge,
      agentOf: (id) => agents.find((agent) => agent.id === id),
      now: () => (clock += 1),
      publish: (state) => void published.push(state),
      onFailure: () => {},
      prose: store
    })
    await connected(conversation)

    expect(published.at(-1)?.entries).toMatchObject([{ kind: 'run', runId: 'r9', status: 'running', sections: ['A'] }])
    expect(store.get('r9')).toEqual({ callId: 'c9', path: 'prd.md', text: 'so far' })
  })
})
