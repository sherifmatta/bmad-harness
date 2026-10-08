import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { errnoOf } from '../errno'

/**
 * Where each project's output folder choice lives and how it is read and
 * written: one JSON file, `<userData>/output-folders.json`, holding
 * `{version, folders}` where `folders` maps a project's path (its key) to the
 * project-relative folder chosen for it, and nothing else. It is the harness's
 * own bookkeeping, beside the recent list and the theme; nothing is ever written
 * into a project.
 *
 * Reading never throws and never judges: a file that is missing, unreadable or
 * not JSON is `null`, and whatever else was found is handed back as it is for
 * the fold to read tolerantly. Writing is synchronous and atomic (a temporary
 * file beside the target, then a rename), so a reader never meets half a file,
 * and it reports instead of throwing. The next write after a bad file replaces
 * it whole.
 */

export const OUTPUT_FOLDERS_VERSION = 1

/** The file the choices are kept in, under the app's own data directory. */
export function outputFoldersFilePath(userDataDir: string): string {
  return join(userDataDir, 'output-folders.json')
}

/** The parsed JSON of the file, or `null` when it cannot be read as JSON. */
export function readOutputFoldersFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch {
    return null
  }
}

export type OutputFoldersWriteOutcome = { ok: true } | { ok: false; errno: string }

/** Replace the file with `folders`: the errno name when it could not, never a throw. */
export function writeOutputFoldersFile(
  filePath: string,
  folders: Readonly<Record<string, string>>
): OutputFoldersWriteOutcome {
  const temporary = `${filePath}.${process.pid}.tmp`
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(temporary, JSON.stringify({ version: OUTPUT_FOLDERS_VERSION, folders }))
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
