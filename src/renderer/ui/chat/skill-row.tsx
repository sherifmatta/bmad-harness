import { useId, useState } from 'react'
import type { JSX } from 'react'

import './skill-row.css'
import type { MenuEntryView } from '../../../shared/install'

/** How many entries show before the rest sit behind `+N more`. */
const VISIBLE = 5

/** `7 skills`, `1 skill`: every entry of the menu, shown or not. */
function countOf(n: number): string {
  return n === 1 ? '1 skill' : `${n} skills`
}

/**
 * The skill row — "<Persona> can …" above the composer, one button per entry
 * of the current persona's menu, each its description behind a leading code
 * chip (DESIGN.md `components.skill-button`, EXPERIENCE.md's skill buttons).
 *
 * The row opens only when the user wants it (Story 9.1, UX-DR57). Its label is a
 * native disclosure button, `▸ <Name> can · <N> skills` while collapsed and
 * `▾ <Name> can` while open; `<N>` counts every entry, and the word is the
 * spec's for all of them, whatever main runs for each. The toggle controls the
 * row's entries region (`aria-controls`), which is always there and holds no
 * skill button and no `+N more` while collapsed, so the toggle is the row's only
 * tab stop. Whether it is open is not this row's: it comes in as `open` and goes
 * out through `onOpenChange`, one choice the app keeps for every persona's chat,
 * so a persona switch, a first message or a turn leaves it as it was. Toggling
 * touches no transcript, sends nothing, announces nothing and leaves focus on the
 * toggle, which a turn in flight never disables. Its accessible name is
 * `<Name> can, <N> skills`; the chevron is hidden from it.
 *
 * A skill button knows nothing about what it runs: activating one hands its `code`
 * to `onRun`, which sends `menu.dispatch(sessionId, code)` and nothing else.
 * Main alone decides what the code runs; the row is told an entry's code and
 * description and nothing of what it is. No tooltip and no preview.
 *
 * The buttons are disabled while the persona's session has a turn in flight, and
 * only then; on an empty chat, with no session yet, they are enabled and a press
 * starts the seat with the skill as its first turn (Story 8.3). The composer
 * below is never disabled. A persona with no entries has no row.
 *
 * Open, only the first `VISIBLE` entries show. A longer menu ends in a `+N more`
 * button that opens the row in place to every entry and then reads `fewer`.
 * The expansion is the open entries' own state and is not kept: they are drawn
 * only while the row is open, so it starts closed every time the row opens. It
 * touches no transcript, no bridge and no live region, and the toggle follows the
 * entries so opening it moves nothing under the keyboard. It is not a skill
 * button and a turn in flight never holds it.
 */
export function SkillRow({
  name,
  items,
  disabled,
  onRun,
  open,
  onOpenChange
}: {
  name: string
  items: readonly MenuEntryView[]
  /** A turn is in flight in the persona's session, or the persona has no session yet. */
  disabled: boolean
  onRun: (code: string) => void
  /** Whether the row is open: the app's one choice, never this row's. */
  open: boolean
  /** Asks for the row to be opened or closed; the caller keeps the choice. */
  onOpenChange: (open: boolean) => void
}): JSX.Element | null {
  const entriesId = useId()
  if (items.length === 0) {
    return null
  }
  return (
    <div className="skill-row">
      <button
        type="button"
        className="skill-row-toggle"
        aria-expanded={open}
        aria-controls={entriesId}
        aria-label={`${name} can, ${countOf(items.length)}`}
        onClick={() => onOpenChange(!open)}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="skill-row-label">{`${name} can`}</span>
        {!open && <span className="skill-row-count">{`· ${countOf(items.length)}`}</span>}
      </button>
      <div id={entriesId} className="skill-row-entries">
        {open && <OpenEntries items={items} held={disabled} onRun={onRun} />}
      </div>
    </div>
  )
}

/** The open row's entries and its `+N more`; drawn only while the row is open, so a close always forgets the expansion. */
function OpenEntries({
  items,
  held,
  onRun
}: {
  items: readonly MenuEntryView[]
  /** The row's `disabled`: a turn is in flight, so every skill button is held. */
  held: boolean
  onRun: (code: string) => void
}): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const overflow = items.length > VISIBLE
  const shown = overflow && !expanded ? items.slice(0, VISIBLE) : items
  return (
    <>
      {shown.map((item) => (
        <button key={item.code} type="button" className="skill-button" disabled={held} onClick={() => onRun(item.code)}>
          <span className="skill-code">{item.code}</span>
          {item.description}
        </button>
      ))}
      {overflow && (
        <button type="button" className="skill-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'fewer' : `+${items.length - VISIBLE} more`}
        </button>
      )}
    </>
  )
}
