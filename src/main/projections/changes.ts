import { basename } from 'node:path'
import type { ChangesBody, ChangesSnapshot } from '../../shared/changes'
import { foldPorcelainV2 } from '../fold/git-status'
import { readGitStatus } from '../sources/project/git-status'
import type { GitStatusResult } from '../sources/project/git-status'

/**
 * The Changes read model (Story 9.3, AD-31): one snapshot per project window of
 * what git reports uncommitted, kept fresh only while the window is in front.
 *
 * - **Freshness.** `front()` reads at once, then again `intervalMs` (2s) after
 *   each answer, for as long as the window stays in front. `back()` schedules
 *   nothing more: a read in flight finishes and its answer is applied, and that is
 *   the last until the window comes back. Only one read is ever in flight.
 * - **Dedupe.** The snapshot is `reading` until the first answer, which is always
 *   pushed, since it replaces `reading`. After that `onChange` hears a body only
 *   when it differs from the one held, by its JSON.
 * - **Pure of window and clock.** The bridge says front and back; the timers are
 *   injected.
 */

/** About two seconds after each answer, while the window is in front. */
export const CHANGES_INTERVAL_MS = 2_000

export type ChangesTimers = {
  setTimeout(callback: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export type ChangesProjection = {
  snapshot(): ChangesSnapshot
  /** The window is (or came) in front: read now, and keep reading. */
  front(): void
  /** The window went to the background: schedule nothing more. */
  back(): void
  dispose(): void
}

/** What a source result comes to, through the fold. */
export function bodyOf(result: GitStatusResult): ChangesBody {
  switch (result.kind) {
    case 'not-repo':
    case 'no-git':
      return { kind: result.kind }
    case 'failed':
      return { kind: 'failed', reason: result.reason }
    case 'output': {
      const fold = foldPorcelainV2(result.stdout)
      return fold.ok ? { kind: 'list', rows: fold.rows } : { kind: 'failed', reason: 'unexpected output' }
    }
  }
}

/** The default read: the source, then the fold. */
export async function readChanges(projectRoot: string): Promise<ChangesBody> {
  return bodyOf(await readGitStatus(projectRoot))
}

const DEFAULT_TIMERS: ChangesTimers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
}

export function createChangesProjection({
  projectRoot,
  read = readChanges,
  onChange,
  timers = DEFAULT_TIMERS,
  intervalMs = CHANGES_INTERVAL_MS
}: {
  projectRoot: string
  read?: (projectRoot: string) => Promise<ChangesBody>
  onChange: (snapshot: ChangesSnapshot) => void
  timers?: ChangesTimers
  intervalMs?: number
}): ChangesProjection {
  const root = basename(projectRoot)
  let current: ChangesSnapshot = { kind: 'reading', revision: 1, root }
  let key = JSON.stringify({ kind: 'reading' })
  let inFront = false
  let inFlight = false
  let disposed = false
  let pending: unknown = null

  function cancelPending(): void {
    if (pending !== null) {
      timers.clearTimeout(pending)
      pending = null
    }
  }

  function apply(body: ChangesBody): void {
    const next = JSON.stringify(body)
    if (next === key) {
      return
    }
    key = next
    current = { ...body, revision: current.revision + 1, root }
    onChange(current)
  }

  async function readNow(): Promise<void> {
    if (inFlight || disposed) {
      return
    }
    cancelPending()
    inFlight = true
    let body: ChangesBody
    try {
      body = await read(projectRoot)
    } catch {
      body = { kind: 'failed', reason: 'unexpected output' }
    }
    inFlight = false
    if (disposed) {
      return
    }
    apply(body)
    if (inFront && pending === null) {
      pending = timers.setTimeout(() => {
        pending = null
        void readNow()
      }, intervalMs)
    }
  }

  return {
    snapshot: () => current,
    front() {
      if (disposed) {
        return
      }
      inFront = true
      void readNow()
    },
    back() {
      inFront = false
      cancelPending()
    },
    dispose() {
      disposed = true
      inFront = false
      cancelPending()
    }
  }
}
