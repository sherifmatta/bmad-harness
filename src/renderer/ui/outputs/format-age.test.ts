import { describe, expect, it } from 'vitest'
import { formatAge } from './format-age'

const NOW = 1_000_000_000_000
const ago = (ms: number): string => formatAge(NOW - ms, NOW)

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('formatAge', () => {
  it('reads just now under a minute', () => {
    expect(ago(0)).toBe('just now')
    expect(ago(59 * SECOND + 999)).toBe('just now')
  })

  it('reads whole minutes from a minute to under an hour', () => {
    expect(ago(MINUTE)).toBe('1m')
    expect(ago(MINUTE + 59 * SECOND)).toBe('1m')
    expect(ago(59 * MINUTE + 59 * SECOND)).toBe('59m')
  })

  it('reads whole hours from an hour to under a day', () => {
    expect(ago(HOUR)).toBe('1h')
    expect(ago(23 * HOUR + 59 * MINUTE)).toBe('23h')
  })

  it('reads whole days from a day on, with no larger unit', () => {
    expect(ago(DAY)).toBe('1d')
    expect(ago(3 * DAY)).toBe('3d')
    expect(ago(400 * DAY)).toBe('400d')
  })

  it('clamps a savedAt ahead of now to just now', () => {
    expect(formatAge(NOW + 5 * MINUTE, NOW)).toBe('just now')
    expect(formatAge(NOW + 1, NOW)).toBe('just now')
  })
})
