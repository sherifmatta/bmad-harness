import { describe, expect, it } from 'vitest'
import type { ContractEvent } from '../../../shared/events'
import type { AgentView } from '../../../shared/install'
import {
  addUserTurn,
  clearPending,
  foldEvent,
  holdPending,
  initialConversation,
  sessionOf,
  withSession
} from './conversation-state'
import type { ConversationState } from './conversation-state'

const mary: AgentView = {
  id: 'bmad-agent-analyst',
  module: 'bmm',
  name: 'Mary',
  title: 'Analyst',
  icon: 'i',
  description: 'd'
}
const john: AgentView = { ...mary, id: 'bmad-agent-pm', name: 'John', title: 'Product Manager' }
const agentOf = (id: string): AgentView | undefined => [mary, john].find((agent) => agent.id === id)

const said = (messageId: string, text: string, at = 1, agentId: string | null = mary.id): ContractEvent => ({
  name: 'persona:said',
  payload: { sessionId: 's1', ...(agentId === null ? {} : { agentId }), messageId, text, at }
})

function fold(events: ContractEvent[], from: ConversationState = initialConversation) {
  let state = from
  for (const event of events) state = foldEvent(state, event, agentOf).state
  return state
}

describe('persona:said', () => {
  it('starts a persona entry with the agent’s own view and the first piece’s time', () => {
    const state = fold([said('m1', 'Hel', 10)])

    expect(state.entries).toEqual([
      { kind: 'persona', id: 'entry-0', at: 10, agent: mary, text: 'Hel', messageId: 'm1' }
    ])
  })

  it('joins the pieces of one messageId into one turn, in order, with the words untouched', () => {
    const state = fold([said('m1', ' Hel', 10), said('m1', 'lo\n\n', 11), said('m1', '  there ', 12)])

    expect(state.entries).toHaveLength(1)
    expect(state.entries[0]).toMatchObject({ at: 10, text: ' Hello\n\n  there ' })
  })

  it('starts a new turn for the next messageId', () => {
    const state = fold([said('m1', 'one', 1), said('m2', 'two', 2)])

    expect(state.entries.map((entry) => [entry.id, entry.kind === 'persona' && entry.text])).toEqual([
      ['entry-0', 'one'],
      ['entry-1', 'two']
    ])
  })

  it('does not join across a user turn, or across personas', () => {
    const afterUser = foldEvent(
      addUserTurn(fold([said('m1', 'one')]), 5, 'reply'),
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
    expect(gone.entries[0]).toMatchObject({ agent: { id: 'bmad-agent-gone', name: 'bmad-agent-gone' } })

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

  it('drops that persona’s pending text when its session closes, and no one else’s', () => {
    let state = fold([opened('s1'), opened('s2', john.id)])
    state = holdPending(holdPending(state, mary.id, 'a'), john.id, 'b')
    state = fold([closed('s1')], state)

    expect([...state.pending]).toEqual([[john.id, 'b']])
  })

  it('has no session for an inherited key', () => {
    expect(sessionOf(initialConversation, 'constructor')).toBeUndefined()
  })

  it('ignores an opened session that names no agent', () => {
    expect(fold([opened('s1', null)]).sessions.size).toBe(0)
  })

  it('delivers the pending text on that session’s awaiting-turn, once, and only to it', () => {
    const waiting = holdPending(withSession(initialConversation, mary.id, 's1'), mary.id, 'hello')
    const awaiting = (sessionId: string): ContractEvent => ({
      name: 'session:awaiting-turn',
      payload: { sessionId, at: 3 }
    })

    expect(foldEvent(waiting, awaiting('s9'), agentOf).deliver).toBeUndefined()

    const first = foldEvent(waiting, awaiting('s1'), agentOf)
    expect(first.deliver).toEqual({ sessionId: 's1', text: 'hello' })
    expect(first.state.pending.size).toBe(0)
    expect(foldEvent(first.state, awaiting('s1'), agentOf).deliver).toBeUndefined()
  })

  it('has nothing to deliver for a session with no pending text', () => {
    const state = withSession(initialConversation, mary.id, 's1')

    expect(
      foldEvent(state, { name: 'session:awaiting-turn', payload: { sessionId: 's1', at: 3 } }, agentOf)
        .deliver
    ).toBeUndefined()
  })
})

describe('the user’s turn', () => {
  it('is appended at the time given with the text exactly as sent', () => {
    const state = addUserTurn(initialConversation, 42, ' hi\nthere ')

    expect(state.entries).toEqual([{ kind: 'user', id: 'entry-0', at: 42, text: ' hi\nthere ' }])
    expect(addUserTurn(state, 43, 'x').entries.map((entry) => entry.id)).toEqual(['entry-0', 'entry-1'])
  })

  it('holds and clears pending text per agent', () => {
    const held = holdPending(initialConversation, mary.id, 'a')

    expect(held.pending.get(mary.id)).toBe('a')
    expect(clearPending(held, mary.id).pending.size).toBe(0)
    expect(held.pending.size).toBe(1)
  })
})

describe('events the conversation has no use for', () => {
  it('leave the state as it was', () => {
    const events: ContractEvent[] = [
      { name: 'persona:state', payload: { agentId: mary.id, state: 'work', at: 1 } },
      { name: 'run:finished', payload: { runId: 'r', sessionId: 's', at: 1 } }
    ]
    for (const event of events) {
      expect(foldEvent(initialConversation, event, agentOf).state).toBe(initialConversation)
    }
  })
})
