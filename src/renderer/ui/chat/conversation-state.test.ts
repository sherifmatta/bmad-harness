import { describe, expect, it } from 'vitest'
import type { ConversationSnapshot, SyslineRecord } from '../../../shared/conversation'
import type { ContractEvent, PersonaState } from '../../../shared/events'
import type { AgentView } from '../../../shared/install'
import {
  canAnswer,
  cancelQueued,
  dispatchFailed,
  dispatchStarted,
  dropQueued,
  ended,
  foldEvent,
  hydrate,
  initialConversation,
  orphansOf,
  runCardOf,
  sendMessage,
  sessionOf,
  sessionReady,
  withHandoff
} from './conversation-state'
import type { ConversationState, Delivery } from './conversation-state'

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
const agentOf = (id: string): AgentView | undefined => [mary, john].find((agent) => agent.id === id)

const said = (
  messageId: string,
  text: string,
  at = 1,
  agentId: string | null = mary.id
): ContractEvent => ({
  name: 'persona:said',
  payload: {
    sessionId: 's1',
    ...(agentId === null ? {} : { agentId }),
    messageId,
    text,
    at
  }
})

/** A message sent as the window sends it: to Mary, named for the queue marker. */
function send(
  state: ConversationState,
  text: string,
  at = 50,
  agentId = mary.id
): { state: ConversationState; deliver?: Delivery } {
  return sendMessage(state, agentId, at, text, agentOf(agentId)?.name ?? agentId)
}

function fold(events: ContractEvent[], from: ConversationState = initialConversation) {
  let state = from
  for (const event of events) state = foldEvent(state, event, agentOf).state
  return state
}

describe('persona:said', () => {
  it('starts a persona entry with the agent’s own view and the first piece’s time', () => {
    const state = fold([said('m1', 'Hel', 10)])

    expect(state.entries).toEqual([
      {
        kind: 'persona',
        id: 'entry-0',
        at: 10,
        agent: mary,
        text: 'Hel',
        messageId: 'm1'
      }
    ])
  })

  it('joins the pieces of one messageId into one turn, in order, with the words untouched', () => {
    const state = fold([
      said('m1', ' Hel', 10),
      said('m1', 'lo\n\n', 11),
      said('m1', '  there ', 12)
    ])

    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]).toMatchObject({
      at: 10,
      text: ' Hello\n\n  there '
    })
  })

  it('starts a new turn for the next messageId', () => {
    const state = fold([said('m1', 'one', 1), said('m2', 'two', 2)])

    expect(
      state.entries.map((entry) => [entry.id, entry.kind === 'persona' && entry.text])
    ).toEqual([
      ['entry-0', 'one'],
      ['entry-1', 'two']
    ])
  })

  it('does not join across a user turn, or across personas', () => {
    const afterUser = foldEvent(
      send(fold([said('m1', 'one'), openedEvent('s1', mary.id), awaitingTurn('s1')]), 'reply', 5)
        .state,
      said('m1', 'two'),
      agentOf
    ).state
    expect(afterUser.entries.map((entry) => entry.kind)).toEqual(['persona', 'user', 'persona'])

    const across = fold([said('m1', 'one'), said('m1', 'two', 2, john.id)])
    expect(across.entries).toHaveLength(2)
    expect(across.entries[1]).toMatchObject({ agent: john })
  })

  it('shows a persona the roster no longer names under its id, and ignores a speaker with none', () => {
    const gone = fold([said('m1', 'hi', 1, 'bmad-agent-gone')])
    expect(gone.entries[0]).toMatchObject({
      agent: { id: 'bmad-agent-gone', name: 'bmad-agent-gone' }
    })

    expect(fold([said('m1', 'hi', 1, null)]).entries).toEqual([])
  })

  it('does not change the state it was handed', () => {
    const before = fold([said('m1', 'one')])
    const snapshot = JSON.stringify(before.entries)
    foldEvent(before, said('m1', 'two'), agentOf)

    expect(JSON.stringify(before.entries)).toBe(snapshot)
  })
})

describe('sessions', () => {
  const opened = (sessionId: string, agentId: string | null = mary.id): ContractEvent => ({
    name: 'session:opened',
    payload: { sessionId, ...(agentId === null ? {} : { agentId }), at: 1 }
  })
  const closed = (sessionId: string, reason: 'closed' | 'process-exited' = 'process-exited'): ContractEvent => ({
    name: 'session:closed',
    payload: { sessionId, reason, at: 2 }
  })

  it('keeps a session per agent from session:opened and forgets it on session:closed', () => {
    let state = fold([opened('s1'), opened('s2', john.id)])
    expect(sessionOf(state, mary.id)).toBe('s1')
    expect(sessionOf(state, john.id)).toBe('s2')

    state = fold([closed('s1')], state)
    expect(sessionOf(state, mary.id)).toBeUndefined()
    expect(sessionOf(state, john.id)).toBe('s2')
  })

  it('drops that persona’s queued messages with their entries when the user closes its session, and no one else’s', () => {
    let state = fold([opened('s1'), opened('s2', john.id)])
    state = send(send(state, 'a').state, 'b', 51, john.id).state
    state = fold([closed('s1', 'closed')], state)

    expect([...state.queue.keys()]).toEqual([john.id])
    expect(state.entries.map((entry) => entry.kind === 'user' && entry.text)).toEqual(['b'])
    expect(state.busy.has('s1')).toBe(false)
    expect(state.busy.has('s2')).toBe(true)
  })

  it('keeps the queued messages, with their entries, when the process exits on its own, and sends the first to the next session', () => {
    let state = fold([opened('s1')])
    state = send(send(state, 'a', 50).state, 'b', 51).state
    state = fold([closed('s1', 'process-exited')], state)

    expect(sessionOf(state, mary.id)).toBeUndefined()
    expect(state.queue.get(mary.id)?.map((message) => message.text)).toEqual(['a', 'b'])
    expect(state.entries.map((entry) => entry.kind === 'user' && entry.text)).toEqual(['a', 'b'])
    expect(state.busy.has('s1')).toBe(false)

    // The next session takes them first in first, one per turn.
    const next = foldEvent(
      foldEvent(state, opened('s2'), agentOf).state,
      { name: 'session:awaiting-turn', payload: { sessionId: 's2', at: 3 } },
      agentOf
    )
    expect(next.deliver).toMatchObject({ sessionId: 's2', text: 'a' })
    expect(next.state.queue.get(mary.id)?.map((message) => message.text)).toEqual(['b'])
  })

  it('takes the harness’s own line as a sysline at the end, once, and not again for the same id', () => {
    const line: ContractEvent = {
      name: 'harness:said',
      payload: { sessionId: 's1', id: 'm-4', text: 'turn failed · error_during_execution', at: 9 }
    }
    let state = fold([opened('s1'), said('m1', 'Hello', 1, mary.id)])
    state = fold([line, line], state)

    expect(state.entries.map((entry) => [entry.kind, entry.id, 'text' in entry ? entry.text : undefined])).toEqual([
      ['persona', expect.any(String), 'Hello'],
      ['sysline', 'm-4', 'turn failed · error_during_execution']
    ])
    // The words that follow it are a message of their own.
    state = fold([said('m1', ' more', 10, mary.id)], state)
    expect(state.entries.map((entry) => entry.kind)).toEqual(['persona', 'sysline', 'persona'])
  })

  describe('orphansOf', () => {
    it('is a live session whose agent the roster lacks, in session order, as the transcript last knew it', () => {
      const state = fold([
        opened('s1'),
        opened('s2', john.id),
        said('m1', 'Hello', 1, john.id),
        said('m2', 'Hi', 2, mary.id)
      ])

      expect(orphansOf(state, [mary, john])).toEqual([])
      expect(orphansOf(state, [john])).toEqual([mary])
      expect(orphansOf(state, [mary])).toEqual([john])
      expect(orphansOf(state, [])).toEqual([mary, john])
    })

    it('is the agent id as the name when no turn of the persona is held', () => {
      const state = fold([opened('s1', 'bmad-agent-gone')])

      expect(orphansOf(state, [mary])).toEqual([
        { id: 'bmad-agent-gone', module: '', name: 'bmad-agent-gone', title: '', icon: '', description: '' }
      ])
    })

    it('is gone with its session, and is not a function of the roster alone', () => {
      const state = fold([opened('s1'), said('m1', 'Hello')])

      expect(orphansOf(state, [john])).toEqual([mary])
      expect(orphansOf(fold([closed('s1')], state), [john])).toEqual([])
      expect(orphansOf(initialConversation, [])).toEqual([])
    })

    it('does not touch the state it reads', () => {
      const state = fold([opened('s1'), said('m1', 'Hello')])
      const before = JSON.stringify([state.entries, [...state.sessions], [...state.busy]])
      orphansOf(state, [])

      expect(JSON.stringify([state.entries, [...state.sessions], [...state.busy]])).toBe(before)
    })
  })

  it('has no session for an inherited key', () => {
    expect(sessionOf(initialConversation, 'constructor')).toBeUndefined()
  })

  it('ignores an opened session that names no agent', () => {
    expect(fold([opened('s1', null)]).sessions.size).toBe(0)
  })

  it('is busy from session:opened until its awaiting-turn, and nothing is delivered when nothing waits', () => {
    const awaitingTurn = (sessionId: string): ContractEvent => ({
      name: 'session:awaiting-turn',
      payload: { sessionId, at: 3 }
    })
    const live = fold([opened('s1')])
    expect(live.busy.has('s1')).toBe(true)

    const idle = foldEvent(live, awaitingTurn('s1'), agentOf)
    expect(idle.state.busy.has('s1')).toBe(false)
    expect(idle.deliver).toBeUndefined()
    expect(foldEvent(idle.state, awaitingTurn('s9'), agentOf).deliver).toBeUndefined()
  })
})

const awaitingTurn = (sessionId: string): ContractEvent => ({
  name: 'session:awaiting-turn',
  payload: { sessionId, at: 3 }
})
const openedEvent = (sessionId: string, agentId: string): ContractEvent => ({
  name: 'session:opened',
  payload: { sessionId, agentId, at: 1 }
})

describe('sending', () => {
  const idle = fold([openedEvent('s1', mary.id), awaitingTurn('s1')])

  it('sends at once, as a plain turn, to an idle session, which is then busy', () => {
    const sent = send(idle, ' hi\nthere ', 42)

    expect(sent.deliver).toMatchObject({ sessionId: 's1', text: ' hi\nthere ' })
    expect(sent.state.entries).toEqual([
      { kind: 'user', id: 'entry-0', at: 42, text: ' hi\nthere ' }
    ])
    expect(sent.state.busy.has('s1')).toBe(true)
    expect(sent.state.queue.size).toBe(0)
  })

  it('queues a send to a busy session in the same state as its entry, and delivers nothing', () => {
    const sent = send(send(idle, 'one').state, 'two', 51)

    expect(sent.deliver).toBeUndefined()
    expect(sent.state.entries).toEqual([
      { kind: 'user', id: 'entry-0', at: 50, text: 'one' },
      { kind: 'user', id: 'entry-1', at: 51, text: 'two', queuedFor: 'Mary' }
    ])
    expect(sent.state.queue.get(mary.id)).toEqual([{ entryId: 'entry-1', text: 'two' }])
  })

  it('queues a send to a persona with no session', () => {
    const sent = send(initialConversation, 'hello')

    expect(sent.deliver).toBeUndefined()
    expect(sent.state.entries).toMatchObject([{ text: 'hello', queuedFor: 'Mary' }])
    expect(sent.state.queue.get(mary.id)).toHaveLength(1)
  })

  it('names a persona the roster does not know by what it was given', () => {
    const sent = sendMessage(initialConversation, 'gone', 1, 'x', 'gone')

    expect(sent.state.entries).toMatchObject([{ queuedFor: 'gone' }])
  })

  it('sends one queued message per awaiting-turn, first in first, un-dimming its entry in place', () => {
    const state = send(send(send(idle, 'zero').state, 'one', 51).state, 'two', 52).state

    const first = foldEvent(state, awaitingTurn('s1'), agentOf)
    expect(first.deliver).toMatchObject({ sessionId: 's1', text: 'one' })
    expect(first.state.busy.has('s1')).toBe(true)
    expect(first.state.entries).toEqual([
      { kind: 'user', id: 'entry-0', at: 50, text: 'zero' },
      { kind: 'user', id: 'entry-1', at: 51, text: 'one' },
      { kind: 'user', id: 'entry-2', at: 52, text: 'two', queuedFor: 'Mary' }
    ])
    expect(first.state.entries[1]).not.toHaveProperty('queuedFor')

    const second = foldEvent(first.state, awaitingTurn('s1'), agentOf)
    expect(second.deliver).toMatchObject({ sessionId: 's1', text: 'two' })
    expect(second.state.queue.size).toBe(0)

    const none = foldEvent(second.state, awaitingTurn('s1'), agentOf)
    expect(none.deliver).toBeUndefined()
    expect(none.state.busy.has('s1')).toBe(false)
  })

  it('keeps each session’s queue and busy to itself', () => {
    let state = fold([openedEvent('s1', mary.id), openedEvent('s2', john.id), awaitingTurn('s2')])
    const toMary = send(state, 'to mary')
    state = toMary.state
    expect(toMary.deliver).toBeUndefined()

    const toJohn = send(state, 'to john', 51, john.id)
    expect(toJohn.deliver).toMatchObject({ sessionId: 's2', text: 'to john' })

    const maryDone = foldEvent(toJohn.state, awaitingTurn('s1'), agentOf)
    expect(maryDone.deliver).toMatchObject({ sessionId: 's1', text: 'to mary' })
  })

  it('sends the head of an idle persona’s queue first, so a failed send leaves the order as typed', () => {
    const queued = send(send(idle, 'zero').state, 'one', 51).state
    const failed = dispatchFailed(queued, 's1')
    expect(failed.busy.has('s1')).toBe(false)

    const next = send(failed, 'two', 52)
    expect(next.deliver).toMatchObject({ sessionId: 's1', text: 'one' })
    expect(next.state.queue.get(mary.id)).toEqual([{ entryId: 'entry-2', text: 'two' }])
  })

  it('does not change the state it was handed', () => {
    const snapshot = JSON.stringify([idle.entries, [...idle.queue], [...idle.busy]])
    send(idle, 'x')

    expect(JSON.stringify([idle.entries, [...idle.queue], [...idle.busy]])).toBe(snapshot)
  })
})

describe('cancelling', () => {
  it('removes the entry and its queue item, and nothing is ever delivered for it', () => {
    const busy = fold([openedEvent('s1', mary.id)])
    const queued = send(send(busy, 'one').state, 'two', 51).state
    const cancelled = cancelQueued(queued, 'entry-0')

    expect(cancelled.entries.map((entry) => entry.id)).toEqual(['entry-1'])
    expect(cancelled.queue.get(mary.id)).toEqual([{ entryId: 'entry-1', text: 'two' }])
    expect(foldEvent(cancelled, awaitingTurn('s1'), agentOf).deliver).toMatchObject({
      sessionId: 's1',
      text: 'two'
    })
  })

  it('empties the persona’s queue with its last item, and leaves a sent turn alone', () => {
    const idle = fold([openedEvent('s1', mary.id), awaitingTurn('s1')])
    const sent = send(idle, 'sent').state
    expect(cancelQueued(sent, 'entry-0')).toBe(sent)

    const queued = send(sent, 'queued', 51).state
    expect(cancelQueued(queued, 'entry-1').queue.size).toBe(0)
  })

  it('does not reuse the id of a removed entry', () => {
    const queued = send(fold([openedEvent('s1', mary.id)]), 'one').state
    const next = send(cancelQueued(queued, 'entry-0'), 'two')

    expect(next.state.entries.map((entry) => entry.id)).toEqual(['entry-1'])
  })
})

describe('a session that does not come', () => {
  it('drops the queued messages and their entries when the open fails, and not another persona’s', () => {
    const state = send(send(initialConversation, 'a').state, 'b', 51, john.id).state
    const dropped = dropQueued(state, mary.id)

    expect(dropped.entries).toMatchObject([{ text: 'b' }])
    expect([...dropped.queue.keys()]).toEqual([john.id])
    expect(dropQueued(dropped, mary.id)).toBe(dropped)
  })
})

describe('the reply to opening a session', () => {
  it('leaves a session the events announced as it is, still busy, with its queue waiting', () => {
    const state = send(fold([openedEvent('s7', mary.id)]), 'hello').state
    const ready = sessionReady(state, mary.id, 's7')

    expect(ready.state).toBe(state)
    expect(ready.deliver).toBeUndefined()
  })

  it('takes a session first met here as idle and sends the first queued message to it', () => {
    const state = send(initialConversation, 'hello').state
    const ready = sessionReady(state, mary.id, 's7')

    expect(ready.deliver).toMatchObject({ sessionId: 's7', text: 'hello' })
    expect(sessionOf(ready.state, mary.id)).toBe('s7')
    expect(ready.state.entries[0]).not.toHaveProperty('queuedFor')
  })
})

describe('a persona’s reply while a message is queued', () => {
  it('goes on joining one message’s pieces past the queued turns below it', () => {
    let state = fold([openedEvent('s1', mary.id), awaitingTurn('s1')])
    state = send(state, 'first').state
    state = fold([said('m1', 'Hel', 60)], state)
    state = send(state, 'queued', 61).state
    state = fold([said('m1', 'lo', 62)], state)

    expect(state.entries.map((entry) => entry.kind)).toEqual(['user', 'persona', 'user'])
    expect(state.entries[1]).toMatchObject({ text: 'Hello', at: 60 })
  })
})

describe('events the conversation has no use for', () => {
  it('leave the state as it was', () => {
    const events: ContractEvent[] = [
      { name: 'run:finished', payload: { runId: 'r', sessionId: 's', at: 1 } }
    ]
    for (const event of events) {
      expect(foldEvent(initialConversation, event, agentOf).state).toBe(initialConversation)
    }
  })
})

describe('persona:state', () => {
  const personaState = (state: PersonaState, at: number): ContractEvent => ({
    name: 'persona:state',
    payload: { agentId: mary.id, state, at }
  })

  it('is kept as main said it, with the instant the state began', () => {
    const next = foldEvent(initialConversation, personaState('work', 5), agentOf).state

    expect(next.personas.get(mary.id)).toEqual({ state: 'work', at: 5 })
    expect(next.entries).toBe(initialConversation.entries)
  })

  it('is replaced by the next report for the same persona and leaves the others', () => {
    let state = foldEvent(initialConversation, personaState('work', 5), agentOf).state
    state = foldEvent(
      state,
      { name: 'persona:state', payload: { agentId: 'other', state: 'error', at: 6 } },
      agentOf
    ).state
    state = foldEvent(state, personaState('idle', 9), agentOf).state

    expect(state.personas.get(mary.id)).toEqual({ state: 'idle', at: 9 })
    expect(state.personas.get('other')).toEqual({ state: 'error', at: 6 })
  })

  it('does not change what the conversation sends or holds busy when the persona has no session', () => {
    const folded = foldEvent(initialConversation, personaState('work', 5), agentOf)

    expect(folded.deliver).toBeUndefined()
    expect(folded.state.busy).toBe(initialConversation.busy)
    expect(folded.state.sessions).toBe(initialConversation.sessions)
  })

  it('holds the persona’s session busy while it is working, for a turn nobody sent: nothing is sent into it and no decision is offered', () => {
    const idle = fold([
      { name: 'session:opened', payload: { sessionId: 's1', agentId: mary.id, at: 1 } },
      { name: 'session:awaiting-turn', payload: { sessionId: 's1', at: 2 } }
    ])
    expect(canAnswer(idle, mary.id)).toBe(true)

    const woken = foldEvent(idle, personaState('work', 5), agentOf)

    expect(woken.state.busy.has('s1')).toBe(true)
    expect(canAnswer(woken.state, mary.id)).toBe(false)
    // What the user types meanwhile waits, in place, until the turn ends.
    const typed = send(woken.state, 'later')
    expect(typed.deliver).toBeUndefined()
    expect(typed.state.queue.get(mary.id)).toHaveLength(1)
  })

  it('does not free a busy session when the persona stops working: the turn ending does', () => {
    const working = fold([{ name: 'session:opened', payload: { sessionId: 's1', agentId: mary.id, at: 1 } }])
    const next = foldEvent(working, personaState('error', 5), agentOf).state

    expect(next.busy.has('s1')).toBe(true)
  })
})

describe('hydrate', () => {
  const snapshot = (over: Partial<ConversationSnapshot> = {}): ConversationSnapshot => ({
    entries: [],
    sessions: [],
    busy: [],
    personas: [],
    runs: [],
    ...over
  })
  const stored: ConversationSnapshot['entries'] = [
    { kind: 'user', id: 'm-0', at: 5, text: 'hello' },
    { kind: 'persona', id: 'm-1', at: 6, agentId: mary.id, messageId: 'msg_1', text: 'Hel' }
  ]

  it('shows the stored turns as the window’s own, with the agent resolved from the roster', () => {
    const { state } = hydrate(initialConversation, snapshot({ entries: stored }), agentOf)

    expect(state.entries).toEqual([
      { kind: 'user', id: 'm-0', at: 5, text: 'hello' },
      { kind: 'persona', id: 'm-1', at: 6, agent: mary, text: 'Hel', messageId: 'msg_1' }
    ])
  })

  it('names a persona the roster does not hold by its id', () => {
    const { state } = hydrate(initialConversation, snapshot({ entries: stored }), () => undefined)

    expect(state.entries[1]).toMatchObject({ agent: { id: mary.id, name: mary.id } })
  })

  it('takes the live sessions, the busy ones and the personas that are not idle from main', () => {
    const { state } = hydrate(
      initialConversation,
      snapshot({
        sessions: [{ agentId: mary.id, sessionId: 's1' }],
        busy: ['s1'],
        personas: [{ agentId: mary.id, state: 'work', at: 7 }]
      }),
      agentOf
    )

    expect(sessionOf(state, mary.id)).toBe('s1')
    expect([...state.busy]).toEqual(['s1'])
    expect(state.personas.get(mary.id)).toEqual({ state: 'work', at: 7 })
    expect(state.personas.size).toBe(1)
  })

  it('lets a word that follows join the message that was in flight, and awaiting-turn free the session', () => {
    const hydrated = hydrate(
      initialConversation,
      snapshot({ entries: stored, sessions: [{ agentId: mary.id, sessionId: 's1' }], busy: ['s1'] }),
      agentOf
    ).state
    const joined = fold([said('msg_1', 'lo', 9), said('msg_2', 'next', 10)], hydrated)

    expect(joined.entries.map((entry) => ('text' in entry ? entry.text : undefined))).toEqual(['hello', 'Hello', 'next'])
    expect(
      foldEvent(
        joined,
        { name: 'session:awaiting-turn', payload: { sessionId: 's1', at: 11 } },
        agentOf
      ).state.busy.size
    ).toBe(0)
  })

  it('queues a send into a session that is busy, and sends it when the turn ends', () => {
    const hydrated = hydrate(
      initialConversation,
      snapshot({ sessions: [{ agentId: mary.id, sessionId: 's1' }], busy: ['s1'] }),
      agentOf
    ).state
    const sent = send(hydrated, 'later')

    expect(sent.deliver).toBeUndefined()
    expect(sent.state.entries[0]).toMatchObject({ text: 'later', queuedFor: 'Mary' })
    const ended = foldEvent(
      sent.state,
      { name: 'session:awaiting-turn', payload: { sessionId: 's1', at: 12 } },
      agentOf
    )
    expect(ended.deliver).toMatchObject({ sessionId: 's1', text: 'later' })
  })

  it('keeps what was typed before it arrived, after the transcript, and sends it into an idle session', () => {
    const typed = send(initialConversation, 'early', 50).state
    const { state, deliveries } = hydrate(
      typed,
      snapshot({ entries: stored, sessions: [{ agentId: mary.id, sessionId: 's1' }] }),
      agentOf
    )

    expect(state.entries.map((entry) => ('text' in entry ? entry.text : undefined))).toEqual(['hello', 'Hel', 'early'])
    expect(state.entries[2]).not.toHaveProperty('queuedFor')
    expect(deliveries).toMatchObject([{ sessionId: 's1', text: 'early' }])
    expect(state.busy.has('s1')).toBe(true)
  })

  it('keeps what was typed queued when the session is busy or not yet open', () => {
    let typed = send(initialConversation, 'to-busy', 50, mary.id).state
    typed = send(typed, 'to-nobody', 51, john.id).state
    const { state, deliveries } = hydrate(
      typed,
      snapshot({ sessions: [{ agentId: mary.id, sessionId: 's1' }], busy: ['s1'] }),
      agentOf
    )

    expect(deliveries).toEqual([])
    expect(state.entries).toMatchObject([
      { text: 'to-busy', queuedFor: 'Mary' },
      { text: 'to-nobody', queuedFor: 'John' }
    ])
  })
})

describe('ended', () => {
  it('drops the entries, queue, live sessions and busy set, and keeps the personas as main reported them', () => {
    let state = fold([
      { name: 'session:opened', payload: { sessionId: 's1', agentId: mary.id, at: 1 } },
      said('m1', 'Hello'),
      { name: 'persona:state', payload: { agentId: mary.id, state: 'work', at: 5 } }
    ])
    state = send(state, 'queued while busy').state
    expect(state.entries).toHaveLength(2)
    expect(state.busy.size).toBe(1)
    expect(state.queue.size).toBe(1)

    const after = ended(state)

    expect(after.entries).toEqual([])
    expect(after.sessions.size).toBe(0)
    expect(after.busy.size).toBe(0)
    expect(after.queue.size).toBe(0)
    expect([...after.personas]).toEqual([[mary.id, { state: 'work', at: 5 }]])
  })

  it('does not reuse an entry key, so the next message is a new entry', () => {
    const state = ended(send(initialConversation, 'one').state)
    const next = send(state, 'two').state

    expect(next.entries).toMatchObject([{ id: 'entry-1', text: 'two' }])
  })

  it('leaves an empty conversation empty', () => {
    expect(ended(initialConversation)).toEqual(initialConversation)
  })
})

describe('a handoff sysline', () => {
  const record: SyslineRecord = {
    kind: 'sysline',
    id: 'm-2',
    at: 20,
    text: 'handed off · Mary → John · picking up from a.md, b.md'
  }
  const spoken = fold([said('msg_1', 'Hello', 10)])

  it('joins the transcript at the end as an entry of its own, with no agent, name or portrait', () => {
    const handed = withHandoff(spoken, record)

    expect(handed.entries).toEqual([
      expect.objectContaining({ kind: 'persona', text: 'Hello' }),
      { kind: 'sysline', id: 'm-2', at: 20, text: record.text }
    ])
    expect(Object.keys(handed.entries[1]).sort()).toEqual(['at', 'id', 'kind', 'text'])
  })

  it('is added once, however often the same record arrives', () => {
    const once = withHandoff(spoken, record)

    expect(withHandoff(once, record)).toBe(once)
  })

  it('ends the persona message before it: that persona’s later words open a new one after the line', () => {
    const handed = withHandoff(spoken, record)
    const later = fold([said('msg_1', ' and more', 30)], handed)

    expect(later.entries.map((entry) => entry.kind)).toEqual(['persona', 'sysline', 'persona'])
    expect(later.entries.map((entry) => ('text' in entry ? entry.text : undefined))).toEqual(['Hello', record.text, ' and more'])
  })

  it('is hydrated from the stored transcript like any record, and nothing else is added', () => {
    const { state } = hydrate(
      initialConversation,
      { entries: [{ kind: 'user', id: 'm-0', at: 5, text: 'hi' }, record], sessions: [], busy: [], personas: [], runs: [] },
      agentOf
    )

    expect(state.entries).toEqual([
      { kind: 'user', id: 'm-0', at: 5, text: 'hi' },
      { kind: 'sysline', id: 'm-2', at: 20, text: record.text }
    ])
  })

  it('does not end a queued message: words that arrive while one is queued still join the message before it', () => {
    const queued = send(spoken, 'typed meanwhile').state
    const handed = withHandoff(queued, record)

    expect(handed.entries.map((entry) => entry.kind)).toEqual(['persona', 'user', 'sysline'])
  })
})

describe('canAnswer', () => {
  it('is false for a persona with no live session', () => {
    expect(canAnswer(initialConversation, mary.id)).toBe(false)
  })

  it('is false while the session has a turn in flight, true once it awaits one, false once it closes', () => {
    const open = fold([openedEvent('s1', mary.id)])
    expect(canAnswer(open, mary.id)).toBe(false)

    const idle = fold([awaitingTurn('s1')], open)
    expect(canAnswer(idle, mary.id)).toBe(true)
    expect(canAnswer(idle, john.id)).toBe(false)

    const sent = send(idle, 'hello').state
    expect(canAnswer(sent, mary.id)).toBe(false)

    const closed = fold(
      [{ name: 'session:closed', payload: { sessionId: 's1', reason: 'process-exited', at: 9 } }],
      idle
    )
    expect(canAnswer(closed, mary.id)).toBe(false)
  })

  it('is false after a relaunch: a snapshot with no live session leaves nothing to answer', () => {
    const { state } = hydrate(
      initialConversation,
      { entries: [], sessions: [], busy: [], personas: [], runs: [] },
      agentOf
    )
    expect(canAnswer(state, mary.id)).toBe(false)
  })

  it('is true for a session the window met only through a snapshot, if main says it is idle', () => {
    const { state } = hydrate(
      initialConversation,
      { entries: [], sessions: [{ agentId: mary.id, sessionId: 's1' }], busy: [], personas: [], runs: [] },
      agentOf
    )
    expect(canAnswer(state, mary.id)).toBe(true)
  })
})

describe('a run’s card (Story 3.1)', () => {
  const R = { runId: 'r1', sessionId: 's1' }
  const started: ContractEvent = { name: 'run:started', payload: { ...R, agentId: mary.id, code: 'CP', at: 50 } }

  it('is born on run:started in time order, running and empty, and its session is busy', () => {
    const state = fold([said('m1', 'Hello', 10), started])
    expect(state.entries.map((entry) => entry.kind)).toEqual(['persona', 'run'])
    expect(runCardOf(state, 'r1')).toEqual({
      kind: 'run',
      id: 'r1',
      at: 50,
      runId: 'r1',
      sessionId: 's1',
      agentId: mary.id,
      status: 'running',
      notes: [],
      sections: []
    })
    expect(state.busy.has('s1')).toBe(true)
    expect(fold([started, started]).entries).toHaveLength(1)
  })

  it('takes notes, committed headings once each, and one terminal event', () => {
    const state = fold([
      started,
      { name: 'run:note', payload: { ...R, text: '- (event) a', at: 51 } },
      { name: 'doc:committed', payload: { ...R, ok: true, callId: 'c', path: 'p.md', sections: ['A', 'B'], at: 52 } },
      { name: 'doc:committed', payload: { ...R, ok: true, callId: 'd', path: 'p.md', sections: ['B', 'C'], at: 53 } },
      { name: 'run:finished', payload: { ...R, at: 60 } },
      { name: 'run:note', payload: { ...R, text: '- late', at: 61 } }
    ])
    expect(runCardOf(state, 'r1')).toMatchObject({
      status: 'finished',
      endedAt: 60,
      notes: [{ text: '- (event) a', at: 51 }],
      sections: ['A', 'B', 'C']
    })
  })

  it('reads failed with its envelope, and ignores events of a run it never saw start', () => {
    const error = { code: 'run/failed', message: 'run · the run failed', detail: 'x' }
    const failed = fold([started, { name: 'run:failed', payload: { ...R, error, at: 70 } }])
    expect(runCardOf(failed, 'r1')).toMatchObject({ status: 'failed', endedAt: 70, error })
    const ghost = fold([{ name: 'run:finished', payload: { runId: 'gone', sessionId: 's1', at: 1 } }])
    expect(ghost.entries).toEqual([])
  })

  it('folds no doc:prose: a piece of a document is no state change', () => {
    const state = fold([started])
    const prose: ContractEvent = { name: 'doc:prose', payload: { ...R, callId: 'c', path: 'p.md', text: 'x', at: 51 } }
    expect(foldEvent(state, prose, agentOf).state).toBe(state)
  })

  it('comes back from the snapshot of a window that reloaded, in time order among the turns', () => {
    const snapshot: ConversationSnapshot = {
      entries: [{ kind: 'persona', id: 'm-0', at: 10, agentId: mary.id, messageId: 'msg', text: 'Hi' }],
      sessions: [{ agentId: mary.id, sessionId: 's1' }],
      busy: ['s1'],
      personas: [],
      runs: [
        {
          ...R,
          agentId: mary.id,
          code: 'CP',
          startedAt: 20,
          status: 'finished',
          endedAt: 30,
          notes: [{ text: '- n', at: 21 }],
          sections: ['A'],
          prose: { callId: 'c', path: 'p.md', text: 'x' }
        }
      ]
    }
    const state = hydrate(initialConversation, snapshot, agentOf).state
    expect(state.entries.map((entry) => entry.kind)).toEqual(['persona', 'run'])
    expect(runCardOf(state, 'r1')).toMatchObject({ status: 'finished', endedAt: 30, sections: ['A'], notes: [{ text: '- n' }] })
    expect(runCardOf(state, 'r1')).not.toHaveProperty('code')
  })

  it('holds the session busy from a dispatch, and goes with the conversation when it ends', () => {
    expect(dispatchStarted(initialConversation, 's1').busy.has('s1')).toBe(true)
    expect(ended(fold([started])).entries).toEqual([])
  })
})
