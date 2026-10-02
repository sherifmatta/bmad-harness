import type { JSX } from 'react'

/**
 * The one control that ends a conversation (FR15): a native button in the
 * topbar, after the view switch. It is a lifecycle control and never a
 * next-step: no accent, badge, count, tooltip, `title` or confirm step, no
 * highlight, and nothing in the product says when to use it.
 *
 * Always enabled, and activated directly. `Enter` and `Space` come with the
 * native button and the shared focus ring draws on `:focus-visible` with no
 * rule of this component's own.
 */
export function EndSession({ onEnd }: { onEnd: () => void }): JSX.Element {
  return (
    <button type="button" className="end-session" onClick={onEnd}>
      End session
    </button>
  )
}
