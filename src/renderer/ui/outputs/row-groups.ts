import type { RailRow } from '../../../shared/rail'
import { headingKey } from './row-nav'

/**
 * One directory of a rail tree (Story 9.2, UX-DR58; the Changes half's too, Story 9.3).
 * `dir` is the full project-relative path with a trailing `/` (`''` at a tree rooted at
 * the project itself), the same string the folded set holds; `name` is what its heading
 * shows: the root's own name as given, else the directory's own name with a trailing `/`.
 * `depth` is 0 at the root. Its subdirectories and its own rows, each in code-unit order.
 */
export type TreeNode<R extends { path: string } = RailRow> = {
  dir: string
  name: string
  depth: number
  dirs: TreeNode<R>[]
  rows: R[]
}

/** Code-unit order, never locale order: the same on every machine. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * The row's own name, which is what a row shows under its directory's heading. A path
 * that ends in `/` names a directory listed as one row (an untracked directory, Story 9.3),
 * and keeps its slash: `baseName('a/sub/')` is `sub/`.
 */
export function baseName(path: string): string {
  const bare = path.endsWith('/') ? path.slice(0, -1) : path
  return path.slice(bare.lastIndexOf('/') + 1)
}

/**
 * Subdirectories by name, then rows by name, at every level; rows of one name (only
 * rows from outside the root can share one) by their whole path. The nodes are this
 * module's own.
 */
function order<R extends { path: string }>(node: TreeNode<R>): void {
  node.dirs.sort((a, b) => byCodeUnit(a.name, b.name))
  node.rows.sort((a, b) => byCodeUnit(baseName(a.path), baseName(b.path)) || byCodeUnit(a.path, b.path))
  node.dirs.forEach(order)
}

/**
 * The rows as a directory tree rooted at `root` (Story 9.2): the output folder for the
 * Outputs half, `''` for the Changes half, whose root heading is the project folder's
 * name (`name`, Story 9.3). A directory is a node only while a row sits beneath it at
 * any depth, so an empty directory never gets a heading; a chain of single children is
 * not compacted. A path ending in `/` is a row of its parent, not a directory of its
 * own. No recency, relevance or pinning at any level. By contract (Story 5.4) every row
 * is under `root`; one that is not is placed directly under it. Pure and non-mutating.
 */
export function buildTree<R extends { path: string }>(rows: readonly R[], root: string, name: string = root): TreeNode<R> {
  const top: TreeNode<R> = { dir: root, name, depth: 0, dirs: [], rows: [] }
  const nodes = new Map<string, TreeNode<R>>([[root, top]])

  for (const row of rows) {
    const inside = row.path.startsWith(root) ? row.path.slice(root.length) : baseName(row.path)
    // A directory listed as a row sits in its parent: its own trailing slash names no level.
    const bare = inside.endsWith('/') ? inside.slice(0, -1) : inside
    let at = top
    for (const segment of bare.split('/').slice(0, -1)) {
      const dir = `${at.dir}${segment}/`
      let next = nodes.get(dir)
      if (next === undefined) {
        next = { dir, name: `${segment}/`, depth: at.depth + 1, dirs: [], rows: [] }
        nodes.set(dir, next)
        at.dirs.push(next)
      }
      at = next
    }
    at.rows.push(row)
  }

  order(top)
  return top
}

/** Whether any row beneath this directory, at any depth, is `changing` on disk. */
export function hasChanging(node: TreeNode<RailRow>): boolean {
  return node.rows.some((row) => row.state === 'changing') || node.dirs.some(hasChanging)
}

/** Whether a tree holds anything to show. */
export function hasRows<R extends { path: string }>(node: TreeNode<R>): boolean {
  return node.rows.length > 0 || node.dirs.length > 0
}

/**
 * The headings and the rows showing, in visual order: a heading is keyed `dir:<dir>`, a
 * row by its path; nothing beneath a folded heading. With each key's parent heading, for
 * `←` and for a focused entry that leaves. A tree with no rows shows nothing.
 */
export function showing<R extends { path: string }>(
  tree: TreeNode<R> | null,
  folded: ReadonlySet<string>
): { order: string[]; parentOf: Map<string, string | null> } {
  const keys: string[] = []
  const parentOf = new Map<string, string | null>()
  const walk = (node: TreeNode<R>, parent: string | null): void => {
    const key = headingKey(node.dir)
    keys.push(key)
    parentOf.set(key, parent)
    if (folded.has(node.dir)) {
      return
    }
    node.dirs.forEach((child) => walk(child, key))
    for (const row of node.rows) {
      keys.push(row.path)
      parentOf.set(row.path, key)
    }
  }
  if (tree !== null && hasRows(tree)) {
    walk(tree, null)
  }
  return { order: keys, parentOf }
}

/**
 * The first `limit` rows of the tree in visual order (Story 9.3's cap): a preorder walk,
 * each directory's subdirectories before its own rows, folds ignored. The rows are the
 * tree's own, in that order.
 */
export function firstRows<R extends { path: string }>(tree: TreeNode<R>, limit: number): R[] {
  const out: R[] = []
  const walk = (node: TreeNode<R>): void => {
    for (const child of node.dirs) {
      if (out.length >= limit) {
        return
      }
      walk(child)
    }
    for (const row of node.rows) {
      if (out.length >= limit) {
        return
      }
      out.push(row)
    }
  }
  walk(tree)
  return out
}
