import { open, realpath, stat } from 'node:fs/promises'
import { watch } from 'chokidar'
import { DOC_MAX_BYTES, DOC_SNIFF_BYTES } from '../../../shared/document'
import { isInside } from './resolve-document'

/**
 * The document watcher: one file, watched and read in main (FR56, AD-13).
 *
 * The document window never reads anything. This module watches exactly one
 * file with chokidar and, on its initial `add` and on every `change`, reads it
 * here and hands the result to `onRead`. `unlink` reports `missing`.
 *
 * Reads are bounded (`DOC_MAX_BYTES`), typed and serialised: one is in flight
 * at a time, and events that arrive during it schedule exactly one more after
 * it, so the latest write always wins and a burst is never a pile of reads.
 *
 * `atomic: true` folds a writer's temp-then-rename (`memlog.py` writes
 * `<name>.tmp`, then replaces the target) into a `change`, so the file never
 * reads as `missing` mid-write. No `awaitWriteFinish` (it would delay the
 * window behind the write) and no polling.
 *
 * This is one of two modules that read file content in main, the other being
 * `resolve-document.ts` which only asks where a path really leads.
 */

/** What one look at the file found. A non-`present` read carries no text. */
export type DocRead =
  | { state: 'present'; text: string; truncated: boolean }
  | { state: 'missing' | 'unreadable' | 'binary' | 'refused' }

/** How one look at the file is taken; `watchDocument` takes it as a dependency. */
export type DocumentReader = (
  fullPath: string,
  onError: (error: unknown) => void,
  boundary?: string
) => Promise<DocRead>

function codeOf(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined
}

/**
 * Read at most `DOC_MAX_BYTES` of `fullPath` and say what it is. A NUL byte in
 * the first `DOC_SNIFF_BYTES` makes it `binary`. A file that is not there is
 * `missing`; any other failure is `unreadable`, and `onError` is told why.
 *
 * With a `boundary` — the project's `<root>/_bmad` — every read re-checks
 * containment (NFR8): the file's real path must sit inside the boundary's real
 * path, else the read is `refused` and nothing is opened. The check is per
 * read, because what a path leads to can change after the window opened: a file
 * swapped for a link out, or a missing one created under a directory linked
 * out. The file is then opened by its real path, so the link is not followed a
 * second time between the check and the open.
 */
export async function readDocument(
  fullPath: string,
  onError: (error: unknown) => void = () => {},
  boundary?: string
): Promise<DocRead> {
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    let target = fullPath
    if (boundary !== undefined) {
      let realTarget: string
      try {
        realTarget = await realpath(fullPath)
      } catch (error) {
        const code = codeOf(error)
        // Nothing there: missing, exactly as without a boundary.
        if (code === 'ENOENT' || code === 'ENOTDIR') {
          return { state: 'missing' }
        }
        // A loop, or a directory that cannot be searched: containment cannot
        // be shown, so nothing is read.
        return { state: 'refused' }
      }
      let realBoundary: string
      try {
        realBoundary = await realpath(boundary)
      } catch {
        return { state: 'refused' }
      }
      if (!isInside(realBoundary, realTarget)) {
        return { state: 'refused' }
      }
      target = realTarget
    }

    const info = await stat(target)
    if (!info.isFile()) {
      // A directory, a device, a pipe: opening a pipe could wait forever.
      onError(new Error(`${fullPath} is not a regular file`))
      return { state: 'unreadable' }
    }

    handle = await open(target, 'r')
    const buffer = Buffer.alloc(Math.min(info.size, DOC_MAX_BYTES))
    let bytesRead = 0
    if (buffer.length > 0) {
      bytesRead = (await handle.read(buffer, 0, buffer.length, 0)).bytesRead
    }

    const bytes = buffer.subarray(0, bytesRead)
    if (bytes.subarray(0, DOC_SNIFF_BYTES).includes(0)) {
      return { state: 'binary' }
    }
    return {
      state: 'present',
      text: new TextDecoder('utf-8').decode(bytes),
      truncated: info.size > DOC_MAX_BYTES
    }
  } catch (error) {
    const code = codeOf(error)
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return { state: 'missing' }
    }
    onError(error)
    return { state: 'unreadable' }
  } finally {
    await handle?.close().catch(() => {})
  }
}

export type DocumentWatcher = {
  /** Resolves once the first result has been delivered to `onRead`. */
  ready: Promise<void>
  close(): Promise<void>
}

export function watchDocument({
  fullPath,
  boundary,
  read = readDocument,
  onRead,
  onError
}: {
  fullPath: string
  /** The project's `<root>/_bmad`: every read must stay inside its real path. */
  boundary?: string
  /** How a read is taken. Injectable so a test can hold one in flight. */
  read?: DocumentReader
  onRead: (read: DocRead) => void
  onError: (error: unknown) => void
}): DocumentWatcher {
  let closed = false
  let reading = false
  let again = false
  let sawFile = false
  let delivered = false
  // Bumped when the file goes: a read that was already in flight then describes
  // a file that is no longer there, and must not be delivered after `missing`.
  let epoch = 0

  let markReady: () => void = () => {}
  const ready = new Promise<void>((resolve) => {
    markReady = resolve
  })

  const deliver = (read: DocRead): void => {
    if (closed) {
      return
    }
    try {
      onRead(read)
    } catch (error) {
      onError(error)
    }
    if (!delivered) {
      delivered = true
      markReady()
    }
  }

  async function drain(): Promise<void> {
    reading = true
    try {
      do {
        again = false
        const started = epoch
        const result = await read(fullPath, onError, boundary)
        if (epoch === started) {
          deliver(result)
        }
      } while (again && !closed)
    } finally {
      reading = false
    }
  }

  const schedule = (): void => {
    if (closed) {
      return
    }
    if (reading) {
      again = true
    } else {
      void drain()
    }
  }

  const watcher = watch(fullPath, {
    ignoreInitial: false,
    atomic: true,
    alwaysStat: true
  })

  watcher.on('add', () => {
    sawFile = true
    schedule()
  })
  watcher.on('change', schedule)
  watcher.on('unlink', () => {
    epoch += 1
    again = false
    deliver({ state: 'missing' })
  })
  // A watcher that cannot watch is not a reason to take the process down.
  watcher.on('error', (error) => {
    if (!closed) {
      onError(error)
    }
  })
  watcher.once('ready', () => {
    // The initial scan found nothing: the first result is that there is no file.
    if (!sawFile) {
      deliver({ state: 'missing' })
    }
  })

  return {
    ready,
    async close() {
      closed = true
      await watcher.close()
      // Nobody is waiting on a result that will now never come.
      markReady()
    }
  }
}
