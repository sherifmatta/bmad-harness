import { createContext, useContext } from 'react'

import type { PanelId } from '../../../shared/layout'

/**
 * What the window's layout gives the panels and the Outputs list (Story 5.5): the
 * widths the user chose, the directories they folded, whether the skill row is
 * open (Story 9.1), the rail split's share and the Changes half's own folded
 * directories (Story 9.3), and the ways to keep each. The default is inert, so a `Shell` or an `Outputs` mounted with no
 * provider (a test, a page with no bridge) shows the defaults and keeps nothing.
 */
export type LayoutContextValue = {
  /** A panel's chosen width as it was stored, or `null` for the default. Read once, when the panel mounts. */
  widths: Readonly<Record<PanelId, number | null>>
  /** The project-relative directories that are folded, entries for directories that are gone included. */
  folded: ReadonlySet<string>
  /** Keep a panel's width, or forget it for `null`. */
  saveWidth(panel: PanelId, width: number | null): void
  /** Keep the whole folded set. */
  saveFolded(dirs: ReadonlySet<string>): void
  /** Whether the skill row is open: one choice for the whole app, shared by every persona's chat. */
  skillRowOpen: boolean
  /** Open or close the skill row, and keep the choice. */
  saveSkillRowOpen(open: boolean): void
  /** The share of the rail's height the Changes half takes, as stored, or `null` for half and half. Read once, when the split mounts. */
  railSplit: number | null
  /** Keep the rail split's share, or forget it for `null`. */
  saveRailSplit(share: number | null): void
  /** The project-relative directories the Changes half has folded: its own set, apart from `folded`. */
  changesFolded: ReadonlySet<string>
  /** Keep the Changes half's whole folded set. */
  saveChangesFolded(dirs: ReadonlySet<string>): void
}

function nothing(): void {}

export const INERT_LAYOUT: LayoutContextValue = {
  widths: { sidebar: null, rail: null, room: null },
  folded: new Set<string>(),
  saveWidth: nothing,
  saveFolded: nothing,
  skillRowOpen: false,
  saveSkillRowOpen: nothing,
  railSplit: null,
  saveRailSplit: nothing,
  changesFolded: new Set<string>(),
  saveChangesFolded: nothing
}

export const LayoutContext = createContext<LayoutContextValue>(INERT_LAYOUT)

/** The window's layout, or the inert one outside a provider. */
export function useLayoutContext(): LayoutContextValue {
  return useContext(LayoutContext)
}
