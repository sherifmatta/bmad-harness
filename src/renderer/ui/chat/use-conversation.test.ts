// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SessionTarget } from '../../../shared/commands'
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
  /** What each send carried: the session, the text and, only when there was one, the typed mention. */
  sends: ([string, string] | [string, string, string])[] = []
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

  /** The casts the room was asked for, in order; a room open is also an entry of `opens`, as `room`. */
  casts: (readonly string[])[] = []

  /** When main says the room opened, in the reply of an open that does not name its own answer. */
  roomOpenedAt = 5000
  /** The room an open answers with, in place of the one it asked for; one entry is read per room open (Story 4.7). */
  roomAnswers: ({ cast: string[]; openedAt: number } | undefined)[] = []

  openSession(target: SessionTarget): Promise<OpenedSession> {
    const handoff = this.handoffs[this.opens.length]
    const room =
      typeof target === 'string'
        ? undefined
        : (this.roomAnswers[this.casts.length] ?? { cast: [...target.room], openedAt: this.roomOpenedAt })
    if (typeof target !== 'string') {
      this.casts.push(target.room)
    }
    const agentId = typeof target === 'string' ? target : 'room'
    this.opens.push(agentId)
    const pending = deferred<string>()
    this.openResult.push(pending)
    return pending.promise.then((sessionId) => ({
      sessionId,
      ...(handoff === undefined ? {} : { handoff }),
      ...(room === undefined ? {} : { room })
    }))
  }
  closed: string[] = []
  /** What the next close answers; one entry is consumed per close. */
  closeResults: (Promise<void> | undefined)[] = []
  closeSession(sessionId: string): Promise<void> {
    this.closed.push(sessionId)
    return this.closeResults.shift() ?? Promise.resolve()
  }
  sendTurn(sessionId: string, text: string, ...mention: string[]): Promise<void> {
    this.sends.push([sessionId, text, ...mention] as [string, string] | [string, string, string])
    return this.sendResults.shift() ?? Promise.resolve()
  }
  dispatches: [string, string][] = []
  /** What the next dispatch answers; one entry is consumed per dispatch. */
  dispatchResults: (Promise<string> | undefined)[] = []
  dispatchMenu(sessionId: string, code: string): Promise<string> {
    this.dispatches.push([sessionId, code])
    return this.dispatchResults.shift() ?? Promise.resolve('r1')
  }
  stops: string[] = []
  /** What the next stop answers; one entry is consumed per stop. */
  stopResults: (Promise<void> | undefined)[] = []
  stopRun(runId: string): Promise<void> {
    this.stops.push(runId)
    return this.stopResults.shift() ?? Promise.resolve()
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
  const handoffs: SyslineRecord[] = []
  const conversation = createConversation({
    bridge,
    agentOf: (id) => agents.find((agent) => agent.id === id),
    now: () => (clock += 1),
    publish: (state) => void published.push(state),
    onFailure: (error) => void failures.push(error),
    onHandoff: (record) => void handoffs.push(record)
  })
  return {
    conversation,
    published,
    failures,
    handoffs,
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
    const handoff: SyslineRecord = { kind: 'sysline', id: 'm-4', at: 150, text: 'handed to John' }
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
      { kind: 'sysline', id: 'm-4', at: 150, text: 'handed to John' }
    ])
    expect(announced).toEqual([handoff])
  })

  it('does not fold or announce a handoff for an open that outlived the conversation', async () => {
    const handoff: SyslineRecord = { kind: 'sysline', id: 'm-4', at: 150, text: 'handed to John' }
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

describe('send with a typed mention (Story 2.15)', () => {
  it('shows the mention on the entry and passes it to the bridge as the third argument', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    bridge.push(opened('s1', mary.id))
    bridge.push(awaiting('s1'))
    conversation.send(mary.id, 'go', '@Mary')

    expect(last().entries).toEqual([{ kind: 'user', id: 'entry-0', at: 101, text: 'go', mention: '@Mary' }])
    expect(bridge.sends).toEqual([['s1', 'go', '@Mary']])
  })

  it('passes a plain send with no third argument at all', async () => {
    const { conversation } = build()
    await connected(conversation)
    bridge.push(opened('s1', mary.id))
    bridge.push(awaiting('s1'))
    conversation.send(mary.id, 'go')

    expect(bridge.sends[0]).toHaveLength(2)
  })

  it('keeps it on a queued turn and sends it with the turn when the session is free', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    bridge.push(opened('s1', mary.id))
    conversation.send(mary.id, 'go', '@Mary')

    expect(last().entries).toMatchObject([{ text: 'go', mention: '@Mary', queuedFor: 'Mary' }])
    expect(bridge.sends).toEqual([])
    bridge.push(awaiting('s1'))
    expect(bridge.sends).toEqual([['s1', 'go', '@Mary']])
    expect(last().entries[0]).toMatchObject({ mention: '@Mary' })
    expect(last().entries[0]).not.toHaveProperty('queuedFor')
  })

  it('sends it after a session is opened for a persona that had none', async () => {
    const { conversation } = build()
    await connected(conversation)
    conversation.send(john.id, 'go', '@John')
    bridge.push(opened('s7', john.id))
    bridge.openResult[0].resolve('s7')
    await settle()
    bridge.push(awaiting('s7'))

    expect(bridge.sends).toEqual([['s7', 'go', '@John']])
  })

  it('keeps it when main refuses the send as busy, and sends it again with the next turn end', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    bridge.push(opened('s1', mary.id))
    bridge.sendResults.push(Promise.reject({ code: 'session/busy', message: 'busy' }))
    bridge.push(awaiting('s1'))
    conversation.send(mary.id, 'go', '@Mary')
    await settle()

    expect(last().entries[0]).toMatchObject({ mention: '@Mary', queuedFor: 'Mary' })
    bridge.push(awaiting('s1'))
    expect(bridge.sends).toEqual([
      ['s1', 'go', '@Mary'],
      ['s1', 'go', '@Mary']
    ])
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

  it.each([
    ['run:stopped', 'Mary · stopped · §2 B'],
    ['run:failed', 'Mary · failed · §2 B']
  ] as const)('announces %s with the section the last confirmed write reached', async (name, line) => {
    const { lines } = await live()
    bridge.push(started())
    bridge.push(prose('## A\n## B\n## C\n'))
    bridge.push({
      name: 'doc:committed',
      payload: { ok: true, runId: 'r1', sessionId: 's1', callId: 'c1', path: 'prd.md', sections: ['A', 'B'], at: 53 }
    })
    bridge.push(
      name === 'run:failed'
        ? { name, payload: { runId: 'r1', sessionId: 's1', error: { code: 'run/failed', message: 'x' }, at: 54 } }
        : { name, payload: { runId: 'r1', sessionId: 's1', at: 54 } }
    )

    // The streamed text had shown three headings; the announcement names the two a `tool_result` confirmed.
    expect(lines).toEqual(['Mary · writing', line])
  })

  it.each(['run:stopped', 'run:failed'] as const)('announces %s as the bare word when nothing was confirmed', async (name) => {
    const { lines } = await live()
    bridge.push(started())
    bridge.push(prose('## A\n## B\n## C\n'))
    bridge.push(
      name === 'run:failed'
        ? { name, payload: { runId: 'r1', sessionId: 's1', error: { code: 'run/failed', message: 'x' }, at: 54 } }
        : { name, payload: { runId: 'r1', sessionId: 's1', at: 54 } }
    )

    expect(lines.at(-1)).toBe(name === 'run:failed' ? 'Mary · failed' : 'Mary · stopped')
    expect(lines.at(-1)).not.toMatch(/§/)
  })

  it('hands a confirmed write’s text to the prose store, and announces the subject’s sections alone', async () => {
    const { lines, store } = await live()
    bridge.push(started())
    bridge.push(prose('## A\nold text'))
    bridge.push({
      name: 'doc:committed',
      payload: { ok: true, runId: 'r1', sessionId: 's1', callId: 'c1', path: 'prd.md', sections: ['A'], at: 53 }
    })
    bridge.push({
      name: 'doc:committed',
      payload: { ok: true, runId: 'r1', sessionId: 's1', callId: 'c2', path: 'other.md', sections: ['X', 'Y', 'Z'], at: 54 }
    })
    bridge.push({
      name: 'doc:committed',
      payload: { ok: true, runId: 'r1', sessionId: 's1', callId: 'e1', path: 'prd.md', sections: ['A', 'B'], text: '## A\n## B', at: 55 }
    })
    bridge.push({ name: 'run:finished', payload: { runId: 'r1', sessionId: 's1', at: 56 } })

    expect(store.get('r1')).toEqual({ callId: 'e1', path: 'prd.md', text: '## A\n## B' })
    expect(store.paths('r1')).toEqual(['prd.md', 'other.md'])
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
          documents: [
            { path: 'addendum.md', callId: 'c8', text: 'small', written: 5, sections: [] },
            { path: 'prd.md', callId: 'c9', text: 'so far', written: 6, sections: ['A'] }
          ]
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

    expect(published.at(-1)?.entries).toMatchObject([
      { kind: 'run', runId: 'r9', status: 'running', documents: [{ path: 'addendum.md', sections: [] }, { path: 'prd.md', sections: ['A'] }] }
    ])
    expect(store.get('r9')).toEqual({ callId: 'c9', path: 'prd.md', text: 'so far' })
    expect(store.paths('r9')).toEqual(['addendum.md', 'prd.md'])
  })
})

describe('stopping a run (Story 3.7)', () => {
  const build7 = async () => {
    const published: { entries: readonly unknown[] }[] = []
    const failures: unknown[] = []
    const conversation = createConversation({
      bridge,
      agentOf: (id) => agents.find((agent) => agent.id === id),
      now: () => (clock += 1),
      publish: (state) => void published.push(state),
      onFailure: (error) => void failures.push(error)
    })
    await connected(conversation)
    return { conversation, published, failures }
  }

  it('asks main to stop the run by its id, and changes nothing the window holds', async () => {
    const { conversation, published, failures } = await build7()
    bridge.push({ name: 'run:started', payload: { runId: 'r1', sessionId: 's1', agentId: mary.id, code: 'CP', at: 50 } })
    const before = published.length

    await conversation.stopRun('r1')

    expect(bridge.stops).toEqual(['r1'])
    expect(published).toHaveLength(before)
    expect(failures).toEqual([])
  })

  it('says nothing when main answers that the run is not in flight: the control it was pressed on is already gone', async () => {
    const { conversation, failures } = await build7()
    bridge.stopResults = [Promise.reject({ code: 'run/not-found', message: 'run · no such run is in flight' })]

    await expect(conversation.stopRun('r1')).resolves.toBeUndefined()

    expect(failures).toEqual([])
  })

  it('shows any other refusal as the failure line, and never rejects', async () => {
    const { conversation, failures } = await build7()
    const refusal = { code: 'bridge/unexpected', message: 'bridge · something went wrong' }
    bridge.stopResults = [Promise.reject(refusal)]

    await expect(conversation.stopRun('r1')).resolves.toBeUndefined()

    expect(failures).toEqual([refusal])
  })

  it('does not stop a run by a persona or a session: only the run’s id crosses', async () => {
    const { conversation } = await build7()
    await conversation.stopRun('r-orphan')
    await conversation.stopRun('r2')

    expect(bridge.stops).toEqual(['r-orphan', 'r2'])
  })
})

describe('openRoom (Story 4.1)', () => {
  const CAST = [mary.id, john.id]
  const roomOpened = (sessionId: string): ContractEvent => ({ name: 'session:opened', payload: { sessionId, at: 1 } })
  const roomClosed = (sessionId: string): ContractEvent => ({
    name: 'session:closed',
    payload: { sessionId, reason: 'process-exited', at: 9 }
  })
  const roomOf = (published: object | undefined): unknown => (published as { room?: unknown } | undefined)?.room

  it('asks main for the cast, and the reply makes the session the window’s room, no persona’s', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    void conversation.openRoom(CAST)
    expect(bridge.casts).toEqual([CAST])

    bridge.openResult[0].resolve('r1')
    await settle()

    expect(roomOf(last())).toBe('r1')
    expect(conversation).not.toHaveProperty('room')
  })

  it('takes the room from the agentless session:opened and clears it on the agentless session:closed', async () => {
    const { conversation, last } = build()
    await connected(conversation)

    bridge.push(roomOpened('r1'))
    expect(roomOf(last())).toBe('r1')
    bridge.push(roomClosed('r1'))
    expect(roomOf(last())).toBeUndefined()
  })

  it('leaves the persona maps alone: the room is in no session or queue, and only its activation turn is busy', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    bridge.push(roomOpened('r1'))

    const state = last() as unknown as { sessions: ReadonlyMap<string, string>; busy: ReadonlySet<string> }
    expect(state.sessions.size).toBe(0)
    expect([...state.busy]).toEqual(['r1'])
    bridge.push({ name: 'session:awaiting-turn', payload: { sessionId: 'r1', at: 2 } })
    expect((last() as unknown as { busy: ReadonlySet<string> }).busy.size).toBe(0)
  })

  it('keeps a persona’s session when the room closes, and the room when a persona’s closes', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    bridge.push(opened('s1', mary.id))
    bridge.push(roomOpened('r1'))

    bridge.push(roomClosed('r1'))
    expect([...(last() as unknown as { sessions: ReadonlyMap<string, string> }).sessions.keys()]).toEqual([mary.id])
    bridge.push(roomOpened('r2'))
    bridge.push({ name: 'session:closed', payload: { sessionId: 's1', agentId: mary.id, reason: 'closed', at: 9 } })
    expect(roomOf(last())).toBe('r2')
  })

  it('has one open in flight at a time, and waits for the snapshot before asking', async () => {
    const { conversation } = build()
    const stop = conversation.connect()
    void conversation.openRoom(CAST)
    expect(bridge.casts).toEqual([])
    await settle()
    expect(bridge.casts).toEqual([CAST])

    void conversation.openRoom(CAST)
    expect(bridge.casts).toEqual([CAST])
    stop()
  })

  it('shows a refused open as the envelope and leaves the window without a room', async () => {
    const { conversation, failures, last } = build()
    await connected(conversation)
    void conversation.openRoom(CAST)
    bridge.openResult[0].reject({ code: 'session/invalid-cast', message: 'session · not a valid cast for a room' })
    await settle()

    expect(failures.at(-1)).toMatchObject({ code: 'session/invalid-cast' })
    expect(roomOf(last())).toBeUndefined()
  })

  it('takes a room sysline from a push and from the snapshot, flagged, and the 1:1 transcript keeps the flag', async () => {
    const { conversation, last } = build()
    bridge.conversation = Promise.resolve({
      ...EMPTY,
      entries: [{ kind: 'sysline', id: 'm-0', at: 1, text: 'room opened by you · present · Mary', room: true }]
    })
    await connected(conversation)
    bridge.push({
      name: 'harness:said',
      payload: { sessionId: 'r1', id: 'm-1', text: 'session ended · the process exited', at: 5, room: true }
    })
    bridge.push({ name: 'harness:said', payload: { sessionId: 's1', id: 'm-2', text: 'turn failed', at: 6 } })

    expect(last().entries).toEqual([
      { kind: 'sysline', id: 'm-0', at: 1, text: 'room opened by you · present · Mary', room: true },
      { kind: 'sysline', id: 'm-1', at: 5, text: 'session ended · the process exited', room: true },
      { kind: 'sysline', id: 'm-2', at: 6, text: 'turn failed' }
    ])
  })

  it('ignores an agentless persona:said, as the transcript fold does', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    bridge.push({ name: 'persona:said', payload: { sessionId: 'r1', messageId: 'm', text: 'room', at: 1 } })

    expect(last()?.entries ?? []).toEqual([])
  })

  it('forgets the room when the conversation ends', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    bridge.push(roomOpened('r1'))

    await conversation.end('/project')

    expect(roomOf(last())).toBeUndefined()
  })
})

describe('sendToRoom (Story 4.2)', () => {
  const CAST = [mary.id, john.id]
  const spoke = (agentId: string, messageId: string, text: string): ContractEvent => ({
    name: 'persona:said',
    payload: { sessionId: 'r1', agentId, messageId, text, at: 3, room: true }
  })
  type Held = { room?: string; roomCast: readonly string[]; roomOpenedAt?: number; roomTopic?: string; roomReturned?: { key: number; text: string }; busy: ReadonlySet<string>; entries: readonly { kind: string; room?: true; queuedFor?: string; text?: string }[] }
  const held = (published: object | undefined): Held => published as unknown as Held

  async function live() {
    const made = build()
    await connected(made.conversation)
    void made.conversation.openRoom(CAST)
    bridge.openResult[0].resolve('r1')
    await settle()
    bridge.push({ name: 'session:awaiting-turn', payload: { sessionId: 'r1', at: 2 } })
    // The user's clock is past the moment the room opened, as it is in a window.
    clock = bridge.roomOpenedAt
    return made
  }

  it('keeps the cast the room was opened with', async () => {
    const { last } = await live()
    expect(held(last()).roomCast).toEqual(CAST)
  })

  it('keeps the live room’s own cast and open time when an open is made with other ticks', async () => {
    const { conversation, last } = await live()
    bridge.roomAnswers[1] = { cast: [...CAST], openedAt: bridge.roomOpenedAt }
    void conversation.openRoom([john.id])
    bridge.openResult[1].resolve('r1')
    await settle()

    expect(bridge.casts).toEqual([CAST, [john.id]])
    expect(held(last()).roomCast).toEqual(CAST)
    expect(held(last()).roomOpenedAt).toBe(bridge.roomOpenedAt)
  })

  it('takes the cast and the time from the reply, not from the ticks asked for', async () => {
    const made = build()
    await connected(made.conversation)
    bridge.roomAnswers[0] = { cast: [john.id, mary.id], openedAt: 777 }
    void made.conversation.openRoom([mary.id])
    bridge.openResult[0].resolve('r1')
    await settle()

    expect(held(made.last()).roomCast).toEqual([john.id, mary.id])
    expect(held(made.last()).roomOpenedAt).toBe(777)
  })

  it('shows one unqueued room entry, marks the room busy and sends the text to the room session, verbatim', async () => {
    const { conversation, last } = await live()
    conversation.sendToRoom('@john what about  this?')

    expect(bridge.sends).toEqual([['r1', '@john what about  this?']])
    const state = held(last())
    expect(state.busy.has('r1')).toBe(true)
    expect(state.entries).toEqual([
      expect.objectContaining({ kind: 'user', room: true, text: '@john what about  this?' })
    ])
    expect(state.entries[0].queuedFor).toBeUndefined()
  })

  it('sends into a room mid-turn with no gate: no queue, one transmit per send', async () => {
    const { conversation, last } = await live()
    bridge.push(spoke(mary.id, 'm#1', 'Hi'))
    conversation.sendToRoom('one')
    conversation.sendToRoom('two')

    expect(bridge.sends).toEqual([['r1', 'one'], ['r1', 'two']])
    expect(held(last()).entries.filter((entry) => entry.kind === 'user' && entry.queuedFor !== undefined)).toEqual([])
  })

  it('takes the entry back when main refuses as busy: one harness line, the room still busy, the words returned, no failure (Story 4.8)', async () => {
    const { conversation, last, failures, handoffs } = await live()
    bridge.sendResults.push(busy())
    conversation.sendToRoom('x')
    await settle()

    const state = held(last())
    expect(state.busy.has('r1')).toBe(true)
    expect(state.entries).toEqual([
      expect.objectContaining({ kind: 'sysline', room: true, text: 'not sent · the room is still speaking' })
    ])
    expect(handoffs).toEqual([expect.objectContaining({ text: 'not sent · the room is still speaking', room: true })])
    expect(state.roomReturned).toMatchObject({ text: 'x' })
    expect(failures.filter((failure) => failure !== null)).toEqual([])
    // Nothing is sent again.
    expect(bridge.sends).toEqual([['r1', 'x']])
  })

  it('gives each refusal its own key for the returned words', async () => {
    const { conversation, last } = await live()
    bridge.sendResults.push(busy())
    conversation.sendToRoom('one')
    await settle()
    const first = held(last()).roomReturned
    bridge.sendResults.push(busy())
    conversation.sendToRoom('two')
    await settle()
    const second = held(last()).roomReturned

    expect(first).toMatchObject({ text: 'one' })
    expect(second).toMatchObject({ text: 'two' })
    expect(second?.key).not.toBe(first?.key)
  })

  it('leaves no topic from a refused first message, and reads the topic of the first one delivered (Story 4.8)', async () => {
    const { conversation, last } = await live()
    bridge.sendResults.push(busy(), undefined, undefined)
    conversation.sendToRoom('refused first')
    await settle()
    expect(held(last()).roomTopic).toBeUndefined()

    conversation.sendToRoom('delivered')
    await settle()
    expect(held(last()).roomTopic).toBe('delivered')
  })

  it('moves the topic to a message still in flight when the first was refused', async () => {
    const { conversation, last } = await live()
    const first = deferred<void>()
    bridge.sendResults.push(first.promise, undefined)
    conversation.sendToRoom('first')
    conversation.sendToRoom('second')
    expect(held(last()).roomTopic).toBe('first')

    first.reject({ code: 'session/busy', message: 'session · busy' })
    await settle()

    expect(held(last()).roomTopic).toBe('second')
  })

  it('keeps the topic a delivered first message set when a later one is refused', async () => {
    const { conversation, last } = await live()
    bridge.sendResults.push(undefined, busy())
    conversation.sendToRoom('first')
    conversation.sendToRoom('later')
    await settle()

    expect(held(last()).roomTopic).toBe('first')
    expect(held(last()).entries.filter((entry) => entry.kind === 'user')).toHaveLength(1)
  })

  it('takes the entry back and says nothing when the room the user stopped answers busy or not found (Story 4.8)', async () => {
    for (const code of ['session/busy', 'session/not-found']) {
      bridge = new FakeBridge()
      const { conversation, last, failures, handoffs } = await live()
      const waiting = deferred<void>()
      bridge.sendResults.push(waiting.promise)
      conversation.sendToRoom('waiting')
      void conversation.stopRoom()
      waiting.reject({ code, message: 'session · refused' })
      await settle()

      expect(held(last()).entries).toEqual([])
      expect(held(last()).roomReturned).toBeUndefined()
      expect(handoffs).toEqual([])
      expect(failures.filter((failure) => failure !== null)).toEqual([])
    }
  })

  it('takes a refused entry back without a line when the room already closed on its own, and keeps nothing to return', async () => {
    const { conversation, last, failures, handoffs } = await live()
    const waiting = deferred<void>()
    bridge.sendResults.push(waiting.promise)
    conversation.sendToRoom('waiting')
    bridge.push({ name: 'session:closed', payload: { sessionId: 'r1', reason: 'process-exited', at: 9 } })
    waiting.reject({ code: 'session/busy', message: 'session · busy' })
    await settle()

    expect(held(last()).entries).toEqual([])
    expect(handoffs).toEqual([])
    expect(failures.filter((failure) => failure !== null)).toEqual([])
  })

  it('treats a refusal as a refusal again when main refused the stop', async () => {
    const { conversation, last, failures } = await live()
    bridge.closeResults.push(Promise.reject({ code: 'session/not-found', message: 'session · no such session is open' }))
    expect(await conversation.stopRoom()).toBe(false)
    bridge.sendResults.push(busy())
    conversation.sendToRoom('x')
    await settle()

    expect(held(last()).entries).toEqual([expect.objectContaining({ kind: 'sysline' })])
    expect(failures).toContainEqual(expect.objectContaining({ code: 'session/not-found' }))
  })

  it('keeps the entry, clears the busy mark and shows the failure for not found with the room live', async () => {
    const { conversation, last, failures, handoffs } = await live()
    bridge.sendResults.push(Promise.reject({ code: 'session/not-found', message: 'session · no such session is open' }))
    conversation.sendToRoom('x')
    await settle()

    expect(held(last()).busy.has('r1')).toBe(false)
    expect(held(last()).entries).toEqual([expect.objectContaining({ kind: 'user', text: 'x' })])
    expect(held(last()).roomReturned).toBeUndefined()
    expect(handoffs).toEqual([])
    expect(failures[failures.length - 1]).toMatchObject({ code: 'session/not-found' })
  })

  it('clears the busy mark, keeps the entry and shows the failure for any other refusal', async () => {
    const { conversation, last, failures } = await live()
    bridge.sendResults.push(Promise.reject({ code: 'session/write-failed', message: 'session · the turn could not be written' }))
    conversation.sendToRoom('x')
    await settle()

    expect(held(last()).busy.has('r1')).toBe(false)
    expect(held(last()).entries).toHaveLength(1)
    expect(failures[failures.length - 1]).toMatchObject({ code: 'session/write-failed' })
  })

  it('sends nothing when there is no live room', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    conversation.sendToRoom('x')

    expect(bridge.sends).toEqual([])
    expect(last()?.entries ?? []).toEqual([])
  })

  it('is cleared with the conversation: no cast, no room', async () => {
    const { conversation, last } = await live()
    await conversation.end('/project')

    expect(held(last()).roomCast).toEqual([])
    expect(held(last()).room).toBeUndefined()
  })

  it('opens the room at the time main’s reply gave, and reads the first message as the topic', async () => {
    const { last, conversation } = await live()
    expect(held(last()).roomOpenedAt).toBe(bridge.roomOpenedAt)
    expect(held(last()).roomTopic).toBeUndefined()

    conversation.sendToRoom('  Payouts —\nmore  ')
    conversation.sendToRoom('second')
    bridge.push(spoke(john.id, 'm#1', 'No.'))

    expect(held(last()).roomTopic).toBe('Payouts —')
  })

  it('is cleared with the conversation: no open time, no topic', async () => {
    const { conversation, last } = await live()
    conversation.sendToRoom('topic')
    await conversation.end('/project')

    expect(held(last()).roomOpenedAt).toBeUndefined()
    expect(held(last()).roomTopic).toBeUndefined()
  })
})

describe('writeSummary (Story 4.4)', () => {
  const CAST = [mary.id, john.id]
  type Held = { room?: string; roomTopic?: string; busy: ReadonlySet<string>; entries: readonly { kind: string; room?: true; queuedFor?: string; text?: string }[] }
  const held = (published: object | undefined): Held => published as unknown as Held
  const ASK = /^Write a summary of this conversation to _bmad\/party\/\d{4}-\d{2}-\d{2}-/

  async function live() {
    const made = build()
    await connected(made.conversation)
    void made.conversation.openRoom(CAST)
    bridge.openResult[0].resolve('r1')
    await settle()
    bridge.push({ name: 'session:awaiting-turn', payload: { sessionId: 'r1', at: 2 } })
    // The user's clock is past the moment the room opened, as it is in a window.
    clock = bridge.roomOpenedAt
    return made
  }

  it('sends the ask to the room session once, shows it as one unqueued room entry and marks the room busy', async () => {
    const { conversation, last } = await live()
    conversation.writeSummary('_bmad/')

    expect(bridge.sends).toHaveLength(1)
    expect(bridge.sends[0][0]).toBe('r1')
    expect(bridge.sends[0][1]).toMatch(ASK)
    expect(bridge.sends[0][1]).toContain('-<topic>.md')
    const state = held(last())
    expect(state.busy.has('r1')).toBe(true)
    expect(state.entries).toEqual([
      expect.objectContaining({ kind: 'user', room: true, text: bridge.sends[0][1] })
    ])
    expect(state.entries[0].queuedFor).toBeUndefined()
    expect(state.roomTopic).toBeUndefined()
  })

  it('asks for the destination under the folder it is given', async () => {
    const { conversation } = await live()
    conversation.sendToRoom('Payouts')
    conversation.writeSummary('docs/out/')

    expect(bridge.sends[1][1]).toMatch(/to docs\/out\/party\/\d{4}-\d{2}-\d{2}-payouts\.md\. Cover/)
  })

  it('names the topic once the room has one, and the ask is never the topic', async () => {
    const { conversation, last } = await live()
    conversation.sendToRoom('Payouts')
    conversation.writeSummary('_bmad/')

    expect(bridge.sends[1][1]).toMatch(/-payouts\.md\. Cover/)
    expect(held(last()).roomTopic).toBe('Payouts')
  })

  it('sends into a room mid-turn with no gate', async () => {
    const { conversation, last } = await live()
    bridge.push({ name: 'persona:said', payload: { sessionId: 'r1', agentId: mary.id, messageId: 'm#1', text: 'Hi', at: 3, room: true } })
    conversation.writeSummary('_bmad/')

    expect(bridge.sends).toHaveLength(1)
    expect(held(last()).entries.filter((entry) => entry.kind === 'user' && entry.queuedFor !== undefined)).toEqual([])
  })

  it('takes the ask back when main refuses as busy: one harness line, the room busy, topic and destination as before, nothing returned (Story 4.8)', async () => {
    const { conversation, last, failures, handoffs } = await live()
    conversation.sendToRoom('Payouts')
    bridge.sendResults.push(busy())
    conversation.writeSummary('_bmad/')
    await settle()

    const state = held(last())
    expect(state.busy.has('r1')).toBe(true)
    expect(state.roomTopic).toBe('Payouts')
    expect(state.entries.map((entry) => entry.kind)).toEqual(['user', 'sysline'])
    expect(state.entries[1]).toMatchObject({ room: true, text: 'not sent · the room is still speaking' })
    expect(handoffs).toHaveLength(1)
    expect((state as unknown as { roomReturned?: unknown }).roomReturned).toBeUndefined()
    expect(failures.filter((failure) => failure !== null)).toEqual([])
  })

  it('leaves a room with no topic without one when the ask is refused', async () => {
    const { conversation, last } = await live()
    bridge.sendResults.push(busy())
    conversation.writeSummary('_bmad/')
    await settle()

    expect(held(last()).roomTopic).toBeUndefined()
  })

  it('clears the busy mark, keeps the entry and shows the failure for any other refusal', async () => {
    const { conversation, last, failures } = await live()
    bridge.sendResults.push(Promise.reject({ code: 'session/write-failed', message: 'session · the turn could not be written' }))
    conversation.writeSummary('_bmad/')
    await settle()

    expect(held(last()).busy.has('r1')).toBe(false)
    expect(held(last()).entries).toHaveLength(1)
    expect(failures[failures.length - 1]).toMatchObject({ code: 'session/write-failed' })
  })

  it('sends nothing when there is no live room', async () => {
    const { conversation, last } = build()
    await connected(conversation)
    conversation.writeSummary('_bmad/')

    expect(bridge.sends).toEqual([])
    expect(last()?.entries ?? []).toEqual([])
  })
})

describe('stopRoom (Story 4.5)', () => {
  const CAST = [mary.id, john.id]
  const roomClosed = (sessionId: string): ContractEvent => ({
    name: 'session:closed',
    payload: { sessionId, reason: 'closed', at: 9 }
  })
  type Held = { room?: string; roomCast: readonly string[]; entries: readonly { kind: string; text?: string }[] }
  const held = (published: object | undefined): Held => published as unknown as Held

  async function live() {
    const made = build()
    await connected(made.conversation)
    void made.conversation.openRoom(CAST)
    bridge.openResult[0].resolve('r1')
    await settle()
    return made
  }

  it('closes the room’s own session once, and session:closed is what removes the room; the entries stay', async () => {
    const { conversation, last, failures } = await live()
    bridge.push({ name: 'persona:said', payload: { sessionId: 'r1', agentId: mary.id, messageId: 'm#1', text: 'Hi', at: 3, room: true } })

    expect(await conversation.stopRoom()).toBe(true)

    expect(bridge.closed).toEqual(['r1'])
    expect(held(last()).room).toBe('r1')
    expect(failures.filter((failure) => failure !== null)).toEqual([])
    bridge.push(roomClosed('r1'))
    expect(held(last()).room).toBeUndefined()
    expect(held(last()).roomCast).toEqual([])
    expect(held(last()).entries).toMatchObject([{ text: 'Hi' }])
    expect(bridge.ends).toEqual([])
  })

  it('shows a refusal as the failure line, keeps the room and resolves false', async () => {
    const { conversation, last, failures } = await live()
    bridge.closeResults.push(Promise.reject({ code: 'session/not-found', message: 'session · no such session is open' }))

    expect(await conversation.stopRoom()).toBe(false)

    expect(failures.at(-1)).toMatchObject({ code: 'session/not-found' })
    expect(held(last()).room).toBe('r1')
  })

  it('resolves true with no failure when the refusal comes after session:closed was folded', async () => {
    const { conversation, failures } = await live()
    const refused = deferred<void>()
    bridge.closeResults.push(refused.promise)

    const result = conversation.stopRoom()
    bridge.push(roomClosed('r1'))
    refused.reject({ code: 'session/not-found', message: 'session · no such session is open' })

    expect(await result).toBe(true)
    expect(failures.filter((failure) => failure !== null)).toEqual([])
  })

  it('is not a failure when a send still waiting is refused after stop room: no line, no entry in the stopped transcript (Story 4.8)', async () => {
    const { conversation, last, failures, handoffs } = await live()
    const waiting = deferred<void>()
    bridge.sendResults.push(waiting.promise)
    conversation.sendToRoom('waiting')
    const stopping = conversation.stopRoom()
    waiting.reject({ code: 'session/busy', message: 'session · busy' })
    expect(await stopping).toBe(true)
    bridge.push(roomClosed('r1'))
    await settle()

    expect(held(last()).entries).toEqual([])
    expect(handoffs).toEqual([])
    expect(failures.filter((failure) => failure !== null)).toEqual([])
  })

  it('sends nothing and resolves false with no live room', async () => {
    const { conversation } = build()
    await connected(conversation)

    expect(await conversation.stopRoom()).toBe(false)
    expect(bridge.closed).toEqual([])
  })

  it('leaves a persona’s session alone', async () => {
    const { conversation } = await live()
    bridge.push(opened('s2', mary.id))

    await conversation.stopRoom()

    expect(bridge.closed).toEqual(['r1'])
  })
})
