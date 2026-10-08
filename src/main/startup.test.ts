import { tmpdir } from 'node:os'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'

/**
 * The startup wiring itself: `app.whenReady()` resolving must put exactly one
 * window on screen, and what happens to the windows after that is the
 * lifecycle the Welcome made: the last project window closing raises the
 * Welcome, a chosen folder replaces it, closing it quits, and a native dialog
 * opens for none of it unless the Welcome's own action asked.
 *
 * `whenReady` therefore resolves here — the one test file where it does, with
 * a path on the command line. That also means the launch happens while the
 * module is being imported, before the first test body runs, so what happened
 * is recorded in plain arrays: Vitest clears `vi.fn()` call counts between the
 * import and the first test.
 */

type Handler = (...args: never[]) => unknown

const appHandlers = new Map<string, () => void>()
const ipcHandlers = new Map<string, (event: { sender: { id: number } }, ...args: unknown[]) => unknown>()
const ipcListeners = new Map<string, (event: { returnValue?: unknown }) => void>()
const nativeUpdated: (() => void)[] = []
/** What main pushed to a window, as the window would hear it. */
const pushes: { window: FakeWindow; channel: string; payload: unknown }[] = []
/** What the OS says it is painting in; the stored choice below is what main must apply over it. */
const native = { source: 'system', dark: true }
const windows: FakeWindow[] = []
const choosesMade: unknown[] = []
const quits: string[] = []
const menusInstalled: unknown[] = []
/** One shared log, so what came first is a fact and not an inference. */
const callOrder: string[] = []
let chooserAnswer: { canceled: boolean; filePaths: string[] } = { canceled: true, filePaths: [] }
/** While set, the native chooser stays open until it settles: a chooser a second click meets. */
let chooserGate: Promise<void> | null = null
let nextWebContentsId = 1
/** How many menus stood installed once the first window was up. */
let menusAtLaunch = 0

const userData = mkdtempSync(join(tmpdir(), 'harness-startup-userdata-'))
// A choice stored by an earlier run: it must be applied before anything is shown.
writeFileSync(join(userData, 'theme.json'), JSON.stringify({ theme: 'light' }))

/** A window as Electron has it: open until it is closed, and `closed` fires when it goes. */
class FakeWindow {
  options: { title: string; webPreferences: Record<string, unknown> }
  webContents = {
    id: nextWebContentsId++,
    on() {},
    setWindowOpenHandler() {},
    isDestroyed: () => !this.open,
    send: (channel: string, payload: unknown) => {
      pushes.push({ window: this, channel, payload })
    }
  }
  handlers = new Map<string, Handler[]>()
  open = true
  raised = 0
  minimized = false
  restored = 0

  constructor(options: { title: string; webPreferences: Record<string, unknown> }) {
    callOrder.push('window')
    this.options = options
    windows.push(this)
  }

  on(event: string, handler: Handler) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
  }
  once(event: string, handler: Handler) {
    this.on(event, handler)
  }
  close() {
    if (!this.open) {
      return
    }
    this.open = false
    for (const handler of this.handlers.get('closed') ?? []) {
      handler()
    }
  }
  destroy() {
    this.close()
  }
  isDestroyed() {
    return !this.open
  }
  isMinimized() {
    return this.minimized
  }
  restore() {
    this.restored += 1
    this.minimized = false
  }
  show() {
    this.raised += 1
  }
  focus() {
    this.raised += 1
  }
  loadURL() {}
  loadFile() {}

  static getAllWindows() {
    return windows.filter((window) => window.open)
  }
}

vi.mock('electron', () => ({
  BrowserWindow: FakeWindow,
  app: {
    whenReady: () => Promise.resolve(),
    on: (event: string, handler: () => void) => appHandlers.set(event, handler),
    quit: () => quits.push('quit'),
    exit: (code: number) => quits.push(`exit ${code}`),
    getPath: () => userData,
    isPackaged: false
  },
  dialog: {
    showOpenDialog: (options: unknown) => {
      choosesMade.push(options)
      return chooserGate === null ? Promise.resolve(chooserAnswer) : chooserGate.then(() => chooserAnswer)
    },
    showErrorBox: vi.fn()
  },
  ipcMain: {
    handle: (channel: string, handler: (event: { sender: { id: number } }, ...args: unknown[]) => unknown) =>
      ipcHandlers.set(channel, handler),
    on: (channel: string, listener: (event: { returnValue?: unknown }) => void) =>
      ipcListeners.set(channel, listener)
  },
  nativeTheme: {
    get themeSource() {
      return native.source
    },
    set themeSource(source: string) {
      callOrder.push('theme')
      native.source = source
      native.dark = source === 'dark' || (source === 'system' && native.dark)
    },
    get shouldUseDarkColors() {
      return native.dark
    },
    on: (_event: string, listener: () => void) => nativeUpdated.push(listener)
  },
  Menu: {
    buildFromTemplate: (template: unknown) => template,
    setApplicationMenu: (menu: unknown) => {
      callOrder.push('menu')
      menusInstalled.push(menu)
    }
  }
}))

const projectDirectory = mkdtempSync(join(tmpdir(), 'harness-startup-'))
const originalArgv = process.argv

// Read by `openFirstWindow` as soon as whenReady resolves, so it is in place
// before the module under test is imported.
process.argv = ['/path/to/electron', '.', projectDirectory]

const { projectPathForWebContents } = await import('./windows/main-window')
await import('./index')

afterAll(() => {
  process.argv = originalArgv
  rmSync(projectDirectory, { recursive: true, force: true })
  rmSync(userData, { recursive: true, force: true })
})

const open = (): FakeWindow[] => windows.filter((window) => window.open)
const welcomes = (): FakeWindow[] => open().filter((window) => window.options.title === 'bmad harness')
const closeAllWindows = (): void => windows.forEach((window) => window.close())
const recentFile = join(userData, 'recent-projects.json')

/** Ask a bridge channel as a window would. */
async function ask(channel: string, window: FakeWindow, ...args: unknown[]): Promise<unknown> {
  return ipcHandlers.get(channel)?.({ sender: { id: window.webContents.id } }, ...args)
}

it('opens exactly one window, for the path given on the command line, and no Welcome', async () => {
  await vi.waitFor(() => expect(windows).toHaveLength(1))
  menusAtLaunch = menusInstalled.length

  expect(windows[0].options.title).toBe(basename(projectDirectory))
  expect(projectPathForWebContents(windows[0].webContents.id)).toBe(projectDirectory)
  expect(welcomes()).toHaveLength(0)

  // The argument was supplied, so no dialog ever appeared and nothing quit.
  expect(choosesMade).toHaveLength(0)
  expect(quits).toHaveLength(0)
})

it('records that project as the first recent one, so a command-line open is remembered too', () => {
  expect(existsSync(recentFile)).toBe(true)
  const entries = JSON.parse(readFileSync(recentFile, 'utf8')).entries as { path: string }[]

  expect(entries.map(({ path }) => path)).toEqual([projectDirectory])
})

it('opens nothing on activate while a window is already open', () => {
  appHandlers.get('activate')?.()

  expect(windows).toHaveLength(1)
  expect(choosesMade).toHaveLength(0)
})

it('opens the Welcome, and no dialog, when the last project window closes', () => {
  closeAllWindows()
  appHandlers.get('window-all-closed')?.()

  expect(welcomes()).toHaveLength(1)
  const welcome = welcomes()[0]
  // Its own window: no project, the sandbox and isolation on, its own preload.
  expect(welcome.options.webPreferences).toMatchObject({
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  })
  expect(String(welcome.options.webPreferences.preload)).toMatch(/preload[\\/]welcome\.js$/)
  expect(projectPathForWebContents(welcome.webContents.id)).toBeUndefined()
  expect(choosesMade).toHaveLength(0)
  expect(quits).toHaveLength(0)
})

it('never opens a second Welcome while one is open, however it is asked', () => {
  appHandlers.get('window-all-closed')?.()
  appHandlers.get('activate')?.()
  // Electron's own count would say one is open, so activate does nothing; and the
  // window-all-closed above raised the one there is rather than making another.
  expect(welcomes()).toHaveLength(1)
})

it('leaves the Welcome as it was, and the app running, when the chooser is cancelled', async () => {
  const welcome = welcomes()[0]
  chooserAnswer = { canceled: true, filePaths: [] }

  await expect(ask('welcome:choose', welcome)).resolves.toEqual({ ok: false })

  expect(choosesMade).toHaveLength(1)
  expect(welcomes()).toEqual([welcome])
  expect(quits).toHaveLength(0)
  expect(open()).toEqual([welcome])
})

it('opens the chosen folder as a project window and closes the Welcome in the same step, without quitting', async () => {
  const welcome = welcomes()[0]
  chooserAnswer = { canceled: false, filePaths: [projectDirectory] }

  await expect(ask('welcome:choose', welcome)).resolves.toEqual({ ok: true })

  expect(welcomes()).toHaveLength(0)
  expect(open()).toHaveLength(1)
  expect(open()[0].options.title).toBe(basename(projectDirectory))
  // The project window came first, so closing the Welcome was never the last window going.
  expect(windows.indexOf(open()[0])).toBeGreaterThan(windows.indexOf(welcome))
  expect(quits).toHaveLength(0)
  const entries = JSON.parse(readFileSync(recentFile, 'utf8')).entries as { path: string }[]
  expect(entries.map(({ path }) => path)).toEqual([projectDirectory])
})

it('raises the window already open for a dropped project, makes no second, and closes the Welcome', async () => {
  const project = open()[0]
  // A Welcome beside an open project is not a state the app reaches by itself;
  // the handler is simply asked, as it is on the last window closing.
  appHandlers.get('window-all-closed')?.()
  const welcome = welcomes()[0]
  const before = windows.length
  const raised = project.raised

  await expect(ask('welcome:open-dropped', welcome, [projectDirectory])).resolves.toEqual({ ok: true })

  expect(windows).toHaveLength(before)
  expect(project.raised).toBeGreaterThan(raised)
  expect(welcomes()).toHaveLength(0)
  expect(open()).toEqual([project])
  expect(quits).toHaveLength(0)
})

/** The Welcome the app opens when no window is left, as the last project window closing does. */
function openWelcomeAgain(): FakeWindow {
  // A Welcome already open is the one there is; closing it would be the user quitting.
  if (welcomes().length === 0) {
    closeAllWindows()
    appHandlers.get('window-all-closed')?.()
  }
  return welcomes()[0]
}

/** An open project window with a Welcome beside it, a state only the handler being asked for gets to. */
async function projectBesideWelcome(): Promise<{ project: FakeWindow; welcome: FakeWindow }> {
  const first = openWelcomeAgain()
  if (open().every((window) => window === first)) {
    await ask('welcome:open-dropped', first, [projectDirectory])
  }
  const project = open().find((window) => window !== first) ?? open()[0]
  appHandlers.get('window-all-closed')?.()
  return { project, welcome: welcomes()[0] }
}

/** What Electron does when a window gains focus: the app menu is rebuilt for its kind. */
function focus(window: FakeWindow): void {
  ;(appHandlers.get('browser-window-focus') as unknown as (event: unknown, window: unknown) => void)(
    {},
    window
  )
}

/** The installed menu's File ▸ Open Project Folder… item, as the menu bar would click it. */
function openProjectFolderItem(): { accelerator?: string; click: () => void } {
  const menu = menusInstalled[menusInstalled.length - 1] as {
    label?: string
    submenu?: { label?: string; accelerator?: string; click: () => void }[]
  }[]
  const item = menu.find(({ label }) => label === 'File')?.submenu?.find(({ label }) => label === 'Open Project Folder…')
  if (item === undefined) {
    throw new Error('the installed menu has no Open Project Folder…')
  }
  return item
}

it('opens the chosen folder from the Welcome’s ⌘O menu item, and a second click while the chooser is open does nothing', async () => {
  const welcome = openWelcomeAgain()
  expect(welcome).toBeDefined()
  focus(welcome)
  const item = openProjectFolderItem()
  expect(item.accelerator).toBe('CmdOrCtrl+O')

  const before = choosesMade.length
  let release: () => void = () => {}
  chooserGate = new Promise<void>((resolve) => (release = resolve))
  chooserAnswer = { canceled: false, filePaths: [projectDirectory] }

  item.click()
  item.click()
  await vi.waitFor(() => expect(choosesMade.length).toBe(before + 1))
  // The second click met the chooser already open: no second dialog, nothing opened yet.
  expect(welcomes()).toEqual([welcome])

  release()
  chooserGate = null
  await vi.waitFor(() => expect(welcomes()).toHaveLength(0))

  expect(choosesMade.length).toBe(before + 1)
  expect(open()).toHaveLength(1)
  expect(open()[0].options.title).toBe(basename(projectDirectory))
})

it('reports a chooser that fails on stderr, in one line, and keeps the app running', async () => {
  const welcome = openWelcomeAgain()
  focus(welcome)
  const item = openProjectFolderItem()
  const written: string[] = []
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
    written.push(String(chunk))
    return true
  })
  chooserGate = Promise.reject(new Error('dialog failed'))
  chooserGate.catch(() => {})
  const exitsBefore = quits.filter((entry) => entry.startsWith('exit')).length

  item.click()
  await vi.waitFor(() => expect(written.join('')).toContain('welcome/choose-failed · Error: dialog failed'))
  spy.mockRestore()
  chooserGate = null

  expect(written.join('').trim().split('\n')).toHaveLength(1)
  expect(quits.filter((entry) => entry.startsWith('exit'))).toHaveLength(exitsBefore)
  expect(welcomes()).toEqual([welcome])
})

it.each(['dropped', 'chosen'] as const)(
  'raises, and restores if it was minimized, a project already open when it is %s',
  async (route) => {
    const { project, welcome } = await projectBesideWelcome()
    project.minimized = true
    const restored = project.restored
    const before = windows.length
    chooserAnswer = { canceled: false, filePaths: [projectDirectory] }

    await expect(
      route === 'dropped' ? ask('welcome:open-dropped', welcome, [projectDirectory]) : ask('welcome:choose', welcome)
    ).resolves.toEqual({ ok: true })

    expect(project.restored).toBe(restored + 1)
    expect(project.minimized).toBe(false)
    expect(windows).toHaveLength(before)
    expect(welcomes()).toHaveLength(0)
  }
)

it('refuses a project window as a sender: the real check answers `{ok:false}` and opens nothing', async () => {
  const { project, welcome } = await projectBesideWelcome()
  const windowsBefore = windows.length
  const dialogsBefore = choosesMade.length

  await expect(ask('welcome:open-dropped', project, [projectDirectory])).resolves.toEqual({ ok: false })
  await expect(ask('welcome:choose', project)).resolves.toEqual({ ok: false })

  expect(windows).toHaveLength(windowsBefore)
  expect(choosesMade).toHaveLength(dialogsBefore)
  expect(welcomes()).toEqual([welcome])
})

it('applies the stored theme to native chrome before the menu or any window, and answers a window what to paint', () => {
  expect(callOrder.indexOf('theme')).toBe(0)
  expect(callOrder.indexOf('theme')).toBeLessThan(callOrder.indexOf('menu'))

  const reply: { returnValue?: unknown } = {}
  ipcListeners.get('theme:state')?.(reply)

  // The stored `light` over an OS that is dark: native chrome and the answer agree.
  expect(reply.returnValue).toEqual({ choice: 'light', applied: 'light' })
  expect(JSON.stringify(menusInstalled[0])).toMatch(/"label":"Light","type":"radio","checked":true/)
})

it('lets the Welcome choose a theme: stored, applied to native chrome, pushed to every window, and the menu rebuilt', async () => {
  const { project: other, welcome } = await projectBesideWelcome()
  const menusBefore = menusInstalled.length
  pushes.length = 0

  await ask('theme:choose', welcome, 'dark')

  expect(JSON.parse(readFileSync(join(userData, 'theme.json'), 'utf8'))).toEqual({ theme: 'dark' })
  expect(native.source).toBe('dark')
  const told = pushes.filter(({ channel }) => channel === 'theme:changed')
  expect(told.map(({ window }) => window).sort((a, b) => a.webContents.id - b.webContents.id)).toEqual(
    open().sort((a, b) => a.webContents.id - b.webContents.id)
  )
  for (const { payload } of told) {
    expect(payload).toEqual({ choice: 'dark', applied: 'dark' })
  }
  // The menu now in force checks Dark, and is rebuilt for the kind of window that has focus.
  expect(menusInstalled.length).toBe(menusBefore + 1)
  expect(JSON.stringify(menusInstalled.at(-1))).toMatch(/"label":"Dark","type":"radio","checked":true/)
  expect(told.some(({ window }) => window === other)).toBe(true)
})

it('ignores a choice from a window that is not the Welcome, and a word that is not a choice', async () => {
  const { project, welcome } = await projectBesideWelcome()
  pushes.length = 0

  await ask('theme:choose', project, 'light')
  await ask('theme:choose', welcome, 'sepia')
  await ask('theme:choose', welcome, { theme: 'light' })

  expect(pushes.filter(({ channel }) => channel === 'theme:changed')).toEqual([])
  expect(JSON.parse(readFileSync(join(userData, 'theme.json'), 'utf8'))).toEqual({ theme: 'dark' })
})

it('repaints every window when the OS appearance changes while the choice is System, with no choice made', async () => {
  const { welcome } = await projectBesideWelcome()
  await ask('theme:choose', welcome, 'system')
  pushes.length = 0
  native.dark = false

  for (const listener of nativeUpdated) {
    listener()
  }

  const told = pushes.filter(({ channel }) => channel === 'theme:changed')
  expect(told.length).toBe(open().length)
  for (const { payload } of told) {
    expect(payload).toEqual({ choice: 'system', applied: 'light' })
  }
})

it('quits when the user closes the Welcome', () => {
  const welcome = openWelcomeAgain()
  expect(welcome).toBeDefined()

  welcome.close()

  expect(quits).toEqual(['quit'])
  // And the last window going on the way out opens no Welcome of its own.
  appHandlers.get('window-all-closed')?.()
  expect(welcomes()).toHaveLength(0)
})

it('installs the application menu once, before the first window, for the unpackaged build', () => {
  expect(menusAtLaunch).toBe(1)
  // After the stored theme, which is applied before anything is installed or shown.
  expect(callOrder.indexOf('menu')).toBe(1)
  expect(callOrder.indexOf('window')).toBeGreaterThan(callOrder.indexOf('menu'))
  // The mock says `isPackaged: false`, so the developer's DevTools item is in.
  expect(JSON.stringify(menusInstalled[0])).toContain('toggleDevTools')
  // The first menu is the project window's: it may be reloaded and zoomed, and
  // never force-reloaded.
  expect(JSON.stringify(menusInstalled[0])).toContain('"reload"')
  expect(JSON.stringify(menusInstalled[0])).toContain('zoomIn')
  expect(JSON.stringify(menusInstalled[0])).not.toMatch(/forceReload/i)
})
