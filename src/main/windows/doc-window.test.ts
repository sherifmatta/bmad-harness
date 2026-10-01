import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The document window's security posture and mechanics are constructor
 * arguments and event handlers, which nothing watches unless something asserts
 * them. The fakes are EventEmitters so `emit` is how Electron raises an event.
 */

type Bounds = { x: number; y: number; width: number; height: number }

let nextWebContentsId = 1
const constructed: FakeWindow[] = []

class FakeWebContents extends EventEmitter {
  id = nextWebContentsId++
  windowOpenHandler: (() => { action: string }) | null = null
  destroyedFlag = false
  setWindowOpenHandler(handler: () => { action: string }) {
    this.windowOpenHandler = handler
  }
  send = vi.fn()
  isDestroyed() {
    return this.destroyedFlag
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
  bounds: Bounds
  loadedUrl: string | null = null
  loadedFile: string | null = null
  contentBounds: Bounds = { x: 100, y: 120, width: 1280, height: 760 }

  constructor(options: Record<string, unknown> = {}) {
    super()
    this.options = options
    this.bounds = { x: options.x as number, y: options.y as number, width: options.width as number, height: options.height as number }
    constructed.push(this)
  }
  getContentBounds() {
    return this.contentBounds
  }
  setBounds(bounds: Bounds) {
    this.bounds = bounds
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
  static fromWebContents(contents: unknown) {
    return contents === null ? null : { fromWebContents: contents }
  }
}

vi.mock('electron', () => ({ BrowserWindow: FakeWindow }))

type DocWindowModule = typeof import('./doc-window')
let openDocWindow: DocWindowModule['openDocWindow']
let parentWindowFor: DocWindowModule['parentWindowFor']
let isDocWindow: DocWindowModule['isDocWindow']

const PATH = '/work/falcon/_bmad/planning-artifacts/prd.md'
const OTHER = '/work/falcon/_bmad/config.toml'

let parent: FakeWindow
let closed: string[]

const asParent = (window: FakeWindow) => window as unknown as Parameters<DocWindowModule['openDocWindow']>[0]['parent']

function open(fullPath = PATH, forParent = parent) {
  return openDocWindow({
    parent: asParent(forParent),
    fullPath,
    onClosed: (reason) => closed.push(reason)
  })
}

const lastWindow = (): FakeWindow => constructed[constructed.length - 1]

/** What Electron does once `close()` has run: the window is gone and `closed` fires. */
function finishClosing(window: FakeWindow) {
  window.destroyedFlag = true
  window.emit('closed')
}

function key(window: FakeWindow, input: Record<string, unknown>) {
  const event = { preventDefault: vi.fn() }
  window.webContents.emit('before-input-event', event, {
    type: 'keyDown',
    key: 'Escape',
    shift: false,
    control: false,
    alt: false,
    meta: false,
    ...input
  })
  return event
}

beforeEach(async () => {
  constructed.length = 0
  closed = []
  delete process.env.ELECTRON_RENDERER_URL
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // The registry of open windows is module state; each test starts without one.
  vi.resetModules()
  ;({ openDocWindow, parentWindowFor, isDocWindow } = await import('./doc-window'))
  parent = new FakeWindow()
  constructed.length = 0
})

describe('the stage', () => {
  it('is frameless, transparent, non-resizable and a child of the project window', () => {
    open()
    const { options } = lastWindow()

    expect(options.frame).toBe(false)
    expect(options.transparent).toBe(true)
    expect(options.resizable).toBe(false)
    expect(options.parent).toBe(parent)
    expect(options.show).toBe(false)
    expect(options.hasShadow).toBe(false)
  })

  it('is sealed off from Node, with the document preload the only way across', () => {
    open()
    const { webPreferences } = lastWindow().options as {
      webPreferences: { preload: string; contextIsolation: boolean; nodeIntegration: boolean; sandbox: boolean }
    }

    expect(webPreferences.sandbox).toBe(true)
    expect(webPreferences.contextIsolation).toBe(true)
    expect(webPreferences.nodeIntegration).toBe(false)
    expect(webPreferences.preload.endsWith('preload/doc.js')).toBe(true)
  })

  it('opens exactly over the parent’s content bounds', () => {
    open()

    expect(lastWindow().bounds).toEqual({ x: 100, y: 120, width: 1280, height: 760 })
  })

  it('takes the full path as its OS title and never the page’s own', () => {
    open()
    const event = { preventDefault: vi.fn() }

    expect(lastWindow().options.title).toBe(PATH)
    lastWindow().emit('page-title-updated', event)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('is shown when ready, not before', () => {
    open()
    expect(lastWindow().shown).toBe(0)

    lastWindow().emit('ready-to-show')
    expect(lastWindow().shown).toBe(1)
  })

  it('loads doc.html from the dev server when there is one, else from the built file', () => {
    process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/'
    open()
    expect(lastWindow().loadedUrl).toBe('http://localhost:5173/doc.html')

    delete process.env.ELECTRON_RENDERER_URL
    open(OTHER)
    expect(lastWindow().loadedFile?.endsWith('renderer/doc.html')).toBe(true)
  })

  it('destroys itself when its page fails to load, but not for a sub-frame or an aborted navigation', () => {
    open()
    const { webContents } = lastWindow()

    webContents.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'file:///x', false)
    webContents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', 'file:///x', true)
    expect(lastWindow().destroyCalls).toBe(0)

    webContents.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'file:///x', true)
    expect(lastWindow().destroyCalls).toBe(1)
  })
})

describe('following the parent', () => {
  it('re-fits to the parent’s content bounds when it moves and when it resizes', () => {
    open()

    parent.contentBounds = { x: 300, y: 50, width: 1280, height: 760 }
    parent.emit('move')
    expect(lastWindow().bounds).toEqual({ x: 300, y: 50, width: 1280, height: 760 })

    parent.contentBounds = { x: 300, y: 50, width: 900, height: 600 }
    parent.emit('resize')
    expect(lastWindow().bounds).toEqual({ x: 300, y: 50, width: 900, height: 600 })
  })

  it('stops following once it has closed', () => {
    open()
    const window = lastWindow()
    window.emit('close')
    finishClosing(window)

    expect(parent.listenerCount('move')).toBe(0)
    expect(parent.listenerCount('resize')).toBe(0)
    expect(parent.listenerCount('close')).toBe(0)
    expect(parent.listenerCount('closed')).toBe(0)
  })

  it('closes with the parent, and says the parent is why', () => {
    open()
    const window = lastWindow()

    parent.emit('close')
    expect(window.closeCalls).toBe(1)
    finishClosing(window)

    expect(closed).toEqual(['parent'])
  })

  it('is destroyed if the parent is gone and it is somehow still there', () => {
    open()

    parent.emit('closed')

    expect(lastWindow().destroyCalls).toBe(1)
  })
})

describe('Esc', () => {
  it('closes the window from wherever focus is, and is the user’s doing', () => {
    open()
    const event = key(lastWindow(), {})

    expect(event.preventDefault).toHaveBeenCalled()
    expect(lastWindow().closeCalls).toBe(1)
    finishClosing(lastWindow())
    expect(closed).toEqual(['user'])
  })

  it.each([
    ['another key', { key: 'a' }],
    ['a key up', { type: 'keyUp' }],
    ['Shift+Esc', { shift: true }],
    ['Ctrl+Esc', { control: true }],
    ['Alt+Esc', { alt: true }],
    ['Cmd+Esc', { meta: true }]
  ])('does not close it on %s', (_name, input) => {
    open()
    const event = key(lastWindow(), input)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(lastWindow().closeCalls).toBe(0)
  })
})

describe('going nowhere', () => {
  it('denies every window.open', () => {
    open()

    expect(lastWindow().webContents.windowOpenHandler?.()).toEqual({ action: 'deny' })
  })

  it('prevents navigation and redirects', () => {
    open()
    for (const name of ['will-navigate', 'will-redirect']) {
      const event = { preventDefault: vi.fn() }
      lastWindow().webContents.emit(name, event, 'https://example.com/')
      expect(event.preventDefault, name).toHaveBeenCalled()
    }
  })
})

describe('one per project window', () => {
  it('focuses the window already open for that file and opens nothing', () => {
    const first = open()
    const count = constructed.length

    const second = open()

    expect(second.reused).toBe(true)
    expect(second.handle).toBe(first.handle)
    expect(constructed).toHaveLength(count)
    expect(lastWindow().shown).toBe(1)
    expect(lastWindow().focused).toBe(1)
  })

  it('replaces it with a different file: the first closes, and is told it was replaced', () => {
    open()
    const first = lastWindow()

    const second = open(OTHER)

    expect(second.reused).toBe(false)
    expect(constructed).toHaveLength(2)
    expect(first.closeCalls).toBe(1)
    finishClosing(first)
    expect(closed).toEqual(['replaced'])

    // The newer window is still the one registered for the parent.
    expect(open(OTHER).reused).toBe(true)
  })

  it('reports the newer window’s close as the user’s', () => {
    open()
    const first = lastWindow()
    open(OTHER)
    const second = lastWindow()
    finishClosing(first)

    second.webContents.emit('before-input-event', { preventDefault() {} }, { type: 'keyDown', key: 'Escape' })
    finishClosing(second)

    expect(closed).toEqual(['replaced', 'user'])
  })

  it('keeps each project window’s document apart', () => {
    const other = new FakeWindow()
    constructed.length = 0

    open(PATH, parent)
    open(PATH, other)

    expect(constructed).toHaveLength(2)
  })

  it('opens again after the last one has closed', () => {
    open()
    finishClosing(lastWindow())

    expect(open().reused).toBe(false)
  })

  it('calls onClosed once, however the close came about', () => {
    const { handle } = open()
    handle.close()
    handle.close()
    parent.emit('close')
    finishClosing(lastWindow())

    expect(closed).toEqual(['user'])
  })
})

describe('the handle', () => {
  it('hands the bridge the document page to ask from and push to, and the file it shows', () => {
    const { handle } = open()

    expect(handle.sender).toBe(lastWindow().webContents)
    expect(handle.fullPath).toBe(PATH)
  })

  it('closes as the user would', () => {
    const { handle } = open()
    handle.close()

    expect(lastWindow().closeCalls).toBe(1)
  })

  it('does not touch a destroyed window', () => {
    const { handle } = open()
    lastWindow().destroyedFlag = true

    expect(() => handle.focus()).not.toThrow()
    expect(() => handle.close()).not.toThrow()
    expect(lastWindow().shown).toBe(0)
  })
})

describe('parentWindowFor', () => {
  it('asks Electron which window a WebContents belongs to', () => {
    const contents = {}

    expect(parentWindowFor(contents as never)).toEqual({ fromWebContents: contents })
  })
})

describe('isDocWindow', () => {
  it('is true for an open document window’s page and false for its parent and for a stranger', () => {
    open()

    expect(isDocWindow(lastWindow().webContents)).toBe(true)
    expect(isDocWindow(parent.webContents)).toBe(false)
    expect(isDocWindow({ id: 99_999 })).toBe(false)
  })

  it('is false before any document window has opened', () => {
    expect(isDocWindow(parent.webContents)).toBe(false)
  })

  it('is false again once the document window has closed, so the menu returns to the project’s', () => {
    open()
    const { webContents } = lastWindow()
    expect(isDocWindow(webContents)).toBe(true)

    finishClosing(lastWindow())

    expect(isDocWindow(webContents)).toBe(false)
  })
})
