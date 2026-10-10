/**
 * Roving tabindex, as an intent rather than as a side effect.
 *
 * Three surfaces in EXPERIENCE.md's keyboard table are *one tab stop for a
 * list* with arrow travel inside it — the rail's Team half, the skill row and
 * the rail's Outputs half. This is the one implementation of that behaviour;
 * a surface that reimplements it is the defect NFR20 exists to prevent.
 *
 * `rovingKey` decides and returns; it never touches an element. That is what
 * keeps it pure and testable under `environment: 'node'`, and it is also what
 * lets each surface keep its own focus-management rule from EXPERIENCE.md's
 * *Focus management* table, which differs per surface and is not this module's
 * to guess.
 *
 * Two choices worth naming, because neither is specified anywhere:
 *
 *  - Arrow travel **clamps** at both ends; it never wraps. A wrap moves focus
 *    to the far end of a list the user may not be able to see, and nothing in
 *    the intent asks for it.
 *  - There is no `Home`/`End`. NFR20 closes the keyboard vocabulary at arrows,
 *    `Enter`/`Space` and `Esc` — "no shortcut layer beyond this" and the one
 *    chord, `g` then `b`, which is the shell's and not a list's (Story 6.3).
 *
 * A key this module does not claim comes back as `ignore`, which means the
 * browser keeps it. `Tab` is the browser's by definition: the whole point of a
 * roving tabindex is that `Tab` leaves the list.
 */

/** Which pair of arrows the list travels on. The other pair is the browser's. */
export type Orientation = 'vertical' | 'horizontal'

export type RovingList = {
  /** The index that currently holds `tabindex="0"`. */
  index: number
  /** How many items the list has. Zero is a real state — a list can be empty. */
  count: number
  orientation: Orientation
  /**
   * The keys that activate the focused item. Not a constant, because the
   * surfaces disagree: a rail row opens its document on `Enter` **only**
   * (EXPERIENCE.md → *Keyboard reach*), where a persona tile and a skill
   * button take `Enter` and `Space` alike.
   */
  activateOn: readonly string[]
}

export type RovingIntent =
  | { kind: 'move'; index: number }
  | { kind: 'activate' }
  | { kind: 'ignore' }

const IGNORE: RovingIntent = { kind: 'ignore' }

/** The arrow that steps forward and the one that steps back, per axis. */
const ARROWS: Record<Orientation, { previous: string; next: string }> = {
  vertical: { previous: 'ArrowUp', next: 'ArrowDown' },
  horizontal: { previous: 'ArrowLeft', next: 'ArrowRight' }
}

function clamp(index: number, count: number): number {
  return Math.min(Math.max(index, 0), count - 1)
}

/**
 * What a key press means to a roving list. `key` is a `KeyboardEvent.key`
 * value, passed as a plain string so that this module carries no DOM type and
 * stays inside the node program the test suite runs in.
 */
export function rovingKey(key: string, list: RovingList): RovingIntent {
  const { index, count, orientation, activateOn } = list

  // An empty list has nothing to move to and nothing to activate. Checked
  // first so that no later branch can produce index -1.
  if (count <= 0) {
    return IGNORE
  }

  if (activateOn.includes(key)) {
    return { kind: 'activate' }
  }

  const { previous, next } = ARROWS[orientation]
  if (key === previous || key === next) {
    const step = key === next ? 1 : -1
    return { kind: 'move', index: clamp(index + step, count) }
  }

  // Includes the off-axis arrows: an `ArrowLeft` inside a vertical list is not
  // this list's key, so the browser keeps it.
  return IGNORE
}
