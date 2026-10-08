import { describe, expect, it } from 'vitest'

import { clampWidth, effectiveWidth, keyedWidth, limitsFor, PANELS, readWidth } from './layout'

describe('the panels’ ranges', () => {
  it('hold the ranges and the neighbours’ minimums the story decided, and the defaults the tokens give', () => {
    expect(PANELS.rail).toEqual({ default: 348, min: 280, cap: 560, neighbourMin: 420 })
    expect(PANELS.room).toEqual({ default: 240, min: 200, cap: 400, neighbourMin: 480 })
  })
})

describe('limitsFor', () => {
  it('is the range itself while the container’s width is not known', () => {
    for (const unknown of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(limitsFor('rail', unknown)).toEqual({ min: 280, max: 560 })
      expect(limitsFor('room', unknown)).toEqual({ min: 200, max: 400 })
    }
  })

  it('takes the cap while the neighbour keeps its minimum, and what leaves the neighbour its minimum when it does not', () => {
    // 1200 - 420 = 780 > 560: the cap. 900 - 420 = 480 < 560: the neighbour's minimum rules.
    expect(limitsFor('rail', 1200).max).toBe(560)
    expect(limitsFor('rail', 980).max).toBe(560)
    expect(limitsFor('rail', 900).max).toBe(480)
    expect(limitsFor('room', 1000).max).toBe(400)
    expect(limitsFor('room', 780).max).toBe(300)
  })

  it('is never below the minimum, however narrow the container', () => {
    expect(limitsFor('rail', 500)).toEqual({ min: 280, max: 280 })
    expect(limitsFor('room', 100)).toEqual({ min: 200, max: 200 })
  })
})

describe('clampWidth and effectiveWidth', () => {
  it('hold a width at both limits, and let one inside through', () => {
    expect(clampWidth('rail', 100, 1200)).toBe(280)
    expect(clampWidth('rail', 9999, 1200)).toBe(560)
    expect(clampWidth('rail', 400, 1200)).toBe(400)
    expect(clampWidth('room', 100, null)).toBe(200)
    expect(clampWidth('room', 9999, null)).toBe(400)
  })

  it('show the default when none is chosen, and the chosen one when there is room', () => {
    expect(effectiveWidth('rail', null, 1200)).toBe(348)
    expect(effectiveWidth('room', undefined, 1200)).toBe(240)
    expect(effectiveWidth('rail', 500, 1200)).toBe(500)
  })

  it('pull a chosen width in when the container narrows, and return it when the container widens: the choice is data', () => {
    const chosen = 500
    expect(effectiveWidth('rail', chosen, 1200)).toBe(500)
    expect(effectiveWidth('rail', chosen, 900)).toBe(480)
    expect(effectiveWidth('rail', chosen, 1200)).toBe(500)
  })
})

describe('whole pixels', () => {
  it('floors a fractional container’s maximum, so End is an integer main will read back', () => {
    expect(limitsFor('rail', 900.7).max).toBe(480)
    expect(limitsFor('room', 880.9).max).toBe(400)
    expect(limitsFor('room', 780.5).max).toBe(300)
    const end = keyedWidth('rail', 348, 'End', false, 900.7)
    expect(end).toBe(480)
    expect(readWidth(end, 'rail')).toBe(480)
  })

  it('rounds a fractional width before holding it, and every width it returns is readable', () => {
    expect(clampWidth('rail', 400.4, 1200)).toBe(400)
    expect(clampWidth('rail', 400.6, 1200)).toBe(401)
    expect(clampWidth('rail', 559.6, 900.7)).toBe(480)
    expect(clampWidth('rail', 279.6, 1200)).toBe(280)
    for (const width of [300.25, 417.5, 533.9999]) {
      expect(readWidth(clampWidth('rail', width, 1033.3), 'rail')).not.toBeNull()
    }
    expect(effectiveWidth('rail', 400.5, 1200.5)).toBe(401)
  })
})

describe('readWidth', () => {
  it('reads an integer inside the panel’s range, the limits included', () => {
    expect(readWidth(280, 'rail')).toBe(280)
    expect(readWidth(560, 'rail')).toBe(560)
    expect(readWidth(300, 'room')).toBe(300)
  })

  it.each(['x', 12, 9999, 300.5, null, undefined, Number.NaN, Infinity, {}, [], '400', true, 279, 561])(
    'reads %s as the default, silently',
    (value) => {
      expect(readWidth(value, 'rail')).toBeNull()
    }
  )

  it('judges each panel by its own range', () => {
    expect(readWidth(250, 'rail')).toBeNull()
    expect(readWidth(250, 'room')).toBe(250)
    expect(readWidth(450, 'room')).toBeNull()
  })
})

describe('keyedWidth', () => {
  const left = 'Arrow' + 'Left'
  const right = 'Arrow' + 'Right'

  it('grows by 16 on the left arrow and shrinks by 16 on the right, and by 64 with Shift', () => {
    expect(keyedWidth('rail', 348, left, false, 1200)).toBe(364)
    expect(keyedWidth('rail', 348, right, false, 1200)).toBe(332)
    expect(keyedWidth('rail', 348, left, true, 1200)).toBe(412)
    expect(keyedWidth('rail', 348, right, true, 1200)).toBe(284)
  })

  it('goes to the limits on Home and End, and to the default on Enter', () => {
    expect(keyedWidth('rail', 348, 'Home', false, 1200)).toBe(280)
    expect(keyedWidth('rail', 348, 'End', false, 1200)).toBe(560)
    expect(keyedWidth('rail', 348, 'End', false, 900)).toBe(480)
    expect(keyedWidth('room', 240, 'Home', false, null)).toBe(200)
    expect(keyedWidth('room', 240, 'End', false, null)).toBe(400)
    expect(keyedWidth('rail', 500, 'Enter', false, 1200)).toBeNull()
  })

  it('holds at a limit: a key past it gives the limit again, which is no change', () => {
    expect(keyedWidth('rail', 560, left, false, 1200)).toBe(560)
    expect(keyedWidth('rail', 280, right, false, 1200)).toBe(280)
    expect(keyedWidth('rail', 540, left, true, 1200)).toBe(560)
    expect(keyedWidth('rail', 300, right, true, 1200)).toBe(280)
  })

  it('claims no other key', () => {
    for (const key of ['Arrow' + 'Up', 'Arrow' + 'Down', ' ', 'Tab', 'Escape', 'PageUp', 'x']) {
      expect(keyedWidth('rail', 348, key, false, 1200), key).toBeUndefined()
    }
  })
})
