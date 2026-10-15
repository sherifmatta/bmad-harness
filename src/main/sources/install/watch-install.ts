import { relative, sep } from 'node:path'
import { watch } from 'chokidar'
import { MANIFEST_DIR, MANIFEST_FILE } from './skill-manifest'

/**
 * The install watcher: a trigger, not a reader. It says "something that could
 * change the resolved answer changed"; re-resolving is the caller's job, and
 * nothing here opens a file.
 *
 * The watched set is the layering the resolvers apply — the central
 * configuration, the overrides beside it, and each skill's own customization
 * file — and the skill manifest the install declares what it provides in.
 * This is the one place in `src/` that names the toml files, and it names
 * them to watch, never to read. The manifest's two names (directory and file)
 * are taken from its reader, which is the one place that spells them.
 *
 * The `ignored` test is stat-independent and path-shaped: it decides from the
 * path alone, so everything else under `_bmad/` (the artifacts the rail
 * watches) can churn without ever re-resolving anything.
 *
 * The watcher is rooted at the project itself, not at `_bmad` and
 * `.claude/skills`. chokidar never sees a root that did not exist when it
 * started, so a project opened before its install (or before `uv` could read
 * it) would stay blind to the install appearing. Rooted at the project, the
 * creation of `_bmad` or `.claude` is an event like any other, and `ignored`
 * admits nothing else, so no other directory of the project is walked.
 */

/** A burst of events inside this window is one refresh. */
export const DEFAULT_DEBOUNCE_MS = 400

const CENTRAL = new Set(['config.toml', 'config.user.toml'])
const CUSTOMIZE = 'customize.toml'

/**
 * Whether a path relative to `<root>/_bmad` is in the watched set. The empty
 * path and the override directory are admitted so the watcher can descend to
 * the files it wants. The install's skill manifest is the one file of its
 * `_config` directory that is watched, and nothing else in that directory is;
 * its two names come from the reader, the one place that spells them.
 */
function inBmadSet(parts: string[]): boolean {
  if (parts.length === 0) {
    return true
  }
  if (parts.length === 1) {
    return CENTRAL.has(parts[0]) || parts[0] === 'custom' || parts[0] === MANIFEST_DIR
  }
  if (parts.length !== 2) {
    return false
  }
  return (
    (parts[0] === 'custom' && parts[1].endsWith('.toml')) ||
    (parts[0] === MANIFEST_DIR && parts[1] === MANIFEST_FILE)
  )
}

/** Likewise for a path relative to `<root>/.claude/skills`. */
function inSkillsSet(parts: string[]): boolean {
  if (parts.length <= 1) {
    return true
  }
  return parts.length === 2 && parts[1] === CUSTOMIZE
}

/**
 * Whether a path relative to the project root is in the watched set. The root
 * and the directories on the way to a watched file are admitted so the watcher
 * can descend to it, and so can notice them being created; nothing else under
 * the root is.
 */
function inProjectSet(parts: string[]): boolean {
  if (parts.length === 0) {
    return true
  }
  const [first, second, ...rest] = parts
  if (first === '_bmad') {
    return inBmadSet(parts.slice(1))
  }
  if (first === '.claude') {
    return second === undefined || (second === 'skills' && inSkillsSet(rest))
  }
  return false
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
  const ignored = (path: string): boolean => {
    const rel = relative(projectRoot, path)
    if (rel === '..' || rel.startsWith(`..${sep}`)) {
      // Outside the project: a symlink target or a parent, never something to walk.
      return true
    }
    return !inProjectSet(rel === '' ? [] : rel.split(sep))
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

  const watcher = watch(projectRoot, {
    ignoreInitial: true,
    atomic: true,
    // `.claude/skills/<skill>/customize.toml` is the deepest file: four levels
    // under the root, so three of directories to descend.
    depth: 4,
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
