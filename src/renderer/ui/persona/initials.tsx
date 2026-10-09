import type { JSX } from 'react'

import './initials.css'

/**
 * The initials token — FR82, UX-DR15, DESIGN.md's *Initials* and EXPERIENCE.md's
 * *The initials token — focus parity*.
 *
 * Two jobs, split by size.
 *
 * The 20px form is the small reference. At 20px a generated face degrades to a
 * colour blob with a hair silhouette, and the derivation has no collision check
 * to save it, so stacked faces and the handoff chip take a disc of letters
 * instead. That disc stands alone, so it is focusable (`tabindex`), labelled
 * `{name}, {title}`, and reveals name and role on hover and on keyboard focus
 * through one selector list, which makes the parity structural rather than a
 * thing two rules have to agree about. A hover-only tooltip is the one
 * affordance that fails completely without a mouse.
 *
 * The 26px and 22px forms are the chat's avatar (2026-10-09): a persona's and
 * the user's own beside a turn and in the chat header, where the thread carries
 * no portraits. The name is beside them, so they are decorative: `aria-hidden`,
 * no tab stop, no label, no reveal.
 */

/**
 * The three sizes DESIGN.md fixes: the small reference (20), the chat header's
 * disc (22) and the avatar beside a chat turn (26). The 22 and 26 discs are the
 * chat's own avatar, a persona's and yours alike, and stand beside the name, so
 * they are decorative: `aria-hidden`, no tab stop and no reveal.
 */
export type InitialsSize = 20 | 22 | 26

/**
 * The glyphs: the first letter of each of the first two words, upper-cased.
 *
 * Two, never three. A third letter does not fit the disc at either size, and
 * the rule has to be stated rather than assumed because a roster read from a
 * project's own install can hold any number of words — `portrait.html:344`
 * slices for the same reason.
 *
 * A one-word name yields one letter, which is correct rather than a gap to
 * fill: the label carries the full name, and inventing a second glyph from a
 * title would put a letter on the disc that is not in the person's name.
 */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.slice(0, 1))
    .join('')
    .toUpperCase()
}

/**
 * One disc.
 *
 * `role="img"` with an `aria-label` of `{name}, {title}` is the same treatment
 * every portrait `<svg>` carries, and it is what makes the glyphs an image of
 * a person rather than two letters read aloud. The reveal's text is inside the
 * labelled element on purpose: with `role="img"` the children are not exposed,
 * so the name and role are announced once, from the label, rather than twice.
 *
 * `focus-stacked` is opted into rather than restated. The shared ring lives in
 * `design/focus.css` and the stacked case differs only by its offset, which
 * that file already ships; a local focus rule here would be a second
 * definition of a treatment DESIGN.md:654 fixes as identical on every
 * primitive.
 */
export function Initials({
  name,
  title,
  size,
  stacked = false,
  you = false
}: {
  name: string
  title: string
  size: InitialsSize
  stacked?: boolean
  /** Your own disc: the one tint that tells you from a persona (22 and 26 only). */
  you?: boolean
}): JSX.Element {
  if (size !== 20) {
    // The chat's avatar: the name is beside it, so it says nothing of its own.
    const chat = ['initials', size === 26 ? 'initials--thread' : 'initials--header']
    if (you) {
      chat.push('initials--you')
    }
    return (
      <span className={chat.join(' ')} aria-hidden="true">
        {initialsOf(name)}
      </span>
    )
  }

  const classes = ['initials']
  if (stacked) {
    classes.push('initials--stacked', 'focus-stacked')
  }

  return (
    <span className={classes.join(' ')} tabIndex={0} role="img" aria-label={`${name}, ${title}`}>
      {initialsOf(name)}
      {/* The anchor and the card are two elements because the anchor's job is
          to be a zero-height line across the top of the disc that the card can
          hang above and centre on — which is how the reveal is placed without
          spending a percentage that NFR23 would read as a literal. */}
      <span className="initials-reveal">
        <span className="initials-reveal-card">
          <span className="initials-reveal-name">{name}</span>
          <span className="initials-reveal-role">{title}</span>
        </span>
      </span>
    </span>
  )
}
