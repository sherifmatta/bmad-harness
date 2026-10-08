import { describe, expect, it } from 'vitest'

import { recentAge } from './recent-age'

const NOW = 1_000_000_000_000
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('a recent row’s age', () => {
  it('is now for the first minute', () => {
    expect(recentAge(NOW, NOW)).toBe('now')
    expect(recentAge(NOW - 59 * SECOND, NOW)).toBe('now')
  })

  it('is whole minutes, as Nm, from the first to the fifty-ninth', () => {
    expect(recentAge(NOW - MINUTE, NOW)).toBe('1m')
    expect(recentAge(NOW - 5 * MINUTE - 59 * SECOND, NOW)).toBe('5m')
    expect(recentAge(NOW - 59 * MINUTE - 59 * SECOND, NOW)).toBe('59m')
  })

  it('is whole hours, as Nh, up to the twenty-third', () => {
    expect(recentAge(NOW - HOUR, NOW)).toBe('1h')
    expect(recentAge(NOW - 2 * HOUR - 59 * MINUTE, NOW)).toBe('2h')
    expect(recentAge(NOW - 23 * HOUR - 59 * MINUTE, NOW)).toBe('23h')
  })

  it('is whole days, as Nd, and stays in days however old', () => {
    expect(recentAge(NOW - DAY, NOW)).toBe('1d')
    expect(recentAge(NOW - 3 * DAY - 23 * HOUR, NOW)).toBe('3d')
    expect(recentAge(NOW - 400 * DAY, NOW)).toBe('400d')
  })

  it('is now for a time in the future, never a negative age', () => {
    expect(recentAge(NOW + 5 * MINUTE, NOW)).toBe('now')
  })

  it('is one of the four spellings and no other', () => {
    for (const elapsed of [0, 1, 59_999, 60_000, 3_599_999, 3_600_000, 86_399_999, 86_400_000, 9e9]) {
      expect(recentAge(NOW - elapsed, NOW)).toMatch(/^(?:now|\d+m|\d+h|\d+d)$/)
    }
  })
})
