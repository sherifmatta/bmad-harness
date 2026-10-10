/**
 * The one chord in the product (Story 6.3): `g` then `b`, within one second,
 * shows the Board. Pure, so a suite with no DOM holds every rule.
 *
 * The state's `armedAt` is the instant the `g` was pressed, or `null` while none
 * is armed. Keys compare without case, so Caps Lock does not defeat the chord
 * (a held Shift is the caller's to refuse). Any key that is not the chord's next key puts it back to `null`: `g` then
 * another key, and a `g` left over a second, do nothing. A second `g` is the
 * chord's first key again and arms afresh.
 */

/** How long the `b` has to follow the `g`, in milliseconds. */
export const CHORD_WINDOW_MS = 1000

/** `armedAt` is when the `g` landed, in the same clock as the `at` handed to `nextChord`. */
export type ChordState = { armedAt: number | null }

export const IDLE: ChordState = { armedAt: null }

/** What one key did: the state after it, and whether it completed the chord. */
export type ChordStep = { state: ChordState; fired: boolean }

/** A key with no modifier held; the caller resets the chord for any that has one. */
export function nextChord(state: ChordState, pressed: string, at: number): ChordStep {
  const key = pressed.toLowerCase()
  if (key === 'g') {
    return { state: { armedAt: at }, fired: false }
  }
  if (key === 'b' && state.armedAt !== null && at - state.armedAt <= CHORD_WINDOW_MS) {
    return { state: IDLE, fired: true }
  }
  return { state: IDLE, fired: false }
}

/** Where typing belongs to the field and not to the page: an input, a textarea, a select or an editable region. */
export function isFieldTarget(target: EventTarget | null): boolean {
  if (typeof Element === 'undefined' || !(target instanceof Element)) {
    return false
  }
  if (/^(?:input|textarea|select)$/i.test(target.tagName)) {
    return true
  }
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null
}
