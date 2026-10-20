import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { errnoOf } from '../errno'

/**
 * Where the layout lives and how it is read and written (Story 5.5): one JSON
 * file, `<userData>/layout.json`, holding `{version, widths: {sidebar, rail, room},
 * folded: {<projectKey>: string[]}, skillRowOpen: boolean}` and nothing else.
 * `skillRowOpen` (Story 9.1) is whether the skill row is open, app-wide; a file
 * written before it has none, which reads as collapsed. It is the harness's own
 * bookkeeping, beside the recent list, the theme and the output folders; nothing
 * is ever written into a project.
 *
 * Reading never throws and never judges: a file that is missing, unreadable or
 * not JSON is `null`, and whatever else was found is handed back as it is for
 * the fold to read tolerantly. A write starts from `readLayoutToChange`, which
 * tells a file that is not there from one that could not be read. Writing is synchronous and atomic (a temporary
 * file beside the target, then a rename) and reports instead of throwing.
 */

export const LAYOUT_VERSION = 1

/** The file the layout is kept in, under the app's own data directory. */
export function layoutFilePath(userDataDir: string): string {
  return join(userDataDir, 'layout.json')
}

/** The parsed JSON of the file, or `null` when it cannot be read as JSON. */
export function readLayoutFile(filePath: string): unknown {
  const current = readLayoutToChange(filePath)
  return current.ok ? current.raw : null
}

/** Where a write starts from: what the file holds, or the errno of a file that is there and could not be read. */
export type LayoutToChange = { ok: true; raw: unknown } | { ok: false; errno: string }

/** Errnos that mean there is no file at the path, so a write starts from nothing and loses nothing. */
const ABSENT = new Set(['ENOENT', 'ENOTDIR'])

/**
 * The file as a write must start from it. A missing file and one that is not
 * JSON are `null`, as the read has them, so the write replaces them whole; any
 * other failure to read is reported, so a write never replaces a file it could
 * not see with nothing.
 */
export function readLayoutToChange(filePath: string): LayoutToChange {
  let text: string
  try {
    text = readFileSync(filePath, 'utf8')
  } catch (error) {
    const errno = errnoOf(error, 'UNKNOWN')
    return ABSENT.has(errno) ? { ok: true, raw: null } : { ok: false, errno }
  }
  try {
    return { ok: true, raw: JSON.parse(text) as unknown }
  } catch {
    return { ok: true, raw: null }
  }
}

/** What the file holds, as the fold gives it: this module judges none of it. */
export type LayoutToWrite = {
  widths: Readonly<Record<string, number>>
  folded: Readonly<Record<string, readonly string[]>>
  skillRowOpen: boolean
}

export type LayoutWriteOutcome = { ok: true } | { ok: false; errno: string }

/** Replace the file with `layout`: the errno name when it could not, never a throw. */
export function writeLayoutFile(filePath: string, layout: LayoutToWrite): LayoutWriteOutcome {
  const temporary = `${filePath}.${process.pid}.tmp`
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(
      temporary,
      JSON.stringify({
        version: LAYOUT_VERSION,
        widths: layout.widths,
        folded: layout.folded,
        skillRowOpen: layout.skillRowOpen
      })
    )
    renameSync(temporary, filePath)
    return { ok: true }
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch {
      // Nothing was left to remove.
    }
    return { ok: false, errno: errnoOf(error, 'UNKNOWN') }
  }
}
