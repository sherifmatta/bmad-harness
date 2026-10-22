import type { JSX, KeyboardEvent } from 'react'

import type { ChangeRow as Change } from '../../../shared/changes'
import { FileIcon } from '../outputs/output-row'
import { baseName } from '../outputs/row-groups'

/** The row's state in words: one word, and a renamed row's old name after it. */
export function changeStateText(row: Change): string {
  return row.state === 'renamed' && row.from !== undefined ? `renamed · from ${baseName(row.from)}` : row.state
}

/** Whether activating the row opens anything: a deleted file is not there, and a directory is no document. */
export function opensDocument(row: Change): boolean {
  return row.state !== 'deleted' && row.directory !== true
}

/**
 * One uncommitted file in the Changes half (Story 9.3, UX-DR59): a Rail row at rest.
 * The file icon at `faint`, the file's own name in `text`, and git's state as a word
 * at the right in `meta` mono `dim`. No owner, no run annotation, no state colour,
 * no letter badge: nothing in it ever looks like it is happening.
 *
 * The row is an `li` holding one native button, one stop of the half's roving list
 * (`tabStop`). Its accessible name is `<name>, <state>` and its description (its
 * `title`) is the path. A `deleted` row is `dim` and struck through, its description
 * says it opens nothing, and activating it does nothing and announces nothing; an
 * untracked directory's row does nothing either. Every other row asks for its path,
 * as it came, to be opened.
 */
export function ChangeRow({
  row,
  tabStop,
  onOpen,
  onKey,
  buttonRef
}: {
  row: Change
  tabStop: boolean
  onOpen: (path: string) => void
  onKey: (event: KeyboardEvent<HTMLButtonElement>) => void
  buttonRef: (element: HTMLButtonElement | null) => void
}): JSX.Element {
  const name = baseName(row.path)
  const state = changeStateText(row)
  const description = row.state === 'deleted' ? 'deleted · nothing to open' : row.path
  return (
    <li className={`change-row change-row--${row.state}`}>
      <button
        type="button"
        className="change-row-button focus-inset"
        aria-label={`${name}, ${state}`}
        title={description}
        tabIndex={tabStop ? 0 : -1}
        ref={buttonRef}
        onClick={() => {
          if (opensDocument(row)) {
            onOpen(row.path)
          }
        }}
        onKeyDown={onKey}
      >
        <FileIcon />
        <span className="change-row-name">{name}</span>
        <span className="change-row-state">{state}</span>
      </button>
    </li>
  )
}
