import { realpathSync } from 'node:fs'
import { posix } from 'node:path'

/**
 * An absolute path as the file system resolves it, for the permission policy
 * to compare: the deepest part that exists, resolved through links (so `/tmp`
 * is `/private/tmp`, and a `..` after a link steps out of where the link
 * points), and the part that does not exist yet joined on as written. Never
 * throws: a path with nothing that resolves comes back normalised.
 */
export function canonicalPath(absolutePath: string): string {
  const missing: string[] = []
  let probe = absolutePath
  for (;;) {
    try {
      return posix.join(realpathSync.native(probe), ...missing)
    } catch {
      const parent = posix.dirname(probe)
      if (parent === probe) {
        return posix.normalize(absolutePath)
      }
      missing.unshift(posix.basename(probe))
      probe = parent
    }
  }
}
