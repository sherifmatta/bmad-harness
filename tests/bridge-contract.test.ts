import { expect, it, vi } from 'vitest'

/**
 * The `project:path` bridge is two independent string literals — one in main,
 * one in the preload — because `src/shared/` stays empty until Story 2.2.
 * Renaming either one alone leaves lint, typecheck and build green while the
 * window renders an error, so the tie is held here instead.
 *
 * This lives in tests/ rather than in either half: importing the preload from
 * main (or the reverse) is exactly the layering violation eslint.config.mjs
 * forbids.
 */

type InvokeEvent = { sender: { id: number } }

const registeredHandlers = new Map<string, (event: InvokeEvent) => unknown>()
const exposedApis = new Map<string, Record<string, unknown>>()
const invoke = vi.fn()
let nextWebContentsId = 1

vi.mock('electron', () => {
  class BrowserWindow {
    webContents = { id: nextWebContentsId++ }
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
      // Never settles: startup wiring is src/main/startup.test.ts's subject.
      whenReady: () => new Promise<void>(() => {}),
      on: () => {},
      quit: vi.fn(),
      exit: vi.fn(),
      isPackaged: false
    },
    dialog: { showOpenDialog: vi.fn(), showErrorBox: vi.fn() },
    ipcMain: {
      handle: (channel: string, handler: (event: InvokeEvent) => unknown) =>
        registeredHandlers.set(channel, handler)
    },
    ipcRenderer: { invoke: (...args: unknown[]) => invoke(...args) },
    contextBridge: {
      exposeInMainWorld: (key: string, api: Record<string, unknown>) => exposedApis.set(key, api)
    }
  }
})

const main = await import('../src/main/index')
const preload = await import('../src/preload/index')
const { createProjectWindow } = await import('../src/main/windows/main-window')

it('answers on the same channel from both sides', () => {
  expect(preload.PROJECT_PATH_CHANNEL).toBe(main.PROJECT_PATH_CHANNEL)
  expect(registeredHandlers.has(main.PROJECT_PATH_CHANNEL)).toBe(true)
})

it('exposes exactly one named method, and no channel passthrough', () => {
  const harness = exposedApis.get('harness')

  expect(harness).toBeDefined()
  expect(Object.keys(harness ?? {})).toEqual(['getProjectPath'])
  expect(harness?.invoke).toBeUndefined()
})

it('sends that method down the channel main is listening on', async () => {
  invoke.mockResolvedValue('/somewhere/a-project')
  const getProjectPath = exposedApis.get('harness')?.getProjectPath as () => Promise<string>

  await expect(getProjectPath()).resolves.toBe('/somewhere/a-project')
  expect(invoke).toHaveBeenCalledWith(main.PROJECT_PATH_CHANNEL)
})

it('answers a window with its own project, and refuses a window it does not know', () => {
  const window = createProjectWindow('/somewhere/a-project')
  const handler = registeredHandlers.get(main.PROJECT_PATH_CHANNEL)

  expect(handler?.({ sender: { id: window.webContents.id } })).toBe('/somewhere/a-project')
  expect(() => handler?.({ sender: { id: window.webContents.id + 1000 } })).toThrow(
    /no project is open/
  )
})
