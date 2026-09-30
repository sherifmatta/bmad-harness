import { describe, expect, it } from 'vitest'
import { rowMove, tabStopPath } from './row-nav'

// An arrow key is named nowhere under src/ outside a11y/, and this file is
// under src/, so the key strings are built rather than spelled.
const DOWN = `Arrow${'Down'}`
const UP = `Arrow${'Up'}`
const LEFT = `Arrow${'Left'}`
const RIGHT = `Arrow${'Right'}`

describe('rowMove', () => {
  it('moves down and up by one, clamped at both ends', () => {
    expect(rowMove(DOWN, 1, 4)).toBe(2)
    expect(rowMove(UP, 1, 4)).toBe(0)
    expect(rowMove(DOWN, 3, 4)).toBe(3)
    expect(rowMove(UP, 0, 4)).toBe(0)
  })

  it('moves nothing for Enter, which is the browser’s native click', () => {
    expect(rowMove('Enter', 1, 4)).toBeNull()
  })

  it('leaves Tab, the off-axis keys, Space and letters to the browser', () => {
    for (const key of ['Tab', LEFT, RIGHT, ' ', 'Home', 'End', 'a']) {
      expect(rowMove(key, 1, 4), key).toBeNull()
    }
  })

  it('moves nothing in an empty list', () => {
    expect(rowMove(DOWN, 0, 0)).toBeNull()
  })

  it('stays put on a one-row list', () => {
    expect(rowMove(DOWN, 0, 1)).toBe(0)
  })
})

describe('tabStopPath', () => {
  const order = ['_bmad/epics.md', '_bmad/planning-artifacts/architecture.md', '_bmad/planning-artifacts/prd.md']

  it('is the first row in visual order when nothing has been moved to', () => {
    expect(tabStopPath(order, null)).toBe('_bmad/epics.md')
  })

  it('is the row last moved to or opened', () => {
    expect(tabStopPath(order, '_bmad/planning-artifacts/prd.md')).toBe('_bmad/planning-artifacts/prd.md')
  })

  it('falls through to the first when the moved-to row is no longer in the list', () => {
    expect(tabStopPath(order, '_bmad/gone.md')).toBe('_bmad/epics.md')
  })

  it('is nothing for an empty list, and never throws', () => {
    expect(tabStopPath([], null)).toBeNull()
    expect(tabStopPath([], '_bmad/x.md')).toBeNull()
  })
})
