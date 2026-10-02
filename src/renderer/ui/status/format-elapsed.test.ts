import { describe, expect, it } from 'vitest'
import { formatElapsed } from './format-elapsed'

describe('formatElapsed', () => {
  it.each([
    [0, '0s'],
    [999, '0s'],
    [1000, '1s'],
    [59_999, '59s'],
    [60_000, '1m 00s'],
    [65_000, '1m 05s'],
    [3_599_000, '59m 59s'],
    [3_600_000, '1h 00m'],
    [3_720_000, '1h 02m'],
    [3_779_999, '1h 02m'],
    [36_000_000 + 11 * 60_000, '10h 11m']
  ])('writes %d ms as %s', (ms, text) => {
    expect(formatElapsed(ms)).toBe(text)
  })

  it.each([[-5000], [Number.NaN], [Number.POSITIVE_INFINITY]])('reads %d as 0s', (ms) => {
    expect(formatElapsed(ms)).toBe('0s')
  })
})
