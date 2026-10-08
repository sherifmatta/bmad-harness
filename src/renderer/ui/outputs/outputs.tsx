import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { JSX, KeyboardEvent } from 'react'

import './outputs.css'
import type { AgentView, HarnessError } from '../../../shared/install'
import { folderPathOf } from '../../../shared/output-folder'
import type { RailSnapshot } from '../../../shared/rail'
import { ErrorLine } from '../install/error-line'
import { foldKey } from '../a11y/fold-key'
import { useLayoutContext } from '../layout/layout-context'
import { FolderHeading } from './folder-heading'
import { OutputRow } from './output-row'
import { ownerLabel } from './owner-label'
import { groupRows } from './row-groups'
import { headingKey, rowMove, tabStopPath } from './row-nav'
import { useDocOpen } from './use-doc-open'
import { useNow } from './use-now'

/**
 * The rail's Outputs half (FR48, UX-DR18): one row per file under the project's
 * output folder, grouped by directory. The folder is the snapshot's own (Story
 * 5.4): the first group is headed by it, and the empty state names it.
 *
 * Before the first snapshot it draws nothing at all: no spinner, no sentence.
 * A snapshot with no rows is exactly two lines — that there are none, and the
 * path being watched — and no next step, skill name, persona or button. A rail
 * failure with no snapshot renders the envelope through the shared error line.
 *
 * A row's owner is the roster's name for the agent the stream's annotation names
 * (the persona writing it), else the agent its class names, or nothing when the
 * roster lacks that agent: an unlisted agent is never replaced by another. A
 * contended row names every persona its annotation lists and never the class's
 * (`ownerLabel`). `now` is data, passed in so the markup can be rendered at a
 * fixed moment.
 *
 * Each directory's heading is a button that folds its rows (Story 5.5). The folded
 * set is the window's layout (`useLayoutContext`): a toggle is one `saveFolded` of
 * the whole set, entries for directories that are gone kept. A folded directory's
 * rows are not rendered, a file arriving under it unfolds nothing, and its
 * heading says `changing` while a row under it is.
 *
 * The headings and the rows showing are one roving-tabindex list (NFR20, UX-DR18):
 * one tab stop — the one last moved to or opened, else the first in visual order,
 * which is a heading — with vertical, clamped travel through `rowMove`; on a
 * heading `←` folds and `→` unfolds and focus stays on it. Activating a row asks main to
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
  const { folded, saveFolded } = useLayoutContext()
  const listsId = useId()

  const groups = groupRows(snapshot?.rows ?? [])
  // Headings and the rows showing, in visual order: a heading is keyed `dir:<dir>`, a row by its path.
  const order = groups.flatMap((group) => [
    headingKey(group.dir),
    ...(folded.has(group.dir) ? [] : group.rows.map((row) => row.path))
  ])
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
        <p className="outputs-empty-line">{`no files under ${snapshot.folder} yet`}</p>
        <p className="outputs-empty-path">{folderPathOf(projectPath, snapshot.folder)}</p>
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

  /** Fold or unfold one directory; the others, and entries for directories not showing, are kept as they were. */
  function setFolded(dir: string, fold: boolean): void {
    if (folded.has(dir) === fold) {
      return
    }
    const next = new Set(folded)
    if (fold) {
      next.add(dir)
    } else {
      next.delete(dir)
    }
    setMovedToPath(headingKey(dir))
    saveFolded(next)
  }

  function headingKeys(event: KeyboardEvent<HTMLButtonElement>, dir: string, index: number): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return
    }
    const fold = foldKey(event.key)
    if (fold !== null) {
      event.preventDefault()
      setFolded(dir, fold === 'fold')
      return
    }
    travel(event, index)
  }

  return (
    <div className="outputs">
      {groups.map((group, groupIndex) => {
        const isFolded = folded.has(group.dir)
        const key = headingKey(group.dir)
        const listId = `${listsId}-${groupIndex}`
        return (
          <div key={group.dir} className="outputs-group">
            <FolderHeading
              dir={group.dir}
              folded={isFolded}
              changing={group.rows.some((row) => row.state === 'changing')}
              controls={listId}
              tabStop={key === tabStop}
              onToggle={() => setFolded(group.dir, !isFolded)}
              onKey={(event) => headingKeys(event, group.dir, order.indexOf(key))}
              buttonRef={(element) => {
                if (element === null) {
                  buttons.current.delete(key)
                } else {
                  buttons.current.set(key, element)
                }
              }}
            />
            <ul id={listId} className="outputs-list" hidden={isFolded}>
              {isFolded
                ? null
                : group.rows.map((row) => {
                    const index = order.indexOf(row.path)
                    return (
                      <OutputRow
                        key={row.path}
                        row={row}
                        ownerName={ownerLabel(row, nameOf)}
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
        )
      })}
    </div>
  )
}

/** `Outputs` with its clock: the one thing the shell mounts. */
export function ConnectedOutputs(props: Omit<Parameters<typeof Outputs>[0], 'now'>): JSX.Element | null {
  return <Outputs {...props} now={useNow()} />
}
