import { describe, expect, it } from 'vitest'
import type { PersonaSaid } from '../../shared/events'
import type { TranscriptRecord } from '../../shared/conversation'
import {
  EMPTY_TRANSCRIPT,
  foldAttributeLegacy,
  foldPersonaSaid,
  foldSysline,
  foldUserTurn,
  foldWithoutSkillSession,
  transcriptFrom
} from './transcript'
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

  it('records a typed mention on the user’s turn only when one is given, and leaves the text as sent', () => {
    const state = foldUserTurn(foldUserTurn(EMPTY_TRANSCRIPT, 'go', 1, undefined, '@Amelia'), 'plain', 2)

    expect(state.entries).toEqual([
      { kind: 'user', id: 'm-0', at: 1, text: 'go', mention: '@Amelia' },
      { kind: 'user', id: 'm-1', at: 2, text: 'plain' }
    ])
    expect('mention' in state.entries[1]).toBe(false)
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
    const state = foldSysline(foldAll([said('m1', 'a', 10)]), 'handed to B', 20)

    expect(state.entries[1]).toEqual({ kind: 'sysline', id: 'm-1', at: 20, text: 'handed to B' })
    expect(state.nextId).toBe(2)
  })

  it('ends the persona message before it: the same persona and message start a new record after it', () => {
    let state = foldAll([said('m1', 'Hel', 10)])
    state = foldSysline(state, 'handed to B', 20)
    state = foldAll([said('m1', 'lo', 30)], state)

    expect(state.entries.map((entry) => [entry.kind, entry.id, entry.text])).toEqual([
      ['persona', 'm-0', 'Hel'],
      ['sysline', 'm-1', 'handed to B'],
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
    const state = foldSysline(foldSysline(EMPTY_TRANSCRIPT, 'room opened by you · present · Mary', 5, true), 'handed to John', 6)

    expect(state.entries).toEqual([
      { kind: 'sysline', id: 'm-0', at: 5, text: 'room opened by you · present · Mary', room: true },
      { kind: 'sysline', id: 'm-1', at: 6, text: 'handed to John' }
    ])
    expect('room' in state.entries[1]).toBe(false)
  })
})

describe('a skill-first session in the transcript (Story 7.5)', () => {
  const skillSaid = (messageId: string, text: string, skillSession = 's1', at = 1): PersonaSaid => ({
    sessionId: skillSession,
    messageId,
    text,
    at,
    skillSession
  })

  it('records what a skill said as its own record, joined across pieces of one message, with its session', () => {
    const state = [skillSaid('m1', 'Hel', 's1', 5), skillSaid('m1', 'lo', 's1', 6), skillSaid('m2', '!', 's1', 7)].reduce(foldPersonaSaid, EMPTY_TRANSCRIPT)

    expect(state.entries).toEqual([
      { kind: 'skill', id: 'm-0', at: 5, messageId: 'm1', text: 'Hello', skillSession: 's1' },
      { kind: 'skill', id: 'm-1', at: 7, messageId: 'm2', text: '!', skillSession: 's1' }
    ])
  })

  it('does not join the words of two sessions that share a message id, and records no agentless words without a session', () => {
    const two = [skillSaid('m1', 'a', 's1'), skillSaid('m1', 'b', 's2')].reduce(foldPersonaSaid, EMPTY_TRANSCRIPT)
    expect(two.entries.map((entry) => entry.text)).toEqual(['a', 'b'])
    expect(foldPersonaSaid(EMPTY_TRANSCRIPT, said('m1', 'no one', 1, null))).toBe(EMPTY_TRANSCRIPT)
  })

  it('keeps the flag on the user’s turn and the harness’s line, and on nothing else', () => {
    const state = foldSysline(foldUserTurn(EMPTY_TRANSCRIPT, 'go', 1, undefined, undefined, 's1'), 'ended', 2, undefined, 's1')

    expect(state.entries).toEqual([
      { kind: 'user', id: 'm-0', at: 1, text: 'go', skillSession: 's1' },
      { kind: 'sysline', id: 'm-1', at: 2, text: 'ended', skillSession: 's1' }
    ])
    expect(foldUserTurn(EMPTY_TRANSCRIPT, 'plain', 1).entries[0]).not.toHaveProperty('skillSession')
  })

  it('takes one session’s records out and no other’s, and never reuses an id', () => {
    let state = foldUserTurn(EMPTY_TRANSCRIPT, 'a', 1, undefined, undefined, 's1')
    state = foldUserTurn(state, 'persona', 2)
    state = foldPersonaSaid(state, skillSaid('m', 'said', 's2', 3))
    state = foldUserTurn(state, 'b', 4, undefined, undefined, 's1')

    const next = foldWithoutSkillSession(state, 's1')

    expect(next.entries.map((entry) => entry.text)).toEqual(['persona', 'said'])
    expect(next.nextId).toBe(state.nextId)
    expect(foldWithoutSkillSession(next, 's1')).toBe(next)
  })
})

describe('a persona session’s tags (Story 8.1)', () => {
  it('keeps the agentId on the user’s turn and the harness’s line, and a record without one has no such field', () => {
    const state = foldSysline(foldUserTurn(EMPTY_TRANSCRIPT, 'hi', 1, undefined, undefined, undefined, 'john'), 'ended', 2, undefined, undefined, 'john')

    expect(state.entries).toEqual([
      { kind: 'user', id: 'm-0', at: 1, text: 'hi', agentId: 'john' },
      { kind: 'sysline', id: 'm-1', at: 2, text: 'ended', agentId: 'john' }
    ])
    expect(foldUserTurn(EMPTY_TRANSCRIPT, 'plain', 1).entries[0]).not.toHaveProperty('agentId')
    expect(foldSysline(EMPTY_TRANSCRIPT, 'plain', 1).entries[0]).not.toHaveProperty('agentId')
  })
})

describe('attributing a legacy transcript (Story 8.1)', () => {
  const persona = (id: string, agentId: string, room?: true): TranscriptRecord => ({
    kind: 'persona',
    id,
    at: 1,
    agentId,
    messageId: `msg-${id}`,
    text: id,
    ...(room === true ? { room } : {})
  })
  const user = (id: string, extra: Partial<TranscriptRecord> = {}): TranscriptRecord =>
    ({ kind: 'user', id, at: 1, text: id, ...extra }) as TranscriptRecord
  const line = (id: string, extra: Partial<TranscriptRecord> = {}): TranscriptRecord =>
    ({ kind: 'sysline', id, at: 1, text: id, ...extra }) as TranscriptRecord
  const tags = (entries: readonly TranscriptRecord[]): (string | undefined)[] =>
    entries.map((entry) => ('agentId' in entry ? entry.agentId : undefined))

  it('gives a user turn the persona of the next persona turn after it, and a line the nearest one before', () => {
    const out = foldAttributeLegacy([
      user('u1'),
      persona('p1', 'john'),
      line('l1'),
      user('u2'),
      persona('p2', 'mary'),
      line('l2')
    ])

    expect(tags(out)).toEqual(['john', 'john', 'john', 'mary', 'mary', 'mary'])
  })

  it('falls back symmetrically: a user turn to the nearest before, a line to the next after', () => {
    const out = foldAttributeLegacy([line('l0'), persona('p1', 'john'), user('u1')])

    expect(tags(out)).toEqual(['john', 'john', 'john'])
  })

  it('does not take a room’s persona turn as a persona’s', () => {
    const out = foldAttributeLegacy([user('u1'), persona('r1', 'mary', true), line('l1'), persona('p1', 'john')])

    expect(tags(out)).toEqual(['john', 'mary', 'john', 'john'])
  })

  it('leaves room and skill-first records, skill records and tagged records as they are', () => {
    const entries: TranscriptRecord[] = [
      user('u1', { room: true }),
      line('l1', { room: true }),
      user('u2', { skillSession: 's1' }),
      line('l2', { skillSession: 's1' }),
      { kind: 'skill', id: 'k1', at: 1, messageId: 'm', text: 'k', skillSession: 's1' },
      user('u3', { agentId: 'mary' }),
      persona('p1', 'john')
    ]

    expect(foldAttributeLegacy(entries)).toEqual(entries)
    expect(foldAttributeLegacy(entries)).toBe(entries)
  })

  it('leaves a record with no persona turn on either side untagged, and drops nothing', () => {
    const entries = [user('u1'), line('l1'), persona('r1', 'mary', true)]
    const out = foldAttributeLegacy(entries)

    expect(out).toBe(entries)
    expect(out).toHaveLength(3)
  })

  it('is idempotent and keeps order and ids', () => {
    const once = foldAttributeLegacy([user('u1'), persona('p1', 'john'), line('l1')])

    expect(foldAttributeLegacy(once)).toBe(once)
    expect(once.map((entry) => entry.id)).toEqual(['u1', 'p1', 'l1'])
  })

  it('does not change the entries it was given', () => {
    const entries = [user('u1'), persona('p1', 'john')]
    const frozen = JSON.stringify(entries)
    foldAttributeLegacy(entries)

    expect(JSON.stringify(entries)).toBe(frozen)
  })
})
