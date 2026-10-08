import { DEFAULT_OUTPUT_FOLDER } from '../shared/output-folder'
import type { OutputFolderRefusal } from '../shared/output-folder'
import type { FolderResolution } from './fold/output-folder'

/**
 * Each project window's output folder, kept where the bridges that read it can
 * reach it without reaching into one another (Story 5.4). The output folder
 * bridge makes a window's handle and remembers it here; the rail bridge asks it
 * which folder to watch and when that changes, and the document bridge asks it
 * which folder bounds a document it opens. The application menu reads whether
 * the window has a choice to forget.
 *
 * What is held is a fact about a project's folder and never about a session, a
 * run, a transcript or an open document window: changing it touches none.
 */

/**
 * What main holds of a window's output folder: the resolution (the folder
 * watched, BMad's own, the user's choice, what is to be said, and a folder not
 * yet there whose arrival would change the answer) and the last refused choice.
 */
export type FolderView = FolderResolution & { refusal?: OutputFolderRefusal }

export type OutputFolderHandle = {
  /** The last resolved view, or `undefined` before the first resolution. */
  view(): FolderView | undefined
  /** Resolve again from BMad's configuration, the stored choice and the disk; tells subscribers if it moved. */
  refresh(): Promise<FolderView>
  /** Hear each view that differs from the last; returns the way to stop. */
  subscribe(listener: (view: FolderView) => void): () => void
  /** Whether the project has a choice of its own to forget. */
  hasChoice(): boolean
}

const handles = new Map<number, OutputFolderHandle>()

export function rememberOutputFolder(webContentsId: number, handle: OutputFolderHandle): void {
  handles.set(webContentsId, handle)
}

/** Forget a window's handle, unless a newer one has taken its place. */
export function forgetOutputFolder(webContentsId: number, handle: OutputFolderHandle): void {
  if (handles.get(webContentsId) === handle) {
    handles.delete(webContentsId)
  }
}

export function outputFolderOf(webContentsId: number): OutputFolderHandle | undefined {
  return handles.get(webContentsId)
}

/** The folder a window's output is under now, project-relative with a trailing `/`; the default while none is known. */
export function outputFolderNameFor(webContentsId: number): string {
  return handles.get(webContentsId)?.view()?.folder ?? DEFAULT_OUTPUT_FOLDER
}

/**
 * A handle that never moves: the default folder and nothing else, with no
 * resolver and no store behind it. What a bridge holds when it is given nothing
 * to ask.
 */
export function fixedOutputFolder(): OutputFolderHandle {
  const view: FolderView = { folder: DEFAULT_OUTPUT_FOLDER }
  return {
    view: () => view,
    refresh: () => Promise.resolve(view),
    subscribe: () => () => {},
    hasChoice: () => false
  }
}
