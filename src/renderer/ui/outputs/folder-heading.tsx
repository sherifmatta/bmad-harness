import type { JSX, KeyboardEvent } from 'react'

import { StatusDot } from '../status/status-dot'

/**
 * The chevron: one inline stroked path like the file icon, pointing right while the
 * folder is folded and down while it is open. It changes direction and nothing
 * more: no rotation, no transition. Decoration only, hidden from assistive technology.
 */
function Chevron({ open }: { open: boolean }): JSX.Element {
  return (
    <svg className="folder-chevron" viewBox="0 0 9 9" fill="none" aria-hidden="true">
      <path
        d={open ? 'M1.5 3L4.5 6L7.5 3' : 'M3 1.5L6 4.5L3 7.5'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * A directory's heading in the Outputs half (Story 5.5): a button that folds its own
 * rows. The chevron, then the directory path; and, only while it is folded and a
 * row under it is `changing`, the amber dot and the word `changing`, so a file
 * being written is never folded out of sight. It shows no count and never a run's
 * annotation. `aria-expanded` and `aria-controls` say the fold, so nothing is
 * announced through the live region.
 *
 * The button is one stop of the list's roving tabindex, with the rows showing
 * (`tabStop`); which one, and how focus travels, is `Outputs`'s. Enter and Space
 * are the native click of a button and toggle it; `←` folds and `→` unfolds, in
 * `onKey`.
 */
export function FolderHeading({
  dir,
  folded,
  changing,
  controls,
  tabStop,
  onToggle,
  onKey,
  buttonRef
}: {
  dir: string
  folded: boolean
  /** Whether a row under this directory is `changing` on disk. */
  changing: boolean
  /** The id of the list of rows this heading folds. */
  controls: string
  tabStop: boolean
  onToggle: () => void
  onKey: (event: KeyboardEvent<HTMLButtonElement>) => void
  buttonRef: (element: HTMLButtonElement | null) => void
}): JSX.Element {
  return (
    <button
      type="button"
      className="folder-heading focus-inset"
      aria-expanded={!folded}
      aria-controls={controls}
      tabIndex={tabStop ? 0 : -1}
      ref={buttonRef}
      onClick={onToggle}
      onKeyDown={onKey}
    >
      <Chevron open={!folded} />
      <span className="folder-heading-path">{dir}</span>
      {folded && changing && (
        <span className="folder-heading-live">
          <StatusDot state="work" />
          changing
        </span>
      )}
    </button>
  )
}
