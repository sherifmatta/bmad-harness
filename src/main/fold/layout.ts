import { PANEL_IDS, readWidth } from '../../shared/layout'
import type { PanelId } from '../../shared/layout'

/**
 * What the layout store holds (Story 5.5), as a rule over whatever was read, with
 * no I/O: two widths per user, one per panel, and the folded Outputs directories
 * per project, and one app-wide choice, whether the skill row is open (Story 9.1).
 * Reading is tolerant — a value of the wrong shape is no value and
 * the next write replaces it — and writing keeps only what is valid.
 */

/** The widths the store holds; a panel with none is at its default. */
export type StoredWidths = Partial<Record<PanelId, number>>

/** The folded directories of every project the store knows, by project key. */
export type StoredFolded = Record<string, string[]>

/** What a write stores: the widths, the folds, and whether the skill row is open (Story 9.1). */
export type StoredLayout = { widths: StoredWidths; folded: StoredFolded; skillRowOpen: boolean }

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

/** Every project's folded directories, read tolerantly: strings only, deduped, empty sets dropped. */
export function allFolded(raw: unknown): StoredFolded {
  const stored = recordOf(recordOf(raw)?.folded)
  const folded: StoredFolded = {}
  for (const [key, value] of Object.entries(stored ?? {})) {
    const dirs = stringsOf(value)
    if (dirs.length > 0) {
      folded[key] = dirs
    }
  }
  return folded
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

/** The store with one panel's width set, or removed for `null`; everything else untouched. A width the panel would not read is not stored. */
export function withWidth(raw: unknown, panel: PanelId, width: number | null): StoredLayout {
  const widths = widthsOf(raw)
  delete widths[panel]
  const valid = width === null ? null : readWidth(width, panel)
  if (valid !== null) {
    widths[panel] = valid
  }
  return { widths, folded: allFolded(raw), skillRowOpen: skillRowOpenOf(raw) }
}

/** The store with one project's folded directories replaced, or removed when there are none; the other projects untouched. */
export function withFolded(raw: unknown, projectKey: string, dirs: readonly string[]): StoredLayout {
  const folded = allFolded(raw)
  delete folded[projectKey]
  const kept = stringsOf([...dirs])
  if (kept.length > 0) {
    folded[projectKey] = kept
  }
  return { widths: widthsOf(raw), folded, skillRowOpen: skillRowOpenOf(raw) }
}

/** The store with the skill row's choice set; the widths and every project's folds untouched. */
export function withSkillRowOpen(raw: unknown, open: boolean): StoredLayout {
  return { widths: widthsOf(raw), folded: allFolded(raw), skillRowOpen: open }
}
