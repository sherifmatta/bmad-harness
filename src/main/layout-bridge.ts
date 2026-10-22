import { ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import {
  LAYOUT_GET_CHANNEL,
  LAYOUT_SET_FOLDED_CHANNEL,
  LAYOUT_SET_RAIL_SPLIT_CHANNEL,
  LAYOUT_SET_SKILL_ROW_CHANNEL,
  LAYOUT_SET_WIDTH_CHANNEL
} from '../shared/channels'
import { isPanelId, readShare, readWidth } from '../shared/layout'
import type { Layout } from '../shared/layout'
import { defaultProjectPathFor, defaultWriteDiagnostic, noProject, senderOf, unexpected } from './bridge-kit'
import {
  changesFoldedOf,
  foldedOf,
  railSplitOf,
  skillRowOpenOf,
  widthsOf,
  withChangesFolded,
  withFolded,
  withRailSplit,
  withSkillRowOpen,
  withWidth
} from './fold/layout'
import { layoutFilePath, readLayoutFile, readLayoutToChange, writeLayoutFile } from './sources/persistence/layout-file'
import type { LayoutToWrite } from './sources/persistence/layout-file'

/**
 * The layout's five channels. Exported so tests/bridge-contract.test.ts can tie
 * each to the literal in the preload that speaks it.
 */
export {
  LAYOUT_GET_CHANNEL,
  LAYOUT_SET_FOLDED_CHANNEL,
  LAYOUT_SET_RAIL_SPLIT_CHANNEL,
  LAYOUT_SET_SKILL_ROW_CHANNEL,
  LAYOUT_SET_WIDTH_CHANNEL
}

export type LayoutBridgeDeps = {
  /** The app's own data directory, read on first use: the layout is kept beside the other bookkeeping, never in a project. */
  userDataPath: () => string
  projectPathFor?: (webContentsId: number) => string | undefined
  writeDiagnostic?: (line: string) => void
}

/** Most directories one project may fold, and the longest a path may be: a bound, never a limit a project meets. */
const MOST_FOLDED = 1024
const LONGEST_PATH = 4096

/** The strings of a folded set a window sent, or `null` when it is not one. */
function foldedFrom(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MOST_FOLDED) {
    return null
  }
  return value.every((entry) => typeof entry === 'string' && entry.length <= LONGEST_PATH)
    ? (value as string[])
    : null
}

/**
 * Answer a window's layout (Story 5.5): its panel widths, per user, and the
 * Outputs directories it folded, per project, and whether the skill row is open,
 * app-wide (Story 9.1); the rail split's share, per user, and the Changes
 * directories it folded, per project (Story 9.3). The read is synchronous
 * (`ipcMain.on` with a return value, as the theme's is) so the first paint is
 * already at the stored width; the four writes are requests, validated here and
 * ignored when they are not what they say. `layout:set-folded` names the half
 * by its second argument: none is the Outputs half, `'changes'` the Changes half. The folded set is keyed by the
 * sender's own project; a window cannot name another. Nothing is written into a
 * project.
 */
export function registerLayoutBridge(deps: LayoutBridgeDeps): void {
  const projectPathFor = deps.projectPathFor ?? defaultProjectPathFor
  const writeDiagnostic = deps.writeDiagnostic ?? defaultWriteDiagnostic
  const filePath = (): string => layoutFilePath(deps.userDataPath())

  function store(next: (raw: unknown) => LayoutToWrite): void {
    const current = readLayoutToChange(filePath())
    if (!current.ok) {
      // A file that is there and could not be read is left as it is: writing would replace every width and fold it holds.
      writeDiagnostic(`layout/unread · ${current.errno}`)
      return
    }
    const outcome = writeLayoutFile(filePath(), next(current.raw))
    if (!outcome.ok) {
      // The width, fold or skill row choice still applies in this window; say so for the developer.
      writeDiagnostic(`layout/unwritten · ${outcome.errno}`)
    }
  }

  ipcMain.on(LAYOUT_GET_CHANNEL, (event: IpcMainEvent) => {
    let answer: Layout = {
      sidebar: null,
      rail: null,
      room: null,
      folded: [],
      skillRowOpen: false,
      railSplit: null,
      changesFolded: []
    }
    try {
      const raw = readLayoutFile(filePath())
      const widths = widthsOf(raw)
      const projectKey = projectPathFor((event.sender as unknown as { id: number }).id)
      answer = {
        sidebar: widths.sidebar ?? null,
        rail: widths.rail ?? null,
        room: widths.room ?? null,
        folded: projectKey === undefined ? [] : foldedOf(raw, projectKey),
        skillRowOpen: skillRowOpenOf(raw),
        railSplit: railSplitOf(raw),
        changesFolded: projectKey === undefined ? [] : changesFoldedOf(raw, projectKey)
      }
    } catch (error) {
      void unexpected('layout', error, writeDiagnostic)
    }
    event.returnValue = answer
  })

  ipcMain.handle(LAYOUT_SET_WIDTH_CHANNEL, (_event: IpcMainInvokeEvent, panel: unknown, width: unknown) => {
    // A panel that is not one, or a width the panel would not read, is ignored: nothing changes.
    if (!isPanelId(panel) || (width !== null && readWidth(width, panel) === null)) {
      return { ok: true as const, ignored: true as const }
    }
    try {
      store((raw) => withWidth(raw, panel, width as number | null))
      return { ok: true as const }
    } catch (error) {
      return unexpected('layout', error, writeDiagnostic)
    }
  })

  ipcMain.handle(LAYOUT_SET_FOLDED_CHANNEL, (event: IpcMainInvokeEvent, dirs: unknown, half?: unknown) => {
    const projectKey = projectPathFor(senderOf(event).id)
    if (projectKey === undefined) {
      return noProject('layout')
    }
    const folded = foldedFrom(dirs)
    // No half is the Outputs half; `'changes'` is the Changes half (Story 9.3); any other is not a half.
    if (folded === null || (half !== undefined && half !== 'changes')) {
      return { ok: true as const, ignored: true as const }
    }
    try {
      store((raw) =>
        half === 'changes' ? withChangesFolded(raw, projectKey, folded) : withFolded(raw, projectKey, folded)
      )
      return { ok: true as const }
    } catch (error) {
      return unexpected('layout', error, writeDiagnostic)
    }
  })

  ipcMain.handle(LAYOUT_SET_SKILL_ROW_CHANNEL, (_event: IpcMainInvokeEvent, open: unknown) => {
    // The choice is the user's, not a project's, so no project is needed. Anything but a boolean is ignored,
    // and said once for the developer: the preload only ever sends a boolean, so anything else is a renderer bug.
    if (typeof open !== 'boolean') {
      writeDiagnostic(`layout/ignored · skill-row · ${open === null ? 'null' : typeof open}`)
      return { ok: true as const, ignored: true as const }
    }
    try {
      store((raw) => withSkillRowOpen(raw, open))
      return { ok: true as const }
    } catch (error) {
      return unexpected('layout', error, writeDiagnostic)
    }
  })

  ipcMain.handle(LAYOUT_SET_RAIL_SPLIT_CHANNEL, (_event: IpcMainInvokeEvent, share: unknown) => {
    // The share is the user's, not a project's (Story 9.3). A number strictly between 0 and 1 keeps it, `null`
    // forgets it; anything else is ignored and said once for the developer, as the skill row's is.
    if (share !== null && readShare(share) === null) {
      writeDiagnostic(`layout/ignored · rail-split · ${typeof share}`)
      return { ok: true as const, ignored: true as const }
    }
    try {
      store((raw) => withRailSplit(raw, share as number | null))
      return { ok: true as const }
    } catch (error) {
      return unexpected('layout', error, writeDiagnostic)
    }
  })
}
