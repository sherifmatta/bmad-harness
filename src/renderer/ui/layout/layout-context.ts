import { createContext, useContext } from 'react'

import type { PanelId } from '../../../shared/layout'

/**
 * What the window's layout gives the panels and the Outputs list (Story 5.5): the
 * widths the user chose, the directories they folded, and the two ways to keep
 * either. The default is inert, so a `Shell` or an `Outputs` mounted with no
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
}

function nothing(): void {}

export const INERT_LAYOUT: LayoutContextValue = {
  widths: { sidebar: null, rail: null, room: null },
  folded: new Set<string>(),
  saveWidth: nothing,
  saveFolded: nothing
}

export const LayoutContext = createContext<LayoutContextValue>(INERT_LAYOUT)

/** The window's layout, or the inert one outside a provider. */
export function useLayoutContext(): LayoutContextValue {
  return useContext(LayoutContext)
}
