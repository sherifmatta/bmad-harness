import { useId } from 'react'
import type { JSX } from 'react'

import './decision-block.css'
import type { Decision } from './decision'

/**
 * The decision block — DESIGN.md's *Decision option*, EXPERIENCE.md's *Decision
 * option* row (UX-DR22). It sits inside a persona's own turn, after the words,
 * when that persona stopped to ask a lettered or numbered question.
 *
 * It is a function of the transcript and the session, never a thing with a
 * life of its own: nothing here remembers a choice, and the block is gone the
 * moment the user's turn exists. So it has no chosen, selected, disabled,
 * recommended or sorted state, and no `aria-disabled`, `aria-pressed` or
 * `aria-selected`.
 *
 * Each option is a native button: its own tab stop, taking the shared
 * `:focus-visible` ring, activated by click or `Enter`/`Space` with no key code.
 * The key badge is the option's position, `A`, `B`, `C`, and not whatever marker
 * the persona wrote. Title and option text are React text, exactly as the persona
 * wrote them.
 */

/** The badge for the option at a position: `A` to `Z`, then plain numbers. */
export function keyOf(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : String(index + 1)
}

export function DecisionBlock({
  decision,
  onChoose
}: {
  decision: Decision
  /** Send an option's text as the user's turn. */
  onChoose: (text: string) => void
}): JSX.Element {
  const titleId = useId()
  return (
    <div className="decision" role="group" aria-labelledby={titleId}>
      <div className="decision-title" id={titleId}>
        {decision.title}
      </div>
      {decision.options.map((text, index) => (
        <button
          key={index}
          type="button"
          className="decision-option"
          onClick={() => onChoose(text)}
        >
          <span className="decision-key">{keyOf(index)}</span>
          <span className="decision-text">{text}</span>
        </button>
      ))}
    </div>
  )
}
