import { basename } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The security posture is a constructor argument, which means nothing watches
 * it unless something asserts it. Flipping `sandbox` to `false` must fail here.
 */

const constructed = vi.fn()
const destroyed = vi.fn()
let nextWebContentsId = 1

/** Handlers the last-constructed window registered on its `webContents`. */
type Handler = (...args: unknown[]) => void
let webContentsHandlers = new Map<string, Handler>()

/**
 * Handlers each window registered on itself, keyed by its `webContents` id.
 * Per window rather than last-wins, because the one-window-per-project tests
 * hold two live windows at once and close only one of them.
 */
let windowHandlers = new Map<number, Map<string, Handler>>()

vi.mock('electron', () => {
  class BrowserWindow {
    webContents = {
      id: nextWebContentsId++,
      on: (event: string, handler: Handler) => {
        webContentsHandlers.set(event, handler)
      }
    }

    constructor(options: unknown) {
      constructed(options)
      windowHandlers.set(this.webContents.id, new Map())
    }

    on(event: string, handler: Handler) {
      windowHandlers.get(this.webContents.id)?.set(event, handler)
    }

    once() {}
    show() {}
    loadURL() {}
    loadFile() {}
    destroy() {
      destroyed()
    }
  }

  return { BrowserWindow }
})

type MainWindow = typeof import('./main-window')
let createProjectWindow: MainWindow['createProjectWindow']
let projectPathForWebContents: MainWindow['projectPathForWebContents']

interface CapturedOptions {
  title: string
  width: number
  height: number
  webPreferences: {
    preload: string
    contextIsolation: boolean
    nodeIntegration: boolean
    sandbox: boolean
  }
}

function optionsOfLastWindow(): CapturedOptions {
  return constructed.mock.calls[constructed.mock.calls.length - 1][0] as CapturedOptions
}

/** Fire the `did-fail-load` the renderer would raise, with Electron's arg order. */
function failLoad({
  errorCode = -6,
  isMainFrame = true
}: { errorCode?: number; isMainFrame?: boolean } = {}): void {
  const handler = webContentsHandlers.get('did-fail-load')
  expect(handler, 'the window must listen for did-fail-load').toBeDefined()
  handler?.({}, errorCode, 'ERR_FAILED', 'http://localhost:5173', isMainFrame)
}

/** Fire the `closed` Electron raises when a window goes away. */
function close(window: { webContents: { id: number } }): void {
  const handler = windowHandlers.get(window.webContents.id)?.get('closed')
  expect(handler, 'the window must listen for closed').toBeDefined()
  handler?.()
}

beforeEach(async () => {
  constructed.mockClear()
  destroyed.mockClear()
  webContentsHandlers = new Map()
  windowHandlers = new Map()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // The module holds the open-window indexes in its own scope, so each test
  // needs a fresh copy of it or the windows one test opens are still open in
  // the next.
  vi.resetModules()
  ;({ createProjectWindow, projectPathForWebContents } = await import('./main-window'))
})

describe('the project window', () => {
  it('opens wider than the 1000px breakpoint, so it is not born stacked', () => {
    createProjectWindow('/somewhere/a-project')
    const { width, height } = optionsOfLastWindow()

    expect(width).toBe(1280)
    expect(height).toBe(800)
    expect(width).toBeGreaterThan(1180)
  })

  it('is created with the renderer sealed off from Node', () => {
    createProjectWindow('/somewhere/a-project')
    const { webPreferences } = optionsOfLastWindow()

    expect(webPreferences.contextIsolation).toBe(true)
    expect(webPreferences.nodeIntegration).toBe(false)
    expect(webPreferences.sandbox).toBe(true)
  })

  it('points at a preload script, which is the only way anything crosses', () => {
    createProjectWindow('/somewhere/a-project')
    const { webPreferences } = optionsOfLastWindow()

    expect(typeof webPreferences.preload).toBe('string')
    expect(webPreferences.preload.length).toBeGreaterThan(0)
    expect(webPreferences.preload.endsWith('preload/index.js')).toBe(true)
  })

  it('names the project it was opened for', () => {
    createProjectWindow('/somewhere/a-project')

    expect(optionsOfLastWindow().title).toBe(basename('/somewhere/a-project'))
  })

  it('still names something for a root path, where there is no basename', () => {
    createProjectWindow('/')

    expect(optionsOfLastWindow().title).toBe('/')
  })

  it('answers the project path for its own webContents, and nothing for anyone else', () => {
    const window = createProjectWindow('/somewhere/a-project')

    expect(projectPathForWebContents(window.webContents.id)).toBe('/somewhere/a-project')
    expect(projectPathForWebContents(window.webContents.id + 1000)).toBeUndefined()
  })
})

/**
 * One window per project is a boundary, and a boundary only exists where
 * something refuses to cross it. Without an index the other way round — path to
 * window — nothing would stop a second window opening on a project that is
 * already open.
 */
describe('a project that is already open', () => {
  it('is handed its open window rather than a second one on top of it', () => {
    const first = createProjectWindow('/somewhere/a-project')
    const second = createProjectWindow('/somewhere/a-project')

    expect(second).toBe(first)
    expect(constructed).toHaveBeenCalledTimes(1)
  })

  it('does not swallow a different project, which is entitled to its own window', () => {
    const first = createProjectWindow('/somewhere/a-project')
    const second = createProjectWindow('/somewhere/another-project')

    expect(second).not.toBe(first)
    expect(constructed).toHaveBeenCalledTimes(2)
    expect(projectPathForWebContents(first.webContents.id)).toBe('/somewhere/a-project')
    expect(projectPathForWebContents(second.webContents.id)).toBe('/somewhere/another-project')
  })

  it('gets a live window after its last one closed, never the destroyed one back', () => {
    const first = createProjectWindow('/somewhere/a-project')
    close(first)

    const second = createProjectWindow('/somewhere/a-project')

    expect(second).not.toBe(first)
    expect(constructed).toHaveBeenCalledTimes(2)
    expect(projectPathForWebContents(first.webContents.id)).toBeUndefined()
    expect(projectPathForWebContents(second.webContents.id)).toBe('/somewhere/a-project')
  })

  it('keeps its own window when a different project closes', () => {
    const kept = createProjectWindow('/somewhere/a-project')
    const other = createProjectWindow('/somewhere/another-project')
    close(other)

    expect(createProjectWindow('/somewhere/a-project')).toBe(kept)
    expect(constructed).toHaveBeenCalledTimes(2)
  })
})

/**
 * A renderer that never loads used to wedge the app invisibly: the window is
 * created hidden and shown only on `ready-to-show`, which never fires, so
 * nothing appeared, nothing said why, and `window-all-closed` never ran — the
 * process just sat there. A failed load must end the window instead.
 */
describe('a renderer that fails to load', () => {
  it('tears the window down instead of leaving it hidden forever', () => {
    createProjectWindow('/somewhere/a-project')
    failLoad()

    expect(destroyed).toHaveBeenCalledTimes(1)
  })

  it('says why, so the failure is not silent', () => {
    createProjectWindow('/somewhere/a-project')
    failLoad()

    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('ERR_FAILED'))
  })

  it('ignores an aborted navigation, which is not a failure', () => {
    // -3 is ERR_ABORTED: an ordinary cancelled or superseded navigation.
    createProjectWindow('/somewhere/a-project')
    failLoad({ errorCode: -3 })

    expect(destroyed).not.toHaveBeenCalled()
  })

  it('ignores a sub-frame failure, which leaves the renderer itself alive', () => {
    createProjectWindow('/somewhere/a-project')
    failLoad({ isMainFrame: false })

    expect(destroyed).not.toHaveBeenCalled()
  })
})
