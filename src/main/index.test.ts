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
const registerRailBridge = vi.hoisted(() =>
  vi.fn<(deps: { observeArtifact?: (...args: unknown[]) => void; outputFolder?: unknown }) => void>()
)
vi.mock('./rail-bridge', () => ({ registerRailBridge }))
// The output folders (Story 5.4): the rail watches what they say, and the menu's File chooses through them.
const outputFolders = vi.hoisted(() => ({
  handleFor: vi.fn(),
  ready: vi.fn(),
  choose: vi.fn(),
  forget: vi.fn(),
  hasChoice: vi.fn(),
  onChanged: vi.fn()
}))
const registerOutputFolderBridge = vi.hoisted(() => vi.fn<(deps: { userDataPath: () => string }) => typeof outputFolders>(() => outputFolders))
vi.mock('./output-folder-bridge', () => ({ registerOutputFolderBridge }))
// The menu is `windows/app-menu.test.ts`'s; here only what the root hands it.
const installApplicationMenu = vi.hoisted(() => vi.fn())
vi.mock('./windows/app-menu', () => ({ installApplicationMenu }))
// Settled by the last test, which is the one that runs the start the others leave pending.
const appReady = vi.hoisted(() => ({ resolve: () => {} }))

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
      // Pending until the last test settles it: the launch that happens at startup is
      // not what the others are about, and leaving it pending keeps the reopen path clean.
      whenReady: () => new Promise<void>((resolve) => void (appReady.resolve = resolve)),
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
    ipcMain: { handle: vi.fn(), on: vi.fn() },
    nativeTheme: { themeSource: 'system', shouldUseDarkColors: true, on: vi.fn() },
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
const folderDeps = [...registerOutputFolderBridge.mock.calls]
const registrationOrder = {
  folders: registerOutputFolderBridge.mock.invocationCallOrder[0],
  rail: registerRailBridge.mock.invocationCallOrder[0]
}

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

it('registers the output folders once, over userData, and hands the rail bridge the way to each window’s folder (Story 5.4)', () => {
  expect(folderDeps).toHaveLength(1)
  expect(folderDeps[0][0].userDataPath()).toBe(existingDirectory)
  expect(railDeps[0]?.[0].outputFolder).toBe(outputFolders.handleFor)
  // Registered before the rail asks for any: the order the root spells.
  expect(registrationOrder.folders).toBeLessThan(registrationOrder.rail)
})

// Last: it settles the app's start, which opens the first window.
it('hands the menu the output folders: its File reaches the bridge’s own functions, and a failed chooser is one stderr line (Story 5.4)', async () => {
  const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  appReady.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(installApplicationMenu).toHaveBeenCalledTimes(1)
  const menu = installApplicationMenu.mock.calls[0][3] as {
    ready: unknown
    hasChoice: unknown
    forget: unknown
    onChanged: unknown
    choose: (id: number) => void
  }
  expect(menu.ready).toBe(outputFolders.ready)
  expect(menu.hasChoice).toBe(outputFolders.hasChoice)
  expect(menu.forget).toBe(outputFolders.forget)
  expect(menu.onChanged).toBe(outputFolders.onChanged)

  outputFolders.choose.mockResolvedValueOnce({ kind: 'cancelled' })
  menu.choose(7)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(outputFolders.choose).toHaveBeenLastCalledWith(7)
  expect(write).not.toHaveBeenCalled()

  outputFolders.choose.mockRejectedValueOnce(new Error('no chooser'))
  menu.choose(8)
  await new Promise((resolve) => setTimeout(resolve, 0))

  expect(outputFolders.choose).toHaveBeenLastCalledWith(8)
  expect(write).toHaveBeenCalledTimes(1)
  expect(String(write.mock.calls[0][0])).toBe('output-folder/choose-failed \u00b7 Error: no chooser\n')
  write.mockRestore()
})
