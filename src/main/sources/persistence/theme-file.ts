import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ThemeChoice } from '../../../shared/theme'
import { errnoOf } from '../errno'

/**
 * Where the theme choice lives and how it is read and written: one JSON file,
 * `<userData>/theme.json`, holding `{"theme": "<system|light|dark>"}` and
 * nothing else. It is the harness's own bookkeeping, beside the recent list;
 * nothing is ever written into a project.
 *
 * Reading never throws and never judges: a file that is missing, unreadable or
 * not JSON is `null`, and whatever else was found is handed back as it is for
 * `fold/theme-choice.ts` to read. Writing is synchronous and atomic (a
 * temporary file beside the target, then a rename), so a reader never meets
 * half a file, and it reports instead of throwing.
 */

/** The file the choice is kept in, under the app's own data directory. */
export function themeFilePath(userDataDir: string): string {
  return join(userDataDir, 'theme.json')
}

/** The parsed JSON of the file, or `null` when it cannot be read as JSON. */
export function readThemeFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch {
    return null
  }
}

export type ThemeWriteOutcome = { ok: true } | { ok: false; errno: string }

/** Replace the file with `choice`: the errno name when it could not, never a throw. */
export function writeThemeFile(filePath: string, choice: ThemeChoice): ThemeWriteOutcome {
  const temporary = `${filePath}.${process.pid}.tmp`
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(temporary, JSON.stringify({ theme: choice }))
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
