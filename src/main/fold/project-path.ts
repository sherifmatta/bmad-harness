import { posix } from 'node:path'

/** A run's working notes file, whose text is `run:note` and never document prose or a step. */
export const MEMLOG = '.memlog.md'

/**
 * A path as the project sees it: relative, POSIX, with nothing escaping the
 * root. Anything else is outside the project and has no such path.
 */
export function projectRelative(filePath: string, projectRoot: string): string | undefined {
  if (filePath === '') return undefined
  const absolute = posix.resolve(projectRoot, filePath)
  const relative = posix.relative(posix.resolve(projectRoot), absolute)
  if (relative === '' || relative === '..' || relative.startsWith('../') || posix.isAbsolute(relative)) {
    return undefined
  }
  return relative
}
