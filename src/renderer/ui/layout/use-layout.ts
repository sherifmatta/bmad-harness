import { useCallback, useMemo, useState } from 'react'

import { NO_LAYOUT, PANEL_IDS, readShare, readWidth } from '../../../shared/layout'
import type { Layout, PanelId } from '../../../shared/layout'
import type { LayoutContextValue } from './layout-context'

/** The slice of the bridge the layout uses. Every method may be missing: a preload that did not load. */
type LayoutBridge = {
  getLayout?: () => Layout
  setPanelWidth?: (panel: PanelId, width: number | null) => void
  setFolded?: (dirs: readonly string[], half?: 'changes') => void
  setSkillRowOpen?: (open: boolean) => void
  setRailSplit?: (share: number | null) => void
}

function bridge(): LayoutBridge | undefined {
  return (globalThis as { window?: { harness?: LayoutBridge } }).window?.harness
}

/**
 * The layout as the window starts from it: asked once, synchronously, and read
 * as tolerantly as main reads it. A width that is not an integer within its
 * panel's range is the default; a folded set that is not strings is nothing folded;
 * a skill row choice that is not `true` is collapsed; a rail split that is not a
 * share strictly between 0 and 1 is half and half.
 */
function readInitial(): Layout {
  const asked = bridge()?.getLayout
  if (typeof asked !== 'function') {
    return NO_LAYOUT
  }
  let got: unknown
  try {
    got = asked.call(bridge())
  } catch {
    return NO_LAYOUT
  }
  const record = typeof got === 'object' && got !== null ? (got as Record<string, unknown>) : {}
  return {
    sidebar: readWidth(record['sidebar'], 'sidebar'),
    rail: readWidth(record['rail'], 'rail'),
    room: readWidth(record['room'], 'room'),
    folded: Array.isArray(record['folded'])
      ? record['folded'].filter((entry): entry is string => typeof entry === 'string')
      : [],
    skillRowOpen: record['skillRowOpen'] === true,
    railSplit: readShare(record['railSplit']),
    changesFolded: Array.isArray(record['changesFolded'])
      ? record['changesFolded'].filter((entry): entry is string => typeof entry === 'string')
      : []
  }
}

/**
 * The window's layout (Story 5.5), for `App` to provide: what was stored, read
 * once, and the ways to keep a width, a fold (in either rail half), the skill row
 * choice or the rail split's share. A write is a request through
 * a named bridge method and reports nothing back; with no such method it only
 * changes what this window shows.
 */
export function useLayout(): LayoutContextValue {
  const [initial] = useState(readInitial)
  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set(initial.folded))
  const [skillRowOpen, setSkillRowOpen] = useState<boolean>(initial.skillRowOpen === true)
  const [changesFolded, setChangesFolded] = useState<ReadonlySet<string>>(() => new Set(initial.changesFolded))

  const saveWidth = useCallback((panel: PanelId, width: number | null) => {
    const send = bridge()?.setPanelWidth
    if (typeof send === 'function') {
      send.call(bridge(), panel, width)
    }
  }, [])

  const saveFolded = useCallback((dirs: ReadonlySet<string>) => {
    setFolded(new Set(dirs))
    const send = bridge()?.setFolded
    if (typeof send === 'function') {
      send.call(bridge(), [...dirs])
    }
  }, [])

  // The Changes half's set crosses with its half named (Story 9.3); the Outputs half's never names one.
  const saveChangesFolded = useCallback((dirs: ReadonlySet<string>) => {
    setChangesFolded(new Set(dirs))
    const send = bridge()?.setFolded
    if (typeof send === 'function') {
      send.call(bridge(), [...dirs], 'changes')
    }
  }, [])

  const saveRailSplit = useCallback((share: number | null) => {
    const send = bridge()?.setRailSplit
    if (typeof send === 'function') {
      send.call(bridge(), share)
    }
  }, [])

  const saveSkillRowOpen = useCallback((open: boolean) => {
    setSkillRowOpen(open)
    const send = bridge()?.setSkillRowOpen
    if (typeof send === 'function') {
      send.call(bridge(), open)
    }
  }, [])

  return useMemo(() => {
    const widths = Object.fromEntries(PANEL_IDS.map((panel) => [panel, initial[panel]])) as Record<
      PanelId,
      number | null
    >
    return {
      widths,
      folded,
      saveWidth,
      saveFolded,
      skillRowOpen,
      saveSkillRowOpen,
      railSplit: initial.railSplit,
      saveRailSplit,
      changesFolded,
      saveChangesFolded
    }
  }, [initial, folded, saveWidth, saveFolded, skillRowOpen, saveSkillRowOpen, saveRailSplit, changesFolded, saveChangesFolded])
}
