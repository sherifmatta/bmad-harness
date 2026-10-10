// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { CHORD_WINDOW_MS, IDLE, isFieldTarget, nextChord } from './board-chord'

describe('nextChord', () => {
  it('fires on a `b` that follows a `g` within a second, and rests after', () => {
    const armed = nextChord(IDLE, 'g', 100)
    expect(armed).toEqual({ state: { armedAt: 100 }, fired: false })

    expect(nextChord(armed.state, 'b', 100 + CHORD_WINDOW_MS)).toEqual({ state: IDLE, fired: true })
    expect(nextChord(armed.state, 'b', 150)).toEqual({ state: IDLE, fired: true })
  })

  it('reads the keys without case, so Caps Lock does not defeat it', () => {
    const armed = nextChord(IDLE, 'G', 0)

    expect(armed.state).toEqual({ armedAt: 0 })
    expect(nextChord(armed.state, 'B', 10).fired).toBe(true)
  })

  it('does nothing for a `b` alone', () => {
    expect(nextChord(IDLE, 'b', 5)).toEqual({ state: IDLE, fired: false })
  })

  it('is cancelled by any other key between, and by a gap over a second', () => {
    const armed = nextChord(IDLE, 'g', 0).state

    const between = nextChord(armed, 'x', 10)
    expect(between).toEqual({ state: IDLE, fired: false })
    expect(nextChord(between.state, 'b', 20).fired).toBe(false)

    expect(nextChord(armed, 'b', CHORD_WINDOW_MS + 1)).toEqual({ state: IDLE, fired: false })
  })

  it('treats a second `g` as the first key again', () => {
    const armed = nextChord(IDLE, 'g', 0).state
    const again = nextChord(armed, 'g', 900)

    expect(again.state).toEqual({ armedAt: 900 })
    expect(nextChord(again.state, 'b', 1800).fired).toBe(true)
  })

  it('does not fire a second time on the same `g`', () => {
    const armed = nextChord(IDLE, 'g', 0).state
    const fired = nextChord(armed, 'b', 10)

    expect(nextChord(fired.state, 'b', 20).fired).toBe(false)
  })
})

describe('isFieldTarget', () => {
  const made = (html: string): Element => {
    const holder = document.createElement('div')
    holder.innerHTML = html
    return holder.firstElementChild as Element
  }

  it.each(['<textarea></textarea>', '<input type="text">', '<input type="checkbox">', '<select></select>'])(
    'is a field: %s',
    (html) => {
      expect(isFieldTarget(made(html))).toBe(true)
    }
  )

  it('is a field inside an editable region, and not inside one switched off', () => {
    expect(isFieldTarget(made('<div contenteditable="true"><span>x</span></div>').firstElementChild)).toBe(true)
    expect(isFieldTarget(made('<div contenteditable=""><b></b></div>').firstElementChild)).toBe(true)
    expect(isFieldTarget(made('<div contenteditable="false"><b></b></div>').firstElementChild)).toBe(false)
  })

  it('is not a field: a button, the body, a non-element', () => {
    expect(isFieldTarget(made('<button></button>'))).toBe(false)
    expect(isFieldTarget(document.body)).toBe(false)
    expect(isFieldTarget(null)).toBe(false)
    expect(isFieldTarget(window)).toBe(false)
  })
})
