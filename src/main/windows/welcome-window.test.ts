import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Welcome's security posture and mechanics are constructor arguments and
 * event handlers, which nothing watches unless something asserts them. The
 * fakes are EventEmitters so `emit` is how Electron raises an event.
 */

let nextWebContentsId = 1
const constructed: FakeWindow[] = []

class FakeWebContents extends EventEmitter {
  id = nextWebContentsId++
  windowOpenHandler: (() => { action: string }) | null = null
  setWindowOpenHandler(handler: () => { action: string }) {
    this.windowOpenHandler = handler
  }
}

class FakeWindow extends EventEmitter {
  webContents = new FakeWebContents()
  options: Record<string, unknown>
  destroyedFlag = false
  shown = 0
  focused = 0
  closeCalls = 0
  destroyCalls = 0
  loadedUrl: string | null = null
  loadedFile: string | null = null

  constructor(options: Record<string, unknown> = {}) {
    super()
    this.options = options
    constructed.push(this)
  }
  show() {
    this.shown += 1
  }
  focus() {
    this.focused += 1
  }
  close() {
    this.closeCalls += 1
    // Electron raises `closed` a moment later; a test raises it explicitly.
  }
  destroy() {
    this.destroyCalls += 1
    this.destroyedFlag = true
  }
  isDestroyed() {
    return this.destroyedFlag
  }
  loadURL(url: string) {
    this.loadedUrl = url
    return Promise.resolve()
  }
  loadFile(path: string) {
    this.loadedFile = path
    return Promise.resolve()
  }
}

vi.mock('electron', () => ({ BrowserWindow: FakeWindow }))

type Module = typeof import('./welcome-window')
let openWelcome: Module['openWelcome']
let closeWelcome: Module['closeWelcome']
let isWelcomeWindow: Module['isWelcomeWindow']

let closed: string[]
const open = () => openWelcome({ onClosed: (reason) => closed.push(reason) })
const lastWindow = (): FakeWindow => constructed[constructed.length - 1]

/** What Electron does once `close()` has run: the window is gone and `closed` fires. */
function finishClosing(window: FakeWindow) {
  window.destroyedFlag = true
  window.emit('closed')
}

beforeEach(async () => {
  constructed.length = 0
  closed = []
  delete process.env.ELECTRON_RENDERER_URL
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // The one open Welcome is module state; each test starts without one.
  vi.resetModules()
  ;({ openWelcome, closeWelcome, isWelcomeWindow } = await import('./welcome-window'))
})

describe('the window', () => {
  it('is 1080 by 720, named for the harness, and created hidden', () => {
    open()

    expect(constructed).toHaveLength(1)
    expect(constructed[0].options).toMatchObject({
      width: 1080,
      height: 720,
      title: 'bmad harness',
      show: false
    })
  })

  it('is isolated and sandboxed, with its own preload and no node', () => {
    open()
    const { webPreferences } = constructed[0].options as {
      webPreferences: Record<string, unknown>
    }

    expect(webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    })
    expect(String(webPreferences.preload)).toMatch(/preload[\\/]welcome\.js$/)
  })

  it('is shown when it is ready, and not before', () => {
    open()
    expect(lastWindow().shown).toBe(0)

    lastWindow().emit('ready-to-show')

    expect(lastWindow().shown).toBe(1)
  })

  it('loads the file beside the project page, or the dev server’s welcome page', () => {
    open()
    expect(lastWindow().loadedFile).toMatch(/renderer[\\/]welcome\.html$/)

    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/'
    closeWelcome('chosen')
    finishClosing(lastWindow())
    open()
    expect(lastWindow().loadedUrl).toBe('http://localhost:5173/welcome.html')
  })

  it('keeps its own title when the page names one', () => {
    open()
    const event = { preventDefault: vi.fn() }

    lastWindow().emit('page-title-updated', event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })
})

describe('going nowhere', () => {
  it('opens no window and takes no navigation or redirect, so a dropped file cannot replace the page', () => {
    open()
    const { webContents } = lastWindow()

    expect(webContents.windowOpenHandler?.()).toEqual({ action: 'deny' })
    for (const event of ['will-navigate', 'will-redirect']) {
      const prevented = { preventDefault: vi.fn() }
      webContents.emit(event, prevented)
      expect(prevented.preventDefault, event).toHaveBeenCalledTimes(1)
    }
  })

  it('destroys itself when the page fails to load, rather than leave a wedge', () => {
    open()

    lastWindow().webContents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', '', true)

    expect(lastWindow().destroyCalls).toBe(1)
  })

  it('ignores a failed sub-frame and a navigation that was only superseded', () => {
    open()

    lastWindow().webContents.emit('did-fail-load', {}, -105, 'x', '', false)
    lastWindow().webContents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', '', true)

    expect(lastWindow().destroyCalls).toBe(0)
  })
})

describe('there is one', () => {
  it('raises the one that is open rather than make a second', () => {
    const first = open()
    const second = open()

    expect(constructed).toHaveLength(1)
    expect(second).toBe(first)
    expect(lastWindow().shown).toBe(1)
    expect(lastWindow().focused).toBe(1)
  })

  it('makes a new one once the last has closed', () => {
    open()
    closeWelcome('chosen')
    finishClosing(lastWindow())

    open()

    expect(constructed).toHaveLength(2)
  })

  it('knows its own page, and no other', () => {
    open()
    const id = lastWindow().webContents.id

    expect(isWelcomeWindow({ id })).toBe(true)
    expect(isWelcomeWindow({ id: id + 1 })).toBe(false)

    finishClosing(lastWindow())
    expect(isWelcomeWindow({ id })).toBe(false)
  })
})

describe('closing', () => {
  it('is by the user when nothing else asked for it', () => {
    open()

    finishClosing(lastWindow())

    expect(closed).toEqual(['user'])
  })

  it('is chosen when a project opened and the app closed it', () => {
    open()

    closeWelcome('chosen')
    expect(lastWindow().closeCalls).toBe(1)
    finishClosing(lastWindow())

    expect(closed).toEqual(['chosen'])
  })

  it('does nothing to close a Welcome that is not there', () => {
    expect(() => closeWelcome('chosen')).not.toThrow()
    expect(constructed).toHaveLength(0)
  })

  it('is told once, and a window gone is no longer the one asked about', () => {
    open()
    finishClosing(lastWindow())
    closeWelcome('chosen')

    expect(closed).toEqual(['user'])
  })
})
