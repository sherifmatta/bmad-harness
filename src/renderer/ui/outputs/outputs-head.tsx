import type { JSX } from 'react'

import './outputs.css'

/**
 * What the Outputs head says on its right (Story 5.4, DESIGN.md → *Outputs
 * head*): the folder the rail is watching, project-relative with a trailing `/`,
 * then `change…`, an unbordered link that opens the native folder chooser. Both
 * are text the user reads or acts on, so neither sits at `faint`, and neither has
 * a colour of its own beyond the text tier and the accent every link takes.
 *
 * The button is one tab stop, and it comes before the list's because the head is
 * before the list. It has no handler of its own: pressing it asks main to open
 * the chooser, and the folder it reports back is the next rail snapshot's.
 */
export function OutputsFolder({
  folder,
  onChange
}: {
  folder: string
  onChange: () => void
}): JSX.Element {
  return (
    <>
      <span className="outputs-where">{folder}</span>
      <button type="button" className="outputs-change" onClick={onChange}>
        change…
      </button>
    </>
  )
}

/**
 * The one line beneath the head, present only while there is a state to say:
 * `bmad writes to · <folder>`, `<chosen> · folder missing` or `not changed ·
 * <reason>`. It is a fact and nothing else, so it has no colour, no icon, no dot
 * and no badge; it is not a live region (the window's one is the announcer's).
 */
export function OutputsState({ line }: { line: string }): JSX.Element {
  return <p className="outputs-state">{line}</p>
}
