import { describe, expect, it } from 'vitest'
import type { ConversationSnapshot } from '../../../shared/conversation'
import type { ContractEvent } from '../../../shared/events'
import type { AgentView } from '../../../shared/install'
import {
  dropQueued,
  ended,
  foldEvent,
  hydrate,
  initialConversation,
  sendMessage,
  skillKey
} from './conversation-state'
import type { ConversationState } from './conversation-state'
import {
  SESSION_ENDED_LINE,
  skillRefused,
  skillRemoved,
  skillSeatsOf,
  skillStarted,
  skillTurnInFlight
} from './skill-session-state'

const mary: AgentView = { id: 'bmad-agent-analyst', module: 'bmm', name: 'Mary', title: 'Analyst', icon: 'i', description: 'd' }
const agentOf = (id: string): AgentView | undefined => (id === mary.id ? mary : undefined)

const fold = (events: ContractEvent[], from: ConversationState = initialConversation): ConversationState =>
  events.reduce((state, event) => foldEvent(state, event, agentOf).state, from)

const opened = (sessionId = 'sk1', skill = 'bmad-build', at = 10): ContractEvent => ({
  name: 'session:opened',
  payload: { sessionId, skill, at }
})
const spoke = (text: string, messageId = 'm1', sessionId = 'sk1', at = 20): ContractEvent => ({
  name: 'persona:said',
  payload: { sessionId, messageId, text, at, skillSession: sessionId }
})
const awaiting = (sessionId = 'sk1', at = 30): ContractEvent => ({ name: 'session:awaiting-turn', payload: { sessionId, at } })
const closed = (reason: 'closed' | 'process-exited' = 'closed', sessionId = 'sk1'): ContractEvent => ({
  name: 'session:closed',
  payload: { sessionId, skill: 'bmad-build', reason, at: 40 }
})
const runStarted = (sessionId = 'sk1', runId = 'r1', at = 11): ContractEvent => ({
  name: 'run:started',
  payload: { runId, sessionId, code: 'bmad-build', skill: 'bmad-build', at }
})
const empty: ConversationSnapshot = { entries: [], sessions: [], busy: [], personas: [], runs: [] }

describe('a skill-first session in the window’s state (Story 7.5)', () => {
  it('is held live and busy from session:opened, apart from every persona session and the room', () => {
    const state = fold([opened()])

    expect([...state.skillSessions.values()]).toEqual([{ sessionId: 'sk1', skill: 'bmad-build', at: 10, live: true }])
    expect(state.busy.has('sk1')).toBe(true)
    expect(state.sessions.size).toBe(0)
    expect(state.room).toBeUndefined()
  })

  it('hears what the skill said as its own entries, joined by message, and never as a persona’s', () => {
    const state = fold([opened(), spoke('Hel'), spoke('lo'), spoke('Next', 'm2')])

    expect(state.entries).toEqual([
      { kind: 'skill', id: 'entry-0', at: 20, text: 'Hello', messageId: 'm1', skillSession: 'sk1' },
      { kind: 'skill', id: 'entry-1', at: 20, text: 'Next', messageId: 'm2', skillSession: 'sk1' }
    ])
  })

  it('keeps two sessions’ words apart even when they share a message id', () => {
    const state = fold([opened(), opened('sk2'), spoke('a', 'm', 'sk1'), spoke('b', 'm', 'sk2')])

    expect(state.entries.map((entry) => [entry.skillSession, entry.kind === 'skill' ? entry.text : undefined])).toEqual([
      ['sk1', 'a'],
      ['sk2', 'b']
    ])
  })

  it('flags a run card as its session’s and a harness line as its thread’s', () => {
    const state = fold([
      opened(),
      runStarted(),
      { name: 'harness:said', payload: { sessionId: 'sk1', id: 'm-3', text: 'session ended · the process exited', at: 50, skillSession: 'sk1' } }
    ])

    expect(state.entries).toEqual([
      expect.objectContaining({ kind: 'run', runId: 'r1', skill: 'bmad-build', skillSession: 'sk1' }),
      { kind: 'sysline', id: 'm-3', at: 50, text: 'session ended · the process exited', skillSession: 'sk1' }
    ])
    expect(state.entries[0]).not.toHaveProperty('agentId')
  })

  it('is idle when it awaits a turn, and ended when its session closes, whoever closed it, keeping its thread', () => {
    let state = fold([opened(), spoke('Hi'), awaiting()])
    expect(state.busy.has('sk1')).toBe(false)
    expect(skillSeatsOf(state)).toEqual([{ sessionId: 'sk1', skill: 'bmad-build', at: 10, state: 'live', since: undefined }])

    state = fold([closed('process-exited')], state)
    expect(skillSeatsOf(state)).toEqual([{ sessionId: 'sk1', skill: 'bmad-build', at: 10, state: 'ended', since: undefined }])
    expect(state.entries).toHaveLength(1)
  })

  it('reads working with when the turn began: the later of the start, the user’s last message and a run in flight', () => {
    let state = fold([opened('sk1', 'bmad-build', 10), runStarted('sk1', 'r1', 12)])
    expect(skillSeatsOf(state)[0]).toMatchObject({ state: 'work', since: 12 })

    state = fold([awaiting()], state)
    state = sendMessage(state, skillKey('sk1'), 100, 'again', 'bmad-build').state
    expect(skillSeatsOf(state)[0]).toMatchObject({ state: 'work', since: 100 })
  })

  it('does not move the start of the turn in flight for a message typed meanwhile, which is queued for the next', () => {
    const streaming = fold([opened('sk1', 'bmad-build', 10), spoke('Working', 'm1', 'sk1', 20)])
    const typed = sendMessage(streaming, skillKey('sk1'), 500, 'one more thing', 'bmad-build').state

    expect(skillSeatsOf(typed)[0]).toMatchObject({ state: 'work', since: 10 })
    // The entry being written keeps its caret and no pending turn appears.
    expect(skillTurnInFlight(typed, 'sk1')).toEqual({ since: 10, entryId: 'entry-0' })
  })

  it('lists the seats in start order, whichever opened last', () => {
    const state = fold([opened('b', 'bmad-build-auto', 5), opened('a', 'bmad-build', 9)])

    expect(skillSeatsOf(state).map(({ sessionId }) => sessionId)).toEqual(['b', 'a'])
  })

  it('queues a message typed in flight under the seat, flagged, and sends it when the turn ends', () => {
    let state = fold([opened(), spoke('Hi')])
    const queued = sendMessage(state, skillKey('sk1'), 50, 'wait for me', 'bmad-build')

    expect(queued.deliver).toBeUndefined()
    expect(queued.state.entries.at(-1)).toEqual({
      kind: 'user',
      id: 'entry-1',
      at: 50,
      text: 'wait for me',
      skillSession: 'sk1',
      queuedFor: 'bmad-build'
    })

    const done = foldEvent(queued.state, awaiting(), agentOf)
    expect(done.deliver).toEqual({ sessionId: 'sk1', agentId: skillKey('sk1'), entryId: 'entry-1', text: 'wait for me' })
    expect(done.state.entries.at(-1)).not.toHaveProperty('queuedFor')
    state = done.state
    expect(state.busy.has('sk1')).toBe(true)
  })

  it('drops what was typed for a session that ended, and sends nothing to it', () => {
    const queued = sendMessage(fold([opened(), spoke('Hi')]), skillKey('sk1'), 50, 'wait', 'bmad-build').state
    const state = foldEvent(queued, closed('process-exited'), agentOf).state

    expect(state.entries.some((entry) => entry.kind === 'user')).toBe(false)
    expect(state.queue.size).toBe(0)
    const again = sendMessage(state, skillKey('sk1'), 60, 'late', 'bmad-build')
    expect(again.deliver).toBeUndefined()
  })

  it('draws a started session from the open’s reply once: the user’s first turn at the instant it was sent, and no second after the events', () => {
    const replied = skillStarted(initialConversation, 'sk1', 'bmad-build', 5, '/bmad-build go')
    expect(replied.entries).toEqual([{ kind: 'user', id: 'entry-0', at: 5, text: '/bmad-build go', skillSession: 'sk1' }])
    expect(replied.busy.has('sk1')).toBe(true)

    const both = fold([opened('sk1', 'bmad-build', 6)], replied)
    expect(both.entries).toHaveLength(1)
    expect(skillStarted(both, 'sk1', 'bmad-build', 7, '/bmad-build go')).toBe(both)
    // The reply came first, so its time stands: the first of the two is kept.
    expect(both.skillSessions.get('sk1')?.at).toBe(5)
  })

  it('removes the session, its thread, its cards, its queue and its busy mark, and nothing else', () => {
    const queued = sendMessage(fold([opened(), runStarted(), spoke('Hi'), opened('other', 'bmad-build-auto'), spoke('keep', 'm', 'other')]), skillKey('sk1'), 50, 'q', 'bmad-build').state
    const withPersona = foldEvent(queued, { name: 'persona:said', payload: { sessionId: 's9', agentId: mary.id, messageId: 'p', text: 'persona', at: 60 } }, agentOf).state

    const state = skillRemoved(withPersona, 'sk1')

    expect(state.skillSessions.has('sk1')).toBe(false)
    expect(state.entries.map((entry) => entry.skillSession ?? entry.kind)).toEqual(['other', 'persona'])
    expect(state.busy.has('sk1')).toBe(false)
    expect(state.queue.size).toBe(0)
    expect(skillRemoved(state, 'sk1')).toBe(state)
  })

  it('says `session ended` once, in the session’s thread, with no user turn, and nothing for a session it does not hold', () => {
    const state = fold([opened(), spoke('Hi'), closed()])

    const refused = skillRefused(state, 'sk1', 90)

    expect(SESSION_ENDED_LINE).toBe('session ended')
    expect(refused.said).toEqual({ kind: 'sysline', id: 'entry-1', at: 90, text: 'session ended', skillSession: 'sk1' })
    expect(refused.state.entries.at(-1)).toEqual({ kind: 'sysline', id: 'entry-1', at: 90, text: 'session ended', skillSession: 'sk1' })
    expect(refused.state.entries.some((entry) => entry.kind === 'user')).toBe(false)
    expect(skillRefused(state, 'gone', 91)).toEqual({ state })
  })

  it('draws a turn in flight with its words so far, and none while a run in flight says it for it', () => {
    const working = fold([opened('sk1', 'bmad-build', 10)])
    expect(skillTurnInFlight(working, 'sk1')).toEqual({ since: 10, entryId: undefined })

    const spokeFirst = fold([spoke('Hi')], working)
    expect(skillTurnInFlight(spokeFirst, 'sk1')).toEqual({ since: 10, entryId: 'entry-0' })

    expect(skillTurnInFlight(fold([runStarted('sk1', 'r1', 12)], working), 'sk1')).toBeUndefined()
    expect(skillTurnInFlight(fold([awaiting()], working), 'sk1')).toBeUndefined()
  })

  it('is cleared by the conversation ending, and by nothing smaller', () => {
    const state = fold([opened(), spoke('Hi'), awaiting()])

    expect(ended(state).skillSessions.size).toBe(0)
    expect(dropQueued(state, skillKey('sk1'))).toBe(state)
  })
})

describe('a skill-first session read back from main (Story 7.5)', () => {
  const snapshot: ConversationSnapshot = {
    ...empty,
    entries: [
      { kind: 'user', id: 'm-0', at: 40, text: '/bmad-build go', skillSession: 'sk1' },
      { kind: 'skill', id: 'm-1', at: 41, messageId: 'x', text: 'Done.', skillSession: 'sk1' },
      { kind: 'sysline', id: 'm-2', at: 42, text: 'session ended · the process exited', skillSession: 'sk1' },
      { kind: 'user', id: 'm-3', at: 43, text: 'plain' }
    ],
    runs: [
      { runId: 'r1', sessionId: 'sk1', code: 'bmad-build', skill: 'bmad-build', startedAt: 40, status: 'failed', endedAt: 42, notes: [], steps: [], documents: [] },
      { runId: 'r2', sessionId: 's9', agentId: mary.id, code: 'CP', startedAt: 44, status: 'finished', endedAt: 45, notes: [], steps: [], documents: [] }
    ],
    skillSessions: [
      { sessionId: 'sk1', skill: 'bmad-build', live: false },
      { sessionId: 'sk2', skill: 'bmad-build-auto', live: true }
    ],
    busy: ['sk2']
  }

  it('lists each in main’s order, live or ended, started at the first record of its thread', () => {
    const { state } = hydrate(initialConversation, snapshot, agentOf)

    expect([...state.skillSessions.values()]).toEqual([
      { sessionId: 'sk1', skill: 'bmad-build', at: 40, live: false },
      { sessionId: 'sk2', skill: 'bmad-build-auto', at: 0, live: true }
    ])
    expect(skillSeatsOf(state).map(({ state: seat }) => seat)).toEqual(['ended', 'work'])
  })

  it('draws the thread as it was, flags a card that is a session’s, and leaves a persona’s alone', () => {
    const { state } = hydrate(initialConversation, snapshot, agentOf)

    expect(state.entries.map((entry) => entry.skillSession ?? null)).toEqual(['sk1', 'sk1', 'sk1', null, 'sk1', null])
    expect(state.entries.filter((entry) => entry.kind === 'skill')).toEqual([
      { kind: 'skill', id: 'm-1', at: 41, text: 'Done.', messageId: 'x', skillSession: 'sk1' }
    ])
  })

  it('has none when main lists none', () => {
    expect(hydrate(initialConversation, empty, agentOf).state.skillSessions.size).toBe(0)
  })
})
