import { afterAll, beforeAll, expect, it, vi } from 'vitest'

/**
 * A project path that is not a directory is a *named startup error* — it names
 * the fault on the channel the user is watching and exits non-zero.
 *
 * This lives in its own file because it depends on the module-level "use the
 * command-line argument for the first window" state being untouched, and Vitest
 * isolates module registries per file.
 */

const appHandlers = new Map<string, () => void>()
const exit = vi.fn()
const quit = vi.fn()
const showErrorBox = vi.fn()
const showOpenDialog = vi.fn()
const browserWindowConstructed = vi.fn()

vi.mock('electron', () => {
  class BrowserWindow {
    webContents = { id: 1, on() {} }
    constructor(options: unknown) {
      browserWindowConstructed(options)
    }
    on() {}
    once() {}
    show() {}
    loadURL() {}
    loadFile() {}
    static getAllWindows() {
      return []
    }
  }

  return {
    BrowserWindow,
    app: {
      whenReady: () => new Promise<void>(() => {}),
      on: (event: string, handler: () => void) => appHandlers.set(event, handler),
      quit,
      exit,
      isPackaged: false
    },
    dialog: { showOpenDialog, showErrorBox },
    ipcMain: { handle: vi.fn() }
  }
})

await import('./index')

const originalArgv = process.argv
const written: string[] = []
let restoreStderr: () => void

beforeAll(() => {
  const write = process.stderr.write.bind(process.stderr)
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    written.push(String(chunk))
    return true
  })
  restoreStderr = () => {
    spy.mockRestore()
    void write
  }
  process.argv = ['/path/to/electron', '.', '/nope/not/a/real/directory']
})

afterAll(() => {
  restoreStderr()
  process.argv = originalArgv
})

it('names the fault on stderr and exits non-zero, rather than blocking on a modal', async () => {
  appHandlers.get('window-all-closed')?.()
  await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))

  expect(written.join('')).toContain('startup/project-path-not-a-directory')
  expect(written.join('')).toContain('/nope/not/a/real/directory')

  // Not a modal, and never a silent fall back to the chooser.
  expect(showErrorBox).not.toHaveBeenCalled()
  expect(showOpenDialog).not.toHaveBeenCalled()
  expect(browserWindowConstructed).not.toHaveBeenCalled()
})
