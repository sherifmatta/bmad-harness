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
 * A directory's heading in the Outputs tree (Stories 5.5 and 9.2): a button that folds
 * everything beneath it. The chevron, then the directory's own `name` (the output folder
 * as written at the root); and, only while it is folded and a row anywhere beneath it is
 * `changing`, the amber dot and the word `changing`, so a file being written is never
 * folded out of sight. It shows no count and never a run's annotation. Its full
 * project-relative path is its `title`, so a nested name is never ambiguous.
 * `aria-expanded` and `aria-controls` say the fold, so nothing is announced through
 * the live region.
 *
 * The button sits in a `role="heading"` wrapper whose `aria-level` is the tree's depth
 * (the rail head is an `h3`, so the root is level 4). The indent is the stylesheet's,
 * from the group's `--tree-depth`, and moves the chevron only, so the rule and the
 * hover ground stay full width.
 *
 * The button is one stop of the list's roving tabindex, with the rows showing
 * (`tabStop`); which one, and how focus travels, is `Outputs`'s. Enter and Space
 * are the native click of a button and toggle it; the arrows are `onKey`'s.
 */
export function FolderHeading({
  name,
  dir,
  level,
  folded,
  changing,
  controls,
  tabStop,
  onToggle,
  onKey,
  buttonRef
}: {
  /** What the heading shows: the directory's own name with a trailing `/`. */
  name: string
  /** The full project-relative path, as the folded set holds it. */
  dir: string
  /** The heading's `aria-level`: 4 at the root, one more per level. */
  level: number
  folded: boolean
  /** Whether a row anywhere beneath this directory is `changing` on disk. */
  changing: boolean
  /** The id of the branch this heading folds. */
  controls: string
  tabStop: boolean
  onToggle: () => void
  onKey: (event: KeyboardEvent<HTMLButtonElement>) => void
  buttonRef: (element: HTMLButtonElement | null) => void
}): JSX.Element {
  return (
    <div role="heading" aria-level={level} className="folder-heading-row">
      <button
        type="button"
        className="folder-heading focus-inset"
        aria-expanded={!folded}
        aria-controls={controls}
        title={dir}
        tabIndex={tabStop ? 0 : -1}
        ref={buttonRef}
        onClick={onToggle}
        onKeyDown={onKey}
      >
        <Chevron open={!folded} />
        <span className="folder-heading-path">{name}</span>
        {folded && changing && (
          <span className="folder-heading-live">
            <StatusDot state="work" />
            changing
          </span>
        )}
      </button>
    </div>
  )
}
