import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
const projectBridge = await import('../src/main/project-bridge')
const railBridge = await import('../src/main/rail-bridge')
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

it('answers the branch channel on the same literal from both sides', () => {
  expect(preload.PROJECT_BRANCH_CHANNEL).toBe(projectBridge.PROJECT_BRANCH_CHANNEL)
  expect(preload.PROJECT_BRANCH_CHANNEL).toBe('project:branch')
  expect(registeredHandlers.has(projectBridge.PROJECT_BRANCH_CHANNEL)).toBe(true)
})

it('answers the rail channels on the same literals from both sides', () => {
  expect(preload.RAIL_GET_CHANNEL).toBe(railBridge.RAIL_GET_CHANNEL)
  expect(preload.RAIL_CHANGED_CHANNEL).toBe(railBridge.RAIL_CHANGED_CHANNEL)
  expect(preload.RAIL_GET_CHANNEL).toBe('rail:get')
  expect(preload.RAIL_CHANGED_CHANNEL).toBe('rail:changed')
  expect(registeredHandlers.has(railBridge.RAIL_GET_CHANNEL)).toBe(true)
})

it('exposes exactly six named methods, and no channel passthrough', () => {
  const harness = exposedApis.get('harness')

  expect(harness).toBeDefined()
  expect(Object.keys(harness ?? {})).toEqual([
    'getProjectPath',
    'getInstall',
    'onInstallChanged',
    'getBranch',
    'getRail',
    'onRailChanged'
  ])
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
  const snapshot = { revision: 1, agents: [], menus: {}, errors: [], preflight: [] }
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

  const snapshot = { revision: 2, agents: [], menus: {}, errors: [], preflight: [] }
  ;(added[0] as (event: unknown, snapshot: unknown) => void)({ sender: 'raw event' }, snapshot)
  expect(received).toEqual([snapshot])

  unsubscribe()
  expect(removed).toEqual([[installBridge.INSTALL_CHANGED_CHANNEL, added[0]]])
  expect(listeners.get(installBridge.INSTALL_CHANGED_CHANNEL)?.size).toBe(0)
})

it('turns a refused rail:get into a rejection carrying the envelope', async () => {
  const error = { code: 'rail/no-project', message: 'rail · no project is open' }
  invoke.mockResolvedValue({ ok: false, error })
  const getRail = exposedApis.get('harness')?.getRail as () => Promise<unknown>

  await expect(getRail()).rejects.toEqual(error)
  expect(invoke).toHaveBeenCalledWith(railBridge.RAIL_GET_CHANNEL)
})

it('resolves the rail snapshot itself when rail:get succeeds', async () => {
  const snapshot = { revision: 1, rows: [] }
  invoke.mockResolvedValue({ ok: true, snapshot })
  const getRail = exposedApis.get('harness')?.getRail as () => Promise<unknown>

  await expect(getRail()).resolves.toEqual(snapshot)
})

it('hands a rail subscriber the snapshot and never the event, and unsubscribes that very listener', () => {
  const onRailChanged = exposedApis.get('harness')?.onRailChanged as (
    listener: (snapshot: unknown) => void
  ) => () => void
  const received: unknown[] = []

  const unsubscribe = onRailChanged((snapshot) => received.push(snapshot))
  const added = [...(listeners.get(railBridge.RAIL_CHANGED_CHANNEL) ?? [])]
  expect(added).toHaveLength(1)

  const snapshot = { revision: 2, rows: [] }
  ;(added[0] as (event: unknown, snapshot: unknown) => void)({ sender: 'raw event' }, snapshot)
  expect(received).toEqual([snapshot])

  removed.length = 0
  unsubscribe()
  expect(removed).toEqual([[railBridge.RAIL_CHANGED_CHANNEL, added[0]]])
  expect(listeners.get(railBridge.RAIL_CHANGED_CHANNEL)?.size).toBe(0)
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

it('sends getBranch down the branch channel and resolves what main answers', async () => {
  invoke.mockResolvedValue('feat/payouts-prd')
  const getBranch = exposedApis.get('harness')?.getBranch as () => Promise<string | null>

  await expect(getBranch()).resolves.toBe('feat/payouts-prd')
  expect(invoke).toHaveBeenCalledWith(projectBridge.PROJECT_BRANCH_CHANNEL)
})

it('answers the branch of a window with none for a window it does not know', async () => {
  const handler = registeredHandlers.get(projectBridge.PROJECT_BRANCH_CHANNEL)

  await expect(handler?.({ sender: { id: 987654 } })).resolves.toBeNull()
})

it('answers a known window with the branch read from its own project', async () => {
  const root = mkdtempSync(join(tmpdir(), 'bridge-branch-'))
  try {
    mkdirSync(join(root, '.git'))
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/x\n')
    const window = createProjectWindow(root)
    const handler = registeredHandlers.get(projectBridge.PROJECT_BRANCH_CHANNEL)

    await expect(handler?.({ sender: { id: window.webContents.id } })).resolves.toBe('x')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
