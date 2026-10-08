/**
 * The two side panels' widths (Story 5.5), as one pure rule over four things:
 * the width the user chose (or none), the panel's range, what the neighbouring
 * column needs and what the container holds. The drag, the keys, a narrowed
 * window and the stored value all go through it, so they cannot disagree.
 *
 * Plain data and functions, no imports beyond types: the build inlines this
 * module into the preload, which cannot load a second file.
 */

/** The panel that can be sized: the 1:1 view's rail and the party view's Room panel. */
export type PanelId = 'rail' | 'room'

/** A panel's default, range and what its neighbouring column keeps. */
export type PanelLimits = {
  /** The width the token gives it; equal to `--rail` / `--party-side`, tied by a test. */
  default: number
  min: number
  cap: number
  /** The least the column beside it keeps: the chat column for the rail, the party column for the Room panel. */
  neighbourMin: number
}

export const PANELS: Readonly<Record<PanelId, PanelLimits>> = {
  rail: { default: 348, min: 280, cap: 560, neighbourMin: 420 },
  room: { default: 240, min: 200, cap: 400, neighbourMin: 480 }
}

/** The panels, in the order the layout names them. */
export const PANEL_IDS: readonly PanelId[] = ['rail', 'room']

/** What the window holds of the layout: a chosen width per panel (or none) and the folded Outputs directories. */
export type Layout = {
  rail: number | null
  room: number | null
  /** Project-relative directory paths, as the Outputs half groups them (trailing `/`). */
  folded: string[]
}

/** The layout of a window that has stored nothing. */
export const NO_LAYOUT: Layout = { rail: null, room: null, folded: [] }

/** Whether a value is one of the panels. */
export function isPanelId(value: unknown): value is PanelId {
  return value === 'rail' || value === 'room'
}

/** What a key on a focused splitter moves by: the step, and the larger one with `Shift`. */
export const KEY_STEP = 16
export const KEY_STEP_SHIFT = 64

/**
 * The smallest and the largest width a panel may have where `available` is the
 * width of the container holding both columns. The maximum is the smaller of
 * the cap and what leaves the neighbour its minimum, and never below the
 * minimum. An `available` that is not a positive number is unknown: no pull-in.
 */
export function limitsFor(panel: PanelId, available: number | null | undefined): { min: number; max: number } {
  const { min, cap, neighbourMin } = PANELS[panel]
  if (typeof available !== 'number' || !Number.isFinite(available) || available <= 0) {
    return { min, max: cap }
  }
  return { min, max: Math.max(min, Math.min(cap, Math.floor(available - neighbourMin))) }
}

/** `width` held to the panel's range at this `available`. */
export function clampWidth(panel: PanelId, width: number, available: number | null | undefined): number {
  const { min, max } = limitsFor(panel, available)
  // A whole number of pixels, so what is shown is what main will read back.
  return Math.min(Math.max(Math.round(width), min), max)
}

/**
 * The width a panel shows: the chosen one, else its default, held to the range.
 * A chosen width is only ever data; a narrowed window shows less of it and
 * changes nothing stored.
 */
export function effectiveWidth(
  panel: PanelId,
  chosen: number | null | undefined,
  available: number | null | undefined
): number {
  return clampWidth(panel, chosen ?? PANELS[panel].default, available)
}

/**
 * A stored width as the panel reads it: an integer within `[min, cap]`, else
 * `null`, which reads as the default. Silent: a bad value is never an error.
 */
export function readWidth(value: unknown, panel: PanelId): number | null {
  const { min, cap } = PANELS[panel]
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= cap ? value : null
}

/**
 * What a key does to a focused splitter, given the panel's current (effective)
 * width. The panel sits at the window's right edge, so `←` moves its edge left
 * and grows it. A width, `null` for the default (`Enter`), or `undefined` for a
 * key the splitter does not claim. A chord with a modifier other than `Shift`
 * is not the splitter's.
 */
export function keyedWidth(
  panel: PanelId,
  current: number,
  key: string,
  shift: boolean,
  available: number | null | undefined
): number | null | undefined {
  const step = shift ? KEY_STEP_SHIFT : KEY_STEP
  const { min, max } = limitsFor(panel, available)
  switch (key) {
    case 'ArrowLeft':
      return clampWidth(panel, current + step, available)
    case 'ArrowRight':
      return clampWidth(panel, current - step, available)
    case 'Home':
      return min
    case 'End':
      return max
    case 'Enter':
      return null
    default:
      return undefined
  }
}
