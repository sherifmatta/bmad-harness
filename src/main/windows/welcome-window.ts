import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import type { WebContents } from 'electron'

/**
 * The Welcome (FR106): the window the harness opens before any project, and
 * each time the last project window closes. It is the one place a project is
 * chosen, so it has no project, no install and no edge to a project's files.
 *
 * It follows the document window's precedent: its own page (`welcome.html`),
 * its own preload bundle, created hidden and shown on `ready-to-show`, and
 * never navigating anywhere, so a file dropped on it cannot replace the page.
 * There is at most one: asking for it while one is open raises that one.
 *
 * Why it closed is the caller's to act on. `user` is the person closing it,
 * which quits the app (nobody chose a project, and there is nothing else to
 * show); `chosen` is the app closing it in the moment a project's window opens.
 */

export const WELCOME_WIDTH = 1080
export const WELCOME_HEIGHT = 720

export type WelcomeCloseReason = 'user' | 'chosen'

/** The page the window loads, beside the project window's `index.html`. */
const WELCOME_PAGE = 'welcome.html'

/** Chromium's ERR_ABORTED: a navigation cancelled or replaced, not a failure. */
const ABORTED = -3

type Open = { window: BrowserWindow; webContentsId: number; closeAs: (reason: WelcomeCloseReason) => void }

/** The one open Welcome, if there is one. */
let open: Open | null = null

/** Whether a `WebContents` is the Welcome's page: what the menu and the bridge ask. */
export function isWelcomeWindow(webContents: Pick<WebContents, 'id'>): boolean {
  return open !== null && open.webContentsId === webContents.id
}

/** Close the Welcome because a project opened. Nothing happens when none is open. */
export function closeWelcome(reason: 'chosen'): void {
  open?.closeAs(reason)
}

/**
 * Open the Welcome, or raise the one already open: a second is never made.
 * `onClosed` hears why it closed, once.
 */
export function openWelcome({
  onClosed
}: {
  onClosed: (reason: WelcomeCloseReason) => void
}): BrowserWindow {
  if (open !== null && !open.window.isDestroyed()) {
    open.window.show()
    open.window.focus()
    return open.window
  }

  const window = new BrowserWindow({
    show: false,
    width: WELCOME_WIDTH,
    height: WELCOME_HEIGHT,
    title: 'bmad harness',
    webPreferences: {
      preload: join(__dirname, '../preload/welcome.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const webContents = window.webContents
  let reason: WelcomeCloseReason = 'user'
  const closeAs = (why: WelcomeCloseReason): void => {
    reason = why
    if (!window.isDestroyed()) {
      window.close()
    }
  }
  const mine: Open = { window, webContentsId: webContents.id, closeAs }
  open = mine

  window.on('closed', () => {
    if (open === mine) {
      open = null
    }
    onClosed(reason)
  })

  // The window names itself; the page's own <title> does not win.
  window.on('page-title-updated', (event) => {
    event.preventDefault()
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  // The page shows a welcome and goes nowhere: no new window, no navigation,
  // and so nowhere for a dropped file to take it.
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  webContents.on('will-navigate', (event) => event.preventDefault())
  webContents.on('will-redirect', (event) => event.preventDefault())

  // Created hidden and shown on `ready-to-show`; if the page never loads, that
  // event never fires, so end the window rather than leave a wedge.
  webContents.on('did-fail-load', (_event, errorCode, errorDescription, _url, isMainFrame) => {
    if (!isMainFrame || errorCode === ABORTED) {
      return
    }
    console.error(`welcome window failed to load: ${errorDescription} (${errorCode})`)
    window.destroy()
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  const loaded =
    devServerUrl !== undefined
      ? window.loadURL(`${devServerUrl.replace(/\/$/, '')}/${WELCOME_PAGE}`)
      : window.loadFile(join(__dirname, `../renderer/${WELCOME_PAGE}`))
  // A failed load is `did-fail-load`'s to report; the rejection adds nothing.
  Promise.resolve(loaded).catch(() => {})

  return window
}
