import { basename } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The security posture is a constructor argument, which means nothing watches
 * it unless something asserts it. Flipping `sandbox` to `false` must fail here.
 */

const constructed = vi.fn()
let nextWebContentsId = 1

vi.mock('electron', () => {
  class BrowserWindow {
    webContents = { id: nextWebContentsId++ }

    constructor(options: unknown) {
      constructed(options)
    }

    on() {}
    once() {}
    show() {}
    loadURL() {}
    loadFile() {}
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

beforeEach(() => {
  constructed.mockClear()
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
