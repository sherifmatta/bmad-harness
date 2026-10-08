/**
 * What crosses between main and the Welcome window: the replies of its four
 * requests. Bridge-layer types only, no behaviour.
 *
 * A recent row carries only what a row shows and the one fact a row cannot
 * know for itself: whether the folder is still there. Main stats each folder
 * and nothing else; no install state, count, branch or version is part of it.
 */

/** One row of the recent list, newest first. */
export type RecentRow = {
  /** The folder's absolute path: what opening the row opens. */
  path: string
  /** The folder's own name, or its path when it has none (a root). */
  name: string
  /** The folder's parent, the home directory written `~`. */
  parent: string
  /** When the project's window last opened, epoch milliseconds. */
  openedAt: number
  /** False when the folder is gone: the row stays and does nothing. */
  exists: boolean
}

/**
 * The answer to a choose, a recent row or a drop. `ok` means a project's window
 * opened (or was raised) and the Welcome is closing. Otherwise nothing opened:
 * `name` is what a refused drop was called, for the line that says so, and
 * is absent for a cancelled chooser, a missing folder or a refused sender.
 */
export type OpenAck = { ok: true } | { ok: false; name?: string }
