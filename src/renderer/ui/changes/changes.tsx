import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, JSX, KeyboardEvent } from 'react'

import './changes.css'
import type { ChangeRow as Change, ChangesSnapshot } from '../../../shared/changes'
import type { HarnessError } from '../../../shared/install'
import { foldKey } from '../a11y/fold-key'
import { ErrorLine } from '../install/error-line'
import { useLayoutContext } from '../layout/layout-context'
import { FolderHeading } from '../outputs/folder-heading'
import { buildTree, firstRows, showing } from '../outputs/row-groups'
import type { TreeNode } from '../outputs/row-groups'
import { headingKey, rowMove, tabStopPath } from '../outputs/row-nav'
import { useDocOpen } from '../outputs/use-doc-open'
import { ChangeRow } from './change-row'
import { useChanges } from './use-changes'

/** The most rows drawn; past it one plain line says how many more there are. */
export const CHANGES_CAP = 500

/** The one line a snapshot that is not a list says, or `null` for a list or for `reading` (which draws nothing). */
export function changesLine(snapshot: ChangesSnapshot): string | null {
  switch (snapshot.kind) {
    case 'reading':
      return null
    case 'list':
      return snapshot.rows.length === 0 ? 'no uncommitted changes' : null
    case 'not-repo':
      return 'not a git repository'
    case 'no-git':
      return 'git not available'
    case 'failed':
      return `changes not read · ${snapshot.reason}`
  }
}

/**
 * The tree drawn and what is left out (Story 9.3): the full list as Story 9.2's tree,
 * rooted at the project itself and headed by its folder's name, cut to its first
 * `CHANGES_CAP` rows in tree order, and how many rows that leaves unlisted.
 */
export function changesTree(rows: readonly Change[], root: string): { tree: TreeNode<Change>; more: number } {
  const name = `${root}/`
  const full = buildTree(rows, '', name)
  if (rows.length <= CHANGES_CAP) {
    return { tree: full, more: 0 }
  }
  const shown = firstRows(full, CHANGES_CAP)
  return { tree: buildTree(shown, '', name), more: rows.length - shown.length }
}

/**
 * The rail's Changes half (Story 9.3, FR142, UX-DR59): every file git reports
 * uncommitted in the project, as Story 9.2's tree rooted at the project folder,
 * with a folded set of its own per project (`changesFolded`). A Changes row is
 * never merged with a rail row and carries none of the stream's facts (AD-2).
 *
 * Before the first answer (`reading`) it draws nothing at all. A snapshot that is
 * not a list, or an empty list, is exactly one line and no action. Past
 * `CHANGES_CAP` rows a plain `+<N> more not listed` follows, which is not a control.
 * A bridge failure with no snapshot renders the envelope through the shared error
 * line, as the Outputs half does. Nothing here is announced through the live region.
 *
 * The roving list, the folds and the focus hand-off are the Outputs half's, with
 * their own state: the headings and the rows showing are one tab stop; `↑`/`↓`
 * travel, `←` folds or goes to the parent, `→` unfolds; a focused entry that
 * leaves hands focus to its nearest ancestor heading still showing, else the list's
 * tab stop, else — the list gone entirely — the half's one line (`tabIndex={-1}`, so
 * it is never a tab stop), never the page (NFR21). A folded heading never says `changing`: a git
 * state is settled. Activating a row asks main to open its path as it came (AD-13's
 * second admission); a deleted row and a directory's row open nothing.
 */
export function Changes({
  snapshot,
  failure
}: {
  snapshot: ChangesSnapshot | null
  failure: HarnessError | null
}): JSX.Element | null {
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  // The half's one line, which takes the focus a list that went away entirely dropped (NFR21).
  const lineRef = useRef<HTMLParagraphElement | null>(null)
  const [movedToPath, setMovedToPath] = useState<string | null>(null)
  const { changesFolded: folded, saveChangesFolded } = useLayoutContext()
  const listsId = useId()

  const drawn = useMemo(
    () => (snapshot === null || snapshot.kind !== 'list' || snapshot.rows.length === 0 ? null : changesTree(snapshot.rows, snapshot.root)),
    [snapshot]
  )
  const tree = drawn?.tree ?? null
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
    } else {
      // Nothing of the list is left (all committed, or a one-line state): the line holds the focus, in the half.
      lineRef.current?.focus()
    }
  }, [order, parentOf])

  const returnFocus = useCallback((path: string) => {
    const row = buttons.current.get(path)
    if (row !== undefined) {
      setMovedToPath(path)
      row.focus()
      return
    }
    const stop = heldStop.current
    if (stop !== null) {
      buttons.current.get(stop)?.focus()
    }
  }, [])
  const open = useDocOpen(returnFocus)

  if (snapshot === null) {
    return failure === null ? null : (
      <div className="changes-failure">
        <ErrorLine error={failure} />
      </div>
    )
  }

  const line = changesLine(snapshot)
  if (line !== null) {
    return (
      <p className="changes-line" tabIndex={-1} ref={lineRef}>
        {line}
      </p>
    )
  }
  if (tree === null) {
    return null
  }

  const chord = (event: KeyboardEvent<HTMLButtonElement>): boolean =>
    event.altKey || event.ctrlKey || event.metaKey || event.shiftKey

  function moveTo(key: string): void {
    setMovedToPath(key)
    buttons.current.get(key)?.focus()
  }

  function travel(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    if (chord(event)) {
      return
    }
    const to = rowMove(event.key, index, order.length)
    const target = to === null ? undefined : order[to]
    if (target === undefined) {
      return
    }
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

  /** Fold or unfold one directory of this half's own set; the others are kept as they were. */
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
    saveChangesFolded(next)
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

  let branches = 0

  /** One directory: its heading, then its branch of subdirectories and then rows, at its depth. */
  function group(node: TreeNode<Change>): JSX.Element {
    const isFolded = folded.has(node.dir)
    const key = headingKey(node.dir)
    const branchId = `${listsId}-${branches++}`
    return (
      <div key={node.dir} className="changes-group" style={{ '--tree-depth': node.depth } as CSSProperties}>
        <FolderHeading
          name={node.name}
          dir={node.dir === '' ? node.name : node.dir}
          level={4 + node.depth}
          folded={isFolded}
          changing={false}
          controls={branchId}
          tabStop={key === tabStop}
          onToggle={() => setFolded(node.dir, !isFolded)}
          onKey={(event) => headingKeys(event, node.dir)}
          buttonRef={remember(key)}
        />
        <div id={branchId} className="changes-branch" hidden={isFolded}>
          {isFolded ? null : node.dirs.map(group)}
          {isFolded || node.rows.length === 0 ? null : (
            <ul className="changes-list">
              {node.rows.map((row) => (
                <ChangeRow
                  key={row.path}
                  row={row}
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
      className="changes"
      onFocus={(event) => {
        const target: EventTarget = event.target
        const key = [...buttons.current].find(([, element]) => element === target)?.[0]
        focusedKey.current = key ?? null
      }}
      onBlur={(event) => {
        const to = event.relatedTarget
        const elsewhere = to === null ? document.hasFocus() : !event.currentTarget.contains(to)
        if (event.target.isConnected && elsewhere) {
          focusedKey.current = null
        }
      }}
    >
      {group(tree)}
      {drawn !== null && drawn.more > 0 && <p className="changes-line">{`+${drawn.more} more not listed`}</p>}
    </div>
  )
}

/** `Changes` with its snapshot: the one thing the shell mounts. */
export function ConnectedChanges(): JSX.Element | null {
  const { snapshot, failure } = useChanges()
  return <Changes snapshot={snapshot} failure={failure} />
}
