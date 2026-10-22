import type { ChangeRow, ChangesSnapshot } from '../shared/changes'

/**
 * Each project window's Changes rows as main last read them (Story 9.3), kept
 * where the document bridge can reach them without reaching into the Changes
 * bridge: AD-13's second admission opens a path only when it is exactly a row
 * main holds for the asking window. `null` is a window whose Changes snapshot is
 * not a list (reading, not a repository, no git, a failed read).
 */

const rows = new Map<number, ChangeRow[] | null>()

/** Hold what a window's snapshot lists, or `null` when it lists nothing. */
export function rememberChanges(webContentsId: number, snapshot: ChangesSnapshot): void {
  rows.set(webContentsId, snapshot.kind === 'list' ? snapshot.rows : null)
}

export function forgetChanges(webContentsId: number): void {
  rows.delete(webContentsId)
}

/** The rows main holds for a window, or `null` when it holds no list. */
export function changeRowsOf(webContentsId: number): readonly ChangeRow[] | null {
  return rows.get(webContentsId) ?? null
}
