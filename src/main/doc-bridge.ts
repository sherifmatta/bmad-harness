import { join } from 'node:path'
import { ipcMain } from 'electron'
import type { BrowserWindow, IpcMainInvokeEvent, WebContents } from 'electron'
import type { DocAck, DocReply } from '../shared/document'
import type { HarnessError } from '../shared/install'
import { documentKindFor } from './fold/document-kind'
import { createDocumentProjection } from './projections/document'
import type { DocumentProjection } from './projections/document'
import { resolveDocument } from './sources/project/resolve-document'
import { watchDocument } from './sources/project/watch-document'
import type { DocRead, DocumentWatcher } from './sources/project/watch-document'
import { openDocWindow, parentWindowFor } from './windows/doc-window'
import type { DocWindowCloseReason, DocWindowHandle } from './windows/doc-window'
import { openInEditor, revealInFinder } from './windows/macos-escapes'
import type { EscapeTarget } from './windows/macos-escapes'
import { projectPathForWebContents } from './windows/main-window'

/**
 * The channels behind the shell's `openDoc` / `onDocClosed` and the document
 * window's five methods. Exported so tests/bridge-contract.test.ts can tie each
 * to the literal in the preload that speaks it.
 */
export const DOC_OPEN_CHANNEL = 'doc:open'
export const DOC_CLOSED_CHANNEL = 'doc:closed'
export const DOC_GET_CHANNEL = 'doc:get'
export const DOC_CHANGED_CHANNEL = 'doc:changed'
export const DOC_REVEAL_CHANNEL = 'doc:reveal'
export const DOC_EDIT_CHANNEL = 'doc:open-in-editor'
export const DOC_CLOSE_CHANNEL = 'doc:close'

export type DocBridgeDeps = {
  projectPathFor?: (webContentsId: number) => string | undefined
  parentWindowFor?: (webContents: WebContents) => BrowserWindow | null
  resolve?: typeof resolveDocument
  watch?: (options: {
    fullPath: string
    boundary: string
    onRead: (read: DocRead) => void
    onError: (error: unknown) => void
  }) => DocumentWatcher
  openWindow?: typeof openDocWindow
  reveal?: (target: EscapeTarget) => void
  openInEditor?: (target: EscapeTarget) => void
  writeDiagnostic?: (line: string) => void
}

/** What one open document window is, keyed by the document page's `WebContents` id. */
type Entry = {
  projection: DocumentProjection
  watcher: DocumentWatcher | null
  handle: DocWindowHandle
  parent: BrowserWindow
  /** The row's project-relative path, which is what goes back to the rail. */
  projectRelative: string
  fullPath: string
  ready: Promise<void>
}

function failure(error: HarnessError): { ok: false; error: HarnessError } {
  return { ok: false, error }
}

const NO_PROJECT: HarnessError = {
  code: 'doc/no-project',
  message: 'doc · no project is open for this window'
}
const NO_DOCUMENT: HarnessError = {
  code: 'doc/no-document',
  message: 'doc · no document is open for this window'
}
const INVALID_PATH: HarnessError = {
  code: 'doc/invalid-path',
  message: 'doc · not a document under _bmad/'
}

/**
 * Open a document window on `doc:open`, answer it with `doc:get`, push every
 * change on `doc:changed`, and return the room on close with `doc:closed`.
 *
 * Every handler is `ipcMain.handle`, and registering them reads and starts
 * nothing: a watcher exists only while a document window does. `doc:open` is
 * answered for a project window only; the other four act on the asking
 * document window's own entry, and an unknown sender is refused. No handler
 * but `doc:open` takes an argument, and that one takes a path which is
 * validated before anything is resolved, watched or opened.
 */
export function registerDocBridge(deps: DocBridgeDeps = {}): void {
  const projectPathFor = deps.projectPathFor ?? projectPathForWebContents
  const parentOf = deps.parentWindowFor ?? parentWindowFor
  const resolve = deps.resolve ?? resolveDocument
  const watch = deps.watch ?? watchDocument
  const openWindow = deps.openWindow ?? openDocWindow
  const writeDiagnostic =
    deps.writeDiagnostic ?? ((line: string) => void process.stderr.write(`${line}\n`))
  const reveal = deps.reveal ?? ((target) => void revealInFinder(target, { writeDiagnostic }))
  const edit = deps.openInEditor ?? ((target) => void openInEditor(target, { writeDiagnostic }))

  const entries = new Map<number, Entry>()

  function entryFor(event: IpcMainInvokeEvent): Entry | undefined {
    return entries.get(event.sender.id)
  }

  /** What an escape acts on: the file, unless it now leads outside `_bmad/`. */
  function escapeTarget(entry: Entry): EscapeTarget {
    return { fullPath: entry.fullPath, refused: entry.projection.snapshot().state === 'refused' }
  }

  function closed(entry: Entry, reason: DocWindowCloseReason): void {
    entry.projection.dispose()
    void entry.watcher?.close().catch(() => {})
    entries.delete(entry.handle.sender.id)

    // Only the user's close returns the room. A replaced window is followed by
    // the next one; a window closed with its parent has nobody to tell.
    if (reason !== 'user' || entry.parent.isDestroyed()) {
      return
    }
    entry.parent.focus()
    if (!entry.parent.webContents.isDestroyed()) {
      entry.parent.webContents.send(DOC_CLOSED_CHANNEL, entry.projectRelative)
    }
  }

  ipcMain.handle(
    DOC_OPEN_CHANNEL,
    async (event: IpcMainInvokeEvent, path: unknown): Promise<DocAck> => {
      const projectRoot = projectPathFor(event.sender.id)
      if (projectRoot === undefined) {
        return failure(NO_PROJECT)
      }

      // The window, once one is made: if anything after that fails, it must not
      // be left open with nothing behind it.
      let created: DocWindowHandle | undefined
      try {
        const resolved = await resolve(projectRoot, path)
        if (!resolved.ok) {
          return failure(INVALID_PATH)
        }
        const parent = parentOf(event.sender)
        if (parent === null || parent.isDestroyed()) {
          return failure(NO_PROJECT)
        }

        // Valid, so it is a string: `resolve` refuses everything else.
        const projectRelative = path as string
        // Filled in once the window is open; a close cannot come before that.
        const made: { entry?: Entry } = {}
        const { handle, reused } = openWindow({
          parent,
          fullPath: resolved.fullPath,
          onClosed: (reason) => {
            if (made.entry !== undefined) {
              closed(made.entry, reason)
            }
          }
        })
        if (reused) {
          return { ok: true }
        }
        created = handle

        const projection = createDocumentProjection({
          path: projectRelative,
          fullPath: resolved.fullPath,
          kind: documentKindFor(projectRelative),
          refused: resolved.refused,
          onChange: (snapshot) => {
            if (!handle.sender.isDestroyed()) {
              handle.sender.send(DOC_CHANGED_CHANNEL, snapshot)
            }
          }
        })
        // A refused document is never watched, and so never read.
        const watcher = resolved.refused
          ? null
          : watch({
              fullPath: resolved.fullPath,
              boundary: join(projectRoot, '_bmad'),
              onRead: (read) => projection.apply(read),
              onError: (error) =>
                writeDiagnostic(
                  `doc/watch · ${error instanceof Error ? error.message : String(error)}`
                )
            })
        const entry: Entry = {
          projection,
          watcher,
          handle,
          parent,
          projectRelative,
          fullPath: resolved.fullPath,
          ready: projection.ready()
        }
        made.entry = entry
        entries.set(handle.sender.id, entry)
        return { ok: true }
      } catch (error) {
        created?.close()
        const name = error instanceof Error ? error.constructor.name : 'unknown'
        // The cause is for the developer's terminal only; the reply carries the
        // class name and nothing else.
        writeDiagnostic(
          `doc/unexpected · ${error instanceof Error ? error.message : String(error)}`
        )
        return failure({
          code: 'doc/unexpected',
          message: 'doc · unexpected failure',
          detail: name
        })
      }
    }
  )

  ipcMain.handle(DOC_GET_CHANNEL, async (event: IpcMainInvokeEvent): Promise<DocReply> => {
    const entry = entryFor(event)
    if (entry === undefined) {
      return failure(NO_DOCUMENT)
    }
    // The first snapshot is the watcher's own first result, held by the
    // projection. The window asks; it does not read.
    await entry.ready
    return { ok: true, snapshot: entry.projection.snapshot() }
  })

  ipcMain.handle(DOC_REVEAL_CHANNEL, (event: IpcMainInvokeEvent): DocAck => {
    const entry = entryFor(event)
    if (entry === undefined) {
      return failure(NO_DOCUMENT)
    }
    reveal(escapeTarget(entry))
    return { ok: true }
  })

  ipcMain.handle(DOC_EDIT_CHANNEL, (event: IpcMainInvokeEvent): DocAck => {
    const entry = entryFor(event)
    if (entry === undefined) {
      return failure(NO_DOCUMENT)
    }
    edit(escapeTarget(entry))
    return { ok: true }
  })

  ipcMain.handle(DOC_CLOSE_CHANNEL, (event: IpcMainInvokeEvent): DocAck => {
    const entry = entryFor(event)
    if (entry === undefined) {
      return failure(NO_DOCUMENT)
    }
    entry.handle.close()
    return { ok: true }
  })
}
