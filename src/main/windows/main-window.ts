import { basename, join } from 'node:path'
import { BrowserWindow } from 'electron'

/**
 * One window per project, keyed by its `WebContents` id so the preload's
 * `getProjectPath` answers for the window that asked.
 */
const projectPathsByWebContents = new Map<number, string>()

/** The project a window was opened for, or `undefined` once it has closed. */
export function projectPathForWebContents(webContentsId: number): string | undefined {
  return projectPathsByWebContents.get(webContentsId)
}

/** Open the single window for one project. */
export function createProjectWindow(projectPath: string): BrowserWindow {
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
  window.on('closed', () => {
    projectPathsByWebContents.delete(webContentsId)
  })

  // The window names its project; the document's own <title> does not win.
  window.on('page-title-updated', (event) => {
    event.preventDefault()
  })

  window.once('ready-to-show', () => {
    window.show()
  })

  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl !== undefined) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}
