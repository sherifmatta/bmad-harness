import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { errnoOf } from '../errno'

/**
 * Where the layout lives and how it is read and written (Story 5.5): one JSON
 * file, `<userData>/layout.json`, holding `{version, widths: {rail, room},
 * folded: {<projectKey>: string[]}}` and nothing else. It is the harness's own
 * bookkeeping, beside the recent list, the theme and the output folders; nothing
 * is ever written into a project.
 *
 * Reading never throws and never judges: a file that is missing, unreadable or
 * not JSON is `null`, and whatever else was found is handed back as it is for
 * the fold to read tolerantly. Writing is synchronous and atomic (a temporary
 * file beside the target, then a rename) and reports instead of throwing.
 */

export const LAYOUT_VERSION = 1

/** The file the layout is kept in, under the app's own data directory. */
export function layoutFilePath(userDataDir: string): string {
  return join(userDataDir, 'layout.json')
}

/** The parsed JSON of the file, or `null` when it cannot be read as JSON. */
export function readLayoutFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch {
    return null
  }
}

/** What the file holds, as the fold gives it: this module judges none of it. */
export type LayoutToWrite = {
  widths: Readonly<Record<string, number>>
  folded: Readonly<Record<string, readonly string[]>>
}

export type LayoutWriteOutcome = { ok: true } | { ok: false; errno: string }

/** Replace the file with `layout`: the errno name when it could not, never a throw. */
export function writeLayoutFile(filePath: string, layout: LayoutToWrite): LayoutWriteOutcome {
  const temporary = `${filePath}.${process.pid}.tmp`
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(
      temporary,
      JSON.stringify({ version: LAYOUT_VERSION, widths: layout.widths, folded: layout.folded })
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
