import type { RailAnnotation, RailRow, ArtifactObservation } from '../../shared/rail'

/**
 * The rail's rows, folded from what the watcher saw — pure, immutable, with
 * `now` injected and no I/O.
 *
 * A row has two fields with two owners (FR49, AD-2). The disk field is written
 * only by `observe` and `settle`; the annotation only by `annotate`. `observe`
 * and `settle` carry an entry's annotation across untouched, and `annotate`
 * replaces nothing but the annotation. Nothing here merges them.
 *
 * `changing` is not a flag a writer sets: it is "an observation arrived less
 * than `SETTLE_MS` ago". That is what lets it work for a writer the harness is
 * not running (an editor, a terminal `claude`), and what makes any number of
 * events on one path inside the window one `changing` period and one `saved`
 * (FR52).
 */

/** The observed coalescing window: how long a path must stay silent to be saved. */
export const SETTLE_MS = 400

type Disk =
  | { state: 'not-yet-written' }
  | { state: 'changing'; observedAt: number; mtimeMs: number }
  | { state: 'saved'; savedAt: number }

type Entry = { disk: Disk; annotation?: RailAnnotation }

/** Keyed by project-relative POSIX path. Never mutated: every function returns a table. */
export type RailTable = ReadonlyMap<string, Entry>

export const EMPTY_TABLE: RailTable = new Map()

function withDisk(table: RailTable, path: string, disk: Disk): RailTable {
  const next = new Map(table)
  const entry = table.get(path)
  next.set(path, entry?.annotation === undefined ? { disk } : { disk, annotation: entry.annotation })
  return next
}

/**
 * An annotation as the table holds it and the rows carry it: its words and its owner or owners,
 * copied (a fresh array of fresh objects), and nothing else.
 */
function carried({ text, owner, owners }: RailAnnotation): RailAnnotation {
  return {
    text,
    ...(owner === undefined ? {} : { owner: { agentId: owner.agentId } }),
    ...(owners === undefined ? {} : { owners: owners.map(({ agentId }) => ({ agentId })) })
  }
}

/** Fold one observation into the table. A row exists because the watcher saw the file. */
export function observe(table: RailTable, observation: ArtifactObservation, now: number): RailTable {
  const { type, path, size, mtimeMs } = observation

  if (type === 'artifact:removed') {
    if (!table.has(path)) {
      return table
    }
    const next = new Map(table)
    next.delete(path)
    return next
  }

  if (size <= 0) {
    return withDisk(table, path, { state: 'not-yet-written' })
  }
  if (type === 'artifact:found') {
    return withDisk(table, path, { state: 'saved', savedAt: mtimeMs })
  }
  return withDisk(table, path, { state: 'changing', observedAt: now, mtimeMs })
}

/**
 * Turn every `changing` row whose last observation is at least `quietMs` old
 * into `saved`, stamped with the last `mtimeMs` seen. Returns the same table
 * when nothing settles.
 */
export function settle(table: RailTable, now: number, quietMs: number = SETTLE_MS): RailTable {
  let next: Map<string, Entry> | null = null

  for (const [path, entry] of table) {
    const { disk } = entry
    if (disk.state === 'changing' && now - disk.observedAt >= quietMs) {
      next ??= new Map(table)
      next.set(path, {
        ...entry,
        disk: { state: 'saved', savedAt: disk.mtimeMs }
      })
    }
  }

  return next ?? table
}

/**
 * Set or clear (`null`) the annotation of an existing row. A path with no row
 * is a no-op, as is a change that changes nothing: the same table comes back.
 * Nothing else about the row can move, and no row is made or removed.
 */
export function annotate(
  table: RailTable,
  path: string,
  annotation: RailAnnotation | null
): RailTable {
  const entry = table.get(path)
  if (entry === undefined) {
    return table
  }
  if (annotation === null) {
    if (entry.annotation === undefined) {
      return table
    }
    const next = new Map(table)
    next.set(path, { disk: entry.disk })
    return next
  }
  const next = new Map(table)
  next.set(path, { disk: entry.disk, annotation: carried(annotation) })
  return next
}

/** When the next `changing` row is due to settle, or `null` if none is. */
export function nextSettleAt(table: RailTable, quietMs: number = SETTLE_MS): number | null {
  let earliest: number | null = null
  for (const { disk } of table.values()) {
    if (disk.state === 'changing') {
      const due = disk.observedAt + quietMs
      earliest = earliest === null || due < earliest ? due : earliest
    }
  }
  return earliest
}

/** Code-unit order, never locale order: the same on every machine. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * The table as rows, sorted by path. Watcher-internal bookkeeping (when a row
 * was last observed) stays behind; the owner is attached by the projection.
 */
export function toRows(table: RailTable): RailRow[] {
  return [...table.keys()].sort(byCodeUnit).map((path) => {
    const { disk, annotation } = table.get(path) as Entry
    const field: RailRow =
      disk.state === 'saved'
        ? { path, state: 'saved', savedAt: disk.savedAt }
        : { path, state: disk.state }
    return annotation === undefined ? field : { ...field, annotation: carried(annotation) }
  })
}
