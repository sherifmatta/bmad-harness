import { useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'

import type { RecentRow } from '../../../shared/welcome'
import { rovingKey } from '../a11y/roving-tabindex'
import { recentAge } from './recent-age'

/**
 * The projects opened before, newest first (FR107). The section is the list and
 * its label; with no rows it is not rendered at all, no label and no empty
 * line, because an absent thing is not shown as an empty one.
 *
 * The list is one tab stop. Arrows move between rows, `Enter` opens, and `Tab`
 * leaves. A row is a native button, so `Enter` is the browser's own click; a
 * row whose folder is gone is `aria-disabled` rather than `disabled`, so the
 * arrows still reach it and the user can read why, and its activation does
 * nothing. There is no control to remove a row, and no count, badge, install
 * state or version on one: the page does not know what a project holds.
 */
export function RecentList({
  rows,
  now,
  onOpen
}: {
  rows: readonly RecentRow[]
  now: number
  onOpen: (row: RecentRow) => void
}): JSX.Element | null {
  const [stop, setStop] = useState(0)
  const buttons = useRef<Map<string, HTMLButtonElement>>(new Map())

  if (rows.length === 0) {
    return null
  }
  // The list can shrink between two fetches; the stop never points past it.
  const held = Math.min(stop, rows.length - 1)

  function onKey(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return
    }
    const intent = rovingKey(event.key, {
      index,
      count: rows.length,
      orientation: 'vertical',
      activateOn: ['Enter']
    })
    if (intent.kind !== 'move') {
      return
    }
    // A move would otherwise scroll the window; Enter never reaches here.
    event.preventDefault()
    setStop(intent.index)
    buttons.current.get(rows[intent.index].path)?.focus()
  }

  return (
    <section className="welcome-recent" aria-labelledby="welcome-recent-label">
      <h2 className="welcome-label" id="welcome-recent-label">
        recent
      </h2>
      <ul className="welcome-recent-list">
        {rows.map((row, index) => (
          <li key={row.path}>
            <button
              type="button"
              className="welcome-recent-row focus-inset"
              tabIndex={index === held ? 0 : -1}
              aria-disabled={row.exists ? undefined : true}
              ref={(element) => {
                if (element === null) {
                  buttons.current.delete(row.path)
                } else {
                  buttons.current.set(row.path, element)
                }
              }}
              onClick={() => {
                setStop(index)
                if (row.exists) {
                  onOpen(row)
                }
              }}
              onKeyDown={(event) => onKey(event, index)}
            >
              <span className="welcome-recent-name">{row.name}</span>
              <span className="welcome-recent-path">{row.parent}</span>
              {row.exists ? (
                <span className="welcome-recent-age">{recentAge(row.openedAt, now)}</span>
              ) : (
                <span className="welcome-recent-missing">folder missing</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
