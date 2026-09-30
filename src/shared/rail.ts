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

/** The agent a file belongs to, by its class. The renderer resolves the name. */
export type RailOwner = { agentId: string }

/** The stream's note on a row. The minimum the stub needs; Epic 3 extends it. */
export type RailAnnotation = { text: string }

/** One file under `_bmad/`. `path` is project-relative, POSIX. */
export type RailRow = {
  path: string
  owner?: RailOwner
  annotation?: RailAnnotation
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
