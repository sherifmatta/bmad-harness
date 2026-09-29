import { join, relative, sep } from 'node:path'
import { watch } from 'chokidar'

/**
 * The install watcher: a trigger, not a reader. It says "something that could
 * change the resolved answer changed"; re-resolving is the caller's job, and
 * nothing here opens a file.
 *
 * The watched set is the layering the resolvers apply — the central
 * configuration, the overrides beside it, and each skill's own customization
 * file. This is the one place in `src/` that names those files, and it names
 * them to watch, never to read.
 *
 * The `ignored` test is stat-independent and path-shaped: it decides from the
 * path alone, so everything else under `_bmad/` (the artifacts the rail
 * watches) can churn without ever re-resolving anything.
 */

/** A burst of events inside this window is one refresh. */
export const DEFAULT_DEBOUNCE_MS = 400

const CENTRAL = new Set(['config.toml', 'config.user.toml'])
const CUSTOMIZE = 'customize.toml'

/**
 * Whether a path relative to `<root>/_bmad` is in the watched set. The empty
 * path and the override directory are admitted so the watcher can descend to
 * the files it wants.
 */
function inBmadSet(parts: string[]): boolean {
  if (parts.length === 0) {
    return true
  }
  if (parts.length === 1) {
    return CENTRAL.has(parts[0]) || parts[0] === 'custom'
  }
  return parts.length === 2 && parts[0] === 'custom' && parts[1].endsWith('.toml')
}

/** Likewise for a path relative to `<root>/.claude/skills`. */
function inSkillsSet(parts: string[]): boolean {
  if (parts.length <= 1) {
    return true
  }
  return parts.length === 2 && parts[1] === CUSTOMIZE
}

export type InstallWatcher = {
  /** Resolves once the initial scan is done and events will be delivered. */
  ready: Promise<void>
  close(): Promise<void>
}

export function watchInstall({
  projectRoot,
  onChange,
  debounceMs = DEFAULT_DEBOUNCE_MS
}: {
  projectRoot: string
  onChange: () => void
  debounceMs?: number
}): InstallWatcher {
  const bmad = join(projectRoot, '_bmad')
  const skills = join(projectRoot, '.claude', 'skills')

  const ignored = (path: string): boolean => {
    for (const [base, admits] of [
      [bmad, inBmadSet],
      [skills, inSkillsSet]
    ] as const) {
      const rel = relative(base, path)
      if (rel === '..' || rel.startsWith(`..${sep}`)) {
        continue
      }
      return !admits(rel === '' ? [] : rel.split(sep))
    }
    // Neither root: a parent of a watched root, which must stay reachable.
    return false
  }

  let timer: NodeJS.Timeout | null = null
  let closed = false

  const schedule = (): void => {
    if (closed) {
      return
    }
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      if (!closed) {
        onChange()
      }
    }, debounceMs)
  }

  const watcher = watch([bmad, skills], {
    ignoreInitial: true,
    atomic: true,
    depth: 2,
    ignored
  })

  watcher.on('all', (event) => {
    if (event === 'add' || event === 'change' || event === 'unlink') {
      schedule()
    }
  })
  // A watcher that cannot watch is a trigger that never fires, not a reason
  // to take the process down.
  watcher.on('error', () => {})

  const ready = new Promise<void>((resolve) => {
    watcher.once('ready', () => resolve())
  })

  return {
    ready,
    async close() {
      closed = true
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      await watcher.close()
    }
  }
}
