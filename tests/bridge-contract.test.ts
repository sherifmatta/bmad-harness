import { expect, it, vi } from 'vitest'

/**
 * Each bridge channel is two independent string literals — one in main, one in
 * the preload. Renaming either one alone leaves lint, typecheck and build green
 * while the window renders an error, so the tie is held here instead.
 *
 * This lives in tests/ rather than in either half: importing the preload from
 * main (or the reverse) is exactly the layering violation eslint.config.mjs
 * forbids.
 */

type InvokeEvent = { sender: { id: number } }

const registeredHandlers = new Map<string, (event: InvokeEvent) => unknown>()
const exposedApis = new Map<string, Record<string, unknown>>()
const invoke = vi.fn()
const listeners = new Map<string, Set<unknown>>()
const removed: [string, unknown][] = []
let nextWebContentsId = 1

vi.mock('electron', () => {
  class BrowserWindow {
    webContents = { id: nextWebContentsId++, on() {} }
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
    ipcRenderer: {
      invoke: (...args: unknown[]) => invoke(...args),
      on: (channel: string, listener: unknown) => {
        listeners.set(channel, (listeners.get(channel) ?? new Set()).add(listener))
      },
      removeListener: (channel: string, listener: unknown) => {
        listeners.get(channel)?.delete(listener)
        removed.push([channel, listener])
      }
    },
    contextBridge: {
      exposeInMainWorld: (key: string, api: Record<string, unknown>) => exposedApis.set(key, api)
    }
  }
})

const main = await import('../src/main/index')
const installBridge = await import('../src/main/install-bridge')
const preload = await import('../src/preload/index')
const { createProjectWindow } = await import('../src/main/windows/main-window')

it('answers on the same channel from both sides', () => {
  expect(preload.PROJECT_PATH_CHANNEL).toBe(main.PROJECT_PATH_CHANNEL)
  expect(registeredHandlers.has(main.PROJECT_PATH_CHANNEL)).toBe(true)
})

it('answers the install channels on the same literals from both sides', () => {
  expect(preload.INSTALL_GET_CHANNEL).toBe(installBridge.INSTALL_GET_CHANNEL)
  expect(preload.INSTALL_CHANGED_CHANNEL).toBe(installBridge.INSTALL_CHANGED_CHANNEL)
  expect(registeredHandlers.has(installBridge.INSTALL_GET_CHANNEL)).toBe(true)
})

it('exposes exactly three named methods, and no channel passthrough', () => {
  const harness = exposedApis.get('harness')

  expect(harness).toBeDefined()
  expect(Object.keys(harness ?? {})).toEqual(['getProjectPath', 'getInstall', 'onInstallChanged'])
  expect(harness?.invoke).toBeUndefined()
})

it('turns a refused install:get into a rejection carrying the envelope', async () => {
  const error = { code: 'install/no-project', message: 'install · no project is open' }
  invoke.mockResolvedValue({ ok: false, error })
  const getInstall = exposedApis.get('harness')?.getInstall as () => Promise<unknown>

  await expect(getInstall()).rejects.toEqual(error)
  expect(invoke).toHaveBeenCalledWith(installBridge.INSTALL_GET_CHANNEL)
})

it('resolves the snapshot itself when install:get succeeds', async () => {
  const snapshot = { revision: 1, agents: [], menus: {}, errors: [] }
  invoke.mockResolvedValue({ ok: true, snapshot })
  const getInstall = exposedApis.get('harness')?.getInstall as () => Promise<unknown>

  await expect(getInstall()).resolves.toEqual(snapshot)
})

it('hands a subscriber the snapshot and never the event, and unsubscribes that very listener', () => {
  const onInstallChanged = exposedApis.get('harness')?.onInstallChanged as (
    listener: (snapshot: unknown) => void
  ) => () => void
  const received: unknown[] = []

  const unsubscribe = onInstallChanged((snapshot) => received.push(snapshot))
  const added = [...(listeners.get(installBridge.INSTALL_CHANGED_CHANNEL) ?? [])]
  expect(added).toHaveLength(1)

  const snapshot = { revision: 2, agents: [], menus: {}, errors: [] }
  ;(added[0] as (event: unknown, snapshot: unknown) => void)({ sender: 'raw event' }, snapshot)
  expect(received).toEqual([snapshot])

  unsubscribe()
  expect(removed).toEqual([[installBridge.INSTALL_CHANGED_CHANNEL, added[0]]])
  expect(listeners.get(installBridge.INSTALL_CHANGED_CHANNEL)?.size).toBe(0)
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
