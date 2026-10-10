import { describe, expect, it } from 'vitest'

import { formatEventTime, formatTurnTime } from './format-turn-time'

describe('formatTurnTime', () => {
  const noon = Date.UTC(2026, 9, 1, 12, 5, 9)

  it('reads the wall clock in the zone it is given, 24-hour and zero-padded', () => {
    expect(formatTurnTime(noon, 'UTC')).toBe('12:05')
    expect(formatTurnTime(Date.UTC(2026, 9, 1, 0, 3), 'UTC')).toBe('00:03')
    expect(formatTurnTime(Date.UTC(2026, 9, 1, 23, 59), 'UTC')).toBe('23:59')
  })

  it('moves with the zone', () => {
    expect(formatTurnTime(noon, 'Asia/Tokyo')).toBe('21:05')
    expect(formatTurnTime(noon, 'America/New_York')).toBe('08:05')
  })

  it('formats in the local zone when none is given', () => {
    expect(formatTurnTime(noon)).toMatch(/^\d{2}:\d{2}$/)
  })

  it('reads empty rather than throwing for a time that is not an instant', () => {
    expect(formatTurnTime(Number.NaN)).toBe('')
    expect(formatTurnTime(Number.POSITIVE_INFINITY)).toBe('')
    expect(formatTurnTime(8.64e15 + 1)).toBe('')
  })
})

describe('formatEventTime', () => {
  const at = Date.UTC(2026, 9, 1, 12, 5, 9)

  it('reads month-day and the 24-hour wall clock, zero-padded, in the zone it is given', () => {
    expect(formatEventTime(at, 'UTC')).toBe('10-01 12:05')
    expect(formatEventTime(Date.UTC(2026, 0, 2, 0, 3), 'UTC')).toBe('01-02 00:03')
    expect(formatEventTime(Date.UTC(2026, 11, 31, 23, 59), 'UTC')).toBe('12-31 23:59')
  })

  it('moves the date with the zone', () => {
    expect(formatEventTime(Date.UTC(2026, 9, 1, 20, 30), 'Asia/Tokyo')).toBe('10-02 05:30')
    expect(formatEventTime(Date.UTC(2026, 9, 1, 3, 30), 'America/New_York')).toBe('09-30 23:30')
  })

  it('formats in the local zone when none is given', () => {
    expect(formatEventTime(at)).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
  })

  it('reads empty rather than throwing for a time that is not an instant', () => {
    expect(formatEventTime(Number.NaN)).toBe('')
    expect(formatEventTime(Number.POSITIVE_INFINITY)).toBe('')
    expect(formatEventTime(8.64e15 + 1)).toBe('')
  })
})
