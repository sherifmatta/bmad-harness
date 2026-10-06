import { BrowserWindow, app, ipcMain } from 'electron'
import { PROJECT_PATH_CHANNEL } from '../shared/channels'
import { defaultWriteDiagnostic } from './bridge-kit'
import { registerDocBridge } from './doc-bridge'
import { registerInstallBridge } from './install-bridge'
import { agentNameFor } from './install-model'
import { registerProjectBridge } from './project-bridge'
import { createTranscriptRegistry } from './projections/transcript'
import { registerRailBridge } from './rail-bridge'
import { registerSessionBridge } from './session-bridge'
import { installApplicationMenu } from './windows/app-menu'
import { ProjectPathError, resolveProjectPath } from './windows/choose-project'
import { createProjectWindow, projectPathForWebContents } from './windows/main-window'
import { createRunNotifier } from './windows/run-notification'

/**
 * The one channel behind the preload's `getProjectPath`. It is spelled in
 * `src/shared/channels.ts`, where the preload reads it too, and re-exported here
 * for tests/bridge-contract.test.ts.
 */
export { PROJECT_PATH_CHANNEL }

/** The command-line argument names the project for the first window only. */
let useCommandLineArgument = true

/** Guards against a second chooser while one is already open. */
let choosing = false

async function openProjectWindow(): Promise<void> {
  if (choosing) {
    return
  }
  choosing = true

  let projectPath: string | null
  try {
    projectPath = await resolveProjectPath({
      argv: process.argv,
      isPackaged: app.isPackaged,
      useArgument: useCommandLineArgument
    })
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
  } finally {
    useCommandLineArgument = false
    choosing = false
  }

  if (projectPath === null) {
    app.quit()
    return
  }

  createProjectWindow(projectPath)
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
// The rail's watcher is the one that sees a memlog change; the session side
// reads it for the notes of the run in flight.
registerRailBridge({
  observeArtifact: (sender, projectRoot, observation) =>
    void sessions.observeArtifact(sender, projectRoot, observation)
})
registerDocBridge()

app.on('before-quit', () => {
  transcripts.flushAll()
})

/**
 * Anything `openProjectWindow` did not expect. It is attached at every call
 * site: a rejection here means no window will ever open, so failing loudly and
 * non-zero beats an app sitting in the dock with nothing on screen.
 */
function reportStartupFailure(error: unknown): void {
  process.stderr.write(`startup/unexpected \u00b7 ${String(error)}\n`)
  app.exit(1)
}

app
  .whenReady()
  .then(() => {
    // Before the first window, so no window ever has Electron's default menu.
    installApplicationMenu(app.isPackaged)
    return openProjectWindow()
  })
  .catch(reportStartupFailure)

// Closing a project window returns to the chooser rather than quitting;
// cancelling the chooser quits.
app.on('window-all-closed', () => {
  openProjectWindow().catch(reportStartupFailure)
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    openProjectWindow().catch(reportStartupFailure)
  }
})
