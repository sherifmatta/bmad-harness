import type { JSX } from 'react'

import { VIEWS } from './view'
import type { ViewId } from './view'

/**
 * The view switch: a group of exactly two native buttons, one pressed.
 *
 * Native `<button>`s are keyboard-operable by `Enter` and `Space` with nothing
 * added, and the shared focus ring draws on `:focus-visible` without a rule of
 * this component's own. No roving tabindex and no arrow handling: two buttons
 * are two tab stops, and those are the topbar's only ones (EXPERIENCE.md:480).
 */
export function ViewSwitch({
  view,
  onChange
}: {
  view: ViewId
  onChange: (next: ViewId) => void
}): JSX.Element {
  return (
    <div className="view-switch" role="group" aria-label="View">
      {VIEWS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={view === id}
          onClick={() => {
            onChange(id)
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
