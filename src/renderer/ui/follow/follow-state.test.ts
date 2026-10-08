import { describe, expect, it } from 'vitest'

import { atBottom, bottomTop, FOLLOW_TOLERANCE } from './follow-state'

describe('follow state', () => {
  it('is one line, 24px', () => {
    expect(FOLLOW_TOLERANCE).toBe(24)
  })

  it('puts the bottom at the content height less the view, and never below the top', () => {
    expect(bottomTop(400, 1000)).toBe(600)
    expect(bottomTop(400, 400)).toBe(0)
    expect(bottomTop(400, 100)).toBe(0)
    expect(bottomTop(0, 0)).toBe(0)
  })

  it('is at the bottom within one line of it, and not a pixel farther', () => {
    expect(atBottom(600, 400, 1000)).toBe(true)
    expect(atBottom(576, 400, 1000)).toBe(true)
    expect(atBottom(575, 400, 1000)).toBe(false)
    expect(atBottom(0, 400, 1000)).toBe(false)
  })

  it('is at the bottom of content that fits, however it is measured', () => {
    expect(atBottom(0, 400, 400)).toBe(true)
    expect(atBottom(0, 400, 300)).toBe(true)
    expect(atBottom(0, 0, 0)).toBe(true)
  })
})
