import { lstat, realpath } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'

/**
 * Which file a row names, and whether it may be read (NFR8, NFR7).
 *
 * Two tiers, and the second never runs if the first fails. Both are about the
 * project's output folder `F` (Story 5.4): project-relative, POSIX, with a
 * trailing `/`, and the install's own folder unless the project says another.
 *
 * Lexical: the path must be a project-relative POSIX path that names a file
 * strictly inside `F` — a string, not empty, not absolute, no backslash, no NUL,
 * no `.` or `..` or empty segment, and starting with `F`'s own segments with at
 * least one more. Anything else is `doc/invalid-path` and no window opens.
 *
 * Real path: when the target exists, its real path must sit inside the real
 * path of `<root>/F`. A symlink that leaves it is not an error — the window
 * opens, in the `refused` state, and reads nothing. A target that does not
 * exist is fine: the row may have just gone, and the window opens `missing`.
 * A link that dangles is refused too, because what it would point at if it
 * were mended has not been checked.
 */

export type ResolvedDocument =
  | { ok: true; fullPath: string; refused: boolean }
  | { ok: false; code: 'doc/invalid-path' }

const INVALID: ResolvedDocument = { ok: false, code: 'doc/invalid-path' }

/** The segments of a valid document path under `folder`, or `null` if it is not one. */
export function documentSegments(path: unknown, folder: string): string[] | null {
  if (typeof path !== 'string' || path === '') {
    return null
  }
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    return null
  }
  const segments = path.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return null
  }
  // A document is a file under the folder, not the folder itself.
  const within = folder.split('/').filter((segment) => segment !== '')
  return segments.length > within.length && within.every((segment, at) => segments[at] === segment)
    ? segments
    : null
}

/** Whether `target` is strictly inside `root`, both already real paths. */
export function isInside(root: string, target: string): boolean {
  const path = relative(root, target)
  return path !== '' && path !== '..' && !path.startsWith('../') && !isAbsolute(path)
}

function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined
}

export async function resolveDocument(
  projectRoot: string,
  path: unknown,
  folder: string
): Promise<ResolvedDocument> {
  const segments = documentSegments(path, folder)
  if (segments === null) {
    return INVALID
  }
  const fullPath = join(projectRoot, ...segments)

  let realTarget: string
  try {
    realTarget = await realpath(fullPath)
  } catch (error) {
    const code = codeOf(error)
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      // Nothing there — unless there is a link there that leads nowhere.
      try {
        await lstat(fullPath)
        return { ok: true, fullPath, refused: true }
      } catch {
        return { ok: true, fullPath, refused: false }
      }
    }
    // A loop, or a directory that cannot be searched: containment cannot be
    // shown, so nothing is read.
    return { ok: true, fullPath, refused: true }
  }

  try {
    const realFolder = await realpath(join(projectRoot, folder))
    return { ok: true, fullPath, refused: !isInside(realFolder, realTarget) }
  } catch {
    return { ok: true, fullPath, refused: true }
  }
}
