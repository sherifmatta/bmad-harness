import { describe, expect, it } from 'vitest'
import { elapsedMs } from './elapsed'

describe('elapsedMs', () => {
  it('derives elapsed time from the start instant and the injected clock', () => {
    expect(elapsedMs(1_700_000_000_000, 1_700_000_004_250)).toBe(4250)
  })

  it('is zero at the start instant', () => {
    expect(elapsedMs(1_700_000_000_000, 1_700_000_000_000)).toBe(0)
  })

  it('clamps to zero when now precedes startedAt rather than returning negative time', () => {
    expect(elapsedMs(1_700_000_000_000, 1_699_999_999_000)).toBe(0)
  })

  it('answers zero rather than NaN for a non-finite instant', () => {
    // The promise is a non-negative number of milliseconds, and NaN keeps
    // neither half of it.
    expect(elapsedMs(Number.NaN, 1_700_000_000_000)).toBe(0)
    expect(elapsedMs(1_700_000_000_000, Number.NaN)).toBe(0)
    expect(elapsedMs(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(0)
    // Infinite elapsed time is not a usable millisecond count either.
    expect(elapsedMs(Number.NEGATIVE_INFINITY, 0)).toBe(0)
  })

  it('is never negative for any ordering of the two instants', () => {
    for (const [startedAt, now] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [Number.MAX_SAFE_INTEGER, 0]
    ] as const) {
      expect(elapsedMs(startedAt, now)).toBeGreaterThanOrEqual(0)
    }
  })
})
