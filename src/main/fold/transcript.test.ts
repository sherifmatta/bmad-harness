import { describe, expect, it } from 'vitest'
import type { PersonaSaid } from '../../shared/events'
import { EMPTY_TRANSCRIPT, foldPersonaSaid, foldSysline, foldUserTurn, transcriptFrom } from './transcript'
import type { TranscriptState } from './transcript'

const said = (messageId: string, text: string, at = 1, agentId: string | null = 'a'): PersonaSaid => ({
  sessionId: 's1',
  ...(agentId === null ? {} : { agentId }),
  messageId,
  text,
  at
})

function foldAll(events: PersonaSaid[], from: TranscriptState = EMPTY_TRANSCRIPT): TranscriptState {
  return events.reduce(foldPersonaSaid, from)
}

describe('the transcript fold', () => {
  it('starts a persona record with the first piece’s time and a main-assigned id', () => {
    const state = foldAll([said('m1', 'Hel', 10)])

    expect(state.entries).toEqual([
      { kind: 'persona', id: 'm-0', at: 10, agentId: 'a', messageId: 'm1', text: 'Hel' }
    ])
  })

  it('joins a following piece of the same agent and message, appending the text unedited', () => {
    const state = foldAll([said('m1', ' Hel', 10), said('m1', 'lo  ', 11), said('m1', '\n', 12)])

    expect(state.entries).toEqual([
      { kind: 'persona', id: 'm-0', at: 10, agentId: 'a', messageId: 'm1', text: ' Hello  \n' }
    ])
    expect(state.nextId).toBe(1)
  })

  it('starts a new record for another message or another agent', () => {
    const state = foldAll([said('m1', 'a'), said('m2', 'b'), said('m2', 'c', 1, 'other')])

    expect(state.entries.map((entry) => [entry.id, entry.text])).toEqual([
      ['m-0', 'a'],
      ['m-1', 'b'],
      ['m-2', 'c']
    ])
  })

  it('does not record a piece with no agent', () => {
    const state = foldAll([said('m1', 'room', 1, null)])

    expect(state).toBe(EMPTY_TRANSCRIPT)
  })

  it('records what a persona said in a room with the flag, and joins its pieces by the turn’s message id (Story 4.2)', () => {
    const turn = (messageId: string, text: string, agentId = 'a'): PersonaSaid => ({ ...said(messageId, text, 5, agentId), room: true })
    const state = foldAll([turn('m#1', 'Hi'), turn('m#1', '.'), turn('m#2', 'No.', 'b'), turn('m#3', 'Again', 'a')])

    expect(state.entries).toEqual([
      { kind: 'persona', id: 'm-0', at: 5, agentId: 'a', messageId: 'm#1', text: 'Hi.', room: true },
      { kind: 'persona', id: 'm-1', at: 5, agentId: 'b', messageId: 'm#2', text: 'No.', room: true },
      { kind: 'persona', id: 'm-2', at: 5, agentId: 'a', messageId: 'm#3', text: 'Again', room: true }
    ])
  })

  it('still drops a room’s words that name no persona, flag or not', () => {
    expect(foldAll([{ ...said('m1', 'x', 1, null), room: true }])).toBe(EMPTY_TRANSCRIPT)
  })

  it('records the user’s turn into the room with the flag, and a plain one without it', () => {
    const state = foldUserTurn(foldUserTurn(EMPTY_TRANSCRIPT, 'to the room', 1, true), 'to one', 2)

    expect(state.entries).toEqual([
      { kind: 'user', id: 'm-0', at: 1, text: 'to the room', room: true },
      { kind: 'user', id: 'm-1', at: 2, text: 'to one' }
    ])
  })

  it('records the user’s turn, which ends a message so the next piece starts afresh', () => {
    let state = foldAll([said('m1', 'a')])
    state = foldUserTurn(state, 'hi', 20)
    state = foldAll([said('m1', 'b')], state)

    expect(state.entries).toEqual([
      { kind: 'persona', id: 'm-0', at: 1, agentId: 'a', messageId: 'm1', text: 'a' },
      { kind: 'user', id: 'm-1', at: 20, text: 'hi' },
      { kind: 'persona', id: 'm-2', at: 1, agentId: 'a', messageId: 'm1', text: 'b' }
    ])
  })

  it('leaves the state it was given as it was', () => {
    const before = foldAll([said('m1', 'a')])
    const frozen = JSON.stringify(before)
    foldAll([said('m1', 'b')], before)
    foldUserTurn(before, 'x', 2)

    expect(JSON.stringify(before)).toBe(frozen)
  })

  it('continues ids past the highest a loaded transcript holds, ignoring ids that are not its own', () => {
    const loaded = transcriptFrom([
      { kind: 'user', id: 'm-3', at: 1, text: 'x' },
      { kind: 'user', id: 'm-11', at: 2, text: 'y' },
      { kind: 'user', id: 'other', at: 3, text: 'z' }
    ])

    expect(foldUserTurn(loaded, 'next', 4).entries.at(-1)?.id).toBe('m-12')
    expect(transcriptFrom([]).nextId).toBe(0)
  })

  it('lets a loaded persona record take a following piece of the same message', () => {
    const loaded = transcriptFrom([
      { kind: 'persona', id: 'm-0', at: 1, agentId: 'a', messageId: 'm1', text: 'Hel' }
    ])

    expect(foldAll([said('m1', 'lo', 5)], loaded).entries).toMatchObject([{ id: 'm-0', text: 'Hello' }])
  })
})

describe('the sysline fold', () => {
  it('appends a record of its own with a main-assigned id, and nothing but kind, id, time and text', () => {
    const state = foldSysline(foldAll([said('m1', 'a', 10)]), 'handed off · A → B', 20)

    expect(state.entries[1]).toEqual({ kind: 'sysline', id: 'm-1', at: 20, text: 'handed off · A → B' })
    expect(state.nextId).toBe(2)
  })

  it('ends the persona message before it: the same persona and message start a new record after it', () => {
    let state = foldAll([said('m1', 'Hel', 10)])
    state = foldSysline(state, 'handed off · A → B', 20)
    state = foldAll([said('m1', 'lo', 30)], state)

    expect(state.entries.map((entry) => [entry.kind, entry.id, entry.text])).toEqual([
      ['persona', 'm-0', 'Hel'],
      ['sysline', 'm-1', 'handed off · A → B'],
      ['persona', 'm-2', 'lo']
    ])
  })

  it('leaves the state it was given as it was, and continues ids past a loaded sysline', () => {
    const before = foldAll([said('m1', 'a')])
    const frozen = JSON.stringify(before)
    foldSysline(before, 'x', 2)
    expect(JSON.stringify(before)).toBe(frozen)

    const loaded = transcriptFrom([{ kind: 'sysline', id: 'm-6', at: 1, text: 'x' }])
    expect(foldUserTurn(loaded, 'next', 2).entries.at(-1)?.id).toBe('m-7')
  })
})

describe('a room’s sysline', () => {
  it('keeps the `room` flag on its record, and a line without it has no such field', () => {
    const state = foldSysline(foldSysline(EMPTY_TRANSCRIPT, 'room opened by you · present · Mary', 5, true), 'handed off', 6)

    expect(state.entries).toEqual([
      { kind: 'sysline', id: 'm-0', at: 5, text: 'room opened by you · present · Mary', room: true },
      { kind: 'sysline', id: 'm-1', at: 6, text: 'handed off' }
    ])
    expect('room' in state.entries[1]).toBe(false)
  })
})
