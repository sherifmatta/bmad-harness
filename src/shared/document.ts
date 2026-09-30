import type { HarnessError } from './install'

/**
 * The document contract — what main reads out of one file under `_bmad/` and
 * what crosses the bridge to the document window. Types and two constants, like
 * `rail.ts`: Bridge is the one layer every side may import.
 *
 * The window never reads the file (AD-13). Main's watcher reads it, holds the
 * latest result as a snapshot, and the window receives that snapshot: once when
 * it asks, and again every time it differs.
 */

/** The most bytes of a file that are read and decoded (NFR8). 1 MiB. */
export const DOC_MAX_BYTES = 1_048_576

/** How much of the start of a file is looked at for a NUL byte. */
export const DOC_SNIFF_BYTES = 8192

/**
 * What main can say about the file:
 * - `present`: read, decoded, shown;
 * - `missing`: not on disk (yet, or any more);
 * - `refused`: resolves outside `_bmad/`, so nothing was read;
 * - `unreadable`: a read failed;
 * - `binary`: a NUL byte in the first 8 KiB, so it is not text.
 */
export type DocState = 'present' | 'missing' | 'refused' | 'unreadable' | 'binary'

/** How the window renders the text: through markdown, or as plain text. */
export type DocKind = 'markdown' | 'text'

/**
 * One document, one moment. `path` is project-relative POSIX; `fullPath` is the
 * absolute path and is **display data only** — nothing opens, reads or reveals
 * by it. `revision` increases by one per pushed snapshot, so a late push can be
 * told from a fresh one.
 *
 * `text` is the last good text. A failed or non-text read never blanks it.
 */
export type DocSnapshot = {
  revision: number
  path: string
  fullPath: string
  kind: DocKind
  state: DocState
  text: string
  truncated: boolean
}

/** The reply to `doc:get`: a snapshot, or the envelope saying why not. */
export type DocReply = { ok: true; snapshot: DocSnapshot } | { ok: false; error: HarnessError }

/** The reply to `doc:open` and to the document window's three escapes. */
export type DocAck = { ok: true } | { ok: false; error: HarnessError }
