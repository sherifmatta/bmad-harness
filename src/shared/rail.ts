import type { HarnessError } from './install'

/**
 * The rail contract — what main folds out of the project's `_bmad/` tree and
 * what crosses the bridge to the renderer. Types only, like `install.ts`.
 *
 * A row has two fields with two owners and no merge (FR49, AD-2). The disk
 * field (`state`, and `savedAt` while saved) is written only by what the file
 * watcher saw; `annotation` is written only by the stream side, and only ever
 * decorates a row the watcher has already made. No field here is a merge of the
 * two, and no `status` exists.
 */

/** What the watcher alone says about a file. `savedAt` exists only while saved. */
export type DiskField =
  | { state: 'not-yet-written' | 'changing' }
  | { state: 'saved'; savedAt: number }

/**
 * An agent a row names, by id: the one its class gives a row's own `owner`, and the
 * persona writing it that the stream gives an annotation's. The renderer resolves
 * the name.
 */
export type RailOwner = { agentId: string }

/**
 * The stream's note on a row: the words for what is being written (`text`), and
 * the persona writing it (`owner`), absent when the run has none. The owner
 * rides here and not on the row, whose own `owner` is the class's and stays what
 * the watcher side reads; the owner slot prefers this one.
 *
 * `owners` is the contention annotation's: present only when two or more runs
 * that have not ended each hold the file, then in place of `owner`, listing the
 * personas those runs carry in the order the runs started (none when none carries
 * one). A run holds a file from its first piece of it until its own run ends, as
 * the single run's annotation does, with no test of how recently it wrote. It is
 * the stream's report of who holds the file and nothing more: it says not who
 * wrote last, and the class's owner never stands in for it.
 */
export type RailAnnotation = { text: string; owner?: RailOwner; owners?: readonly RailOwner[] }

/** One file under `_bmad/`. `path` is project-relative, POSIX. */
export type RailRow = {
  path: string
  owner?: RailOwner
  annotation?: RailAnnotation
  /**
   * Set when a room session wrote the file (Story 4.1): the row's owner is the
   * room, which is no persona. It stands in place of `owner`, never beside it.
   */
  room?: true
} & DiskField

/** `revision` only ever increases, so a late push can be told from a fresh one. */
export type RailSnapshot = { revision: number; rows: RailRow[] }

/** The reply to `rail:get`: a snapshot, or the envelope saying why not. */
export type RailReply =
  | { ok: true; snapshot: RailSnapshot }
  | { ok: false; error: HarnessError }

/**
 * What the watcher saw, in `noun:verb-past` form. `found` is the initial scan,
 * `written` an add or change after it, `removed` an unlink. `size` and
 * `mtimeMs` come from the watcher's own stat; nothing ever opens the file.
 */
export type ArtifactObservation = {
  type: 'artifact:found' | 'artifact:written' | 'artifact:removed'
  path: string
  size: number
  mtimeMs: number
}
