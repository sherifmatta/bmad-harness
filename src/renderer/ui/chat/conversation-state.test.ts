import { describe, expect, it } from 'vitest'
import type { ConversationSnapshot, SyslineRecord } from '../../../shared/conversation'
import type { ContractEvent, PersonaState } from '../../../shared/events'
import type { AgentView } from '../../../shared/install'
import { roomSummaryTurn } from '../../../shared/room-summary'
import {
  canAnswer,
  cancelQueued,
  dispatchFailed,
  dispatchRefusedBusy,
  dispatchStarted,
  dropQueued,
  ended,
  foldEvent,
  hydrate,
  initialConversation,
  orphansOf,
  personaTurnsInFlight,
  ROOM_REFUSED_LINE,
  roomReady,
  roomRefused,
  roomSent,
  roomSummaryAsked,
  roomTurnInFlight,
  roomTurnsOf,
  roomUnsent,
  runCardOf,
  sendMessage,
  sessionOf,
  sessionReady,
  speakerOf,
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

describe('a typed mention (Story 2.15)', () => {
  const idle = fold([openedEvent('s1', mary.id), awaitingTurn('s1')])
  const busy = fold([openedEvent('s1', mary.id)])
  const typed = (state: ConversationState, text: string, mention?: string) =>
    sendMessage(state, mary.id, 50, text, 'Mary', mention)

  it('sends it with the turn to an idle session, and shows it on the entry', () => {
    const sent = typed(idle, 'go', '@Mary')

    expect(sent.deliver).toEqual({ sessionId: 's1', agentId: mary.id, entryId: 'entry-0', text: 'go', mention: '@Mary' })
    expect(sent.state.entries).toEqual([{ kind: 'user', id: 'entry-0', at: 50, text: 'go', mention: '@Mary' }])
  })

  it('sends a plain turn with no mention at all', () => {
    const sent = typed(idle, 'go')

    expect(sent.deliver).not.toHaveProperty('mention')
    expect(sent.state.entries[0]).not.toHaveProperty('mention')
  })

  it('keeps it on the queued entry and the queue item, and sends it when the session is free', () => {
    const queued = typed(busy, 'go', '@Mary')

    expect(queued.deliver).toBeUndefined()
    expect(queued.state.entries).toEqual([
      { kind: 'user', id: 'entry-0', at: 50, text: 'go', mention: '@Mary', queuedFor: 'Mary' }
    ])
    expect(queued.state.queue.get(mary.id)).toEqual([{ entryId: 'entry-0', text: 'go', mention: '@Mary' }])

    const freed = foldEvent(queued.state, awaitingTurn('s1'), agentOf)
    expect(freed.deliver).toMatchObject({ text: 'go', mention: '@Mary' })
    expect(freed.state.entries[0]).toEqual({ kind: 'user', id: 'entry-0', at: 50, text: 'go', mention: '@Mary' })
  })

  it('sends it when the session was not up at all, once it comes up', () => {
    const queued = typed(initialConversation, 'go', '@Mary')

    expect(queued.state.entries[0]).toMatchObject({ mention: '@Mary', queuedFor: 'Mary' })
    expect(sessionReady(queued.state, mary.id, 's1').deliver).toMatchObject({ text: 'go', mention: '@Mary' })
  })

  it('goes back to the head of the queue with its mention when a send is refused as busy', () => {
    const sent = typed(idle, 'go', '@Mary')
    const refused = dispatchRefusedBusy(sent.state, sent.deliver!, 'Mary')

    expect(refused.entries[0]).toMatchObject({ mention: '@Mary', queuedFor: 'Mary' })
    expect(refused.queue.get(mary.id)).toEqual([{ entryId: 'entry-0', text: 'go', mention: '@Mary' }])
  })

  it('is taken out with the entry when the queued message is cancelled', () => {
    const cancelled = cancelQueued(typed(busy, 'go', '@Mary').state, 'entry-0')

    expect(cancelled.entries).toEqual([])
    expect(cancelled.queue.size).toBe(0)
  })

  it.each([[3], [null], [''], ['  '], ['Mary'], ['@ Mary']])(
    'restores a user turn whose stored mention is %j as a plain turn',
    (bad) => {
      const { state } = hydrate(
        initialConversation,
        {
          entries: [{ kind: 'user', id: 'm-0', at: 5, text: 'go', mention: bad } as never],
          sessions: [],
          busy: [],
          personas: [],
          runs: []
        },
        agentOf
      )

      expect(state.entries).toEqual([{ kind: 'user', id: 'm-0', at: 5, text: 'go' }])
    }
  )

  it('restores a room user turn carrying a mention as a plain room turn', () => {
    const { state } = hydrate(
      initialConversation,
      {
        entries: [{ kind: 'user', id: 'm-0', at: 5, text: 'go', room: true, mention: '@Mary' }],
        sessions: [],
        busy: [],
        personas: [],
        runs: []
      },
      agentOf
    )

    expect(state.entries).toEqual([{ kind: 'user', id: 'm-0', at: 5, text: 'go', room: true }])
  })

  it('shows a stored mention on a restored turn', () => {
    const { state } = hydrate(
      initialConversation,
      {
        entries: [
          { kind: 'user', id: 'm-0', at: 5, text: 'go', mention: '@Mary' },
          { kind: 'user', id: 'm-1', at: 6, text: 'plain' }
        ],
        sessions: [],
        busy: [],
        personas: [],
        runs: []
      },
      agentOf
    )

    expect(state.entries).toEqual([
      { kind: 'user', id: 'm-0', at: 5, text: 'go', mention: '@Mary' },
      { kind: 'user', id: 'm-1', at: 6, text: 'plain' }
    ])
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

  it('leaves a persona session with no turn in flight answerable whatever its dot reads, and holds it for `work` alone', () => {
    const idle = fold([
      { name: 'session:opened', payload: { sessionId: 's1', agentId: mary.id, at: 1 } },
      { name: 'session:awaiting-turn', payload: { sessionId: 's1', at: 2 } }
    ])
    for (const dot of ['idle', 'live', 'note', 'error'] as const) {
      expect(canAnswer(foldEvent(idle, personaState(dot, 5), agentOf).state, mary.id)).toBe(true)
    }
    expect(canAnswer(foldEvent(idle, personaState('work', 5), agentOf).state, mary.id)).toBe(false)
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

describe('hydrate: a live room (Story 4.7)', () => {
  const ROOM = { sessionId: 'r1', cast: [john.id, mary.id], openedAt: 100 }
  const snapshot = (over: Partial<ConversationSnapshot> = {}): ConversationSnapshot => ({
    entries: [],
    sessions: [],
    busy: [],
    personas: [],
    runs: [],
    room: ROOM,
    ...over
  })
  const userIn = (id: string, at: number, text: string, room = true): ConversationSnapshot['entries'][number] => ({
    kind: 'user',
    id,
    at,
    text,
    ...(room ? { room: true as const } : {})
  })
  const taken = (over: Partial<ConversationSnapshot> = {}): ConversationState =>
    hydrate(initialConversation, snapshot(over), agentOf).state

  it('takes the room, its cast in open order and its open time from main', () => {
    const state = taken()

    expect(state.room).toBe('r1')
    expect(state.roomCast).toEqual([john.id, mary.id])
    expect(state.roomOpenedAt).toBe(100)
    expect(state.sessions.size).toBe(0)
  })

  it('has no room, cast, time or topic when the snapshot names none', () => {
    const state = taken({ room: undefined, entries: [userIn('m-0', 150, 'topic')] })

    expect(state).toMatchObject({ room: undefined, roomCast: [], roomOpenedAt: undefined, roomTopic: undefined })
  })

  it('is busy when main says it is, and its speaker is lit from the stored entries', () => {
    const state = taken({
      busy: ['r1'],
      entries: [userIn('m-0', 110, 'hello'), { kind: 'persona', id: 'm-1', at: 120, agentId: john.id, messageId: 'a', text: 'Hi', room: true }]
    })

    expect(state.busy.has('r1')).toBe(true)
    expect(speakerOf(state)).toBe(john.id)
    expect(speakerOf(taken({ entries: [userIn('m-0', 110, 'hello')] }))).toBeUndefined()
  })

  it('counts the room’s persona entries from the open on as its turns', () => {
    const state = taken({
      entries: [
        { kind: 'persona', id: 'm-0', at: 50, agentId: john.id, messageId: 'a', text: 'old', room: true },
        { kind: 'persona', id: 'm-1', at: 120, agentId: john.id, messageId: 'b', text: 'new', room: true }
      ]
    })

    expect(roomTurnsOf(state)).toBe(1)
  })

  it('derives the topic as the first non-blank, non-summary-ask room user entry at or after the open', () => {
    const ask = roomSummaryTurn('_bmad/party/2026-01-01-x.md')
    const state = taken({
      entries: [
        userIn('m-0', 50, 'an earlier room'),
        userIn('m-1', 100, '   '),
        userIn('m-2', 101, ask),
        userIn('m-3', 102, 'not the room', false),
        userIn('m-4', 103, '  Payouts —\nmore  '),
        userIn('m-5', 104, 'second')
      ]
    })

    expect(state.roomTopic).toBe('Payouts —')
  })

  it('has no topic when the room has had no message but the summary ask', () => {
    expect(taken({ entries: [userIn('m-0', 110, roomSummaryTurn('_bmad/party/2026-01-01-<topic>.md'))] }).roomTopic).toBeUndefined()
    expect(taken({ entries: [] }).roomTopic).toBeUndefined()
  })

  it('agrees with a room that was live: the summary ask typed first is no topic there either', () => {
    const live = roomReady(foldEvent(initialConversation, { name: 'session:opened', payload: { sessionId: 'r1', at: 100 } }, agentOf).state, 'r1', [john.id])
    const ask = roomSummaryTurn('_bmad/party/2026-01-01-<topic>.md')

    expect(roomSent(live, 110, ask).state.roomTopic).toBeUndefined()
    expect(roomSent(roomSent(live, 110, ask).state, 120, 'real').state.roomTopic).toBe('real')
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
    text: 'handed to John'
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
      steps: [],
      documents: []
    })
    expect(state.busy.has('s1')).toBe(true)
    expect(fold([started, started]).entries).toHaveLength(1)
  })

  it('takes notes, each committed path’s sections as its last confirmed write left them, and one terminal event', () => {
    const state = fold([
      started,
      { name: 'run:note', payload: { ...R, text: '- (event) a', at: 51 } },
      { name: 'doc:committed', payload: { ...R, ok: true, callId: 'c', path: 'p.md', sections: ['A', 'B'], at: 52 } },
      { name: 'doc:committed', payload: { ...R, ok: true, callId: 'e', path: 'q.md', sections: ['Q'], at: 53 } },
      { name: 'doc:committed', payload: { ...R, ok: true, callId: 'd', path: 'p.md', sections: ['B', 'C'], text: '## B\n## C', at: 54 } },
      {
        name: 'doc:committed',
        payload: { ...R, ok: false, callId: 'f', path: 'p.md', error: { code: 'doc/write-rejected', message: 'x' }, at: 55 }
      },
      { name: 'run:finished', payload: { ...R, at: 60 } },
      { name: 'run:note', payload: { ...R, text: '- late', at: 61 } }
    ])
    expect(runCardOf(state, 'r1')).toMatchObject({
      status: 'finished',
      endedAt: 60,
      notes: [{ text: '- (event) a', at: 51 }],
      documents: [
        { path: 'p.md', sections: ['B', 'C'] },
        { path: 'q.md', sections: ['Q'] }
      ]
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
          steps: [],
          documents: [{ path: 'p.md', callId: 'c', text: 'x', written: 1, sections: ['A'] }]
        }
      ]
    }
    const state = hydrate(initialConversation, snapshot, agentOf).state
    expect(state.entries.map((entry) => entry.kind)).toEqual(['persona', 'run'])
    expect(runCardOf(state, 'r1')).toMatchObject({
      status: 'finished',
      endedAt: 30,
      documents: [{ path: 'p.md', sections: ['A'] }],
      notes: [{ text: '- n' }]
    })
    expect(runCardOf(state, 'r1')).not.toHaveProperty('code')
  })

  it('is born with the plan run:started carried, adds the names a note pulled once each, and has none when the run had none (Story 3.3)', () => {
    const plan: ContractEvent = {
      name: 'run:started',
      payload: { ...R, agentId: mary.id, code: 'CP', plan: ['Vision', 'Scope'], at: 50 }
    }
    const state = fold([
      plan,
      { name: 'run:note', payload: { ...R, text: '- concern scan: Why Now, scope', pulled: ['Why Now', 'scope'], at: 51 } },
      { name: 'run:note', payload: { ...R, text: '- plain', at: 52 } },
      { name: 'run:note', payload: { ...R, text: '- concern scan: Why Now', pulled: ['why now'], at: 53 } }
    ])
    expect(runCardOf(state, 'r1')?.plan).toEqual(['Vision', 'Scope', 'Why Now'])
    expect(runCardOf(fold([started]), 'r1')).not.toHaveProperty('plan')
    expect(runCardOf(fold([started, { name: 'run:note', payload: { ...R, text: '- n', at: 51 } }]), 'r1')).not.toHaveProperty('plan')
  })

  it('carries a card’s plan from the snapshot a reloading window is handed (Story 3.3)', () => {
    const snapshot: ConversationSnapshot = {
      entries: [],
      sessions: [],
      busy: [],
      personas: [],
      runs: [
        {
          ...R,
          agentId: mary.id,
          code: 'CP',
          plan: ['Vision', 'Scope'],
          startedAt: 20,
          status: 'running',
          notes: [],
          steps: [],
          documents: []
        }
      ]
    }
    expect(runCardOf(hydrate(initialConversation, snapshot, agentOf).state, 'r1')?.plan).toEqual(['Vision', 'Scope'])
  })

  describe('steps (Story 3.16)', () => {
    const running = (callId: string, at: number): ContractEvent => ({
      name: 'run:step',
      payload: { ...R, callId, status: 'running', label: `read ${callId}.md`, at }
    })
    const closed = (callId: string, status: 'done' | 'failed', at: number): ContractEvent => ({
      name: 'run:step',
      payload: { ...R, callId, status, at }
    })

    it('holds a step as main’s card does: the notes held when it began, closed by its result, once', () => {
      const state = fold([
        started,
        running('a', 51),
        { name: 'run:note', payload: { ...R, text: '- (event) one', at: 52 } },
        running('b', 53),
        closed('a', 'done', 54),
        closed('a', 'failed', 55),
        running('a', 56),
        closed('nobody', 'done', 57)
      ])
      expect(runCardOf(state, 'r1')?.steps).toEqual([
        { callId: 'a', label: 'read a.md', status: 'done', startedAt: 51, endedAt: 54, notesBefore: 0 },
        { callId: 'b', label: 'read b.md', status: 'running', startedAt: 53, notesBefore: 1 }
      ])
    })

    it('closes a running step as failed at the terminal event’s instant, and takes no step after the end', () => {
      const state = fold([started, running('a', 51), { name: 'run:finished', payload: { ...R, at: 60 } }, running('late', 61), closed('a', 'done', 62)])
      expect(runCardOf(state, 'r1')?.steps).toEqual([{ callId: 'a', label: 'read a.md', status: 'failed', startedAt: 51, endedAt: 60, notesBefore: 0 }])
    })

    it('copies a card’s steps from the snapshot a reloading window is handed', () => {
      const steps = [{ callId: 'a', label: 'read a.md', status: 'running' as const, startedAt: 51, notesBefore: 0 }]
      const snapshot: ConversationSnapshot = {
        entries: [],
        sessions: [],
        busy: [],
        personas: [],
        runs: [{ ...R, agentId: mary.id, code: 'CP', startedAt: 20, status: 'running', notes: [], steps, documents: [] }]
      }
      const state = hydrate(initialConversation, snapshot, agentOf).state
      expect(runCardOf(state, 'r1')?.steps).toEqual(steps)
      expect(runCardOf(foldEvent(state, closed('a', 'done', 70), agentOf).state, 'r1')?.steps[0]).toMatchObject({ status: 'done', endedAt: 70 })
    })

    it('leaves the state as it was for a step of a run it has no card for', () => {
      expect(foldEvent(initialConversation, running('a', 1), agentOf).state).toBe(initialConversation)
    })
  })

  it('holds the session busy from a dispatch, and goes with the conversation when it ends', () => {
    expect(dispatchStarted(initialConversation, 's1').busy.has('s1')).toBe(true)
    expect(ended(fold([started])).entries).toEqual([])
  })
})

describe('the room’s cast, turns and speaker (Story 4.2)', () => {
  const opened = (sessionId: string): ContractEvent => ({ name: 'session:opened', payload: { sessionId, at: 1 } })
  const awaiting = (sessionId: string): ContractEvent => ({ name: 'session:awaiting-turn', payload: { sessionId, at: 2 } })
  const closed = (sessionId: string): ContractEvent => ({
    name: 'session:closed',
    payload: { sessionId, reason: 'process-exited', at: 9 }
  })
  const spoke = (agentId: string, messageId: string, text: string, at = 3, room = true): ContractEvent => ({
    name: 'persona:said',
    payload: { sessionId: 'r1', agentId, messageId, text, at, ...(room ? { room: true as const } : {}) }
  })
  const fold = (state: ConversationState, ...events: ContractEvent[]): ConversationState =>
    events.reduce((held, event) => foldEvent(held, event, agentOf).state, state)
  const live = (): ConversationState => roomReady(fold(initialConversation, opened('r1')), 'r1', [mary.id, john.id])

  it('keeps the cast the open’s reply made, and drops it with the room or the conversation', () => {
    expect(live().roomCast).toEqual([mary.id, john.id])
    expect(fold(live(), closed('r1')).roomCast).toEqual([])
    expect(fold(live(), closed('r1')).room).toBeUndefined()
    expect(ended(live()).roomCast).toEqual([])
  })

  it('keeps the cast when the event is met after the reply, and sets none from the event alone', () => {
    expect(fold(initialConversation, opened('r1')).roomCast).toEqual([])
    expect(fold(live(), opened('r1')).roomCast).toEqual([mary.id, john.id])
  })

  it('has the room busy for its activation turn, until it is awaiting', () => {
    expect(fold(initialConversation, opened('r1')).busy.has('r1')).toBe(true)
    expect(fold(initialConversation, opened('r1'), awaiting('r1')).busy.has('r1')).toBe(false)
  })

  it('folds a room persona:said into a persona entry with the room flag, joined by message id', () => {
    const state = fold(live(), spoke(mary.id, 'm#1', 'Hi'), spoke(mary.id, 'm#1', '.'), spoke(john.id, 'm#2', 'No.'))

    expect(state.entries.map((entry) => (entry.kind === 'persona' ? [entry.agent.id, entry.messageId, entry.text, entry.room] : []))).toEqual([
      [mary.id, 'm#1', 'Hi.', true],
      [john.id, 'm#2', 'No.', true]
    ])
  })

  it('makes a turn nobody sent put the room busy, and leaves a persona’s own busy set alone', () => {
    const idle = fold(live(), awaiting('r1'))
    expect(idle.busy.has('r1')).toBe(false)

    expect(fold(idle, spoke(mary.id, 'm#1', 'Hi')).busy.has('r1')).toBe(true)
    expect(fold(idle, spoke(mary.id, 'm#1', 'Hi', 3, false)).busy.has('r1')).toBe(false)
  })

  it('still ignores a persona:said with neither an agent nor the room flag', () => {
    const state = fold(live(), { name: 'persona:said', payload: { sessionId: 'r1', messageId: 'm', text: 'x', at: 1 } })
    expect(state.entries).toEqual([])
  })

  it('names the speaker: the last room persona entry while the room is busy, else no one', () => {
    const idle = fold(live(), awaiting('r1'))
    expect(speakerOf(idle)).toBeUndefined()

    const mary1 = fold(idle, spoke(mary.id, 'm#1', 'Hi'))
    expect(speakerOf(mary1)).toBe(mary.id)
    expect(speakerOf(fold(mary1, spoke(john.id, 'm#2', 'No.')))).toBe(john.id)
    // Mary again: three turns, the latest is hers.
    expect(speakerOf(fold(mary1, spoke(john.id, 'm#2', 'No.'), spoke(mary.id, 'm#3', 'Hm')))).toBe(mary.id)
    expect(speakerOf(fold(mary1, awaiting('r1')))).toBeUndefined()
    expect(speakerOf(fold(mary1, closed('r1')))).toBeUndefined()
  })

  it('lights no one after the user sends into an idle room that has earlier turns', () => {
    const earlier = fold(live(), spoke(mary.id, 'm#1', 'Hi'), awaiting('r1'))
    expect(speakerOf(roomSent(earlier, 50, 'next').state)).toBeUndefined()
  })

  it('lights no one in a new room while old turns are still held, until someone speaks in it', () => {
    const old = fold(live(), spoke(mary.id, 'm#1', 'Hi'), closed('r1'))
    const again = fold(roomReady(fold(old, opened('r2')), 'r2', [mary.id]), {
      name: 'harness:said',
      payload: { sessionId: 'r2', id: 'm-9', text: 'room opened by you · present · Mary', at: 20, room: true }
    })
    expect(again.busy.has('r2')).toBe(true)
    expect(speakerOf(again)).toBeUndefined()

    const spoken = fold(again, { name: 'persona:said', payload: { sessionId: 'r2', agentId: john.id, messageId: 'n#1', text: 'Hm', at: 21, room: true } })
    expect(speakerOf(spoken)).toBe(john.id)
  })

  it('lights no one after a send mid-speech, until a persona speaks again', () => {
    const mid = roomSent(fold(live(), spoke(mary.id, 'm#1', 'Hi')), 50, 'wait').state
    expect(speakerOf(mid)).toBeUndefined()
    expect(speakerOf(fold(mid, spoke(john.id, 'm#2', 'Yes')))).toBe(john.id)
  })

  it('lights no one for a persona’s own 1:1 words, even in a busy room', () => {
    const state = fold(live(), spoke(mary.id, 'msg_1', 'one to one', 3, false))
    expect(speakerOf(state)).toBeUndefined()
  })

  it('records a send into the room as one unqueued room entry and marks the room busy', () => {
    const idle = fold(live(), awaiting('r1'))
    const sent = roomSent(idle, 50, 'hello room')

    expect(sent.sessionId).toBe('r1')
    expect(sent.state.entries).toEqual([{ kind: 'user', id: 'entry-0', at: 50, text: 'hello room', room: true }])
    expect(sent.state.busy.has('r1')).toBe(true)
    expect(sent.state.queue.size).toBe(0)
  })

  it('sends into a busy room as well, with no gate and no queue', () => {
    const sent = roomSent(fold(live(), spoke(mary.id, 'm#1', 'Hi')), 50, 'wait')

    expect(sent.sessionId).toBe('r1')
    expect(sent.state.entries.filter((entry) => entry.kind === 'user')).toHaveLength(1)
    expect(sent.state.queue.size).toBe(0)
    expect(sent.state.entries.every((entry) => entry.kind !== 'user' || entry.queuedFor === undefined)).toBe(true)
  })

  it('has nothing to send into without a live room', () => {
    expect(roomSent(initialConversation, 1, 'x')).toEqual({ state: initialConversation })
  })

  it('clears the room’s busy mark when its send is refused for another reason', () => {
    const sent = roomSent(fold(live(), awaiting('r1')), 50, 'x')
    expect(dispatchFailed(sent.state, 'r1').busy.has('r1')).toBe(false)
  })

  it('hydrates the room flag of stored persona and user records', () => {
    const snapshot: ConversationSnapshot = {
      entries: [
        { kind: 'user', id: 'm-0', at: 1, text: 'q', room: true },
        { kind: 'persona', id: 'm-1', at: 2, agentId: mary.id, messageId: 'm#1', text: 'a', room: true },
        { kind: 'user', id: 'm-2', at: 3, text: 'plain' }
      ],
      sessions: [],
      busy: [],
      personas: [],
      runs: []
    }
    const { state } = hydrate(initialConversation, snapshot, agentOf)

    expect(state.entries.map((entry) => ('room' in entry ? entry.room : undefined))).toEqual([true, true, undefined])
  })
})

describe('what the room is about (Story 4.3)', () => {
  const opened = (sessionId: string, at: number): ContractEvent => ({ name: 'session:opened', payload: { sessionId, at } })
  const closed = (sessionId: string): ContractEvent => ({
    name: 'session:closed',
    payload: { sessionId, reason: 'process-exited', at: 99 }
  })
  const spoke = (agentId: string, messageId: string, at: number, room = true): ContractEvent => ({
    name: 'persona:said',
    payload: { sessionId: 'r1', agentId, messageId, text: 'words', at, ...(room ? { room: true as const } : {}) }
  })
  const fold = (state: ConversationState, ...events: ContractEvent[]): ConversationState =>
    events.reduce((held, event) => foldEvent(held, event, agentOf).state, state)
  const live = (at = 100): ConversationState => fold(initialConversation, opened('r1', at))

  it('takes the open time from the room’s session:opened and no topic', () => {
    expect(live(100).roomOpenedAt).toBe(100)
    expect(live(100).roomTopic).toBeUndefined()
    expect(initialConversation.roomOpenedAt).toBeUndefined()
  })

  it('lets the first of the event and the reply stand', () => {
    expect(roomReady(live(100), 'r1', [mary.id], 500).roomOpenedAt).toBe(100)
    expect(fold(roomReady(initialConversation, 'r1', [mary.id], 500), opened('r1', 100)).roomOpenedAt).toBe(500)
    expect(roomReady(initialConversation, 'r1', [mary.id]).roomOpenedAt).toBeUndefined()
  })

  it('sets the topic from the first message, shaped, and never again', () => {
    const first = roomSent(live(), 110, '  Payouts —\nextend billing-svc?  ').state
    expect(first.roomTopic).toBe('Payouts —')

    const second = roomSent(first, 120, 'something else').state
    expect(second.roomTopic).toBe('Payouts —')
  })

  it('cuts a long first line to 80 characters', () => {
    expect(roomSent(live(), 110, 'x'.repeat(200)).state.roomTopic).toBe('x'.repeat(80))
  })

  it('takes an emoji-only first message as the topic', () => {
    expect(roomSent(live(), 110, '🎉🎉').state.roomTopic).toBe('🎉🎉')
  })

  it('leaves the topic open when the first message has no text in it', () => {
    const blank = roomSent(live(), 110, ' \n ').state
    expect(blank.roomTopic).toBeUndefined()
    expect(roomSent(blank, 120, 'real').state.roomTopic).toBe('real')
  })

  it('clears the open time and the topic with the room and with the conversation', () => {
    const held = roomSent(live(), 110, 'topic').state
    const closedRoom = fold(held, closed('r1'))
    expect(closedRoom.roomOpenedAt).toBeUndefined()
    expect(closedRoom.roomTopic).toBeUndefined()
    const endedRoom = ended(held)
    expect(endedRoom.roomOpenedAt).toBeUndefined()
    expect(endedRoom.roomTopic).toBeUndefined()
  })

  it('does not carry a topic into the next room', () => {
    const next = fold(fold(roomSent(live(), 110, 'old').state, closed('r1')), opened('r2', 200))
    expect(next.roomTopic).toBeUndefined()
    expect(next.roomOpenedAt).toBe(200)
  })

  it('counts room persona entries from the open on, and no user message', () => {
    const held = fold(
      live(100),
      spoke(mary.id, 'm#0', 50),
      spoke(mary.id, 'm#1', 101),
      spoke(john.id, 'm#2', 102),
      spoke(mary.id, 'm#3', 103)
    )
    const sent = roomSent(held, 104, 'hello').state

    expect(roomTurnsOf(sent)).toBe(3)
  })

  it('counts a persona entry of another view as no turn of the room', () => {
    expect(roomTurnsOf(fold(live(100), spoke(mary.id, 'm#1', 105, false)))).toBe(0)
  })

  it('has no turns without a room', () => {
    expect(roomTurnsOf(initialConversation)).toBe(0)
    expect(roomTurnsOf(fold(fold(live(100), spoke(mary.id, 'm#1', 105)), closed('r1')))).toBe(0)
  })
})

describe('asking the room for its summary (Story 4.4)', () => {
  const opened = (sessionId: string, at: number): ContractEvent => ({ name: 'session:opened', payload: { sessionId, at } })
  const fold = (state: ConversationState, ...events: ContractEvent[]): ConversationState =>
    events.reduce((held, event) => foldEvent(held, event, agentOf).state, state)
  const at = Date.parse('2026-10-08T14:31:00')
  const live = (): ConversationState => fold(initialConversation, opened('r1', at))

  it('records one room user entry with the ask, marks the room busy and returns the session and the text', () => {
    const topical = roomSent(live(), at + 10, 'Payouts').state
    const asked = roomSummaryAsked(topical, at + 20, '_bmad/')

    expect(asked.sessionId).toBe('r1')
    expect(asked.text).toContain('_bmad/party/2026-10-08-payouts.md')
    expect(asked.text?.startsWith('Write a summary of this conversation to _bmad/party/2026-10-08-payouts.md. Cover')).toBe(true)
    expect(asked.state.entries.slice(topical.entries.length)).toEqual([
      { kind: 'user', id: `entry-${topical.nextId}`, at: at + 20, text: asked.text, room: true }
    ])
    expect(asked.state.busy.has('r1')).toBe(true)
    expect(asked.state.queue.size).toBe(0)
  })

  it('carries <topic> when the room has none yet, and leaves the topic unset', () => {
    const asked = roomSummaryAsked(live(), at + 5, '_bmad/')

    expect(asked.text).toContain('_bmad/party/2026-10-08-<topic>.md')
    expect(asked.state.roomTopic).toBeUndefined()
    expect(roomSent(asked.state, at + 6, 'Payouts').state.roomTopic).toBe('Payouts')
  })

  it('asks for the destination under the folder it is given, a chosen one as the default', () => {
    const topical = roomSent(live(), at + 10, 'Payouts').state
    const asked = roomSummaryAsked(topical, at + 20, 'docs/out/')

    expect(asked.text?.startsWith('Write a summary of this conversation to docs/out/party/2026-10-08-payouts.md. Cover')).toBe(true)
    expect(asked.text).not.toContain('_bmad')
  })

  it('leaves a topic already set as it was', () => {
    const topical = roomSent(live(), at + 10, 'Payouts').state

    expect(roomSummaryAsked(topical, at + 20, '_bmad/').state.roomTopic).toBe('Payouts')
  })

  it('is sent into a busy room as well, with no gate and no queue', () => {
    const busy = fold(live(), { name: 'persona:said', payload: { sessionId: 'r1', agentId: mary.id, messageId: 'm#1', text: 'Hi', at: at + 1, room: true } })
    const asked = roomSummaryAsked(busy, at + 2, '_bmad/')

    expect(asked.sessionId).toBe('r1')
    expect(asked.state.queue.size).toBe(0)
  })

  it('sends nothing without a live room', () => {
    expect(roomSummaryAsked(initialConversation, 1, '_bmad/')).toEqual({ state: initialConversation })
  })
})

describe('a message the room refused (Story 4.8)', () => {
  const opened = (sessionId: string, at: number): ContractEvent => ({ name: 'session:opened', payload: { sessionId, at } })
  const closed = (sessionId: string): ContractEvent => ({ name: 'session:closed', payload: { sessionId, reason: 'closed', at: 9 } })
  const fold = (state: ConversationState, ...events: ContractEvent[]): ConversationState =>
    events.reduce((held, event) => foldEvent(held, event, agentOf).state, state)
  const at = Date.parse('2026-10-08T14:31:00')
  const live = (): ConversationState => fold(initialConversation, opened('r1', at))

  it('returns the entry id of a send and of the summary ask, which is the entry they added', () => {
    const sent = roomSent(live(), at + 1, 'x')
    const asked = roomSummaryAsked(sent.state, at + 2, '_bmad/')

    expect(sent.state.entries.at(-1)?.id).toBe(sent.entryId)
    expect(asked.state.entries.at(-1)?.id).toBe(asked.entryId)
    expect(sent.entryId).not.toBe(asked.entryId)
  })

  it('takes the entry, says one room line, keeps the room busy and returns the typed words', () => {
    const sent = roomSent(live(), at + 1, 'x')
    const refused = roomRefused(sent.state, sent.entryId ?? '', at + 2, true)

    expect(refused.state.entries).toEqual([
      { kind: 'sysline', id: expect.any(String), at: at + 2, text: ROOM_REFUSED_LINE, room: true }
    ])
    expect(refused.said).toMatchObject({ kind: 'sysline', text: 'not sent · the room is still speaking', room: true })
    expect(refused.state.busy.has('r1')).toBe(true)
    expect(refused.state.roomReturned).toEqual({ key: expect.any(Number), text: 'x' })
    expect(refused.state.queue.size).toBe(0)
  })

  it('keeps the line in lower case, mono-register and without terminal punctuation', () => {
    expect(ROOM_REFUSED_LINE).toBe(ROOM_REFUSED_LINE.toLowerCase())
    expect(ROOM_REFUSED_LINE).not.toMatch(/[.!?]$/)
    expect(ROOM_REFUSED_LINE).toContain(' · ')
  })

  it('reads the topic again from what is left: none after a refused first message', () => {
    const sent = roomSent(live(), at + 1, 'first')
    expect(sent.state.roomTopic).toBe('first')

    expect(roomRefused(sent.state, sent.entryId ?? '', at + 2, true).state.roomTopic).toBeUndefined()
  })

  it('hands the topic to the next message still on screen, and keeps one an earlier message set', () => {
    const first = roomSent(live(), at + 1, 'first')
    const second = roomSent(first.state, at + 2, 'second')

    expect(roomRefused(second.state, first.entryId ?? '', at + 3, true).state.roomTopic).toBe('second')
    expect(roomRefused(second.state, second.entryId ?? '', at + 3, true).state.roomTopic).toBe('first')
  })

  it('leaves the topic and destination as they were for the summary ask, and returns nothing', () => {
    const topical = roomSent(live(), at + 10, 'Payouts').state
    const asked = roomSummaryAsked(topical, at + 20, '_bmad/')
    const refused = roomRefused(asked.state, asked.entryId ?? '', at + 21, false)

    expect(refused.state.roomTopic).toBe('Payouts')
    expect(refused.state.roomReturned).toBeUndefined()
    expect(refused.state.entries.map((entry) => entry.kind)).toEqual(['user', 'sysline'])
    expect(roomSummaryAsked(refused.state, at + 22, '_bmad/').text).toContain('2026-10-08-payouts.md')
  })

  it('leaves the topic as it was when the open time is not known', () => {
    const noTime = { ...live(), roomOpenedAt: undefined, roomTopic: 'kept' }
    const sent = roomSent(noTime, at + 1, 'x')

    expect(roomRefused(sent.state, sent.entryId ?? '', at + 2, true).state.roomTopic).toBe('kept')
  })

  it('gives each refusal a key of its own', () => {
    const one = roomSent(live(), at + 1, 'one')
    const refusedOne = roomRefused(one.state, one.entryId ?? '', at + 2, true).state
    const two = roomSent(refusedOne, at + 3, 'two')
    const refusedTwo = roomRefused(two.state, two.entryId ?? '', at + 4, true).state

    expect(refusedTwo.roomReturned?.key).not.toBe(refusedOne.roomReturned?.key)
  })

  it('changes nothing and says nothing for an entry the state no longer holds', () => {
    const sent = roomSent(live(), at + 1, 'x')
    const gone = ended(sent.state)

    expect(roomRefused(gone, sent.entryId ?? '', at + 2, true)).toEqual({ state: gone })
    expect(roomRefused(sent.state, 'entry-nope', at + 2, true)).toEqual({ state: sent.state })
  })

  it('drops the entry alone when unsent: no line, no topic change, nothing returned', () => {
    const sent = roomSent(live(), at + 1, 'x')
    const unsent = roomUnsent(sent.state, sent.entryId ?? '')

    expect(unsent.entries).toEqual([])
    expect(unsent.roomReturned).toBeUndefined()
    expect(unsent.busy).toBe(sent.state.busy)
    expect(roomUnsent(unsent, sent.entryId ?? '')).toBe(unsent)
  })

  it('clears the returned words with the room and with the conversation', () => {
    const sent = roomSent(live(), at + 1, 'x')
    const refused = roomRefused(sent.state, sent.entryId ?? '', at + 2, true).state

    expect(fold(refused, closed('r1')).roomReturned).toBeUndefined()
    expect(ended(refused).roomReturned).toBeUndefined()
    expect(initialConversation.roomReturned).toBeUndefined()
  })

  it('is not in the thread after a reload: the fold of what main recorded holds neither the entry nor the line', () => {
    const sent = roomSent(live(), at + 1, 'x')
    const refused = roomRefused(sent.state, sent.entryId ?? '', at + 2, true).state
    expect(refused.entries).toHaveLength(1)

    // Main recorded nothing for the refused send, so its snapshot of the room holds only the room's own lines.
    const snapshot: ConversationSnapshot = {
      entries: [],
      sessions: [],
      busy: ['r1'],
      personas: [],
      runs: [],
      room: { sessionId: 'r1', cast: [mary.id], openedAt: at }
    }
    expect(hydrate(initialConversation, snapshot, agentOf).state.entries).toEqual([])
  })
})

describe('a turn in flight, as the thread draws it', () => {
  const stateOf = (agentId: string, state: PersonaState, at: number): ContractEvent => ({
    name: 'persona:state',
    payload: { agentId, state, at }
  })
  const opened = (sessionId: string, agentId?: string, at = 1): ContractEvent => ({
    name: 'session:opened',
    payload: { sessionId, ...(agentId === undefined ? {} : { agentId }), at }
  })
  const spoke = (agentId: string, messageId: string, text: string, at: number, room = false): ContractEvent => ({
    name: 'persona:said',
    payload: { sessionId: room ? 'r1' : 's1', agentId, messageId, text, at, ...(room ? { room: true as const } : {}) }
  })
  const awaiting = (sessionId: string, at = 99): ContractEvent => ({ name: 'session:awaiting-turn', payload: { sessionId, at } })

  describe('in a 1:1', () => {
    it('has none while no persona is reported working, whatever is busy', () => {
      expect(personaTurnsInFlight(initialConversation).size).toBe(0)
      // The window's own busy mark is no turn of main's: only the state main reports draws one.
      const sent = send(fold([opened('s1', mary.id), awaiting('s1')]), 'hello', 50)
      expect(sent.state.busy.has('s1')).toBe(true)
      expect(personaTurnsInFlight(sent.state).size).toBe(0)
    })

    it('is in flight from the instant main says work, with no words before the first lands', () => {
      const state = fold([opened('s1', mary.id), awaiting('s1', 2), stateOf(mary.id, 'work', 60)])

      expect([...personaTurnsInFlight(state)]).toEqual([[mary.id, { since: 60, entryId: undefined }]])
    })

    it('holds the words of the turn once they arrive, in the entry they are written into', () => {
      const state = fold([stateOf(mary.id, 'work', 60), spoke(mary.id, 'm1', 'Hello', 61), spoke(mary.id, 'm1', ' there', 62)])
      const entry = state.entries[0]

      expect(personaTurnsInFlight(state).get(mary.id)).toEqual({ since: 60, entryId: entry.id })
      expect(entry.kind === 'persona' && entry.text).toBe('Hello there')
    })

    it('keeps the last words of the turn through a quiet stretch, and moves to the next message of the same turn', () => {
      const first = fold([stateOf(mary.id, 'work', 60), spoke(mary.id, 'm1', 'Looking.', 61)])
      expect(personaTurnsInFlight(first).get(mary.id)?.entryId).toBe(first.entries[0].id)

      const second = fold([spoke(mary.id, 'm2', 'Found it.', 70)], first)
      expect(personaTurnsInFlight(second).get(mary.id)?.entryId).toBe(second.entries[1].id)
    })

    it('does not count words of an earlier turn as this one’s', () => {
      const earlier = fold([spoke(mary.id, 'm0', 'Before.', 10), stateOf(mary.id, 'work', 60)])

      expect(personaTurnsInFlight(earlier).get(mary.id)).toEqual({ since: 60, entryId: undefined })
    })

    it('never reads the room’s words as a persona’s own turn', () => {
      const state = fold([stateOf(mary.id, 'work', 60), spoke(mary.id, 'm1', 'In the room.', 61, true)])

      expect(personaTurnsInFlight(state).get(mary.id)).toEqual({ since: 60, entryId: undefined })
    })

    it('ends with the turn, as main reports it, and leaves the words as they were', () => {
      const working = fold([stateOf(mary.id, 'work', 60), spoke(mary.id, 'm1', 'Done.', 61)])
      for (const end of ['idle', 'live', 'error', 'note'] as const) {
        const ended = fold([stateOf(mary.id, end, 70)], working)
        expect(personaTurnsInFlight(ended).size, end).toBe(0)
        expect(ended.entries).toBe(working.entries)
      }
    })

    it('covers a session opening: the greeting turn is in flight from main’s work', () => {
      const state = fold([opened('s1', mary.id, 5), stateOf(mary.id, 'work', 5)])

      expect(personaTurnsInFlight(state).get(mary.id)).toEqual({ since: 5, entryId: undefined })
    })

    it('leaves out a persona whose run is in flight with no word of this turn yet: the run’s card shows it', () => {
      const run: ContractEvent = { name: 'run:started', payload: { runId: 'r-1', sessionId: 's1', agentId: mary.id, code: 'CP', at: 61 } }
      const running = fold([opened('s1', mary.id), stateOf(mary.id, 'work', 60), run])
      expect(personaTurnsInFlight(running).size).toBe(0)

      // Words it says during the run are this turn's, and get the caret.
      const speaking = fold([spoke(mary.id, 'm1', 'Writing now.', 62)], running)
      expect(personaTurnsInFlight(speaking).get(mary.id)).toEqual({ since: 60, entryId: speaking.entries.at(-1)?.id })

      // A run that has ended is no indicator: the turn still in flight is drawn.
      const finished = fold([{ name: 'run:finished', payload: { runId: 'r-1', sessionId: 's1', at: 70 } }], running)
      expect(personaTurnsInFlight(finished).get(mary.id)).toEqual({ since: 60, entryId: undefined })
    })

    it('lists several in the order their turns began', () => {
      const state = fold([stateOf(john.id, 'work', 80), stateOf(mary.id, 'work', 60)])

      expect([...personaTurnsInFlight(state).keys()]).toEqual([mary.id, john.id])
    })

    it('is drawn again from a hydrated snapshot after a reload, with no delta witnessed', () => {
      const { state } = hydrate(
        initialConversation,
        {
          entries: [{ kind: 'persona', id: 'm-1', at: 61, agentId: mary.id, messageId: 'a', text: 'Half a' }],
          sessions: [{ agentId: mary.id, sessionId: 's1' }],
          busy: ['s1'],
          personas: [{ agentId: mary.id, state: 'work', at: 60 }],
          runs: []
        },
        agentOf
      )

      expect(personaTurnsInFlight(state).get(mary.id)).toEqual({ since: 60, entryId: 'm-1' })
    })
  })

  describe('in the room', () => {
    const live = (): ConversationState => roomReady(fold([opened('r1', undefined, 100)]), 'r1', [mary.id, john.id], 100)

    it('has none without a room, or while the room is not busy', () => {
      expect(roomTurnInFlight(initialConversation)).toBeUndefined()
      expect(roomTurnInFlight(fold([awaiting('r1')], live()))).toBeUndefined()
    })

    it('counts the opening greeting from the room’s open, before anyone speaks', () => {
      expect(roomTurnInFlight(live())).toEqual({ since: 100, entryId: undefined })
    })

    it('counts from the user’s send, with no speaker yet', () => {
      const sent = roomSent(fold([awaiting('r1')], live()), 150, 'hello').state

      expect(roomTurnInFlight(sent)).toEqual({ since: 150, entryId: undefined })
    })

    it('holds the speaker’s words once they are known, and moves with the speaker', () => {
      const sent = roomSent(fold([awaiting('r1')], live()), 150, 'hello').state
      const mary1 = fold([spoke(mary.id, 'a', 'Hi', 151, true)], sent)
      expect(roomTurnInFlight(mary1)).toEqual({ since: 150, entryId: mary1.entries.at(-1)?.id })
      expect(speakerOf(mary1)).toBe(mary.id)

      const john1 = fold([spoke(john.id, 'b', 'No.', 152, true)], mary1)
      expect(roomTurnInFlight(john1)).toEqual({ since: 150, entryId: john1.entries.at(-1)?.id })
    })

    it('ends with the room’s turn', () => {
      const sent = roomSent(fold([awaiting('r1')], live()), 150, 'hello').state
      const spoken = fold([spoke(mary.id, 'a', 'Hi', 151, true)], sent)

      expect(roomTurnInFlight(fold([awaiting('r1', 160)], spoken))).toBeUndefined()
    })

    it('reads no word of an earlier room as this turn’s: a new room open and busy has none yet', () => {
      const closed: ContractEvent = { name: 'session:closed', payload: { sessionId: 'r1', reason: 'process-exited', at: 120 } }
      const old = fold([spoke(mary.id, 'a', 'Hi', 110, true), closed], live())
      const again = fold(
        [{ name: 'harness:said', payload: { sessionId: 'r2', id: 'm-9', text: 'room opened by you · present · Mary', at: 200, room: true } }],
        roomReady(fold([opened('r2', undefined, 200)], old), 'r2', [mary.id], 200)
      )
      expect(again.busy.has('r2')).toBe(true)
      expect(roomTurnInFlight(again)).toEqual({ since: 200, entryId: undefined })

      // Without the open line between them, the earlier room's words are still older than this room.
      const unlined: ConversationState = { ...again, entries: again.entries.filter((entry) => entry.kind !== 'sysline') }
      expect(roomTurnInFlight(unlined)).toEqual({ since: 200, entryId: undefined })
    })

    it('reads no message of an earlier room as this one’s send', () => {
      const earlier: ConversationState = {
        ...live(),
        entries: [{ kind: 'user', id: 'old', at: 20, text: 'before', room: true }]
      }

      expect(roomTurnInFlight(earlier)).toEqual({ since: 100, entryId: undefined })
    })

    it('is drawn again from a hydrated snapshot after a reload', () => {
      const { state } = hydrate(
        initialConversation,
        {
          entries: [{ kind: 'user', id: 'm-0', at: 110, text: 'hello', room: true }],
          sessions: [],
          busy: ['r1'],
          personas: [],
          runs: [],
          room: { sessionId: 'r1', cast: [mary.id], openedAt: 100 }
        },
        agentOf
      )

      expect(roomTurnInFlight(state)).toEqual({ since: 110, entryId: undefined })
    })
  })
})
