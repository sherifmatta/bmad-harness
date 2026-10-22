import { PANEL_IDS, readShare, readWidth } from '../../shared/layout'
import type { PanelId } from '../../shared/layout'

/**
 * What the layout store holds (Story 5.5), as a rule over whatever was read, with
 * no I/O: two widths per user, one per panel, and the folded Outputs directories
 * per project, and one app-wide choice, whether the skill row is open (Story 9.1);
 * then the rail split's share, per user, and the folded Changes directories per
 * project, apart from the Outputs ones (Story 9.3).
 * Reading is tolerant — a value of the wrong shape is no value and
 * the next write replaces it — and writing keeps only what is valid.
 */

/** The widths the store holds; a panel with none is at its default. */
export type StoredWidths = Partial<Record<PanelId, number>>

/** The folded directories of every project the store knows, by project key. */
export type StoredFolded = Record<string, string[]>

/**
 * What a write stores: the widths, the folds, whether the skill row is open (Story 9.1), and the rail
 * split's share (`null` for none) and the Changes half's folds (Story 9.3). Every writer carries all five.
 */
export type StoredLayout = {
  widths: StoredWidths
  folded: StoredFolded
  skillRowOpen: boolean
  railSplit: number | null
  changesFolded: StoredFolded
}

/** A value of any shape as a record, or `null`. */
function recordOf(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** The strings of an array, once each, in order; anything else is dropped. */
function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string'))]
    : []
}

/** The widths a store holds: each a valid integer within its panel's range, and nothing else. */
export function widthsOf(raw: unknown): StoredWidths {
  const stored = recordOf(recordOf(raw)?.widths)
  const widths: StoredWidths = {}
  for (const panel of PANEL_IDS) {
    const width = readWidth(stored?.[panel], panel)
    if (width !== null) {
      widths[panel] = width
    }
  }
  return widths
}

/** A per-project folded record, read tolerantly: strings only, deduped, empty sets dropped. */
function foldedRecord(value: unknown): StoredFolded {
  const stored = recordOf(value)
  const folded: StoredFolded = {}
  for (const [key, value] of Object.entries(stored ?? {})) {
    const dirs = stringsOf(value)
    if (dirs.length > 0) {
      folded[key] = dirs
    }
  }
  return folded
}

/** Every project's folded Outputs directories, read tolerantly: strings only, deduped, empty sets dropped. */
export function allFolded(raw: unknown): StoredFolded {
  return foldedRecord(recordOf(raw)?.folded)
}

/** Every project's folded Changes directories (Story 9.3), read as tolerantly as the Outputs ones. */
export function allChangesFolded(raw: unknown): StoredFolded {
  return foldedRecord(recordOf(raw)?.changesFolded)
}

/** The rail split's share (Story 9.3): a number strictly between 0 and 1, else `null`, which reads as half and half. */
export function railSplitOf(raw: unknown): number | null {
  return readShare(recordOf(raw)?.railSplit)
}

/** Whether the skill row is open: only a stored `true` is; anything else, or nothing, is collapsed. */
export function skillRowOpenOf(raw: unknown): boolean {
  return recordOf(raw)?.skillRowOpen === true
}

/** The directories folded for a project, as the store holds them. */
export function foldedOf(raw: unknown, projectKey: string): string[] {
  const all = allFolded(raw)
  return Object.hasOwn(all, projectKey) ? (all[projectKey] as string[]) : []
}

/** The Changes directories folded for a project (Story 9.3), as the store holds them. */
export function changesFoldedOf(raw: unknown, projectKey: string): string[] {
  const all = allChangesFolded(raw)
  return Object.hasOwn(all, projectKey) ? (all[projectKey] as string[]) : []
}

/** Everything the store holds, read: what each writer starts from and changes one part of. */
function storedOf(raw: unknown): StoredLayout {
  return {
    widths: widthsOf(raw),
    folded: allFolded(raw),
    skillRowOpen: skillRowOpenOf(raw),
    railSplit: railSplitOf(raw),
    changesFolded: allChangesFolded(raw)
  }
}

/** One project's set in a per-project record replaced, or removed when there are none. */
function replaced(record: StoredFolded, projectKey: string, dirs: readonly string[]): StoredFolded {
  const next = { ...record }
  delete next[projectKey]
  const kept = stringsOf([...dirs])
  if (kept.length > 0) {
    next[projectKey] = kept
  }
  return next
}

/** The store with one panel's width set, or removed for `null`; everything else untouched. A width the panel would not read is not stored. */
export function withWidth(raw: unknown, panel: PanelId, width: number | null): StoredLayout {
  const widths = widthsOf(raw)
  delete widths[panel]
  const valid = width === null ? null : readWidth(width, panel)
  if (valid !== null) {
    widths[panel] = valid
  }
  return { ...storedOf(raw), widths }
}

/** The store with one project's folded directories replaced, or removed when there are none; the other projects untouched. */
export function withFolded(raw: unknown, projectKey: string, dirs: readonly string[]): StoredLayout {
  return { ...storedOf(raw), folded: replaced(allFolded(raw), projectKey, dirs) }
}

/** The store with one project's folded Changes directories replaced (Story 9.3); the Outputs folds untouched. */
export function withChangesFolded(raw: unknown, projectKey: string, dirs: readonly string[]): StoredLayout {
  return { ...storedOf(raw), changesFolded: replaced(allChangesFolded(raw), projectKey, dirs) }
}

/** The store with the rail split's share set, or removed for `null` (Story 9.3). A share the split would not read is not stored. */
export function withRailSplit(raw: unknown, share: number | null): StoredLayout {
  return { ...storedOf(raw), railSplit: share === null ? null : readShare(share) }
}

/** The store with the skill row's choice set; the widths and every project's folds untouched. */
export function withSkillRowOpen(raw: unknown, open: boolean): StoredLayout {
  return { ...storedOf(raw), skillRowOpen: open }
}
