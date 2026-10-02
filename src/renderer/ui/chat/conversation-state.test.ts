import { describe, expect, it } from 'vitest'
import type { ContractEvent, PersonaState } from '../../../shared/events'
import type { AgentView } from '../../../shared/install'
import {
  cancelQueued,
  dispatchFailed,
  dropQueued,
  foldEvent,
  initialConversation,
  sendMessage,
  sessionOf,
  sessionReady
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
  const closed = (sessionId: string): ContractEvent => ({
    name: 'session:closed',
    payload: { sessionId, reason: 'process-exited', at: 2 }
  })

  it('keeps a session per agent from session:opened and forgets it on session:closed', () => {
    let state = fold([opened('s1'), opened('s2', john.id)])
    expect(sessionOf(state, mary.id)).toBe('s1')
    expect(sessionOf(state, john.id)).toBe('s2')

    state = fold([closed('s1')], state)
    expect(sessionOf(state, mary.id)).toBeUndefined()
    expect(sessionOf(state, john.id)).toBe('s2')
  })

  it('drops that persona’s queued messages with their entries when its session closes, and no one else’s', () => {
    let state = fold([opened('s1'), opened('s2', john.id)])
    state = send(send(state, 'a').state, 'b', 51, john.id).state
    state = fold([closed('s1')], state)

    expect([...state.queue.keys()]).toEqual([john.id])
    expect(state.entries.map((entry) => entry.kind === 'user' && entry.text)).toEqual(['b'])
    expect(state.busy.has('s1')).toBe(false)
    expect(state.busy.has('s2')).toBe(true)
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

  it('does not change what the conversation sends or holds busy', () => {
    const folded = foldEvent(initialConversation, personaState('work', 5), agentOf)

    expect(folded.deliver).toBeUndefined()
    expect(folded.state.busy).toBe(initialConversation.busy)
    expect(folded.state.sessions).toBe(initialConversation.sessions)
  })
})
