import { DEFAULT_OUTPUT_FOLDER } from '../../shared/output-folder'
import type { OutputFolderFacts, OutputFolderRefusal } from '../../shared/output-folder'
import type { ArtifactObservation, RailAnnotation, RailRow, RailSnapshot } from '../../shared/rail'
import { ownerAgentIdFor } from '../fold/artifact-owner'
import {
  EMPTY_TABLE,
  SETTLE_MS,
  annotate,
  nextSettleAt,
  observe,
  settle,
  toRows
} from '../fold/rail-rows'
import type { RailTable } from '../fold/rail-rows'

/**
 * The rail read model: the rows under the output folder, as the watcher last saw them,
 * with each row's owner derived from its class and the stream's annotation
 * carried beside the disk state, never merged into it.
 *
 * It pushes only when the rows it would send differ from the last it sent, so
 * a burst of writes to one path is at most two pushes (`changing`, then
 * `saved`), and nothing is pushed before `ready()`: the initial scan's rows
 * are the answer to the first `rail:get`, not a stream of events.
 *
 * The folder the rows are under, and what is to be said of it, are the
 * snapshot's own (Story 5.4): a change of either is a change of the snapshot and
 * pushed with the rows, so a re-pointed rail and its head land in one frame. A
 * projection serves one folder; the bridge makes a new one when the watched
 * folder moves, and `continuesFrom` makes its first snapshot a later revision
 * than the last one the window was sent, which `ready()` then makes the baseline.
 *
 * One timer, aimed at the next row due to settle. `now` is injected so the
 * clock can be held still.
 */

export type RailProjection = {
  observe(observation: ArtifactObservation): void
  /** The stream side's only way in. Decorates an existing row; creates nothing. */
  annotate(path: string, annotation: RailAnnotation | null): void
  /**
   * The stream side's other way in (Story 4.1): a room session wrote `path`, so its row
   * is the room's. Creates no row; a path with none is marked for when the watcher
   * makes one, and the mark is kept until the window goes.
   */
  markRoom(path: string): void
  /** A persona wrote `path`: it is no longer the room's. Creates no row, and does nothing for a path never marked. */
  unmarkRoom(path: string): void
  /** The conversation ended: no file is the room's any more. */
  clearRoom(): void
  /** What is to be said of the folder changed (not the folder itself): pushed like any change. */
  setFacts(facts: OutputFolderFacts, refusal?: OutputFolderRefusal): void
  /**
   * The initial scan is done: fix the baseline, and push from here on. Given
   * `after`, the revision of the snapshot this one replaces (Story 5.4), the
   * baseline is a later revision than that whatever its rows, so a window that
   * was sent the other folder's rows takes this one's.
   */
  ready(after?: number): void
  snapshot(): RailSnapshot
  dispose(): void
}

/** What makes two snapshots the same: the folder, what is said of it, and the rows. */
function keyOf(facts: OutputFolderFacts, refusal: OutputFolderRefusal | undefined, rows: readonly RailRow[]): string {
  return JSON.stringify([facts, refusal ?? null, rows])
}

/**
 * A row's owner: the room when a room session wrote the file, which stands in place of
 * the class's owner, else the class's, else nobody.
 */
function withOwner(row: RailRow, roomPaths: ReadonlySet<string>): RailRow {
  if (roomPaths.has(row.path)) {
    return { ...row, room: true }
  }
  const agentId = ownerAgentIdFor(row.path)
  return agentId === undefined ? row : { ...row, owner: { agentId } }
}

/** The folder the rail is under before it has been told another: the install's own. */
const NO_FACTS: OutputFolderFacts = { folder: DEFAULT_OUTPUT_FOLDER }

export function createRailProjection({
  onChange,
  facts: initialFacts = NO_FACTS,
  refusal: initialRefusal,
  now = Date.now,
  quietMs = SETTLE_MS
}: {
  onChange: (snapshot: RailSnapshot) => void
  /** The folder the rows are under and what is said of it. */
  facts?: OutputFolderFacts
  refusal?: OutputFolderRefusal
  now?: () => number
  quietMs?: number
}): RailProjection {
  let table: RailTable = EMPTY_TABLE
  let facts = initialFacts
  let refusal = initialRefusal
  let revision = 0
  let sent: string | null = keyOf(initialFacts, initialRefusal, [])
  let isReady = false
  let disposed = false
  let timer: NodeJS.Timeout | null = null

  /** The files a room session wrote, by path. */
  const roomPaths = new Set<string>()

  const rows = (): RailRow[] => toRows(table).map((row) => withOwner(row, roomPaths))

  const snapshotOf = (current: RailRow[]): RailSnapshot => ({
    revision,
    rows: current,
    ...facts,
    ...(refusal === undefined ? {} : { refusal })
  })

  /** Advance the revision if the rows, the folder or what is said of it differ from the last sent; report whether they did. */
  function commit(): RailSnapshot | null {
    const current = rows()
    const key = keyOf(facts, refusal, current)
    if (key === sent) {
      return null
    }
    sent = key
    revision += 1
    return snapshotOf(current)
  }

  function flush(): void {
    if (!isReady || disposed) {
      return
    }
    const snapshot = commit()
    if (snapshot !== null) {
      onChange(snapshot)
    }
  }

  function arm(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (disposed) {
      return
    }
    const due = nextSettleAt(table, quietMs)
    if (due === null) {
      return
    }
    timer = setTimeout(
      () => {
        timer = null
        table = settle(table, now(), quietMs)
        flush()
        arm()
      },
      Math.max(0, due - now())
    )
  }

  return {
    observe(observation) {
      if (disposed) {
        return
      }
      table = observe(table, observation, now())
      flush()
      arm()
    },

    annotate(path, annotation) {
      if (disposed) {
        return
      }
      table = annotate(table, path, annotation)
      flush()
    },

    markRoom(path) {
      if (disposed || roomPaths.has(path)) {
        return
      }
      roomPaths.add(path)
      flush()
    },

    unmarkRoom(path) {
      if (!disposed && roomPaths.delete(path)) {
        flush()
      }
    },

    clearRoom() {
      if (!disposed && roomPaths.size > 0) {
        roomPaths.clear()
        flush()
      }
    },

    setFacts(next, nextRefusal) {
      if (disposed) {
        return
      }
      facts = next
      refusal = nextRefusal
      flush()
    },

    ready(after) {
      if (isReady || disposed) {
        return
      }
      isReady = true
      if (after !== undefined) {
        // Nothing has been sent from this one, and what it sends next must be newer than `after`.
        revision = Math.max(revision, after)
        sent = null
      }
      // The baseline is handed out by `snapshot()`, not pushed.
      commit()
    },

    snapshot() {
      // After `ready()` every change is committed as it lands, so the revision
      // is always the rows' own.
      return snapshotOf(rows())
    },

    dispose() {
      disposed = true
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
    }
  }
}
