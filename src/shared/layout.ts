/**
 * The side panels' widths (Story 5.5), as one pure rule over four things:
 * the width the user chose (or none), the panel's range, what the neighbouring
 * column needs and what the container holds. The drag, the keys, a narrowed
 * window and the stored value all go through it, so they cannot disagree.
 *
 * Plain data and functions, no imports beyond types: the build inlines this
 * module into the preload, which cannot load a second file.
 */

/** The panel that can be sized: the 1:1 view's Team sidebar and Outputs rail, and the party view's Room panel. */
export type PanelId = 'sidebar' | 'rail' | 'room'

/** A panel's default, range and what its neighbouring column keeps. */
export type PanelLimits = {
  /** The width the token gives it; equal to `--sidebar` / `--rail` / `--party-side`, tied by a test. */
  default: number
  min: number
  cap: number
  /** The least the column beside it keeps: the chat column for the sidebar and the rail, the party column for the Room panel. */
  neighbourMin: number
}

export const PANELS: Readonly<Record<PanelId, PanelLimits>> = {
  sidebar: { default: 244, min: 200, cap: 400, neighbourMin: 420 },
  rail: { default: 300, min: 260, cap: 480, neighbourMin: 420 },
  room: { default: 240, min: 200, cap: 400, neighbourMin: 480 }
}

/** The panels, in the order the layout names them. */
export const PANEL_IDS: readonly PanelId[] = ['sidebar', 'rail', 'room']

/**
 * What the window holds of the layout: a chosen width per panel (or none), the folded Outputs directories,
 * whether the skill row is open, the rail split's share (or none) and the folded Changes directories.
 */
export type Layout = {
  sidebar: number | null
  rail: number | null
  room: number | null
  /** Project-relative directory paths, as the Outputs half groups them (trailing `/`). */
  folded: string[]
  /** Whether the skill row above the composer is open, app-wide (Story 9.1). Absent reads as collapsed. */
  skillRowOpen?: boolean
  /** The share of the rail's height the Changes half takes, per user (Story 9.3), `0 < x < 1`; `null` is half and half. */
  railSplit: number | null
  /** Project-relative directory paths the Changes half has folded (Story 9.3), its own set, apart from `folded`. */
  changesFolded: string[]
}

/** The layout of a window that has stored nothing. */
export const NO_LAYOUT: Layout = {
  sidebar: null,
  rail: null,
  room: null,
  folded: [],
  skillRowOpen: false,
  railSplit: null,
  changesFolded: []
}

/** Whether a value is one of the panels. */
export function isPanelId(value: unknown): value is PanelId {
  return value === 'sidebar' || value === 'rail' || value === 'room'
}

/**
 * Whether a panel's width grows when its splitter moves right: the sidebar sits
 * on the window's left, so its edge moves right to grow it; the rail and the Room
 * panel sit on the right and grow as their edge moves left. One rule for the drag
 * and the keys.
 */
export function growsRight(panel: PanelId): boolean {
  return panel === 'sidebar'
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
 * width. A panel on the window's right (the rail, the Room panel) has `←`
 * move its edge left and grow it; the sidebar, on the left, grows on `→`
 * (`growsRight`). A width, `null` for the default (`Enter`), or `undefined` for a
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
  const grow = growsRight(panel) ? 'ArrowRight' : 'ArrowLeft'
  const shrink = growsRight(panel) ? 'ArrowLeft' : 'ArrowRight'
  switch (key) {
    case grow:
      return clampWidth(panel, current + step, available)
    case shrink:
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

/**
 * The rail split (Story 9.3, UX-DR59): the share of the rail's height the Changes
 * half takes, above the Outputs half. One rule for the drag, the keys and the
 * stored value, as `keyedWidth` is for the side panels. A share is a fraction,
 * `0 < x < 1`; `null` is half and half.
 */

/** The least height either half of the rail is drawn at. */
export const RAIL_HALF_MIN = 120

/** The share with nothing chosen, and the share a rail too short for two minimums is drawn at. */
export const RAIL_SPLIT_DEFAULT = 0.5

/** A stored share as the split reads it: a number strictly between 0 and 1, else `null` (half and half). Silent. */
export function readShare(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1 ? value : null
}

/** Whether `height` is a rail height that can be split: a positive number. */
function knownHeight(height: number | null | undefined): height is number {
  return typeof height === 'number' && Number.isFinite(height) && height > 0
}

/**
 * The least and the most share at this rail `height`: each half keeps `RAIL_HALF_MIN`.
 * A rail too short for both minimums, or of unknown height, holds the split at half and half.
 */
export function splitLimits(height: number | null | undefined): { min: number; max: number } {
  if (!knownHeight(height) || height < RAIL_HALF_MIN * 2) {
    return { min: RAIL_SPLIT_DEFAULT, max: RAIL_SPLIT_DEFAULT }
  }
  return { min: RAIL_HALF_MIN / height, max: 1 - RAIL_HALF_MIN / height }
}

/** `share` held to the limits at this `height`, for drawing only: a stored share is never rewritten by it. */
export function clampShare(share: number, height: number | null | undefined): number {
  const { min, max } = splitLimits(height)
  return Math.min(Math.max(share, min), max)
}

/** The share drawn: the chosen one, else half and half, held to the limits. */
export function effectiveShare(chosen: number | null | undefined, height: number | null | undefined): number {
  return clampShare(chosen ?? RAIL_SPLIT_DEFAULT, height)
}

/** A share as a whole percentage, what the separator's `aria-value*` say. */
export function sharePercent(share: number): number {
  return Math.round(share * 100)
}

/**
 * What a key does to the focused rail split, given the share drawn now and the
 * rail's height: `↑`/`↓` move it 16px (64px with `Shift`), `Home`/`End` go to the
 * limits and `Enter` resets it (`null`). `undefined` for a key the split does not claim.
 */
export function keyedShare(
  share: number,
  key: string,
  shift: boolean,
  height: number | null | undefined
): number | null | undefined {
  const step = (shift ? KEY_STEP_SHIFT : KEY_STEP) / (knownHeight(height) ? height : RAIL_HALF_MIN * 2)
  const { min, max } = splitLimits(height)
  switch (key) {
    case 'ArrowUp':
      return clampShare(share - step, height)
    case 'ArrowDown':
      return clampShare(share + step, height)
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
