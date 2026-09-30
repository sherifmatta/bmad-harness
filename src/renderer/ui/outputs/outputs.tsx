import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'

import './outputs.css'
import type { AgentView, HarnessError } from '../../../shared/install'
import type { RailSnapshot } from '../../../shared/rail'
import { ErrorLine } from '../install/error-line'
import { OutputRow } from './output-row'
import { groupRows } from './row-groups'
import { rowMove, tabStopPath } from './row-nav'
import { useDocOpen } from './use-doc-open'
import { useNow } from './use-now'

/**
 * The rail's Outputs half (FR48, UX-DR18): one row per file under `_bmad/`,
 * grouped by directory.
 *
 * Before the first snapshot it draws nothing at all: no spinner, no sentence.
 * A snapshot with no rows is exactly two lines — that there are none, and the
 * path being watched — and no next step, skill name, persona or button. A rail
 * failure with no snapshot renders the envelope through the shared error line.
 *
 * A row's owner is the roster's name for the agent its class names, or nothing
 * when the roster lacks that agent. `now` is data, passed in so the markup can
 * be rendered at a fixed moment.
 *
 * The rows are one roving-tabindex list (NFR20, UX-DR18): one tab stop — the
 * row last moved to or opened, else the first in visual order — with vertical,
 * clamped travel between rows through `rowMove`. Activating a row asks main to
 * open its document window (FR55). When that window is closed by the user, focus
 * comes back to the row that opened it, and if the row has gone since, to the
 * list's own tab stop; it is never left on the page (NFR21).
 */
export function Outputs({
  snapshot,
  failure,
  agents,
  projectPath,
  now
}: {
  snapshot: RailSnapshot | null
  failure: HarnessError | null
  agents: readonly AgentView[]
  projectPath: string
  now: number
}): JSX.Element | null {
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const [movedToPath, setMovedToPath] = useState<string | null>(null)

  const groups = groupRows(snapshot?.rows ?? [])
  const order = groups.flatMap((group) => group.rows.map((row) => row.path))
  const tabStop = tabStopPath(order, movedToPath)

  // The tab stop as of the last render, for a close that finds its row gone.
  const heldStop = useRef(tabStop)
  useEffect(() => {
    heldStop.current = tabStop
  }, [tabStop])

  const returnFocus = useCallback((path: string) => {
    const row = buttons.current.get(path)
    if (row !== undefined) {
      setMovedToPath(path)
      row.focus()
      return
    }
    // The row is gone: the list's own tab stop takes the focus instead.
    const stop = heldStop.current
    if (stop !== null) {
      buttons.current.get(stop)?.focus()
    }
  }, [])
  const open = useDocOpen(returnFocus)

  if (snapshot === null) {
    return failure === null ? null : (
      <div className="outputs-failure">
        <ErrorLine error={failure} />
      </div>
    )
  }

  if (snapshot.rows.length === 0) {
    return (
      <div className="outputs-empty">
        <p className="outputs-empty-line">no files under _bmad/ yet</p>
        <p className="outputs-empty-path">{`${projectPath}/_bmad`}</p>
      </div>
    )
  }

  const nameOf = new Map(agents.map((agent) => [agent.id, agent.name]))

  function travel(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    // A chord is the OS's or the app's, never a row move.
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return
    }
    const to = rowMove(event.key, index, order.length)
    const target = to === null ? undefined : order[to]
    if (target === undefined) {
      return
    }
    // A move would otherwise scroll the rail; Enter never reaches here.
    event.preventDefault()
    setMovedToPath(target)
    buttons.current.get(target)?.focus()
  }

  function activate(path: string): void {
    setMovedToPath(path)
    open(path)
  }

  return (
    <div className="outputs">
      {groups.map((group) => (
        <div key={group.dir} className="outputs-group">
          <div className="rail-group">{group.dir}</div>
          <ul className="outputs-list">
            {group.rows.map((row) => {
              const index = order.indexOf(row.path)
              return (
                <OutputRow
                  key={row.path}
                  row={row}
                  ownerName={row.owner === undefined ? undefined : nameOf.get(row.owner.agentId)}
                  now={now}
                  tabStop={row.path === tabStop}
                  onOpen={activate}
                  onKey={(event) => travel(event, index)}
                  buttonRef={(element) => {
                    if (element === null) {
                      buttons.current.delete(row.path)
                    } else {
                      buttons.current.set(row.path, element)
                    }
                  }}
                />
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** `Outputs` with its clock: the one thing the shell mounts. */
export function ConnectedOutputs(props: Omit<Parameters<typeof Outputs>[0], 'now'>): JSX.Element | null {
  return <Outputs {...props} now={useNow()} />
}
