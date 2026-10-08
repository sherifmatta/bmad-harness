import { afterAll, beforeAll, expect, it, vi } from 'vitest'

/**
 * A project path that is not a directory is a *named startup error* — it names
 * the fault on the channel the user is watching and exits non-zero, with no
 * window and no dialog, and no Welcome either.
 *
 * This lives in its own file because the launch happens as `whenReady`
 * settles, and Vitest isolates module registries per file.
 */

const exit = vi.fn()
const quit = vi.fn()
const showErrorBox = vi.fn()
const showOpenDialog = vi.fn()
const browserWindowConstructed = vi.fn()
const ready = vi.hoisted(() => ({ release: () => {} }))

vi.mock('electron', () => {
  class BrowserWindow {
    webContents = { id: 1, on() {}, setWindowOpenHandler() {} }
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
      whenReady: () => new Promise<void>((resolve) => (ready.release = resolve)),
      on: () => {},
      quit,
      exit,
      getPath: () => '/nowhere',
      isPackaged: false
    },
    dialog: { showOpenDialog, showErrorBox },
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    nativeTheme: { themeSource: 'system', shouldUseDarkColors: true, on: vi.fn() },
    Menu: { buildFromTemplate: (template: unknown) => template, setApplicationMenu: vi.fn() }
  }
})

await import('./index')

const originalArgv = process.argv
const written: string[] = []
let restoreStderr: () => void

beforeAll(() => {
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    written.push(String(chunk))
    return true
  })
  restoreStderr = () => spy.mockRestore()
  process.argv = ['/path/to/electron', '.', '/nope/not/a/real/directory']
})

afterAll(() => {
  restoreStderr()
  process.argv = originalArgv
})

it('names the fault on stderr and exits non-zero, rather than blocking on a modal', async () => {
  ready.release()
  await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1))

  expect(written.join('')).toContain('startup/project-path-not-a-directory')
  expect(written.join('')).toContain('/nope/not/a/real/directory')

  // Not a modal, no window of any kind, and never a silent fall back to the Welcome.
  expect(showErrorBox).not.toHaveBeenCalled()
  expect(showOpenDialog).not.toHaveBeenCalled()
  expect(browserWindowConstructed).not.toHaveBeenCalled()
  expect(quit).not.toHaveBeenCalled()
})
