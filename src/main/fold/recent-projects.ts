import { basename, dirname, isAbsolute, sep } from 'node:path'

/**
 * The recent-projects list, as rules over values with no I/O: what a stored
 * file is read as, what recording a project does to the list, and how a folder
 * is shown. The file itself is `sources/persistence/recent-file.ts`'s; reading
 * it never throws and hands this whatever it found, which is read here as
 * tolerantly as a thing can be.
 *
 * An entry is a folder and the time its window opened, and nothing else (FR107):
 * no install state, agent count, branch or version is ever part of it.
 */

/** The most projects the list keeps. Older ones are pushed off the end. */
export const RECENT_LIMIT = 8

/** One recorded project: its folder and when its window opened. */
export type RecentEntry = { path: string; openedAt: number }

/**
 * The entries a stored value holds, newest first, whatever the value is.
 * Anything that is not the file's shape is no entries; an entry that is not an
 * absolute path and a time is left out; a path listed twice keeps its first
 * (newest) place; and the list is cut to the limit. Never throws.
 */
export function parseRecent(raw: unknown): RecentEntry[] {
  if (typeof raw !== 'object' || raw === null || !('entries' in raw) || !Array.isArray(raw.entries)) {
    return []
  }

  const seen = new Set<string>()
  const entries: RecentEntry[] = []
  for (const candidate of raw.entries as unknown[]) {
    if (typeof candidate !== 'object' || candidate === null) {
      continue
    }
    const { path, openedAt } = candidate as Record<string, unknown>
    if (
      typeof path !== 'string' ||
      !isAbsolute(path) ||
      typeof openedAt !== 'number' ||
      !Number.isFinite(openedAt) ||
      openedAt < 0 ||
      seen.has(path)
    ) {
      continue
    }
    seen.add(path)
    entries.push({ path, openedAt })
    if (entries.length === RECENT_LIMIT) {
      break
    }
  }
  return entries
}

/**
 * The list with `path` first, opened at `at`: a project already listed moves to
 * the top and is not listed twice, and the list stays within the limit. Pure;
 * the list it was given is not changed.
 */
export function recordRecent(
  entries: readonly RecentEntry[],
  path: string,
  at: number
): RecentEntry[] {
  return [{ path, openedAt: at }, ...entries.filter((entry) => entry.path !== path)].slice(
    0,
    RECENT_LIMIT
  )
}

/** The folder's own name, or the whole path for a root, which has none. */
export function recentName(path: string): string {
  return basename(path) || path
}

/**
 * The folder's parent as shown on a row, with the home directory written `~`:
 * `/Users/me/work` under home `/Users/me` is `~`, and `/Users/me/work/a` is
 * `~/work`. Only a whole leading folder is replaced, so `/Users/menu` is not
 * `~nu`. A root has no parent worth showing and is shown as itself.
 */
export function displayParent(path: string, home: string): string {
  const parent = dirname(path)
  if (parent === path) {
    return parent
  }
  if (home !== '' && home !== sep) {
    if (parent === home) {
      return '~'
    }
    if (parent.startsWith(`${home}${sep}`)) {
      return `~${parent.slice(home.length)}`
    }
  }
  return parent
}
