import { useState } from 'react'
import type { JSX } from 'react'

import './skill-row.css'
import type { MenuEntryView } from '../../../shared/install'

/** How many entries show before the rest sit behind `+N more`. */
const VISIBLE = 5

/**
 * The skill row — "<Persona> can …" above the composer, one button per entry
 * of the current persona's menu, each its description behind a leading code
 * chip (DESIGN.md `components.skill-button`, EXPERIENCE.md's skill buttons).
 *
 * A button knows nothing about what it runs: activating one hands its `code`
 * to `onRun`, which sends `menu.dispatch(sessionId, code)` and nothing else.
 * Main alone decides whether the code is a skill or a prompt; neither word, nor
 * any skill name, is here. No tooltip and no preview.
 *
 * The buttons are disabled while the persona's session has a turn in flight, and
 * only then; on an empty chat, with no session yet, they are enabled and a press
 * starts the seat with the skill as its first turn (Story 8.3). The composer
 * below is never disabled. A persona with no entries has no row.
 *
 * Only the first `VISIBLE` entries show. A longer menu ends in a `+N more`
 * button that opens the row in place to every entry and then reads `fewer`.
 * The expansion is this row's own state: it touches no transcript, no bridge and
 * no live region, and the toggle follows the entries so opening it moves nothing
 * under the keyboard. It is not a skill button and a turn in flight never holds it.
 */
export function SkillRow({
  name,
  items,
  disabled,
  onRun
}: {
  name: string
  items: readonly MenuEntryView[]
  /** A turn is in flight in the persona's session, or the persona has no session yet. */
  disabled: boolean
  onRun: (code: string) => void
}): JSX.Element | null {
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) {
    return null
  }
  const overflow = items.length > VISIBLE
  const shown = overflow && !expanded ? items.slice(0, VISIBLE) : items
  return (
    <div className="skill-row">
      <span className="skill-row-label">{`${name} can`}</span>
      {shown.map((item) => (
        <button key={item.code} type="button" className="skill-button" disabled={disabled} onClick={() => onRun(item.code)}>
          <span className="skill-code">{item.code}</span>
          {item.description}
        </button>
      ))}
      {overflow && (
        <button type="button" className="skill-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'fewer' : `+${items.length - VISIBLE} more`}
        </button>
      )}
    </div>
  )
}
