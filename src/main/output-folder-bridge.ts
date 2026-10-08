import { realpathSync, statSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron'
import { OUTPUT_FOLDER_CHOOSE_CHANNEL } from '../shared/channels'
import type { ChooseOutcome, OutputFolderReply, OutputFolderRefusal } from '../shared/output-folder'
import { defaultProjectPathFor, defaultWriteDiagnostic, noProject, senderOf, unexpected } from './bridge-kit'
import type { Sender } from './bridge-kit'
import {
  bmadFolderOf,
  checkChoice,
  choiceFor,
  resolveOutputFolder,
  withChoice
} from './fold/output-folder'
import type { DiskState } from './fold/output-folder'
import { forgetOutputFolder, rememberOutputFolder } from './output-folder-model'
import type { FolderView, OutputFolderHandle } from './output-folder-model'
import { createInstallSource } from './sources/install/resolvers'
import type { InstallSource } from './sources/install/resolvers'
import {
  outputFoldersFilePath,
  readOutputFoldersFile,
  writeOutputFoldersFile
} from './sources/persistence/output-folder-file'
import { chooseOutputDirectory } from './windows/choose-project'
import { parentWindowFor } from './windows/doc-window'

/**
 * The one channel behind the preload's `chooseOutputFolder`. Exported so
 * tests/bridge-contract.test.ts can tie it to the preload's own literal.
 */
export { OUTPUT_FOLDER_CHOOSE_CHANNEL }

export type OutputFolderBridgeDeps = {
  /** The app's own data directory, read on first use: the choice is stored beside the other bookkeeping, never in the project. */
  userDataPath: () => string
  projectPathFor?: (webContentsId: number) => string | undefined
  createSource?: (projectRoot: string) => InstallSource
  /** The native chooser; `null` is cancelled. */
  chooseDirectory?: (parent: BrowserWindow | null, defaultPath: string) => Promise<string | null>
  parentWindowFor?: (sender: Sender) => BrowserWindow | null
  /** The real path of a folder, or the errno that stopped it. Injectable so a test needs no filesystem. */
  realPath?: (path: string) => Promise<string>
  writeDiagnostic?: (line: string) => void
}

/** What the rest of main asks of the output folders of its windows. */
export type OutputFolderService = {
  /** A window's handle, made on first ask and the same one after. */
  handleFor(sender: Sender, projectRoot: string): OutputFolderHandle
  /** Whether a window has an output folder to act on yet (its rail has asked). */
  ready(webContentsId: number): boolean
  /** Open the chooser for a window's project and keep what it picked, if it may be kept. */
  choose(webContentsId: number): Promise<ChooseOutcome>
  /** Forget a window's project's choice: the rail returns to BMad's folder. */
  forget(webContentsId: number): void
  /** Whether a window's project has a choice to forget. */
  hasChoice(webContentsId: number): boolean
  /** Hear that a window's folder has a handle or has changed, so the menu can follow. */
  onChanged(listener: (webContentsId: number) => void): void
}

/**
 * Hold each project window's output folder and answer the request to choose one.
 *
 * The folder is derived, never asked: the stored choice, else BMad's own
 * `core.output_folder` through its resolver, else the install's folder (the fold
 * decides, over what is on disk). The choice is the user's override, offered
 * through the head's `change…` and the project window's File menu, checked on
 * real paths before it is kept, and kept per project under `userData`. Nothing
 * is written into the project and nothing a session, run or open document holds
 * is touched.
 */
export function registerOutputFolderBridge(deps: OutputFolderBridgeDeps): OutputFolderService {
  const projectPathFor = deps.projectPathFor ?? defaultProjectPathFor
  const createSource = deps.createSource ?? ((projectRoot) => createInstallSource({ projectRoot }))
  const chooseDirectory = deps.chooseDirectory ?? chooseOutputDirectory
  const parentOf =
    deps.parentWindowFor ?? ((sender: Sender) => parentWindowFor(sender as unknown as WebContents))
  const realPath = deps.realPath ?? ((path: string) => realpath(path))
  const writeDiagnostic = deps.writeDiagnostic ?? defaultWriteDiagnostic

  type Entry = { handle: OutputFolderHandle; sender: Sender; projectRoot: string; choose(): Promise<ChooseOutcome>; forget(): void }
  const entries = new Map<number, Entry>()
  const changed: ((webContentsId: number) => void)[] = []

  const filePath = (): string => outputFoldersFilePath(deps.userDataPath())

  function entryFor(sender: Sender, projectRoot: string): Entry {
    const existing = entries.get(sender.id)
    if (existing !== undefined) {
      return existing
    }

    const source = createSource(projectRoot)
    const listeners = new Set<(view: FolderView) => void>()
    let view: FolderView | undefined
    let refusal: OutputFolderRefusal | undefined
    let refusals = 0
    let choosing = false
    let tail: Promise<unknown> = Promise.resolve()

    /** How a project-relative folder stands on disk, judged on real paths. */
    function onDisk(realProject: string, folder: string): DiskState {
      let real: string
      try {
        real = realpathSync(join(projectRoot, folder))
      } catch (error) {
        const code = (error as { code?: unknown }).code
        return code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unusable'
      }
      try {
        if (!statSync(real).isDirectory()) {
          return 'missing'
        }
      } catch {
        return 'missing'
      }
      return checkChoice(realProject, real).ok ? 'usable' : 'unusable'
    }

    async function resolveNow(): Promise<FolderView> {
      // A failure, or an answer of the wrong shape, leaves BMad's folder unknown and says nothing new.
      const asked = await source.resolveOutputFolder().catch(() => undefined)
      const bmad =
        asked?.ok === true && asked.folder !== null ? (bmadFolderOf(asked.folder, projectRoot) ?? undefined) : undefined
      const realProject = await realPath(projectRoot).catch(() => projectRoot)
      const next: FolderView = {
        ...resolveOutputFolder({
          stored: choiceFor(readOutputFoldersFile(filePath()), projectRoot),
          bmad,
          onDisk: (folder) => onDisk(realProject, folder)
        }),
        ...(refusal === undefined ? {} : { refusal })
      }
      const moved = view === undefined || JSON.stringify(view) !== JSON.stringify(next)
      view = next
      if (moved) {
        for (const listener of [...listeners]) {
          listener(next)
        }
        for (const listener of changed) {
          listener(sender.id)
        }
      }
      return next
    }

    /** One resolution at a time, in the order asked: a late answer never overwrites a newer one. */
    function refresh(): Promise<FolderView> {
      const next = tail.then(resolveNow, resolveNow)
      tail = next
      return next
    }

    const handle: OutputFolderHandle = {
      view: () => view,
      refresh,
      subscribe(listener) {
        listeners.add(listener)
        return () => void listeners.delete(listener)
      },
      hasChoice: () => view?.chosen !== undefined
    }

    function store(folder: string | null): void {
      const path = filePath()
      const outcome = writeOutputFoldersFile(path, withChoice(readOutputFoldersFile(path), projectRoot, folder))
      if (!outcome.ok) {
        // The choice still applies from the next resolution only if it was kept; say so for the developer.
        writeDiagnostic(`output-folder/unwritten · ${outcome.errno}`)
      }
    }

    async function choose(): Promise<ChooseOutcome> {
      if (choosing) {
        return { kind: 'cancelled' }
      }
      choosing = true
      try {
        const now = view ?? (await refresh())
        const picked = await chooseDirectory(parentOf(sender), join(projectRoot, now.folder))
        if (picked === null) {
          refusal = undefined
          await refresh()
          return { kind: 'cancelled' }
        }
        let verdict: ReturnType<typeof checkChoice>
        try {
          verdict = checkChoice(await realPath(projectRoot), await realPath(picked))
        } catch {
          // What cannot be shown to be inside the project is outside it.
          verdict = { ok: false, reason: 'outside this project' }
        }
        if (!verdict.ok) {
          refusal = { reason: verdict.reason, seq: ++refusals }
          await refresh()
          return { kind: 'refused', reason: verdict.reason }
        }
        refusal = undefined
        store(verdict.folder)
        await refresh()
        return { kind: 'chosen' }
      } finally {
        choosing = false
      }
    }

    function forget(): void {
      refusal = undefined
      store(null)
      void refresh()
    }

    const entry: Entry = { handle, sender, projectRoot, choose, forget }
    entries.set(sender.id, entry)
    rememberOutputFolder(sender.id, handle)
    sender.once('destroyed', () => {
      forgetOutputFolder(sender.id, handle)
      entries.delete(sender.id)
      listeners.clear()
      // The menu follows: a window that is gone has no folder to act on.
      for (const listener of changed) {
        listener(sender.id)
      }
    })
    for (const listener of changed) {
      listener(sender.id)
    }
    return entry
  }

  ipcMain.handle(
    OUTPUT_FOLDER_CHOOSE_CHANNEL,
    async (event: IpcMainInvokeEvent): Promise<OutputFolderReply> => {
      const sender = senderOf(event)
      const projectRoot = projectPathFor(sender.id)
      if (projectRoot === undefined) {
        return noProject('output-folder')
      }
      try {
        return { ok: true, outcome: await entryFor(sender, projectRoot).choose() }
      } catch (error) {
        return unexpected('output-folder', error, writeDiagnostic)
      }
    }
  )

  return {
    handleFor: (sender, projectRoot) => entryFor(sender, projectRoot).handle,
    ready: (webContentsId) => entries.has(webContentsId),
    choose: (webContentsId) => entries.get(webContentsId)?.choose() ?? Promise.resolve({ kind: 'cancelled' }),
    forget: (webContentsId) => entries.get(webContentsId)?.forget(),
    hasChoice: (webContentsId) => entries.get(webContentsId)?.handle.hasChoice() ?? false,
    onChanged: (listener) => void changed.push(listener)
  }
}
