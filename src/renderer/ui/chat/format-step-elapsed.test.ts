import { describe, expect, it } from 'vitest'

import { formatStepElapsed } from './format-step-elapsed'

describe('formatStepElapsed', () => {
  it.each([
    [0, '0:00'],
    [999, '0:00'],
    [3000, '0:03'],
    [3999, '0:03'],
    [59_000, '0:59'],
    [60_000, '1:00'],
    [760_000, '12:40'],
    [3_599_000, '59:59'],
    [3_600_000, '1:00:00'],
    [3_725_000, '1:02:05']
  ])('writes %i ms as %s', (ms, text) => {
    expect(formatStepElapsed(ms)).toBe(text)
  })

  it('reads a negative or non-finite span as 0:00', () => {
    expect(formatStepElapsed(-5000)).toBe('0:00')
    expect(formatStepElapsed(Number.NaN)).toBe('0:00')
    expect(formatStepElapsed(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})
