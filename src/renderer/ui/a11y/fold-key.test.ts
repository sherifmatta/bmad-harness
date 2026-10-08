import { describe, expect, it } from 'vitest'

import { foldKey } from './fold-key'

describe('foldKey', () => {
  it('folds on the left arrow and unfolds on the right', () => {
    expect(foldKey('ArrowLeft')).toBe('fold')
    expect(foldKey('ArrowRight')).toBe('unfold')
  })

  it('claims nothing else: the vertical arrows are the list’s, and Enter and Space are the button’s own', () => {
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Tab', 'Home', 'End', 'Escape', 'x']) {
      expect(foldKey(key), key).toBeNull()
    }
  })
})
