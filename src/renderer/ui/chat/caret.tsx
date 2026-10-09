import type { JSX } from 'react'

import './caret.css'

/**
 * The caret at the tail of words being written: an empty accent block that
 * blinks hard on and off (DESIGN.md's `blink`). It is hidden from a reader, since
 * it says nothing a word does not, and its caller draws it only while the writing
 * is real and removes it when that ends.
 */
export function Caret(): JSX.Element {
  return <span className="caret" aria-hidden="true" />
}
