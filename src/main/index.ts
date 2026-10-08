import { BrowserWindow, app, ipcMain } from 'electron'
import { PROJECT_PATH_CHANNEL } from '../shared/channels'
import { defaultWriteDiagnostic } from './bridge-kit'
import { registerDocBridge } from './doc-bridge'
import { registerInstallBridge } from './install-bridge'
import { registerOutputFolderBridge } from './output-folder-bridge'
import { agentNameFor } from './install-model'
import { registerProjectBridge } from './project-bridge'
import { createTranscriptRegistry } from './projections/transcript'
import { registerRailBridge } from './rail-bridge'
import { registerSessionBridge } from './session-bridge'
import { createThemeStore, registerThemeBridge } from './theme-bridge'
import { createRecentList, registerWelcomeBridge } from './welcome-bridge'
import { installApplicationMenu } from './windows/app-menu'
import type { OutputFolderMenu } from './windows/app-menu'
import { ProjectPathError, resolveProjectPath } from './windows/choose-project'
import {
  createProjectWindow,
  isProjectOpen,
  projectPathForWebContents,
  raiseProjectWindow
} from './windows/main-window'
import { createRunNotifier } from './windows/run-notification'
import { closeWelcome, openWelcome } from './windows/welcome-window'

/**
 * The one channel behind the preload's `getProjectPath`. It is spelled in
 * `src/shared/channels.ts`, where the preload reads it too, and re-exported here
 * for tests/bridge-contract.test.ts.
 */
export { PROJECT_PATH_CHANNEL }

/**
 * Set once the app is on its way out, so that a window closing on the way does
 * not raise the Welcome again: the last one to close would otherwise be met by
 * `window-all-closed`, which opens the Welcome whenever no window is left.
 */
let quitting = false

/**
 * Open a project: its window is made, or the one already open for it is raised
 * and never doubled. The project is recorded as recent, whichever way it was
 * chosen, and the Welcome closes in the same step, so it never stays open
 * behind a project. The window exists before the Welcome closes, so closing it
 * is never the moment the app has no window.
 */
function openProject(projectPath: string): void {
  const alreadyOpen = isProjectOpen(projectPath)
  const window = createProjectWindow(projectPath)
  if (alreadyOpen) {
    raiseProjectWindow(window)
  }
  recent.record(projectPath)
  closeWelcome('chosen')
}

/**
 * Open the Welcome, or raise it: never a second. Closing it by the user quits
 * the app, because no project was chosen and there is nothing else to show;
 * closing it because a project opened does not.
 */
function openWelcomeWindow(): void {
  openWelcome({
    onClosed: (reason) => {
      if (reason === 'user') {
        quitting = true
        app.quit()
      }
    }
  })
}

/**
 * The first window: the project the command line names, or the Welcome. The
 * path is for this launch's first window only, which is what running this
 * once, here, is.
 */
function openFirstWindow(): void {
  let projectPath: string | null
  try {
    projectPath = resolveProjectPath({ argv: process.argv, isPackaged: app.isPackaged })
  } catch (error) {
    if (error instanceof ProjectPathError) {
      // A ProjectPathError can only come from a command-line argument, so the
      // terminal is the channel the user is watching. A modal here blocks a
      // `npm run dev -- <typo>` forever instead of failing it.
      process.stderr.write(`${error.code} · ${error.message}\n`)
      app.exit(1)
      return
    }
    throw error
  }

  if (projectPath === null) {
    openWelcomeWindow()
  } else {
    openProject(projectPath)
  }
}

ipcMain.handle(PROJECT_PATH_CHANNEL, (event) => {
  const projectPath = projectPathForWebContents(event.sender.id)
  if (projectPath === undefined) {
    throw new Error('no project is open for this window')
  }
  return projectPath
})

registerInstallBridge()
registerProjectBridge()
// The conversations under `userData`, flushed when the app quits so nothing a
// scheduled write had yet to reach is lost. `userData` is read on first use.
const transcripts = createTranscriptRegistry({ userDataPath: () => app.getPath('userData') })
// A run that ends while its window is unfocused is told once, outside the
// window, by the one module in `windows/` that may speak to the OS for it.
const sessions = registerSessionBridge({
  transcripts,
  told: createRunNotifier({ agentName: agentNameFor, writeDiagnostic: defaultWriteDiagnostic }).told
})
// Each project window's output folder (Story 5.4): derived from BMad's own
// configuration, overridden by the user's choice, which is stored under `userData`
// and never in the project. The rail watches it, and the menu's File chooses it.
const outputFolders = registerOutputFolderBridge({ userDataPath: () => app.getPath('userData') })
// The rail's watcher is the one that sees a memlog change; the session side
// reads it for the notes of the run in flight.
registerRailBridge({
  outputFolder: outputFolders.handleFor,
  observeArtifact: (sender, projectRoot, observation) =>
    void sessions.observeArtifact(sender, projectRoot, observation)
})
registerDocBridge()
// The recent list is the app's own bookkeeping under `userData`, read on first use.
const recent = createRecentList({ userDataPath: () => app.getPath('userData') })
const welcome = registerWelcomeBridge({ recent, openProject })
// The theme is main's alone: one stored choice, read on start and told to every
// window. The menu and the Welcome's line both choose through this controller.
const theme = registerThemeBridge({ store: createThemeStore({ userDataPath: () => app.getPath('userData') }) })

app.on('before-quit', () => {
  quitting = true
  transcripts.flushAll()
})

/**
 * What the Welcome's *Open Project Folder…* does. Not a startup failure when it
 * fails: the app is running, so a chooser that failed is said on stderr, in one
 * line, and the Welcome stays as it was.
 */
function chooseFolderFromMenu(): void {
  welcome.chooseFolder().catch((error: unknown) => {
    process.stderr.write(`welcome/choose-failed \u00b7 ${String(error)}\n`)
  })
}

/** What the project menu's File does for a window: the chooser, or the choice forgotten. A failed chooser is said on stderr, in one line. */
const outputFolderMenu: OutputFolderMenu = {
  ready: outputFolders.ready,
  hasChoice: outputFolders.hasChoice,
  choose: (webContentsId) => {
    outputFolders.choose(webContentsId).catch((error: unknown) => {
      process.stderr.write(`output-folder/choose-failed \u00b7 ${String(error)}\n`)
    })
  },
  forget: outputFolders.forget,
  onChanged: outputFolders.onChanged
}

/**
 * Anything startup did not expect. It is attached at every call site: a
 * rejection here means no window will ever open, so failing loudly and non-zero
 * beats an app sitting in the dock with nothing on screen.
 */
function reportStartupFailure(error: unknown): void {
  process.stderr.write(`startup/unexpected \u00b7 ${String(error)}\n`)
  app.exit(1)
}

app
  .whenReady()
  .then(() => {
    // The stored theme is applied before any window or menu exists, so no window
    // is ever painted in the other theme first and the menu's check starts right.
    theme.start()
    // Before the first window, so no window ever has Electron's default menu.
    installApplicationMenu(app.isPackaged, chooseFolderFromMenu, theme, outputFolderMenu)
    openFirstWindow()
  })
  .catch(reportStartupFailure)

// Closing the last project window returns to the Welcome rather than quitting;
// the Welcome is how the app is left, and closing it quits.
app.on('window-all-closed', () => {
  if (!quitting) {
    openWelcomeWindow()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    openWelcomeWindow()
  }
})
