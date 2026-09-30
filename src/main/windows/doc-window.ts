import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'
import type { DocSnapshot } from '../../shared/document'

/**
 * The document window (FR55, UX-DR27): a separate OS window over the project
 * window, reading one file under `_bmad/` without taking the room away.
 *
 * The OS window is only the stage. It is **frameless, transparent and
 * non-resizable**, a child of the project window, and it is kept exactly over
 * the parent's content bounds; the page inside paints the scrim and the window
 * card. That is how a scrim, an 8px radius and the one true shadow exist inside
 * a separate OS window, and how the room stays visible, untouched, behind it.
 *
 * `Esc` is caught here, in main, by `before-input-event`, so it closes the
 * window wherever DOM focus happens to be. The page navigates nowhere and opens
 * nothing. There is at most one document window per project window: asking for
 * the file already open focuses it, asking for another replaces it.
 */

/**
 * Why a window closed. `user`: `Esc`, *Close* or the OS. `replaced`: another
 * document was opened over it. `parent`: the project window went away.
 */
export type DocWindowCloseReason = 'user' | 'replaced' | 'parent'

/** The parts of the document page's `WebContents` the bridge touches. */
export type DocSender = {
  id: number
  send(channel: string, snapshot: DocSnapshot): void
  isDestroyed(): boolean
  once(event: 'destroyed', listener: () => void): unknown
}

export type DocWindowHandle = {
  /** The document page: what `doc:get` is asked from and `doc:changed` goes to. */
  sender: DocSender
  fullPath: string
  focus(): void
  /** Close it as the user would. */
  close(): void
}

/** The page the window loads, beside the project window's `index.html`. */
const DOC_PAGE = 'doc.html'

/** Chromium's ERR_ABORTED: a navigation cancelled or replaced, not a failure. */
const ABORTED = -3

type Opened = { handle: DocWindowHandle; closeAs: (reason: DocWindowCloseReason) => void }

/** The one open document window of each project window, keyed by the parent's `WebContents` id. */
const openByParent = new Map<number, Opened>()

/** The window a `WebContents` belongs to, if it still has one. */
export function parentWindowFor(webContents: WebContents): BrowserWindow | null {
  return BrowserWindow.fromWebContents(webContents)
}

export function openDocWindow({
  parent,
  fullPath,
  onClosed
}: {
  parent: BrowserWindow
  fullPath: string
  onClosed: (reason: DocWindowCloseReason) => void
}): { handle: DocWindowHandle; reused: boolean } {
  const parentId = parent.webContents.id

  const existing = openByParent.get(parentId)
  if (existing !== undefined) {
    if (existing.handle.fullPath === fullPath) {
      existing.handle.focus()
      return { handle: existing.handle, reused: true }
    }
    // Replaced, not closed by the user: nothing is told the room was returned.
    existing.closeAs('replaced')
  }

  const window = new BrowserWindow({
    parent,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    title: fullPath,
    ...parent.getContentBounds(),
    webPreferences: {
      preload: join(__dirname, '../preload/doc.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const webContents = window.webContents
  let reason: DocWindowCloseReason = 'user'
  let closing = false

  const closeAs = (why: DocWindowCloseReason): void => {
    if (closing) {
      return
    }
    closing = true
    reason = why
    if (!window.isDestroyed()) {
      window.close()
    }
  }

  const handle: DocWindowHandle = {
    sender: webContents as unknown as DocSender,
    fullPath,
    focus() {
      if (!window.isDestroyed()) {
        window.show()
        window.focus()
      }
    },
    close: () => closeAs('user')
  }
  const opened: Opened = { handle, closeAs }
  openByParent.set(parentId, opened)

  // The stage follows the parent's content area, so the card stays centred.
  const fit = (): void => {
    if (!window.isDestroyed() && !parent.isDestroyed()) {
      window.setBounds(parent.getContentBounds())
    }
  }
  const onParentClose = (): void => closeAs('parent')
  const onParentClosed = (): void => {
    if (!window.isDestroyed()) {
      window.destroy()
    }
  }
  parent.on('move', fit)
  parent.on('resize', fit)
  parent.on('close', onParentClose)
  parent.on('closed', onParentClosed)

  window.on('closed', () => {
    parent.removeListener('move', fit)
    parent.removeListener('resize', fit)
    parent.removeListener('close', onParentClose)
    parent.removeListener('closed', onParentClosed)
    if (openByParent.get(parentId) === opened) {
      openByParent.delete(parentId)
    }
    onClosed(reason)
  })

  // The window names its file; the page's own <title> does not win.
  window.on('page-title-updated', (event) => {
    event.preventDefault()
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  // `Esc`, unmodified, closes the window from anywhere inside it.
  webContents.on('before-input-event', (event, input) => {
    if (
      input.type === 'keyDown' &&
      input.key === 'Escape' &&
      !input.shift &&
      !input.control &&
      !input.alt &&
      !input.meta
    ) {
      event.preventDefault()
      closeAs('user')
    }
  })

  // The page shows a file and goes nowhere: no new window, no navigation.
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  webContents.on('will-navigate', (event) => event.preventDefault())
  webContents.on('will-redirect', (event) => event.preventDefault())

  // Created hidden and shown on `ready-to-show`; if the page never loads, that
  // event never fires, so end the window rather than leave a wedge.
  webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === ABORTED) {
      return
    }
    console.error(`document window failed to load: ${errorDescription} (${errorCode})`)
    window.destroy()
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  const loaded =
    devServerUrl !== undefined
      ? window.loadURL(`${devServerUrl.replace(/\/$/, '')}/${DOC_PAGE}`)
      : window.loadFile(join(__dirname, `../renderer/${DOC_PAGE}`))
  // A failed load is `did-fail-load`'s to report; the rejection adds nothing.
  Promise.resolve(loaded).catch(() => {})

  return { handle, reused: false }
}
