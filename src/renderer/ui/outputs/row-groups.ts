import type { RailRow } from '../../../shared/rail'

/** One directory's rows. `dir` is project-relative with a trailing `/`. */
export type RowGroup = { dir: string; rows: RailRow[] }

/** Code-unit order, never locale order: the same on every machine. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * The directory a path sits in, with a trailing `/`. Every row is under the
 * output folder (Story 5.4) and its path is project-relative, so a row always
 * has one, and a file directly in the folder is headed by the folder itself.
 */
function dirOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1)
}

/** The file's own name, which is what a row shows under its directory's heading. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/**
 * The rows grouped by directory (UX-DR18). Groups come in code-unit path order
 * and rows in code-unit name order inside each: no recency, relevance or
 * pinning at any level. A group exists only while it has a row, so an empty
 * directory never gets a heading. Pure and non-mutating.
 */
export function groupRows(rows: readonly RailRow[]): RowGroup[] {
  const groups = new Map<string, RailRow[]>()

  for (const row of rows) {
    const dir = dirOf(row.path)
    const group = groups.get(dir)
    if (group === undefined) {
      groups.set(dir, [row])
    } else {
      group.push(row)
    }
  }

  return [...groups.keys()].sort(byCodeUnit).map((dir) => ({
    dir,
    rows: (groups.get(dir) as RailRow[]).sort((a, b) =>
      byCodeUnit(baseName(a.path), baseName(b.path))
    )
  }))
}
