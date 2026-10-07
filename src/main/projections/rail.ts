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
 * The rail read model: the rows under `_bmad/`, as the watcher last saw them,
 * with each row's owner derived from its class and the stream's annotation
 * carried beside the disk state, never merged into it.
 *
 * It pushes only when the rows it would send differ from the last it sent, so
 * a burst of writes to one path is at most two pushes (`changing`, then
 * `saved`), and nothing is pushed before `ready()`: the initial scan's rows
 * are the answer to the first `rail:get`, not a stream of events.
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
  /** The initial scan is done: fix the baseline, and push from here on. */
  ready(): void
  snapshot(): RailSnapshot
  dispose(): void
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

export function createRailProjection({
  onChange,
  now = Date.now,
  quietMs = SETTLE_MS
}: {
  onChange: (snapshot: RailSnapshot) => void
  now?: () => number
  quietMs?: number
}): RailProjection {
  let table: RailTable = EMPTY_TABLE
  let revision = 0
  let sent = '[]'
  let isReady = false
  let disposed = false
  let timer: NodeJS.Timeout | null = null

  /** The files a room session wrote, by path. */
  const roomPaths = new Set<string>()

  const rows = (): RailRow[] => toRows(table).map((row) => withOwner(row, roomPaths))

  /** Advance the revision if the rows differ from the last sent; report whether they did. */
  function commit(): RailSnapshot | null {
    const current = rows()
    const key = JSON.stringify(current)
    if (key === sent) {
      return null
    }
    sent = key
    revision += 1
    return { revision, rows: current }
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

    ready() {
      if (isReady || disposed) {
        return
      }
      isReady = true
      // The baseline is handed out by `snapshot()`, not pushed.
      commit()
    },

    snapshot() {
      // After `ready()` every change is committed as it lands, so the revision
      // is always the rows' own.
      return { revision, rows: rows() }
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
