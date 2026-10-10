import type { HarnessError } from './install'

/**
 * The Board contract — what main reads out of the project's `sprint-status.yaml`
 * and what crosses the bridge to the renderer. Types only, like `rail.ts`.
 *
 * Every status is carried as the file wrote it. `known` says whether it is one
 * of the six the file's own definitions give, so a later view can put an
 * unfamiliar one in a column of its own and nothing is dropped.
 */

/** A status as written, and whether it is one of the six words the file defines. */
export type BoardEntry = { status: string; known: boolean }

/** One story: its file key, its number `N.M` and its title. */
export type BoardStory = BoardEntry & { key: string; number: string; title: string }

/** An epic's retrospective: parsed so it can be left out of a count, never shown. */
export type BoardRetrospective = BoardEntry & { key: string }

/** One epic with its stories in the file's order. `title` is empty where `epics.md` has no heading for it. */
export type BoardEpic = BoardEntry & {
  key: string
  number: number
  title: string
  stories: BoardStory[]
  retrospective?: BoardRetrospective
}

/** A key that is neither an epic, a story nor a retrospective, or a story whose epic has no row. */
export type BoardOther = BoardEntry & { key: string }

/**
 * What the file came to. `none` carries one `code` and `message` and never an
 * error to show; the view says `no sprint status`.
 */
export type BoardBody =
  | { kind: 'read'; epics: BoardEpic[]; others: BoardOther[] }
  | { kind: 'none'; code: string; message: string }

/** What reading the file came to, before the fold: its text, or why there is none. */
export type SprintStatusRead =
  | { state: 'text'; text: string }
  | { state: 'absent' }
  | { state: 'unreadable'; errno: string }

/** `revision` only ever increases, so a late push can be told from a fresh one. */
export type BoardSnapshot = BoardBody & { revision: number }

/** The reply to `board.get`: a snapshot, or the envelope saying why not. */
export type BoardReply =
  | { ok: true; snapshot: BoardSnapshot }
  | { ok: false; error: HarnessError }
