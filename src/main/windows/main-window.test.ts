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
type WebContentsHandler = (...args: unknown[]) => void
let webContentsHandlers = new Map<string, WebContentsHandler>()

vi.mock('electron', () => {
  class BrowserWindow {
    webContents = {
      id: nextWebContentsId++,
      on: (event: string, handler: WebContentsHandler) => {
        webContentsHandlers.set(event, handler)
      }
    }

    constructor(options: unknown) {
      constructed(options)
    }

    on() {}
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

const { createProjectWindow, projectPathForWebContents } = await import('./main-window')

interface CapturedOptions {
  title: string
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

beforeEach(() => {
  constructed.mockClear()
  destroyed.mockClear()
  webContentsHandlers = new Map()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('the project window', () => {
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
