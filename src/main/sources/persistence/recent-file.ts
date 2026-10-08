import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { errnoOf } from '../errno'

/**
 * Where the recent-projects list lives and how it is read and written: one
 * JSON file, `<userData>/recent-projects.json`, holding `{version, entries}`
 * and each entry's `{path, openedAt}` and nothing else. It is the harness's own
 * bookkeeping; nothing is ever written into a project.
 *
 * Reading never throws and never judges: a file that is missing, unreadable or
 * not JSON is `null`, and whatever else was found is handed back as it is for
 * `fold/recent-projects.ts` to read tolerantly. Writing is synchronous and
 * atomic (a temporary file beside the target, then a rename), so a reader never
 * meets half a file, and it reports instead of throwing. The next write after a
 * bad file replaces it whole, which is how the list starts afresh.
 */

export const RECENT_VERSION = 1

/** The file the list is kept in, under the app's own data directory. */
export function recentFilePath(userDataDir: string): string {
  return join(userDataDir, 'recent-projects.json')
}

/** The parsed JSON of the file, or `null` when it cannot be read as JSON. */
export function readRecentFile(filePath: string): unknown {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as unknown
  } catch {
    return null
  }
}

export type RecentWriteOutcome = { ok: true } | { ok: false; errno: string }

/** Replace the file with `entries`: the errno name when it could not, never a throw. */
export function writeRecentFile(
  filePath: string,
  entries: readonly { path: string; openedAt: number }[]
): RecentWriteOutcome {
  const temporary = `${filePath}.${process.pid}.tmp`
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    const body = {
      version: RECENT_VERSION,
      entries: entries.map(({ path, openedAt }) => ({ path, openedAt }))
    }
    writeFileSync(temporary, JSON.stringify(body))
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
