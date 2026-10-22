import { describe, expect, it } from 'vitest'

import {
  clampShare,
  clampWidth,
  effectiveShare,
  effectiveWidth,
  growsRight,
  isPanelId,
  keyedShare,
  keyedWidth,
  limitsFor,
  NO_LAYOUT,
  PANEL_IDS,
  PANELS,
  RAIL_HALF_MIN,
  readShare,
  readWidth,
  sharePercent,
  splitLimits
} from './layout'

describe('the panels’ ranges', () => {
  it('hold the ranges and the neighbours’ minimums the story decided, and the defaults the tokens give', () => {
    expect(PANELS.sidebar).toEqual({ default: 244, min: 200, cap: 400, neighbourMin: 420 })
    expect(PANELS.rail).toEqual({ default: 300, min: 260, cap: 480, neighbourMin: 420 })
    expect(PANELS.room).toEqual({ default: 240, min: 200, cap: 400, neighbourMin: 480 })
  })
})

describe('the panel set', () => {
  it('names the sidebar, the rail and the room, each a panel', () => {
    expect(PANEL_IDS).toEqual(['sidebar', 'rail', 'room'])
    for (const id of PANEL_IDS) {
      expect(isPanelId(id)).toBe(true)
    }
    expect(isPanelId('chat')).toBe(false)
    expect(isPanelId(undefined)).toBe(false)
  })

  it('grows rightward for the sidebar alone: it is the one panel on the window’s left', () => {
    expect(growsRight('sidebar')).toBe(true)
    expect(growsRight('rail')).toBe(false)
    expect(growsRight('room')).toBe(false)
  })
})

describe('limitsFor', () => {
  it('is the range itself while the container’s width is not known', () => {
    for (const unknown of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(limitsFor('sidebar', unknown)).toEqual({ min: 200, max: 400 })
      expect(limitsFor('rail', unknown)).toEqual({ min: 260, max: 480 })
      expect(limitsFor('room', unknown)).toEqual({ min: 200, max: 400 })
    }
  })

  it('takes the cap while the neighbour keeps its minimum, and what leaves the neighbour its minimum when it does not', () => {
    // 1200 - 420 = 780 > 480: the cap. 800 - 420 = 380 < 480: the neighbour's minimum rules.
    expect(limitsFor('rail', 1200).max).toBe(480)
    expect(limitsFor('rail', 900).max).toBe(480)
    expect(limitsFor('rail', 800).max).toBe(380)
    expect(limitsFor('sidebar', 900).max).toBe(400)
    expect(limitsFor('sidebar', 700).max).toBe(280)
    expect(limitsFor('room', 1000).max).toBe(400)
    expect(limitsFor('room', 780).max).toBe(300)
  })

  it('is never below the minimum, however narrow the container', () => {
    expect(limitsFor('sidebar', 500)).toEqual({ min: 200, max: 200 })
    expect(limitsFor('rail', 500)).toEqual({ min: 260, max: 260 })
    expect(limitsFor('room', 100)).toEqual({ min: 200, max: 200 })
  })
})

describe('clampWidth and effectiveWidth', () => {
  it('hold a width at both limits, and let one inside through', () => {
    expect(clampWidth('rail', 100, 1200)).toBe(260)
    expect(clampWidth('rail', 9999, 1200)).toBe(480)
    expect(clampWidth('rail', 400, 1200)).toBe(400)
    expect(clampWidth('sidebar', 100, 1200)).toBe(200)
    expect(clampWidth('sidebar', 9999, 1200)).toBe(400)
    expect(clampWidth('room', 100, null)).toBe(200)
    expect(clampWidth('room', 9999, null)).toBe(400)
  })

  it('show the default when none is chosen, and the chosen one when there is room', () => {
    expect(effectiveWidth('sidebar', null, 1200)).toBe(244)
    expect(effectiveWidth('rail', null, 1200)).toBe(300)
    expect(effectiveWidth('room', undefined, 1200)).toBe(240)
    expect(effectiveWidth('rail', 450, 1200)).toBe(450)
  })

  it('pull a chosen width in when the container narrows, and return it when the container widens: the choice is data', () => {
    const chosen = 450
    expect(effectiveWidth('rail', chosen, 1200)).toBe(450)
    expect(effectiveWidth('rail', chosen, 800)).toBe(380)
    expect(effectiveWidth('rail', chosen, 1200)).toBe(450)
  })
})

describe('whole pixels', () => {
  it('floors a fractional container’s maximum, so End is an integer main will read back', () => {
    expect(limitsFor('rail', 800.7).max).toBe(380)
    expect(limitsFor('room', 880.9).max).toBe(400)
    expect(limitsFor('room', 780.5).max).toBe(300)
    const end = keyedWidth('rail', 300, 'End', false, 800.7)
    expect(end).toBe(380)
    expect(readWidth(end, 'rail')).toBe(380)
  })

  it('rounds a fractional width before holding it, and every width it returns is readable', () => {
    expect(clampWidth('rail', 400.4, 1200)).toBe(400)
    expect(clampWidth('rail', 400.6, 1200)).toBe(401)
    expect(clampWidth('rail', 479.6, 800.7)).toBe(380)
    expect(clampWidth('rail', 259.6, 1200)).toBe(260)
    for (const width of [300.25, 417.5, 479.9999]) {
      expect(readWidth(clampWidth('rail', width, 1033.3), 'rail')).not.toBeNull()
    }
    expect(effectiveWidth('rail', 400.5, 1200.5)).toBe(401)
  })
})

describe('readWidth', () => {
  it('reads an integer inside the panel’s range, the limits included', () => {
    expect(readWidth(260, 'rail')).toBe(260)
    expect(readWidth(480, 'rail')).toBe(480)
    expect(readWidth(200, 'sidebar')).toBe(200)
    expect(readWidth(400, 'sidebar')).toBe(400)
    expect(readWidth(300, 'room')).toBe(300)
  })

  it.each(['x', 12, 9999, 300.5, null, undefined, Number.NaN, Infinity, {}, [], '400', true, 259, 481, 560])(
    'reads %s as the default, silently',
    (value) => {
      expect(readWidth(value, 'rail')).toBeNull()
    }
  )

  it('judges each panel by its own range', () => {
    expect(readWidth(230, 'rail')).toBeNull()
    expect(readWidth(230, 'sidebar')).toBe(230)
    expect(readWidth(230, 'room')).toBe(230)
    expect(readWidth(450, 'room')).toBeNull()
    expect(readWidth(450, 'rail')).toBe(450)
    expect(readWidth(450, 'sidebar')).toBeNull()
  })
})

describe('keyedWidth', () => {
  const left = 'Arrow' + 'Left'
  const right = 'Arrow' + 'Right'

  it('grows by 16 on the left arrow and shrinks by 16 on the right, and by 64 with Shift, for the panels on the right', () => {
    expect(keyedWidth('rail', 300, left, false, 1200)).toBe(316)
    expect(keyedWidth('rail', 300, right, false, 1200)).toBe(284)
    expect(keyedWidth('rail', 300, left, true, 1200)).toBe(364)
    expect(keyedWidth('rail', 300, right, true, 1200)).toBe(260)
    expect(keyedWidth('room', 240, left, false, null)).toBe(256)
  })

  it('swaps the arrows for the sidebar: the right arrow grows it and the left shrinks it', () => {
    expect(keyedWidth('sidebar', 244, right, false, 1200)).toBe(260)
    expect(keyedWidth('sidebar', 244, left, false, 1200)).toBe(228)
    expect(keyedWidth('sidebar', 244, right, true, 1200)).toBe(308)
    expect(keyedWidth('sidebar', 244, left, true, 1200)).toBe(200)
  })

  it('goes to the limits on Home and End, and to the default on Enter', () => {
    expect(keyedWidth('rail', 300, 'Home', false, 1200)).toBe(260)
    expect(keyedWidth('rail', 300, 'End', false, 1200)).toBe(480)
    expect(keyedWidth('rail', 300, 'End', false, 800)).toBe(380)
    expect(keyedWidth('sidebar', 244, 'Home', false, 1200)).toBe(200)
    expect(keyedWidth('sidebar', 244, 'End', false, 1200)).toBe(400)
    expect(keyedWidth('sidebar', 244, 'End', false, 700)).toBe(280)
    expect(keyedWidth('room', 240, 'Home', false, null)).toBe(200)
    expect(keyedWidth('room', 240, 'End', false, null)).toBe(400)
    expect(keyedWidth('rail', 450, 'Enter', false, 1200)).toBeNull()
    expect(keyedWidth('sidebar', 300, 'Enter', false, 1200)).toBeNull()
  })

  it('holds at a limit: a key past it gives the limit again, which is no change', () => {
    expect(keyedWidth('rail', 480, left, false, 1200)).toBe(480)
    expect(keyedWidth('rail', 260, right, false, 1200)).toBe(260)
    expect(keyedWidth('rail', 460, left, true, 1200)).toBe(480)
    expect(keyedWidth('rail', 300, right, true, 1200)).toBe(260)
    expect(keyedWidth('sidebar', 400, right, false, 1200)).toBe(400)
    expect(keyedWidth('sidebar', 200, left, false, 1200)).toBe(200)
  })

  it('claims no other key', () => {
    for (const panel of PANEL_IDS) {
      for (const key of ['Arrow' + 'Up', 'Arrow' + 'Down', ' ', 'Tab', 'Escape', 'PageUp', 'x']) {
        expect(keyedWidth(panel, 300, key, false, 1200), `${panel} ${key}`).toBeUndefined()
      }
    }
  })
})

describe('the rail split (Story 9.3)', () => {
  const up = 'Arrow' + 'Up'
  const down = 'Arrow' + 'Down'

  it('keeps each half at least 120px, and holds half and half where the rail cannot hold both', () => {
    expect(RAIL_HALF_MIN).toBe(120)
    expect(splitLimits(600)).toEqual({ min: 0.2, max: 0.8 })
    expect(splitLimits(240)).toEqual({ min: 0.5, max: 0.5 })
    for (const short of [239, 100, 0, -1, null, undefined, Number.NaN, Infinity]) {
      expect(splitLimits(short), String(short)).toEqual({ min: 0.5, max: 0.5 })
    }
  })

  it('reads a stored share strictly between 0 and 1, and anything else as half and half, silently', () => {
    expect(readShare(0.3)).toBe(0.3)
    expect(readShare(0.999)).toBe(0.999)
    for (const bad of [0, 1, 7, -0.2, Number.NaN, Infinity, '0.4', null, undefined, {}, [], true]) {
      expect(readShare(bad), String(bad)).toBeNull()
    }
    expect(NO_LAYOUT.railSplit).toBeNull()
    expect(NO_LAYOUT.changesFolded).toEqual([])
  })

  it('clamps a share to the live height when drawn, and draws half and half with nothing chosen', () => {
    expect(clampShare(0.05, 600)).toBe(0.2)
    expect(clampShare(0.95, 600)).toBe(0.8)
    expect(clampShare(0.4, 600)).toBe(0.4)
    expect(effectiveShare(null, 600)).toBe(0.5)
    expect(effectiveShare(0.3, 600)).toBe(0.3)
    expect(effectiveShare(0.3, 200)).toBe(0.5)
  })

  it('says the share as a whole percentage', () => {
    expect(sharePercent(0.5)).toBe(50)
    expect(sharePercent(1 / 3)).toBe(33)
    expect(sharePercent(0.2)).toBe(20)
  })

  it('moves 16px on the arrows and 64px with Shift, up shrinking the Changes half', () => {
    expect(keyedShare(0.5, up, false, 800)).toBeCloseTo(0.48)
    expect(keyedShare(0.5, down, false, 800)).toBeCloseTo(0.52)
    expect(keyedShare(0.5, up, true, 800)).toBeCloseTo(0.42)
    expect(keyedShare(0.5, down, true, 800)).toBeCloseTo(0.58)
  })

  it('goes to the limits on Home and End, resets on Enter, and holds at a limit', () => {
    expect(keyedShare(0.5, 'Home', false, 600)).toBe(0.2)
    expect(keyedShare(0.5, 'End', false, 600)).toBe(0.8)
    expect(keyedShare(0.3, 'Enter', false, 600)).toBeNull()
    expect(keyedShare(0.2, up, false, 600)).toBe(0.2)
    expect(keyedShare(0.8, down, true, 600)).toBe(0.8)
  })

  it('claims no other key', () => {
    for (const key of ['Arrow' + 'Left', 'Arrow' + 'Right', ' ', 'Tab', 'Escape', 'PageUp', 'x']) {
      expect(keyedShare(0.5, key, false, 600), key).toBeUndefined()
    }
  })
})
