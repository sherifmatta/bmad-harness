import { describe, expect, it } from 'vitest'

import { roomDestination } from './room-destination'
import { isRoomSummaryTurn, roomSummaryTurn } from './room-summary'

describe('roomSummaryTurn', () => {
  it('names the destination of a room with a topic, in the exact ask', () => {
    const destination = roomDestination(Date.parse('2026-10-08T14:31:00'), 'Payouts')

    expect(roomSummaryTurn(destination)).toBe(
      'Write a summary of this conversation to _bmad/party/2026-10-08-payouts.md. Cover what was discussed, what was decided and what is still open. If the file name has <topic> in it, put a short name for the topic there; if the file already exists, add -2 to the name rather than overwrite it.'
    )
  })

  it('carries <topic> for the runtime to fill when the room has none yet', () => {
    const text = roomSummaryTurn(roomDestination(Date.parse('2026-10-08T14:31:00'), undefined))

    expect(text.startsWith('Write a summary of this conversation to _bmad/party/2026-10-08-<topic>.md. Cover')).toBe(true)
  })

  it('is one paragraph', () => {
    expect(roomSummaryTurn('_bmad/party/x.md')).not.toMatch(/\n/)
  })
})

describe('isRoomSummaryTurn', () => {
  it('knows the ask for any destination, with or without a topic', () => {
    expect(isRoomSummaryTurn(roomSummaryTurn(roomDestination(Date.parse('2026-10-08T14:31:00'), 'Payouts')))).toBe(true)
    expect(isRoomSummaryTurn(roomSummaryTurn(roomDestination(undefined, undefined)))).toBe(true)
  })

  it('does not take the user’s own words for it', () => {
    expect(isRoomSummaryTurn('')).toBe(false)
    expect(isRoomSummaryTurn('Write a summary of this conversation to somewhere')).toBe(false)
    expect(isRoomSummaryTurn(`${roomSummaryTurn('_bmad/party/x.md')} and then some more`)).toBe(false)
    expect(isRoomSummaryTurn('Payouts')).toBe(false)
  })
})
