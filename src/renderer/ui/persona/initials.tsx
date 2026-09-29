import type { JSX } from 'react'

import './initials.css'

/**
 * The initials token — FR82, UX-DR15, DESIGN.md:581-587 and EXPERIENCE.md's
 * *The initials token — focus parity*.
 *
 * This is the thing that made the 32px portrait floor affordable. At 20px a
 * generated face degrades to a colour blob with a hair silhouette, and the
 * derivation has no collision check to save it, so the small-reference cases —
 * stacked faces, the handoff chip — take a disc of letters instead. The 32px
 * form is the user's own avatar in the transcript, which is the only place a
 * person who has no generated face appears.
 *
 * **`tabindex` and the reveal are the point, not decoration.** A hover-only
 * tooltip is the one affordance that fails completely without a mouse, and the
 * whole content of a stacked row — who is in it — is behind that reveal. So
 * the disc is focusable, it is labelled, and the reveal fires on hover and on
 * keyboard focus through one selector list, which is what makes the parity
 * structural rather than a thing two rules have to agree about.
 */

/** The two sizes DESIGN.md fixes: small reference, and the user's own avatar. */
export type InitialsSize = 20 | 32

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
  stacked = false
}: {
  name: string
  title: string
  size: InitialsSize
  stacked?: boolean
}): JSX.Element {
  const classes = ['initials']
  if (size === 32) {
    classes.push('initials--user')
  }
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
