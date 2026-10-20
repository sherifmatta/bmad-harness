import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, JSX, KeyboardEvent } from 'react'

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
import { buildTree, hasChanging } from './row-groups'
import type { TreeNode } from './row-groups'
import { headingKey, rowMove, tabStopPath } from './row-nav'
import { useDocOpen } from './use-doc-open'
import { useNow } from './use-now'

/**
 * The headings and the rows showing, in visual order: a heading is keyed `dir:<dir>`, a
 * row by its path; nothing beneath a folded heading. With each key's parent heading, for
 * `←` and for a focused entry that leaves. A tree with no rows shows nothing.
 */
function showing(
  tree: TreeNode | null,
  folded: ReadonlySet<string>
): { order: string[]; parentOf: Map<string, string | null> } {
  const order: string[] = []
  const parentOf = new Map<string, string | null>()
  const walk = (node: TreeNode, parent: string | null): void => {
    const key = headingKey(node.dir)
    order.push(key)
    parentOf.set(key, parent)
    if (folded.has(node.dir)) {
      return
    }
    node.dirs.forEach((child) => walk(child, key))
    for (const row of node.rows) {
      order.push(row.path)
      parentOf.set(row.path, key)
    }
  }
  if (tree !== null && hasRows(tree)) {
    walk(tree, null)
  }
  return { order, parentOf }
}

function hasRows(node: TreeNode): boolean {
  return node.rows.length > 0 || node.dirs.length > 0
}

/**
 * The rail's Outputs half (FR48, UX-DR18): one row per file under the project's
 * output folder, nested as a directory tree (Story 9.2, UX-DR58). The folder is
 * the snapshot's own (Story 5.4): the tree is rooted at it, its heading shows it
 * as written, and the empty state names it.
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
 * Each directory's heading is a button that folds its whole subtree (Stories 5.5
 * and 9.2). The folded set is the window's layout (`useLayoutContext`): a toggle is
 * one `saveFolded` of the whole set, entries for directories that are gone kept,
 * and the folds inside a folded directory kept too. Nothing beneath a folded
 * directory is rendered, a file arriving under it unfolds nothing, and its heading
 * says `changing` while a row anywhere beneath it is.
 *
 * The headings and the rows showing are one roving-tabindex list (NFR20, UX-DR18):
 * one tab stop — the one last moved to or opened, else the first in visual order,
 * which is a heading — with vertical, clamped travel through `rowMove` in visual
 * order (a heading, its subdirectories, then its files); on an open heading `←`
 * folds and `→` unfolds and focus stays on it, and `←` on a folded heading or a
 * row moves to its parent heading (none at the root). Activating a row asks main to
 * open its document window (FR55). When that window is closed by the user, focus
 * comes back to the row that opened it, and if the row has gone since, to the
 * list's own tab stop. When the focused heading or row leaves the list, focus goes
 * to its nearest ancestor heading still showing, else to the list's tab stop: it is
 * never left on the page (NFR21).
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

  const tree = useMemo(() => (snapshot === null ? null : buildTree(snapshot.rows, snapshot.folder)), [snapshot])
  const { order, parentOf } = useMemo(() => showing(tree, folded), [tree, folded])
  const tabStop = tabStopPath(order, movedToPath)

  // The tab stop as of the last render, for a close that finds its row gone.
  const heldStop = useRef(tabStop)
  useEffect(() => {
    heldStop.current = tabStop
  }, [tabStop])

  // The entry holding focus, and the parents as of the render it was focused in.
  const focusedKey = useRef<string | null>(null)
  const heldParents = useRef(parentOf)
  useLayoutEffect(() => {
    const was = focusedKey.current
    const parents = heldParents.current
    heldParents.current = parentOf
    if (was === null || order.includes(was)) {
      return
    }
    focusedKey.current = null
    // Only a focus the removal dropped is placed again: one the user took elsewhere is left there.
    const active = document.activeElement
    if (active !== null && active !== document.body) {
      return
    }
    let to = parents.get(was) ?? null
    while (to !== null && !order.includes(to)) {
      to = parents.get(to) ?? null
    }
    const target = to ?? tabStopPath(order, null)
    if (target !== null) {
      setMovedToPath(target)
      buttons.current.get(target)?.focus()
    }
  }, [order, parentOf])

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

  if (tree === null || snapshot.rows.length === 0) {
    return (
      <div className="outputs-empty">
        <p className="outputs-empty-line">{`no files under ${snapshot.folder} yet`}</p>
        <p className="outputs-empty-path">{folderPathOf(projectPath, snapshot.folder)}</p>
      </div>
    )
  }

  const nameOf = new Map(agents.map((agent) => [agent.id, agent.name]))

  const chord = (event: KeyboardEvent<HTMLButtonElement>): boolean =>
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey

  function moveTo(key: string): void {
    setMovedToPath(key)
    buttons.current.get(key)?.focus()
  }

  function travel(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    // A chord is the OS's or the app's, never a row move.
    if (chord(event)) {
      return
    }
    const to = rowMove(event.key, index, order.length)
    const target = to === null ? undefined : order[to]
    if (target === undefined) {
      return
    }
    // A move would otherwise scroll the rail; Enter never reaches here.
    event.preventDefault()
    moveTo(target)
  }

  /** `←` on a folded heading or a row: to the parent heading, and nowhere at the root. */
  function toParent(event: KeyboardEvent<HTMLButtonElement>, key: string): void {
    event.preventDefault()
    const parent = parentOf.get(key) ?? null
    if (parent !== null) {
      moveTo(parent)
    }
  }

  function rowKeys(event: KeyboardEvent<HTMLButtonElement>, path: string): void {
    if (chord(event)) {
      return
    }
    if (foldKey(event.key) === 'fold') {
      toParent(event, path)
      return
    }
    travel(event, order.indexOf(path))
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

  function headingKeys(event: KeyboardEvent<HTMLButtonElement>, dir: string): void {
    if (chord(event)) {
      return
    }
    const key = headingKey(dir)
    const fold = foldKey(event.key)
    if (fold === 'fold' && folded.has(dir)) {
      toParent(event, key)
      return
    }
    if (fold !== null) {
      event.preventDefault()
      setFolded(dir, fold === 'fold')
      return
    }
    travel(event, order.indexOf(key))
  }

  const remember = (key: string) => (element: HTMLButtonElement | null) => {
    if (element === null) {
      buttons.current.delete(key)
    } else {
      buttons.current.set(key, element)
    }
  }

  // Branch ids in render order; a folded branch's subtree takes none.
  let branches = 0

  /** One directory: its heading, then its branch of subdirectories and then files, at its depth. */
  function group(node: TreeNode): JSX.Element {
    const isFolded = folded.has(node.dir)
    const key = headingKey(node.dir)
    const branchId = `${listsId}-${branches++}`
    return (
      <div key={node.dir} className="outputs-group" style={{ '--tree-depth': node.depth } as CSSProperties}>
        <FolderHeading
          name={node.name}
          dir={node.dir}
          level={4 + node.depth}
          folded={isFolded}
          changing={isFolded && hasChanging(node)}
          controls={branchId}
          tabStop={key === tabStop}
          onToggle={() => setFolded(node.dir, !isFolded)}
          onKey={(event) => headingKeys(event, node.dir)}
          buttonRef={remember(key)}
        />
        <div id={branchId} className="outputs-branch" hidden={isFolded}>
          {isFolded ? null : node.dirs.map(group)}
          {isFolded || node.rows.length === 0 ? null : (
            <ul className="outputs-list">
              {node.rows.map((row) => (
                <OutputRow
                  key={row.path}
                  row={row}
                  ownerName={ownerLabel(row, nameOf)}
                  now={now}
                  tabStop={row.path === tabStop}
                  onOpen={activate}
                  onKey={(event) => rowKeys(event, row.path)}
                  buttonRef={remember(row.path)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="outputs"
      onFocus={(event) => {
        const target: EventTarget = event.target
        const key = [...buttons.current].find(([, element]) => element === target)?.[0]
        focusedKey.current = key ?? null
      }}
      onBlur={(event) => {
        // Focus taken elsewhere in this document by the user: a later removal is none of the list's business.
        // A window losing focus (a null target while the document has none) moves nothing, and is kept.
        const to = event.relatedTarget
        const elsewhere = to === null ? document.hasFocus() : !event.currentTarget.contains(to)
        if (event.target.isConnected && elsewhere) {
          focusedKey.current = null
        }
      }}
    >
      {group(tree)}
    </div>
  )
}

/** `Outputs` with its clock: the one thing the shell mounts. */
export function ConnectedOutputs(props: Omit<Parameters<typeof Outputs>[0], 'now'>): JSX.Element | null {
  return <Outputs {...props} now={useNow()} />
}
