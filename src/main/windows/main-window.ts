import { basename, join } from 'node:path'
import { BrowserWindow } from 'electron'

/**
 * The project each open window was opened for, keyed by its `WebContents` id so
 * the preload's `getProjectPath` answers for the window that asked.
 */
const projectPathsByWebContents = new Map<number, string>()

/**
 * The same set of open windows read the other way round. One window per project
 * is only a boundary if something can be asked whether a project is already
 * open, and this is the thing that can be asked.
 */
const windowsByProjectPath = new Map<string, BrowserWindow>()

/** Chromium's ERR_ABORTED: a navigation cancelled or replaced, not a failure. */
const ABORTED = -3

/** The project a window was opened for, or `undefined` once it has closed. */
export function projectPathForWebContents(webContentsId: number): string | undefined {
  return projectPathsByWebContents.get(webContentsId)
}

/**
 * Open the single window for one project, or hand back the one already open for
 * it. The caller asked for that project's window; when there is one, that is
 * the answer, and a second window on the same project is not.
 */
export function createProjectWindow(projectPath: string): BrowserWindow {
  const openWindow = windowsByProjectPath.get(projectPath)
  if (openWindow !== undefined) {
    return openWindow
  }

  const window = new BrowserWindow({
    show: false,
    // `basename` is empty for a root path, which would leave the window
    // naming no project at all.
    title: basename(projectPath) || projectPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const webContentsId = window.webContents.id
  projectPathsByWebContents.set(webContentsId, projectPath)
  windowsByProjectPath.set(projectPath, window)
  // Both indexes, or the next call for this project is handed a destroyed
  // window instead of opening a live one.
  window.on('closed', () => {
    projectPathsByWebContents.delete(webContentsId)
    windowsByProjectPath.delete(projectPath)
  })

  // The window names its project; the document's own <title> does not win.
  window.on('page-title-updated', (event) => {
    event.preventDefault()
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  // The window is created hidden and shown only on `ready-to-show`. If the
  // renderer never loads — a dev server that is not running, a missing
  // `out/renderer` — that event never fires, so without this the process sits
  // alive with no window, no message and no `window-all-closed`. Ending the
  // window turns an invisible wedge into an ordinary exit that says why.
  window.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, _url, isMainFrame) => {
      // A sub-frame failure leaves the renderer itself alive, and ERR_ABORTED
      // is an ordinary superseded navigation rather than a failure to load.
      if (!isMainFrame || errorCode === ABORTED) {
        return
      }
      console.error(`renderer failed to load: ${errorDescription} (${errorCode})`)
      window.destroy()
    }
  )

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl !== undefined) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
