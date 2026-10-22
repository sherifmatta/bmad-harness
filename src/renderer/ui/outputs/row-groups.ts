import type { RailRow } from '../../../shared/rail'

/**
 * One directory of the Outputs tree (Story 9.2, UX-DR58). `dir` is the full
 * project-relative path with a trailing `/`, the same string the folded set holds;
 * `name` is what its heading shows: the output folder as written at the root,
 * else the directory's own name with a trailing `/`. `depth` is 0 at the root.
 * Its subdirectories and its own files, each in code-unit order.
 */
export type TreeNode = {
  dir: string
  name: string
  depth: number
  dirs: TreeNode[]
  rows: RailRow[]
}

/** Code-unit order, never locale order: the same on every machine. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** The file's own name, which is what a row shows under its directory's heading. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * Subdirectories by name, then files by name, at every level; files of one name (only
 * rows from outside the root can share one) by their whole path. The nodes are this
 * module's own.
 */
function order(node: TreeNode): void {
  node.dirs.sort((a, b) => byCodeUnit(a.name, b.name))
  node.rows.sort((a, b) => byCodeUnit(baseName(a.path), baseName(b.path)) || byCodeUnit(a.path, b.path))
  node.dirs.forEach(order)
}

/**
 * The rows as a directory tree rooted at the output folder `root` (Story 9.2). A
 * directory is a node only while a row sits beneath it at any depth, so an empty
 * directory never gets a heading; a chain of single children is not compacted.
 * No recency, relevance or pinning at any level. By contract (Story 5.4) every row
 * is under `root`; one that is not is placed directly under it. Pure and
 * non-mutating.
 */
export function buildTree(rows: readonly RailRow[], root: string): TreeNode {
  const top: TreeNode = { dir: root, name: root, depth: 0, dirs: [], rows: [] }
  const nodes = new Map<string, TreeNode>([[root, top]])

  for (const row of rows) {
    const inside = row.path.startsWith(root) ? row.path.slice(root.length) : baseName(row.path)
    let at = top
    for (const segment of inside.split('/').slice(0, -1)) {
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
export function hasChanging(node: TreeNode): boolean {
  return node.rows.some((row) => row.state === 'changing') || node.dirs.some(hasChanging)
}
