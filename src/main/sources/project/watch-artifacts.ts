import { join, relative, sep } from 'node:path'
import { watch } from 'chokidar'
import type { ArtifactObservation } from '../../../shared/rail'

/**
 * The artifact watcher: one observation per thing the watcher saw under
 * `<root>/_bmad/`, and nothing else. It stats through chokidar and never opens
 * a file (FR54): the rail knows that a file exists, how big it is and when it
 * was last modified, and no more.
 *
 * It watches `_bmad/` only. The harness's own transcripts, logs, caches and
 * window state live in `userData`, outside the project, and so can never be a
 * row. The install watcher owns `.claude/skills` and the configuration files;
 * this is a second watcher on a different question, not a second answer to the
 * same one.
 *
 * `atomic: true` folds a writer's temp-then-rename (`memlog.py` writes
 * `<name>.tmp`, then `os.replace`s it over the target) into a change, so the
 * target's row never disappears and comes back. No `awaitWriteFinish`, which
 * would delay the `changing` indication, and no debounce here: coalescing is
 * the fold's, as a quiet window.
 */

/** Basenames that are never a row: Finder's, and a writer's temp file. */
const NOISE_NAME = '.DS_Store'
const NOISE_SUFFIX = '.tmp'

/** Whether a path is noise. Path-shaped: it decides from the path alone. */
export function ignored(path: string): boolean {
  const base = path.slice(path.lastIndexOf(sep) + 1)
  return base === NOISE_NAME || base.endsWith(NOISE_SUFFIX)
}

export type ArtifactWatcher = {
  /** Resolves once the initial scan is done and events will be delivered. */
  ready: Promise<void>
  close(): Promise<void>
}

export function watchArtifacts({
  projectRoot,
  onObservation,
  onError
}: {
  projectRoot: string
  onObservation: (observation: ArtifactObservation) => void
  onError: (error: unknown) => void
}): ArtifactWatcher {
  let scanned = false
  let closed = false

  const posix = (path: string): string => relative(projectRoot, path).split(sep).join('/')

  const watcher = watch(join(projectRoot, '_bmad'), {
    ignoreInitial: false,
    atomic: true,
    alwaysStat: true,
    ignored
  })

  const emit = (
    type: ArtifactObservation['type'],
    path: string,
    stats?: { size: number; mtimeMs: number }
  ): void => {
    if (closed) {
      return
    }
    if (type === 'artifact:removed') {
      onObservation({ type, path: posix(path), size: 0, mtimeMs: 0 })
    } else if (stats !== undefined) {
      // `alwaysStat` makes this always so; without a stat there is no fact to report.
      onObservation({ type, path: posix(path), size: stats.size, mtimeMs: stats.mtimeMs })
    }
  }

  watcher.on('add', (path, stats) => emit(scanned ? 'artifact:written' : 'artifact:found', path, stats))
  watcher.on('change', (path, stats) => emit('artifact:written', path, stats))
  watcher.on('unlink', (path) => emit('artifact:removed', path))
  // A watcher that cannot watch is not a reason to take the process down.
  watcher.on('error', (error) => {
    if (!closed) {
      onError(error)
    }
  })

  const ready = new Promise<void>((resolve) => {
    watcher.once('ready', () => {
      scanned = true
      resolve()
    })
  })

  return {
    ready,
    async close() {
      closed = true
      await watcher.close()
    }
  }
}
