import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeEach, expect, it, vi } from 'vitest'

/**
 * Closing the last project window returns to the Welcome rather than quitting,
 * and closing the Welcome quits. Those are decisions in the spec's frozen
 * boundaries, so they are asserted rather than demonstrated by hand.
 */

const appHandlers = new Map<string, () => void>()
const showOpenDialog = vi.fn()
const openWelcome = vi.hoisted(() => vi.fn<(deps: { onClosed: (reason: 'user' | 'chosen') => void }) => void>())
const quit = vi.fn()
const exit = vi.fn()
const browserWindowConstructed = vi.fn()

// The composition root's one registry: the bridge records into it and quitting flushes it.
const registry = vi.hoisted(() => ({ forProject: vi.fn(), flush: vi.fn(), flushAll: vi.fn() }))
// It hands back the session side's memlog observer, which the rail bridge is given.
const registerSessionBridge = vi.hoisted(() =>
  vi.fn<(deps: unknown) => { observeArtifact: () => void }>(() => ({ observeArtifact: vi.fn() }))
)
vi.mock('./projections/transcript', () => ({ createTranscriptRegistry: () => registry }))
// The notifier is built once at the root, over the roster's name and the default diagnostic line.
const notifier = vi.hoisted(() => ({ told: vi.fn() }))
const createRunNotifier = vi.hoisted(() => vi.fn<(deps: unknown) => typeof notifier>(() => notifier))
vi.mock('./windows/run-notification', () => ({ createRunNotifier }))
vi.mock('./session-bridge', () => ({ registerSessionBridge }))
// The Welcome's own window is `windows/welcome-window.test.ts`'s; here only that it is asked for, and why it closed.
vi.mock('./windows/welcome-window', () => ({ openWelcome, closeWelcome: vi.fn(), isWelcomeWindow: () => false }))
const registerRailBridge = vi.hoisted(() => vi.fn<(deps: { observeArtifact?: (...args: unknown[]) => void }) => void>())
vi.mock('./rail-bridge', () => ({ registerRailBridge }))

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
      isPackaged: false,
      getPath: () => existingDirectory
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
// Imported after the root, as the electron mock above is only usable once its fakes are defined.
const { defaultWriteDiagnostic } = await import('./bridge-kit')
const { agentNameFor } = await import('./install-model')
// Taken at import: the registration happens once, as the module loads.
const bridgeDeps = registerSessionBridge.mock.calls[0]?.[0]
const notifierCalls = [...createRunNotifier.mock.calls]
const sessionBridge = registerSessionBridge.mock.results[0]?.value as { observeArtifact: ReturnType<typeof vi.fn> }
const railDeps = [...registerRailBridge.mock.calls]

const existingDirectory = mkdtempSync(join(tmpdir(), 'harness-reopen-'))
const originalArgv = process.argv

afterAll(() => {
  process.argv = originalArgv
  rmSync(existingDirectory, { recursive: true, force: true })
})

beforeEach(() => {
  showOpenDialog.mockReset()
  quit.mockReset()
  openWelcome.mockReset()
  browserWindowConstructed.mockReset()
  process.argv = ['/path/to/electron', '.']
})

it('opens the Welcome, and no dialog, when the last window closes', () => {
  appHandlers.get('window-all-closed')?.()

  expect(openWelcome).toHaveBeenCalledTimes(1)
  expect(showOpenDialog).not.toHaveBeenCalled()
  expect(browserWindowConstructed).not.toHaveBeenCalled()
  expect(quit).not.toHaveBeenCalled()
})

it('opens the Welcome when the app is activated with no window', () => {
  appHandlers.get('activate')?.()

  expect(openWelcome).toHaveBeenCalledTimes(1)
  expect(showOpenDialog).not.toHaveBeenCalled()
})

it('does not quit when the Welcome closed because a project opened', () => {
  appHandlers.get('window-all-closed')?.()
  const onClosed = openWelcome.mock.calls[0][0].onClosed

  onClosed('chosen')

  expect(quit).not.toHaveBeenCalled()
})

// Last of the three: a quit in progress is the app's state from here on, which is the point.
it('quits when the user closes the Welcome, and opens no second one on the way out', () => {
  appHandlers.get('window-all-closed')?.()
  const onClosed = openWelcome.mock.calls[0][0].onClosed

  onClosed('user')
  expect(quit).toHaveBeenCalledTimes(1)

  // The window closing is what `window-all-closed` follows: the quit is under way.
  appHandlers.get('window-all-closed')?.()
  expect(openWelcome).toHaveBeenCalledTimes(1)
})

it('hands the session bridge the registry that quitting flushes, and the one listener that speaks for a run outside the window', () => {
  const beforeQuit = appHandlers.get('before-quit')

  expect(bridgeDeps).toEqual({ transcripts: registry, told: notifier.told })
  expect(notifierCalls).toEqual([[{ agentName: agentNameFor, writeDiagnostic: defaultWriteDiagnostic }]])
  expect(beforeQuit).toBeDefined()
  expect(registry.flushAll).not.toHaveBeenCalled()

  beforeQuit?.()

  expect(registry.flushAll).toHaveBeenCalledTimes(1)
})

it('hands the rail bridge an observer that forwards what the watcher saw to the session bridge it registered', () => {
  const observeArtifact = railDeps[0]?.[0].observeArtifact
  const sender = { id: 7 }
  const observation = { type: 'artifact:written', path: '_bmad/x/.memlog.md', size: 1, mtimeMs: 2 }

  expect(railDeps).toHaveLength(1)
  expect(observeArtifact).toBeTypeOf('function')
  observeArtifact?.(sender, '/project', observation)

  expect(sessionBridge.observeArtifact).toHaveBeenCalledTimes(1)
  expect(sessionBridge.observeArtifact).toHaveBeenCalledWith(sender, '/project', observation)
})
