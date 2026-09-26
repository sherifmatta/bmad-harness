import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { basename, join } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'

/**
 * The startup wiring itself: `app.whenReady()` resolving must put exactly one
 * window on screen. Deleting that block used to leave every test green while
 * the shipped app launched with nothing at all.
 *
 * `whenReady` therefore resolves here — the one test file where it does. That
 * also means the launch happens while the module is being imported, before the
 * first test body runs, so what happened is recorded in plain arrays: Vitest
 * clears `vi.fn()` call counts between the import and the first test.
 */

const appHandlers = new Map<string, () => void>()
const windowTitles: string[] = []
const choosesMade: unknown[] = []
const quits: string[] = []

/** Close every open window the way Electron does — `closed` fires, then they are gone. */
function closeAllWindows(): void {
  for (const window of constructedWindows.splice(0)) {
    for (const handler of window.closedHandlers) {
      handler()
    }
  }
  openWindows = []
}

let openWindows: unknown[] = []
/** Every window the mock has built, so closing them can be modelled faithfully. */
const constructedWindows: { closedHandlers: (() => void)[] }[] = []
let chooserAnswer: { canceled: boolean; filePaths: string[] } = {
  canceled: true,
  filePaths: []
}
let nextWebContentsId = 1

vi.mock('electron', () => {
  class BrowserWindow {
    webContents = { id: nextWebContentsId++, on() {} }
    closedHandlers: (() => void)[] = []

    constructor(options: { title: string }) {
      windowTitles.push(options.title)
      constructedWindows.push(this)
    }

    on(event: string, handler: () => void) {
      if (event === 'closed') {
        this.closedHandlers.push(handler)
      }
    }

    once() {}
    show() {}
    loadURL() {}
    loadFile() {}

    static getAllWindows() {
      return openWindows
    }
  }

  return {
    BrowserWindow,
    app: {
      whenReady: () => Promise.resolve(),
      on: (event: string, handler: () => void) => appHandlers.set(event, handler),
      quit: () => quits.push('quit'),
      exit: (code: number) => quits.push(`exit ${code}`),
      isPackaged: false
    },
    dialog: {
      showOpenDialog: (options: unknown) => {
        choosesMade.push(options)
        return Promise.resolve(chooserAnswer)
      },
      showErrorBox: vi.fn()
    },
    ipcMain: { handle: vi.fn() }
  }
})

const projectDirectory = mkdtempSync(join(tmpdir(), 'harness-startup-'))
const originalArgv = process.argv

// Read by `openProjectWindow` as soon as whenReady resolves, so it is in place
// before the module under test is imported.
process.argv = ['/path/to/electron', '.', projectDirectory]

const { projectPathForWebContents } = await import('./windows/main-window')
await import('./index')

afterAll(() => {
  process.argv = originalArgv
  rmSync(projectDirectory, { recursive: true, force: true })
})

it('opens exactly one window, for the path given on the command line', async () => {
  await vi.waitFor(() => expect(windowTitles).toHaveLength(1))

  expect(windowTitles[0]).toBe(basename(projectDirectory))
  expect(projectPathForWebContents(1)).toBe(projectDirectory)

  // The argument was supplied, so the chooser never appeared and nothing quit.
  expect(choosesMade).toHaveLength(0)
  expect(quits).toHaveLength(0)
})

it('opens nothing on activate while a window is already open', async () => {
  openWindows = [{}]

  appHandlers.get('activate')?.()
  await new Promise((resolve) => setTimeout(resolve, 20))

  expect(windowTitles).toHaveLength(1)
  expect(choosesMade).toHaveLength(0)
})

it('opens one on activate when none is open', async () => {
  // Emptying `getAllWindows()` alone would only model half a close: in Electron
  // a window that is gone has emitted `closed`, which is what releases it from
  // the one-window-per-project index. Without firing it, the next open for the
  // same project is correctly answered with the window that just went away.
  closeAllWindows()
  chooserAnswer = { canceled: false, filePaths: [projectDirectory] }

  appHandlers.get('activate')?.()
  await vi.waitFor(() => expect(windowTitles).toHaveLength(2))

  // The command-line argument named the first window only; after that it is the
  // chooser every time.
  expect(choosesMade).toHaveLength(1)
  expect(quits).toHaveLength(0)
})
