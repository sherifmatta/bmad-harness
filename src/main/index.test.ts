import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeEach, expect, it, vi } from 'vitest'

/**
 * Closing a project window returns to the chooser rather than quitting. That is
 * a decision in the spec's frozen boundaries, so it is asserted rather than
 * demonstrated by hand.
 */

const appHandlers = new Map<string, () => void>()
const showOpenDialog = vi.fn()
const quit = vi.fn()
const exit = vi.fn()
const browserWindowConstructed = vi.fn()

// The composition root's one registry: the bridge records into it and quitting flushes it.
const registry = vi.hoisted(() => ({ forProject: vi.fn(), flush: vi.fn(), flushAll: vi.fn() }))
const registerSessionBridge = vi.hoisted(() => vi.fn())
vi.mock('./projections/transcript', () => ({ createTranscriptRegistry: () => registry }))
vi.mock('./session-bridge', () => ({ registerSessionBridge }))

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
      // Never settles: the launch that happens at startup is not what this
      // test is about, and leaving it pending keeps the reopen path clean.
      whenReady: () => new Promise<void>(() => {}),
      on: (event: string, handler: () => void) => appHandlers.set(event, handler),
      quit,
      exit,
      isPackaged: false
    },
    dialog: {
      showOpenDialog: (...args: unknown[]) => showOpenDialog(...args),
      showErrorBox: vi.fn()
    },
    ipcMain: { handle: vi.fn() },
    Menu: { buildFromTemplate: (template: unknown) => template, setApplicationMenu: vi.fn() }
  }
})

await import('./index')
// Taken at import: the registration happens once, as the module loads.
const bridgeDeps = registerSessionBridge.mock.calls[0]?.[0]

const existingDirectory = mkdtempSync(join(tmpdir(), 'harness-reopen-'))
const originalArgv = process.argv

afterAll(() => {
  process.argv = originalArgv
  rmSync(existingDirectory, { recursive: true, force: true })
})

beforeEach(() => {
  showOpenDialog.mockReset()
  quit.mockReset()
  browserWindowConstructed.mockReset()
  // No positional argument, so the reopen goes through the chooser.
  process.argv = ['/path/to/electron', '.']
})

it('reopens the chooser when the last window closes, rather than quitting', async () => {
  showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [existingDirectory] })

  const windowAllClosed = appHandlers.get('window-all-closed')
  expect(windowAllClosed).toBeDefined()

  windowAllClosed?.()
  await vi.waitFor(() => expect(browserWindowConstructed).toHaveBeenCalledTimes(1))

  expect(showOpenDialog).toHaveBeenCalledTimes(1)
  expect(quit).not.toHaveBeenCalled()
})

it('quits when the reopened chooser is cancelled', async () => {
  showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

  appHandlers.get('window-all-closed')?.()
  await vi.waitFor(() => expect(quit).toHaveBeenCalledTimes(1))

  expect(browserWindowConstructed).not.toHaveBeenCalled()
})

it('hands the session bridge the registry that quitting flushes', () => {
  const beforeQuit = appHandlers.get('before-quit')

  expect(bridgeDeps).toEqual({ transcripts: registry })
  expect(beforeQuit).toBeDefined()
  expect(registry.flushAll).not.toHaveBeenCalled()

  beforeQuit?.()

  expect(registry.flushAll).toHaveBeenCalledTimes(1)
})
