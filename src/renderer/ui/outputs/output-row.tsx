import type { JSX, KeyboardEvent } from 'react'

import type { RailRow } from '../../../shared/rail'
import { StatusDot } from '../status/status-dot'
import { formatAge } from './format-age'
import { baseName } from './row-groups'

/** The row's state text. The vocabulary is fixed; `saved` carries its age. */
function stateText(row: RailRow, now: number): string {
  switch (row.state) {
    case 'not-yet-written':
      return 'not yet written'
    case 'changing':
      return 'changing'
    case 'saved':
      return `saved · ${formatAge(row.savedAt, now)}`
  }
}

/**
 * A row's file icon: the mockup's two paths, sized by tokens in the stylesheet
 * and stroked with the row's colour. Decoration only, so it is hidden from
 * assistive technology.
 */
function FileIcon(): JSX.Element {
  return (
    <svg className="file-icon" viewBox="0 0 12 14" fill="none" aria-hidden="true">
      <path
        d="M1 1.5A.5.5 0 0 1 1.5 1h5L11 5.2v7.3a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5z"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path d="M6.5 1.2v4h4.3" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}

/**
 * One file under `_bmad/`, as one line (UX-DR18): icon, name, then a meta
 * cluster — the stream's annotation if there is one, the owner's name if it
 * resolved, and the watcher's state.
 *
 * The row is an `li` holding one native button (FR55, NFR20), so `Enter` is the
 * browser's own click and the row is a control that does something: it opens
 * the file's document window. Exactly one row in the list is a tab stop
 * (`tabStop`), and which one, and how focus travels between rows, is
 * `Outputs`'s. The button carries the shared inset ring and no rule of its own.
 *
 * The row is complete without an annotation: the slot renders nothing, not an
 * empty box. `ownerName` is the roster's name for the row's owner, or
 * `undefined` when the row has none or the roster lacks it — and then nothing
 * is drawn, never a fallback. A dot appears only beside the text `changing`.
 * Opening a document changes nothing about the row.
 */
export function OutputRow({
  row,
  ownerName,
  now,
  tabStop,
  onOpen,
  onKey,
  buttonRef
}: {
  row: RailRow
  ownerName?: string
  now: number
  tabStop: boolean
  onOpen: (path: string) => void
  onKey: (event: KeyboardEvent<HTMLButtonElement>) => void
  buttonRef: (element: HTMLButtonElement | null) => void
}): JSX.Element {
  return (
    <li className={`output-row output-row--${row.state}`}>
      <button
        type="button"
        className="output-row-button focus-inset"
        tabIndex={tabStop ? 0 : -1}
        ref={buttonRef}
        onClick={() => onOpen(row.path)}
        onKeyDown={onKey}
      >
        <FileIcon />
        <span className="output-row-name">{baseName(row.path)}</span>
        <span className="output-row-meta">
          {row.annotation !== undefined && (
            <span className="output-row-annotation">{row.annotation.text}</span>
          )}
          {ownerName !== undefined && (
            // The room is no persona: its own class and tokens, and no portrait (Story 4.1).
            <span className={row.room === true ? 'output-row-owner output-row-owner--room' : 'output-row-owner'}>
              {ownerName}
            </span>
          )}
          <span className="output-row-state">
            {row.state === 'changing' && <StatusDot state="work" />}
            {stateText(row, now)}
          </span>
        </span>
      </button>
    </li>
  )
}
