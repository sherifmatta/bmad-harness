import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename } from 'node:path'
import { ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import {
  WELCOME_CHOOSE_CHANNEL,
  WELCOME_OPEN_DROPPED_CHANNEL,
  WELCOME_OPEN_RECENT_CHANNEL,
  WELCOME_RECENT_CHANNEL
} from '../shared/channels'
import type { OpenAck, RecentRow } from '../shared/welcome'
import { defaultWriteDiagnostic } from './bridge-kit'
import { displayParent, parseRecent, recentName, recordRecent } from './fold/recent-projects'
import type { RecentEntry } from './fold/recent-projects'
import { readRecentFile, recentFilePath, writeRecentFile } from './sources/persistence/recent-file'
import { chooseProjectDirectory } from './windows/choose-project'
import { isWelcomeWindow } from './windows/welcome-window'

/**
 * The channels behind the Welcome's four methods. Exported so
 * tests/bridge-contract.test.ts can tie each to the literal in the preload that
 * speaks it.
 */
export {
  WELCOME_CHOOSE_CHANNEL,
  WELCOME_OPEN_DROPPED_CHANNEL,
  WELCOME_OPEN_RECENT_CHANNEL,
  WELCOME_RECENT_CHANNEL
}

/** What is at a path, as far as the Welcome cares: a folder, or anything else. */
export type FolderCheck = (path: string) => 'folder' | 'other'

/** The real check: a stat that follows links, and a failure of any kind is `other`. */
export function checkFolder(path: string): 'folder' | 'other' {
  try {
    return statSync(path).isDirectory() ? 'folder' : 'other'
  } catch {
    return 'other'
  }
}

/**
 * The recent list as the app holds it: read from its file whenever it is asked
 * for, so a list another launch wrote is the list shown, and recorded to the
 * file on every project that opens, by any route. `userData` is read on first
 * use, never at construction, because the app is not ready until later.
 */
export type RecentList = {
  read(): RecentEntry[]
  record(path: string): void
}

export function createRecentList({
  userDataPath,
  now = Date.now,
  writeDiagnostic = defaultWriteDiagnostic
}: {
  userDataPath: () => string
  now?: () => number
  writeDiagnostic?: (line: string) => void
}): RecentList {
  const read = (): RecentEntry[] => parseRecent(readRecentFile(recentFilePath(userDataPath())))

  return {
    read,
    record(path) {
      const outcome = writeRecentFile(recentFilePath(userDataPath()), recordRecent(read(), path, now()))
      if (!outcome.ok) {
        // The list is a convenience: failing to keep it never fails an open.
        writeDiagnostic(`welcome/recent-unwritten · ${outcome.errno}`)
      }
    }
  }
}

export type WelcomeBridgeDeps = {
  recent: RecentList
  /** Open (or raise) a project's window and close the Welcome. */
  openProject: (path: string) => void
  /** The native chooser; `null` is cancelled. */
  chooseDirectory?: () => Promise<string | null>
  isWelcomeSender?: (webContentsId: number) => boolean
  checkFolder?: FolderCheck
  home?: string
}

export type WelcomeBridge = {
  /**
   * Choose a folder and open it: the Welcome's button and its menu's `⌘O` are
   * both this, so they are one single-flight. `busy` is a chooser already open.
   */
  chooseFolder(): Promise<'opened' | 'cancelled' | 'busy'>
}

/** The refusal for a sender that is not the Welcome, or a request that makes no sense. */
const REFUSED: OpenAck = { ok: false }

/**
 * Answer the Welcome's four requests. Every handler refuses a sender that is
 * not the Welcome window, and none takes more than a path the Welcome was shown
 * or was handed by a drop, which is checked here before anything opens: the
 * page never touches the filesystem, and a path it names is trusted for
 * nothing. Registering reads and starts nothing.
 */
export function registerWelcomeBridge(deps: WelcomeBridgeDeps): WelcomeBridge {
  const { recent, openProject } = deps
  const chooseDirectory = deps.chooseDirectory ?? chooseProjectDirectory
  const isWelcomeSender = deps.isWelcomeSender ?? ((id: number) => isWelcomeWindow({ id }))
  const folderAt = deps.checkFolder ?? checkFolder
  const home = deps.home ?? homedir()

  let choosing = false

  async function chooseFolder(): Promise<'opened' | 'cancelled' | 'busy'> {
    if (choosing) {
      return 'busy'
    }
    choosing = true
    try {
      const chosen = await chooseDirectory()
      if (chosen === null || folderAt(chosen) !== 'folder') {
        return 'cancelled'
      }
      openProject(chosen)
      return 'opened'
    } finally {
      choosing = false
    }
  }

  ipcMain.handle(WELCOME_RECENT_CHANNEL, (event: IpcMainInvokeEvent): RecentRow[] => {
    if (!isWelcomeSender(event.sender.id)) {
      return []
    }
    // Each folder is statted and that is all: no resolver, `claude` or `uv`.
    return recent.read().map(({ path, openedAt }) => ({
      path,
      name: recentName(path),
      parent: displayParent(path, home),
      openedAt,
      exists: folderAt(path) === 'folder'
    }))
  })

  ipcMain.handle(WELCOME_CHOOSE_CHANNEL, async (event: IpcMainInvokeEvent): Promise<OpenAck> => {
    if (!isWelcomeSender(event.sender.id)) {
      return REFUSED
    }
    return (await chooseFolder()) === 'opened' ? { ok: true } : REFUSED
  })

  ipcMain.handle(
    WELCOME_OPEN_RECENT_CHANNEL,
    (event: IpcMainInvokeEvent, path: unknown): OpenAck => {
      if (!isWelcomeSender(event.sender.id)) {
        return REFUSED
      }
      // Only a folder the list holds: the page cannot open an arbitrary path
      // by calling this, only one it was shown.
      if (typeof path !== 'string' || !recent.read().some((entry) => entry.path === path)) {
        return REFUSED
      }
      if (folderAt(path) !== 'folder') {
        return REFUSED
      }
      openProject(path)
      return { ok: true }
    }
  )

  ipcMain.handle(
    WELCOME_OPEN_DROPPED_CHANNEL,
    (event: IpcMainInvokeEvent, paths: unknown): OpenAck => {
      if (!isWelcomeSender(event.sender.id)) {
        return REFUSED
      }
      if (!Array.isArray(paths) || paths.length === 0 || !paths.every((p) => typeof p === 'string' && p !== '')) {
        return REFUSED
      }
      const dropped = paths as string[]
      if (dropped.length === 1 && folderAt(dropped[0]) === 'folder') {
        openProject(dropped[0])
        return { ok: true }
      }
      // Nothing opens. The line names what was dropped: the first item that
      // is not a folder, or the first when every item is one (several folders).
      const named = dropped.find((path) => folderAt(path) !== 'folder') ?? dropped[0]
      return { ok: false, name: basename(named) || named }
    }
  )

  return { chooseFolder }
}
