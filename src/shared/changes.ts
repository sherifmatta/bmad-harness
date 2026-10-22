import type { HarnessError } from './install'

/**
 * The Changes contract (Story 9.3, AD-31): what main reads of the project's
 * uncommitted files from git and what crosses the bridge to the renderer. Types
 * only, like `rail.ts`: Bridge is the one layer every side may import.
 *
 * Git is a third truth channel (AD-2 amended). A Changes row is never merged
 * with a rail row, never annotated by the stream, and never creates or removes
 * one. Main sends the full list; the renderer orders it, builds the tree and
 * caps it.
 */

/** The one word a row's git state is. Staged and unstaged are not told apart. */
export type ChangeState = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'

/**
 * One uncommitted file, by its project-relative POSIX `path`. `from` is a
 * renamed row's old path, and only a renamed row has one. `directory` marks an
 * untracked directory git reported whole (its `path` ends in `/`): drawn as a
 * row that opens nothing.
 */
export type ChangeRow = {
  path: string
  state: ChangeState
  from?: string
  directory?: true
}

/**
 * What one read came to. `reading` is before the first answer and draws no line
 * at all; `list` holds every row git reported (none is the clean repository);
 * `not-repo`, `no-git` and `failed` are each one line. `reason` is a closed
 * vocabulary: `too slow`, `too many files`, `git exit <code>` or
 * `unexpected output`, never git's own words.
 */
export type ChangesBody =
  | { kind: 'reading' }
  | { kind: 'list'; rows: ChangeRow[] }
  | { kind: 'not-repo' }
  | { kind: 'no-git' }
  | { kind: 'failed'; reason: string }

/**
 * One body, one moment. `root` is the project folder's own name, which the
 * tree's root heading shows with a trailing `/`. `revision` only ever increases,
 * so a late push can be told from a fresh one.
 */
export type ChangesSnapshot = ChangesBody & { revision: number; root: string }

/** The reply to `changes:get`: a snapshot, or the envelope saying why not. */
export type ChangesReply = { ok: true; snapshot: ChangesSnapshot } | { ok: false; error: HarnessError }
