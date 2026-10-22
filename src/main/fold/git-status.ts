import type { ChangeRow, ChangeState } from '../../shared/changes'

/**
 * What one `git status --porcelain=v2 -z` answer comes to (Story 9.3, AD-31), as a
 * closed shape: one row per record, or nothing at all.
 *
 * The fold is closed. Every record maps to exactly one row, `#` (header) and `!`
 * (ignored) records are passed over, and anything else — a record type git did not
 * document, a field missing, a state letter outside the set, a path the validator
 * refuses — fails the whole read: a partial list is never sent.
 *
 * - `1 <XY> …` (ordinary): `D` on either side is `deleted`, and wins; else `A` on
 *   either side is `added` (an intent-to-add `.A` included); else `M` or `T` is
 *   `modified`. A submodule (its `<sub>` field starts `S`) is one row that opens
 *   nothing, marked `directory`, its path as git wrote it.
 * - `2 <XY> … <score> <path>\0<orig>` (renamed or copied): `R` is `renamed`, with
 *   the old path, unless `D` is on either side, which is `deleted` (the new path is
 *   gone, so it opens nothing); `C` is `added`.
 * - `u <XY> …` (unmerged): `conflicted`.
 * - `? <path>`: `untracked`; `? <dir>/`: an untracked directory, one row.
 *
 * Pure: no I/O, no clock, no ordering. Main sends the full list and the renderer
 * orders it.
 */

export type GitStatusFold = { ok: true; rows: ChangeRow[] } | { ok: false }

const FAILED: GitStatusFold = { ok: false }

/** The fields before the path, by record type, the type itself included. */
const FIELDS = { '1': 8, '2': 9, u: 10 } as const

/** A two-letter state as porcelain v2 writes it: `.` for unchanged. */
const XY = /^[.MTADRCU]{2}$/
/** A rename or copy's score field: the letter and a similarity. */
const SCORE = /^[RC]\d{1,3}$/

/**
 * What a path may not hold: C0 and C1 controls and DEL, the Arabic letter mark,
 * the zero-width and directional marks, the line and paragraph separators, the bidi embedding, override and isolate controls, the
 * byte-order mark and the replacement character (which is what invalid UTF-8
 * decodes to).
 */
const FORBIDDEN = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufffd]/

/**
 * AD-31's path validator: a project-relative POSIX path, spaces and printable
 * characters allowed, with no empty, `.` or `..` segment (so neither absolute nor
 * escaping) and nothing `FORBIDDEN`. `directory` lets one trailing `/` through.
 */
export function isChangePath(path: string, directory = false): boolean {
  const body = directory ? (path.endsWith('/') ? path.slice(0, -1) : null) : path
  if (body === null || body === '' || FORBIDDEN.test(body)) {
    return false
  }
  return body.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

/** The state of an ordinary record, or `null` when its letters say none. */
function ordinaryState(xy: string): ChangeState | null {
  if (xy.includes('D')) {
    return 'deleted'
  }
  if (xy.includes('A')) {
    return 'added'
  }
  if (xy.includes('M') || xy.includes('T')) {
    return 'modified'
  }
  return null
}

/** The state of a renamed or copied record, or `null` when its letters say neither. */
function movedState(xy: string): ChangeState | null {
  if (xy.includes('D')) {
    return 'deleted'
  }
  if (xy.includes('R')) {
    return 'renamed'
  }
  if (xy.includes('C')) {
    return 'added'
  }
  return null
}

/** `count` space-separated fields, then the rest as the path; `null` when there are fewer. */
function splitFields(record: string, count: number): { fields: string[]; path: string } | null {
  const fields: string[] = []
  let at = 0
  for (let n = 0; n < count; n += 1) {
    const space = record.indexOf(' ', at)
    if (space === -1) {
      return null
    }
    fields.push(record.slice(at, space))
    at = space + 1
  }
  return { fields, path: record.slice(at) }
}

export function foldPorcelainV2(stdout: string): GitStatusFold {
  const records = stdout.split('\0')
  // `-z` ends every record with NUL, so the last split is empty; nothing else may be.
  if (records[records.length - 1] === '') {
    records.pop()
  }
  const rows: ChangeRow[] = []

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] as string
    const type = record.slice(0, 2)

    if (record.startsWith('#') || record.startsWith('!')) {
      continue
    }

    if (type === '? ') {
      const path = record.slice(2)
      const directory = path.endsWith('/')
      if (!isChangePath(path, directory)) {
        return FAILED
      }
      rows.push(directory ? { path, state: 'untracked', directory: true } : { path, state: 'untracked' })
      continue
    }

    const kind = record[0]
    if (record[1] !== ' ' || (kind !== '1' && kind !== '2' && kind !== 'u')) {
      return FAILED
    }
    const split = splitFields(record, FIELDS[kind])
    if (split === null || !XY.test(split.fields[1] as string) || !isChangePath(split.path)) {
      return FAILED
    }
    const xy = split.fields[1] as string

    if (kind === 'u') {
      rows.push({ path: split.path, state: 'conflicted' })
      continue
    }

    if (kind === '1') {
      const state = ordinaryState(xy)
      if (state === null) {
        return FAILED
      }
      rows.push((split.fields[2] as string).startsWith('S') ? { path: split.path, state, directory: true } : { path: split.path, state })
      continue
    }

    // A rename or copy: the old path is the next NUL-separated field.
    const from = records[index + 1]
    index += 1
    const state = movedState(xy)
    if (from === undefined || !SCORE.test(split.fields[8] as string) || !isChangePath(from) || state === null) {
      return FAILED
    }
    rows.push(state === 'renamed' ? { path: split.path, state, from } : { path: split.path, state })
  }

  return { ok: true, rows }
}
