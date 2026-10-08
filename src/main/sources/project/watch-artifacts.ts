import { relative, sep } from 'node:path'
import { watch } from 'chokidar'
import type { ArtifactObservation } from '../../../shared/rail'

/**
 * The artifact watcher: one observation per thing the watcher saw under the
 * project's output folder `F`, and nothing else. It stats through chokidar and
 * never opens a file (FR54): the rail knows that a file exists, how big it is
 * and when it was last modified, and no more.
 *
 * `F` is project-relative, POSIX and may be several segments deep (Story 5.4).
 * The watcher is rooted at the project, not at `F`: chokidar never sees a root
 * that did not exist when it started, so rooting at `F` would leave a project
 * opened before its output folder existed blind to it for good. The project
 * root is therefore the watch path, and what is admitted under it is a prefix
 * test: the root, the directories on the way to `F`, `F` and what is in it. No
 * other directory of the project is walked. The harness's own transcripts,
 * logs, caches and window state live in `userData`, outside the project, and so
 * can never be a row. The install watcher owns `.claude/skills` and the
 * configuration files; this is a second watcher on a different question, not a
 * second answer to the same one.
 *
 * `awaiting` is a folder that is not there yet but whose arrival would move `F`
 * (a choice that went missing, a folder BMad's configuration names that is not
 * made yet): its directories on the way, and it, are admitted, its contents are
 * not, so it never gives a row. Its arrival, and the removal of `F` itself, are
 * told once through `onFolderChange`, which is how the caller knows to resolve
 * again. It is the one watcher: there is no second folder.
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

/** The segments of a project-relative folder: `docs/out/` is `['docs', 'out']`. */
const segmentsOf = (folder: string): string[] => folder.split('/').filter((segment) => segment !== '')

/** Whether `prefix` is `path` or one of its ancestors, by segments. */
const isPrefix = (prefix: readonly string[], path: readonly string[]): boolean =>
  prefix.length <= path.length && prefix.every((segment, at) => segment === path[at])

export type ArtifactWatcher = {
  /** Resolves once the initial scan is done and events will be delivered. */
  ready: Promise<void>
  close(): Promise<void>
}

export function watchArtifacts({
  projectRoot,
  folder,
  awaiting,
  onObservation,
  onFolderChange,
  onError
}: {
  projectRoot: string
  /** The output folder watched: project-relative, POSIX, with a trailing `/`. */
  folder: string
  /** A folder not there yet whose arrival would move `folder`; never a source of rows. */
  awaiting?: string
  onObservation: (observation: ArtifactObservation) => void
  /** `folder` was removed, or `awaiting` arrived: the caller resolves the folder again. */
  onFolderChange?: () => void
  onError: (error: unknown) => void
}): ArtifactWatcher {
  let scanned = false
  let closed = false

  const posix = (path: string): string => relative(projectRoot, path).split(sep).join('/')

  const watched = segmentsOf(folder)
  const waited = awaiting === undefined ? undefined : segmentsOf(awaiting)

  // The root itself is admitted so the watcher can descend; of everything in
  // it only the way to the folder, the folder and what is under it is, and the
  // way to a folder awaited, and that folder, but not what is in it.
  const admitted = (path: string): boolean => {
    const rel = relative(projectRoot, path)
    if (rel === '') {
      return true
    }
    const segments = rel.split(sep)
    // A folder watched never holds these (`normalizeFolder` refuses them), so what is nested in one is never walked.
    if (segments.some((segment) => segment === '.git' || segment === 'node_modules')) {
      return false
    }
    return (
      isPrefix(segments, watched) ||
      isPrefix(watched, segments) ||
      (waited !== undefined && isPrefix(segments, waited))
    )
  }

  const isFolder = (path: string, target: readonly string[]): boolean => posix(path) === target.join('/')

  const watcher = watch(projectRoot, {
    ignoreInitial: false,
    atomic: true,
    alwaysStat: true,
    // The noise test is for names inside the project: the root's own name is
    // the user's, and a project directory called `foo.tmp` is still a project.
    ignored: (path) => (path !== projectRoot && ignored(path)) || !admitted(path)
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

  // A file is a row only under the folder itself: the ways to it and the folder
  // awaited are admitted so they can be walked, and are not rows.
  const isRow = (path: string): boolean => {
    const segments = posix(path).split('/')
    return segments.length > watched.length && isPrefix(watched, segments)
  }
  watcher.on('add', (path, stats) => {
    if (isRow(path)) emit(scanned ? 'artifact:written' : 'artifact:found', path, stats)
  })
  watcher.on('change', (path, stats) => {
    if (isRow(path)) emit('artifact:written', path, stats)
  })
  watcher.on('unlink', (path) => {
    if (isRow(path)) emit('artifact:removed', path)
  })
  watcher.on('unlinkDir', (path) => {
    if (!closed && isFolder(path, watched)) onFolderChange?.()
  })
  watcher.on('addDir', (path) => {
    if (!closed && waited !== undefined && isFolder(path, waited)) onFolderChange?.()
  })
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
