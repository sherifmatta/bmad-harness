import { afterAll, expect, it, vi } from 'vitest'

/**
 * Launching with no project path opens the Welcome and nothing else: the one
 * window, and no native dialog. A dialog stub that fails the test if it is
 * called is the proof that the old path (a chooser before any window existed,
 * which quit when cancelled) is gone.
 *
 * Its own file for the reason `startup.test.ts` is one: the launch is a thing
 * that happens as `whenReady` settles, with the argv in place beforehand.
 */

const constructed: { options: Record<string, unknown> }[] = []
const quits: string[] = []
const menus: unknown[] = []
const showOpenDialog = vi.fn(() => {
  throw new Error('a native dialog must not open at launch')
})

vi.mock('electron', () => {
  class BrowserWindow {
    options: Record<string, unknown>
    webContents = { id: 1, on() {}, setWindowOpenHandler() {} }
    constructor(options: Record<string, unknown>) {
      this.options = options
      constructed.push(this)
    }
    on() {}
    once() {}
    show() {}
    focus() {}
    isDestroyed() {
      return false
    }
    loadURL() {}
    loadFile() {}
    static getAllWindows() {
      return []
    }
  }

  return {
    BrowserWindow,
    app: {
      whenReady: () => Promise.resolve(),
      on: () => {},
      quit: () => quits.push('quit'),
      exit: (code: number) => quits.push(`exit ${code}`),
      getPath: () => '/nowhere',
      isPackaged: false
    },
    dialog: { showOpenDialog, showErrorBox: vi.fn() },
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    nativeTheme: { themeSource: 'system', shouldUseDarkColors: true, on: vi.fn() },
    Menu: {
      buildFromTemplate: (template: unknown) => template,
      setApplicationMenu: (menu: unknown) => menus.push(menu)
    }
  }
})

const originalArgv = process.argv
process.argv = ['/path/to/electron', '.']
await import('./index')

afterAll(() => {
  process.argv = originalArgv
})

it('opens the Welcome, 1080 by 720, and no dialog, when there is no project path', async () => {
  await vi.waitFor(() => expect(constructed).toHaveLength(1))

  expect(constructed[0].options).toMatchObject({ width: 1080, height: 720, title: 'bmad harness' })
  expect(showOpenDialog).not.toHaveBeenCalled()
  expect(quits).toEqual([])
})

it('opens it with the sandbox and context isolation on, node off, and its own preload', () => {
  const { webPreferences } = constructed[0].options as {
    webPreferences: { preload: string; contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean }
  }

  expect(webPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true })
  expect(webPreferences.preload).toMatch(/preload[\\/]welcome\.js$/)
})

it('installs the menu once, before the Welcome', () => {
  expect(menus).toHaveLength(1)
})
