import { describe, expect, it } from 'vitest'
import type { PersonaSaid } from '../../shared/events'
import { EMPTY_TRANSCRIPT, foldPersonaSaid, foldUserTurn, transcriptFrom } from './transcript'
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
