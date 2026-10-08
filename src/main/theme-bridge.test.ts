import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeApplied, ThemeChoice } from '../shared/theme'

type Handler = (event: { sender: { id: number } }, ...args: unknown[]) => unknown
type Listener = (event: { returnValue?: unknown }) => void

const handlers = new Map<string, Handler>()
const listeners = new Map<string, Listener>()

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: (channel: string, handler: Handler) => handlers.set(channel, handler),
    on: (channel: string, listener: Listener) => listeners.set(channel, listener)
  }
}))
vi.mock('./windows/native-theme', () => ({
  setNativeTheme: vi.fn(),
  appliedNativeTheme: () => 'dark',
  onNativeThemeUpdated: vi.fn()
}))
vi.mock('./windows/welcome-window', () => ({ isWelcomeWindow: () => false }))

const { THEME_CHANGED_CHANNEL, THEME_CHOOSE_CHANNEL, THEME_STATE_CHANNEL, createThemeStore, registerThemeBridge } =
  await import('./theme-bridge')

const WELCOME = 7
const OTHER = 8

const root = mkdtempSync(join(tmpdir(), 'harness-theme-bridge-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

let userData: string
let os: ThemeApplied
let native: ThemeChoice[]
let nativeListeners: (() => void)[]
let pushed: { channel: string; payload: unknown }[]
let diagnostics: string[]
let destroyed: boolean

function setUp(stored?: unknown) {
  userData = mkdtempSync(join(root, 'userdata-'))
  if (stored !== undefined) {
    writeFileSync(join(userData, 'theme.json'), typeof stored === 'string' ? stored : JSON.stringify(stored))
  }
  const store = createThemeStore({ userDataPath: () => userData, writeDiagnostic: (line) => diagnostics.push(line) })
  const window = {
    isDestroyed: () => destroyed,
    send: (channel: string, payload: unknown) => pushed.push({ channel, payload })
  }
  const controller = registerThemeBridge({
    store,
    applyNative: (choice) => native.push(choice),
    applied: () => os,
    onNativeUpdated: (listener) => nativeListeners.push(listener),
    windows: () => [window, window],
    isWelcomeSender: (id) => id === WELCOME
  })
  return controller
}

/** The synchronous request every window makes: main answers by setting the event's return value. */
const ask = (): { returnValue?: unknown } => {
  const event: { returnValue?: unknown } = {}
  listeners.get(THEME_STATE_CHANNEL)?.(event)
  return event
}

const choose = (choice: unknown, id = WELCOME): unknown =>
  handlers.get(THEME_CHOOSE_CHANNEL)?.({ sender: { id } }, choice)

const stored = (): unknown => JSON.parse(readFileSync(join(userData, 'theme.json'), 'utf8'))

beforeEach(() => {
  handlers.clear()
  listeners.clear()
  os = 'dark'
  native = []
  nativeListeners = []
  pushed = []
  diagnostics = []
  destroyed = false
})

describe('registering', () => {
  it('answers one synchronous state request, and one choice, and starts nothing', () => {
    setUp()

    expect([...listeners.keys()]).toEqual([THEME_STATE_CHANNEL])
    expect([...handlers.keys()]).toEqual([THEME_CHOOSE_CHANNEL])
    expect(native).toEqual([])
    expect(nativeListeners).toEqual([])
  })

  it('spells the three channels as the shared contract does', () => {
    expect([THEME_STATE_CHANNEL, THEME_CHANGED_CHANNEL, THEME_CHOOSE_CHANNEL]).toEqual([
      'theme:state',
      'theme:changed',
      'theme:choose'
    ])
  })
})

describe('starting', () => {
  it('has never been told a theme: System, which is what the OS says it is', () => {
    const theme = setUp()

    theme.start()

    expect(theme.choice()).toBe('system')
    expect(native).toEqual(['system'])
    expect(theme.state()).toEqual({ choice: 'system', applied: 'dark' })
    os = 'light'
    expect(theme.state()).toEqual({ choice: 'system', applied: 'light' })
  })

  it.each(['light', 'dark', 'system'] as const)('applies a stored %s to native chrome before anything is shown', (choice) => {
    const theme = setUp({ theme: choice })

    theme.start()

    expect(theme.choice()).toBe(choice)
    expect(native).toEqual([choice])
  })

  it.each([
    ['bad JSON', '{ nope'],
    ['an unknown word', { theme: 'sepia' }],
    ['another shape', ['light']],
    ['an empty object', {}]
  ])('reads %s as System, silently', (_name, file) => {
    const theme = setUp(file)

    theme.start()

    expect(theme.choice()).toBe('system')
    expect(native).toEqual(['system'])
    expect(diagnostics).toEqual([])
    expect(pushed).toEqual([])
  })

  it('reads a missing file as System, silently, and the next choice writes it', () => {
    const theme = setUp()

    theme.start()
    expect(diagnostics).toEqual([])

    theme.choose('light')
    expect(stored()).toEqual({ theme: 'light' })
  })

  it('rewrites a file it could not read on the next choice', () => {
    const theme = setUp('garbage')
    theme.start()

    theme.choose('dark')

    expect(stored()).toEqual({ theme: 'dark' })
  })

  it('starts once: a second start reads nothing again and registers no second listener', () => {
    const theme = setUp({ theme: 'light' })

    theme.start()
    theme.start()

    expect(native).toEqual(['light'])
    expect(nativeListeners).toHaveLength(1)
  })

  it('hears the OS appearance change and tells every window what to paint, with no choice made', () => {
    const theme = setUp({ theme: 'system' })
    theme.start()
    expect(nativeListeners).toHaveLength(1)
    const chosen = vi.fn()
    theme.onChosen(chosen)

    os = 'light'
    nativeListeners[0]()

    expect(pushed).toEqual([
      { channel: THEME_CHANGED_CHANNEL, payload: { choice: 'system', applied: 'light' } },
      { channel: THEME_CHANGED_CHANNEL, payload: { choice: 'system', applied: 'light' } }
    ])
    expect(chosen).not.toHaveBeenCalled()
  })
})

describe('the state a window asks for', () => {
  it('is the choice and what it resolves to, answered synchronously', () => {
    const theme = setUp({ theme: 'light' })
    theme.start()

    expect(ask().returnValue).toEqual({ choice: 'light', applied: 'dark' })
    os = 'light'
    expect(ask().returnValue).toEqual({ choice: 'light', applied: 'light' })
  })

  it('is answered to a window that is not the Welcome too: every window paints itself', () => {
    setUp().start()

    expect(ask().returnValue).toEqual({ choice: 'system', applied: 'dark' })
  })
})

describe('choosing', () => {
  it('stores it, applies it to native chrome and tells every window, even when what is painted does not change', () => {
    const theme = setUp({ theme: 'dark' })
    theme.start()
    native.length = 0

    choose('dark')

    expect(stored()).toEqual({ theme: 'dark' })
    expect(native).toEqual(['dark'])
    expect(pushed.map(({ channel }) => channel)).toEqual([THEME_CHANGED_CHANNEL, THEME_CHANGED_CHANNEL])
    expect(pushed[0].payload).toEqual({ choice: 'dark', applied: 'dark' })
  })

  it('is exactly what the menu makes: the controller’s choice, from the Welcome’s handler or from the menu', () => {
    const theme = setUp()
    theme.start()
    const heard: ThemeChoice[] = []
    theme.onChosen((choice) => heard.push(choice))

    choose('light')
    theme.choose('dark')

    expect(heard).toEqual(['light', 'dark'])
    expect(theme.choice()).toBe('dark')
    expect(stored()).toEqual({ theme: 'dark' })
  })

  it('hears only the Welcome, and only one of the three words', () => {
    const theme = setUp({ theme: 'dark' })
    theme.start()
    native.length = 0
    pushed.length = 0

    choose('light', OTHER)
    for (const other of ['sepia', 'Light', '', 3, null, undefined, { theme: 'light' }, ['light'], 'light '] as unknown[]) {
      choose(other)
    }

    expect(theme.choice()).toBe('dark')
    expect(native).toEqual([])
    expect(pushed).toEqual([])
    expect(stored()).toEqual({ theme: 'dark' })
  })

  it('reaches a window that is gone as nothing: a destroyed window hears nothing', () => {
    const theme = setUp()
    theme.start()
    destroyed = true

    expect(() => theme.choose('light')).not.toThrow()
    expect(pushed).toEqual([])
  })

  it('says one line on stderr when the choice cannot be written, and the choice still applies this session', () => {
    const theme = setUp()
    theme.start()
    // A file where `userData` should be.
    const blocker = join(root, 'blocker')
    mkdirSync(root, { recursive: true })
    writeFileSync(blocker, '')
    userData = join(blocker, 'inside')
    native.length = 0

    theme.choose('light')

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatch(/^theme\/unwritten · [A-Z0-9_]+$/)
    expect(theme.choice()).toBe('light')
    expect(native).toEqual(['light'])
    expect(pushed).toHaveLength(2)
  })

  it('touches nothing but the theme: it imports no session, run, rail, document or project module', () => {
    const source = readFileSync(join(import.meta.dirname, 'theme-bridge.ts'), 'utf8')
    const specifiers = [...source.matchAll(/from '([^']+)'/g)].map(([, specifier]) => specifier)

    expect(specifiers.length).toBeGreaterThan(5)
    expect(specifiers.filter((specifier) => /session|transcript|rail|project|doc|install|welcome-bridge/.test(specifier))).toEqual([])
  })
})
