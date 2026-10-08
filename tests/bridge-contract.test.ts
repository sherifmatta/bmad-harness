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
    webUtils: { getPathForFile: (file: { path: string }) => file.path },
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
const docBridge = await import('../src/main/doc-bridge')
const welcomeBridge = await import('../src/main/welcome-bridge')
const sessionBridge = await import('../src/main/session-bridge')
const preload = await import('../src/preload/index')
const docPreload = await import('../src/preload/doc')
const welcomePreload = await import('../src/preload/welcome')
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

it('answers the document channels on the same literals from both sides', () => {
  // The shell's two: a command in, a path back.
  expect(preload.DOC_OPEN_CHANNEL).toBe(docBridge.DOC_OPEN_CHANNEL)
  expect(preload.DOC_CLOSED_CHANNEL).toBe(docBridge.DOC_CLOSED_CHANNEL)
  expect(preload.DOC_OPEN_CHANNEL).toBe('doc:open')
  expect(preload.DOC_CLOSED_CHANNEL).toBe('doc:closed')
  // The document window's five.
  expect(docPreload.DOC_GET_CHANNEL).toBe(docBridge.DOC_GET_CHANNEL)
  expect(docPreload.DOC_CHANGED_CHANNEL).toBe(docBridge.DOC_CHANGED_CHANNEL)
  expect(docPreload.DOC_REVEAL_CHANNEL).toBe(docBridge.DOC_REVEAL_CHANNEL)
  expect(docPreload.DOC_EDIT_CHANNEL).toBe(docBridge.DOC_EDIT_CHANNEL)
  expect(docPreload.DOC_CLOSE_CHANNEL).toBe(docBridge.DOC_CLOSE_CHANNEL)
  expect(
    [
      docPreload.DOC_GET_CHANNEL,
      docPreload.DOC_CHANGED_CHANNEL,
      docPreload.DOC_REVEAL_CHANNEL,
      docPreload.DOC_EDIT_CHANNEL,
      docPreload.DOC_CLOSE_CHANNEL
    ]
  ).toEqual(['doc:get', 'doc:changed', 'doc:reveal', 'doc:open-in-editor', 'doc:close'])
  // Every channel main answers is registered with ipcMain.handle.
  for (const channel of [
    docBridge.DOC_OPEN_CHANNEL,
    docBridge.DOC_GET_CHANNEL,
    docBridge.DOC_REVEAL_CHANNEL,
    docBridge.DOC_EDIT_CHANNEL,
    docBridge.DOC_CLOSE_CHANNEL
  ]) {
    expect(registeredHandlers.has(channel), channel).toBe(true)
  }
})

it('answers the Welcome channels on the same literals from both sides', () => {
  expect(welcomePreload.WELCOME_RECENT_CHANNEL).toBe(welcomeBridge.WELCOME_RECENT_CHANNEL)
  expect(welcomePreload.WELCOME_CHOOSE_CHANNEL).toBe(welcomeBridge.WELCOME_CHOOSE_CHANNEL)
  expect(welcomePreload.WELCOME_OPEN_RECENT_CHANNEL).toBe(welcomeBridge.WELCOME_OPEN_RECENT_CHANNEL)
  expect(welcomePreload.WELCOME_OPEN_DROPPED_CHANNEL).toBe(welcomeBridge.WELCOME_OPEN_DROPPED_CHANNEL)
  expect([
    welcomePreload.WELCOME_RECENT_CHANNEL,
    welcomePreload.WELCOME_CHOOSE_CHANNEL,
    welcomePreload.WELCOME_OPEN_RECENT_CHANNEL,
    welcomePreload.WELCOME_OPEN_DROPPED_CHANNEL
  ]).toEqual(['welcome:recent', 'welcome:choose', 'welcome:open-recent', 'welcome:open-dropped'])
  // Main registered all four when the composition root loaded.
  for (const channel of [
    welcomeBridge.WELCOME_RECENT_CHANNEL,
    welcomeBridge.WELCOME_CHOOSE_CHANNEL,
    welcomeBridge.WELCOME_OPEN_RECENT_CHANNEL,
    welcomeBridge.WELCOME_OPEN_DROPPED_CHANNEL
  ]) {
    expect(registeredHandlers.has(channel), channel).toBe(true)
  }
})

it('exposes exactly seventeen named methods, and no channel passthrough', () => {
  const harness = exposedApis.get('harness')

  expect(harness).toBeDefined()
  expect(Object.keys(harness ?? {})).toEqual([
    'getProjectPath',
    'getInstall',
    'onInstallChanged',
    'getBranch',
    'getRail',
    'onRailChanged',
    'openDoc',
    'onDocClosed',
    'openSession',
    'closeSession',
    'sendTurn',
    'dispatchMenu',
    'stopRun',
    'getConversation',
    'endConversation',
    'onSessionEvent',
    'onRunRevealed'
  ])
  expect(harness?.invoke).toBeUndefined()
  expect(harness?.send).toBeUndefined()
})

it('exposes the document window exactly five named methods, none of which takes a path', () => {
  const docWindow = exposedApis.get('docWindow')

  expect(docWindow).toBeDefined()
  expect(Object.keys(docWindow ?? {})).toEqual([
    'getDocument',
    'onDocumentChanged',
    'revealInFinder',
    'openInEditor',
    'close'
  ])
  expect(docWindow?.invoke).toBeUndefined()
  expect(docWindow?.send).toBeUndefined()
  for (const method of Object.values(docWindow ?? {})) {
    expect((method as () => unknown).length).toBe(method === docWindow?.onDocumentChanged ? 1 : 0)
  }
  // And the shell's bridge does not carry the document window's methods.
  expect(exposedApis.get('harness')?.getDocument).toBeUndefined()
})

it('exposes the Welcome exactly four named methods, and no channel passthrough', () => {
  const welcome = exposedApis.get('welcome')

  expect(welcome).toBeDefined()
  expect(Object.keys(welcome ?? {})).toEqual(['getRecent', 'chooseFolder', 'openRecent', 'openDropped'])
  expect(welcome?.invoke).toBeUndefined()
  expect(welcome?.send).toBeUndefined()
  // Each speaks only its own channel, so no method of the Welcome is another window's.
  for (const other of ['harness', 'docWindow']) {
    for (const method of Object.keys(welcome ?? {})) {
      expect(exposedApis.get(other)?.[method], `${other}.${method}`).toBeUndefined()
    }
  }
  // The counts of the other two are untouched by the Welcome's arrival.
  expect(Object.keys(exposedApis.get('harness') ?? {})).toHaveLength(17)
  expect(Object.keys(exposedApis.get('docWindow') ?? {})).toHaveLength(5)
})

it('sends each Welcome method down its own channel, with only the path or paths it was given', async () => {
  const welcome = exposedApis.get('welcome') as {
    getRecent: () => Promise<unknown>
    chooseFolder: () => Promise<unknown>
    openRecent: (path: string) => Promise<unknown>
    openDropped: (files: { path: string }[]) => Promise<unknown>
  }
  invoke.mockClear()
  invoke.mockResolvedValue({ ok: true })

  await welcome.getRecent()
  await welcome.chooseFolder()
  await welcome.openRecent('/work/falcon')
  await welcome.openDropped([{ path: '/work/a' }, { path: '/work/b' }])

  expect(invoke.mock.calls).toEqual([
    [welcomeBridge.WELCOME_RECENT_CHANNEL],
    [welcomeBridge.WELCOME_CHOOSE_CHANNEL],
    [welcomeBridge.WELCOME_OPEN_RECENT_CHANNEL, '/work/falcon'],
    // The file-path lookup is the preload's: the page hands over Files and main hears paths.
    [welcomeBridge.WELCOME_OPEN_DROPPED_CHANNEL, ['/work/a', '/work/b']]
  ])
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

it('sends openDoc down the open channel with the row’s path, and resolves with nothing', async () => {
  invoke.mockClear()
  invoke.mockResolvedValue({ ok: true })
  const openDoc = exposedApis.get('harness')?.openDoc as (path: string) => Promise<unknown>

  await expect(openDoc('_bmad/planning-artifacts/prd.md')).resolves.toBeUndefined()
  expect(invoke).toHaveBeenCalledWith(docBridge.DOC_OPEN_CHANNEL, '_bmad/planning-artifacts/prd.md')
})

it('turns a refused doc:open into a rejection carrying the envelope', async () => {
  const error = { code: 'doc/invalid-path', message: 'doc · not a document under _bmad/' }
  invoke.mockResolvedValue({ ok: false, error })
  const openDoc = exposedApis.get('harness')?.openDoc as (path: string) => Promise<unknown>

  await expect(openDoc('../x')).rejects.toEqual(error)
})

it('hands an onDocClosed subscriber the path and never the event, and unsubscribes that very listener', () => {
  const onDocClosed = exposedApis.get('harness')?.onDocClosed as (
    listener: (path: string) => void
  ) => () => void
  const received: unknown[] = []

  const unsubscribe = onDocClosed((path) => received.push(path))
  const added = [...(listeners.get(docBridge.DOC_CLOSED_CHANNEL) ?? [])]
  expect(added).toHaveLength(1)

  ;(added[0] as (event: unknown, path: unknown) => void)({ sender: 'raw event' }, '_bmad/prd.md')
  expect(received).toEqual(['_bmad/prd.md'])

  removed.length = 0
  unsubscribe()
  expect(removed).toEqual([[docBridge.DOC_CLOSED_CHANNEL, added[0]]])
  expect(listeners.get(docBridge.DOC_CLOSED_CHANNEL)?.size).toBe(0)
})

it('hands an onRunRevealed subscriber the run id and never the event, on the channel spelled once, and unsubscribes that very listener', () => {
  const onRunRevealed = exposedApis.get('harness')?.onRunRevealed as (
    listener: (runId: string) => void
  ) => () => void
  const received: unknown[] = []

  const unsubscribe = onRunRevealed((runId) => received.push(runId))
  expect(preload.RUN_REVEALED_CHANNEL).toBe('run:revealed')
  const added = [...(listeners.get(preload.RUN_REVEALED_CHANNEL) ?? [])]
  expect(added).toHaveLength(1)

  ;(added[0] as (event: unknown, runId: unknown) => void)({ sender: 'raw event' }, 'run-1')
  expect(received).toEqual(['run-1'])

  removed.length = 0
  unsubscribe()
  expect(removed).toEqual([[preload.RUN_REVEALED_CHANNEL, added[0]]])
  expect(listeners.get(preload.RUN_REVEALED_CHANNEL)?.size).toBe(0)
})

it('turns a refused doc:get into a rejection carrying the envelope, and resolves the snapshot itself', async () => {
  const getDocument = exposedApis.get('docWindow')?.getDocument as () => Promise<unknown>
  const error = { code: 'doc/no-document', message: 'doc · no document is open for this window' }

  invoke.mockClear()
  invoke.mockResolvedValue({ ok: false, error })
  await expect(getDocument()).rejects.toEqual(error)
  expect(invoke).toHaveBeenCalledWith(docBridge.DOC_GET_CHANNEL)

  const snapshot = { revision: 1, path: '_bmad/a.md', state: 'present', text: 'x' }
  invoke.mockResolvedValue({ ok: true, snapshot })
  await expect(getDocument()).resolves.toEqual(snapshot)
})

it('hands a document subscriber the snapshot and never the event, and unsubscribes that very listener', () => {
  const onDocumentChanged = exposedApis.get('docWindow')?.onDocumentChanged as (
    listener: (snapshot: unknown) => void
  ) => () => void
  const received: unknown[] = []

  const unsubscribe = onDocumentChanged((snapshot) => received.push(snapshot))
  const added = [...(listeners.get(docBridge.DOC_CHANGED_CHANNEL) ?? [])]
  expect(added).toHaveLength(1)

  const snapshot = { revision: 2, text: 'y' }
  ;(added[0] as (event: unknown, snapshot: unknown) => void)({ sender: 'raw event' }, snapshot)
  expect(received).toEqual([snapshot])

  removed.length = 0
  unsubscribe()
  expect(removed).toEqual([[docBridge.DOC_CHANGED_CHANNEL, added[0]]])
  expect(listeners.get(docBridge.DOC_CHANGED_CHANNEL)?.size).toBe(0)
})

it.each([
  ['revealInFinder', docBridge.DOC_REVEAL_CHANNEL],
  ['openInEditor', docBridge.DOC_EDIT_CHANNEL],
  ['close', docBridge.DOC_CLOSE_CHANNEL]
])('sends %s down its own channel with no argument, and rejects with the envelope if refused', async (method, channel) => {
  const call = exposedApis.get('docWindow')?.[method] as () => Promise<unknown>

  invoke.mockClear()
  invoke.mockResolvedValue({ ok: true })
  await expect(call()).resolves.toBeUndefined()
  expect(invoke).toHaveBeenCalledWith(channel)

  const error = { code: 'doc/no-document', message: 'doc · no document is open for this window' }
  invoke.mockResolvedValue({ ok: false, error })
  await expect(call()).rejects.toEqual(error)
})

it('answers the session channels on the same literals from both sides', () => {
  expect(preload.SESSION_OPEN_CHANNEL).toBe(sessionBridge.SESSION_OPEN_CHANNEL)
  expect(preload.TURN_SEND_CHANNEL).toBe(sessionBridge.TURN_SEND_CHANNEL)
  expect(preload.SESSION_EVENT_CHANNEL).toBe(sessionBridge.SESSION_EVENT_CHANNEL)
  expect([preload.SESSION_OPEN_CHANNEL, preload.TURN_SEND_CHANNEL, preload.SESSION_EVENT_CHANNEL]).toEqual([
    'session:open',
    'turn:send',
    'session:event'
  ])
  expect(registeredHandlers.has(sessionBridge.SESSION_OPEN_CHANNEL)).toBe(true)
  expect(registeredHandlers.has(sessionBridge.TURN_SEND_CHANNEL)).toBe(true)
})

it('answers the close channel on the same literal from both sides', () => {
  expect(preload.SESSION_CLOSE_CHANNEL).toBe(sessionBridge.SESSION_CLOSE_CHANNEL)
  expect(preload.SESSION_CLOSE_CHANNEL).toBe('session:close')
  expect(registeredHandlers.has(sessionBridge.SESSION_CLOSE_CHANNEL)).toBe(true)
})

it('sends closeSession down the close channel with the session id, resolves with nothing and rejects with the envelope', async () => {
  const closeSession = exposedApis.get('harness')?.closeSession as (id: string) => Promise<unknown>
  invoke.mockClear()
  invoke.mockResolvedValue({ ok: true })

  await expect(closeSession('s1')).resolves.toBeUndefined()
  expect(invoke).toHaveBeenCalledWith(sessionBridge.SESSION_CLOSE_CHANNEL, 's1')

  const error = { code: 'session/not-found', message: 'session · no such session is open' }
  invoke.mockResolvedValue({ ok: false, error })
  await expect(closeSession('s1')).rejects.toEqual(error)
})

it('answers the conversation channel on the same literal from both sides', () => {
  expect(preload.CONVERSATION_GET_CHANNEL).toBe(sessionBridge.CONVERSATION_GET_CHANNEL)
  expect(preload.CONVERSATION_GET_CHANNEL).toBe('conversation:get')
  expect(registeredHandlers.has(sessionBridge.CONVERSATION_GET_CHANNEL)).toBe(true)
})

it('answers the end channel on the same literal from both sides', () => {
  expect(preload.CONVERSATION_END_CHANNEL).toBe(sessionBridge.CONVERSATION_END_CHANNEL)
  expect(preload.CONVERSATION_END_CHANNEL).toBe('conversation:end')
  expect(registeredHandlers.has(sessionBridge.CONVERSATION_END_CHANNEL)).toBe(true)
})

it('sends endConversation down the end channel with the project id, resolves with nothing and rejects with the envelope', async () => {
  const endConversation = exposedApis.get('harness')?.endConversation as (id: string) => Promise<unknown>
  invoke.mockClear()
  invoke.mockResolvedValue({ ok: true })

  await expect(endConversation('/work/project')).resolves.toBeUndefined()
  expect(invoke).toHaveBeenCalledWith(sessionBridge.CONVERSATION_END_CHANNEL, '/work/project')

  const error = { code: 'conversation/end-failed', message: 'conversation · could not end the conversation', detail: 'EACCES' }
  invoke.mockResolvedValue({ ok: false, error })
  await expect(endConversation('/work/project')).rejects.toEqual(error)
})

it('resolves the snapshot itself when conversation:get succeeds, and rejects with the envelope when it is refused', async () => {
  const getConversation = exposedApis.get('harness')?.getConversation as () => Promise<unknown>
  const snapshot = { entries: [], sessions: [], busy: [], personas: [], runs: [] }
  invoke.mockClear()
  invoke.mockResolvedValue({ ok: true, snapshot })

  await expect(getConversation()).resolves.toEqual(snapshot)
  expect(invoke).toHaveBeenCalledWith(sessionBridge.CONVERSATION_GET_CHANNEL)

  const error = { code: 'conversation/no-project', message: 'conversation · no project is open for this window' }
  invoke.mockResolvedValue({ ok: false, error })
  await expect(getConversation()).rejects.toEqual(error)
})

it('sends openSession down the open channel with the agent id, and resolves with the session id', async () => {
  invoke.mockClear()
  invoke.mockResolvedValue({ ok: true, sessionId: 's1' })
  const openSession = exposedApis.get('harness')?.openSession as (id: string) => Promise<unknown>

  await expect(openSession('bmad-agent-pm')).resolves.toEqual({ sessionId: 's1' })
  expect(invoke).toHaveBeenCalledWith(sessionBridge.SESSION_OPEN_CHANNEL, 'bmad-agent-pm')
})

it('sends a room’s cast down the same open channel, as the object it was given, and resolves as for a persona', async () => {
  invoke.mockClear()
  invoke.mockResolvedValue({ ok: true, sessionId: 's9' })
  const openSession = exposedApis.get('harness')?.openSession as (target: unknown) => Promise<unknown>

  await expect(openSession({ room: ['bmad-agent-pm', 'bmad-agent-dev'] })).resolves.toEqual({ sessionId: 's9' })
  expect(invoke).toHaveBeenCalledWith(sessionBridge.SESSION_OPEN_CHANNEL, { room: ['bmad-agent-pm', 'bmad-agent-dev'] })
})

it('copies the room’s own cast and open time from the reply into the opened session', async () => {
  invoke.mockClear()
  const room = { cast: ['bmad-agent-pm', 'bmad-agent-dev'], openedAt: 5 }
  invoke.mockResolvedValue({ ok: true, sessionId: 's9', room })
  const openSession = exposedApis.get('harness')?.openSession as (target: unknown) => Promise<unknown>

  await expect(openSession({ room: ['bmad-agent-pm', 'bmad-agent-dev'] })).resolves.toEqual({ sessionId: 's9', room })
})

it('resolves openSession with the handoff sysline when main answered with one, and with no other field', async () => {
  const handoff = { kind: 'sysline', id: 'm-3', at: 9, text: 'handed off · Mary → John' }
  invoke.mockClear()
  invoke.mockResolvedValue({ ok: true, sessionId: 's2', handoff, stray: 'x' })
  const openSession = exposedApis.get('harness')?.openSession as (id: string) => Promise<unknown>

  await expect(openSession('bmad-agent-pm')).resolves.toEqual({ sessionId: 's2', handoff })
})

it('turns a refused session:open into a rejection carrying the envelope', async () => {
  const error = { code: 'session/invalid-agent', message: 'session · not a valid agent id' }
  invoke.mockResolvedValue({ ok: false, error })
  const openSession = exposedApis.get('harness')?.openSession as (id: string) => Promise<unknown>

  await expect(openSession('../x')).rejects.toEqual(error)
})

it('sends sendTurn down the turn channel with the session id and the text', async () => {
  invoke.mockClear()
  invoke.mockResolvedValue({ ok: true })
  const sendTurn = exposedApis.get('harness')?.sendTurn as (id: string, text: string) => Promise<unknown>

  await expect(sendTurn('s1', 'hello')).resolves.toBeUndefined()
  expect(invoke).toHaveBeenCalledWith(sessionBridge.TURN_SEND_CHANNEL, 's1', 'hello')
})

it('turns a refused turn:send into a rejection carrying the envelope', async () => {
  const error = { code: 'session/busy', message: 'session · a turn is already in flight' }
  invoke.mockResolvedValue({ ok: false, error })
  const sendTurn = exposedApis.get('harness')?.sendTurn as (id: string, text: string) => Promise<unknown>

  await expect(sendTurn('s1', 'hello')).rejects.toEqual(error)
})

it('sends dispatchMenu down the menu channel with the session id and the code, on the literal main answers', async () => {
  invoke.mockClear()
  invoke.mockResolvedValue({ ok: true, runId: 'r1' })
  const dispatchMenu = exposedApis.get('harness')?.dispatchMenu as (id: string, code: string) => Promise<unknown>

  await dispatchMenu('s1', 'CP')
  expect(preload.MENU_DISPATCH_CHANNEL).toBe(sessionBridge.MENU_DISPATCH_CHANNEL)
  expect(preload.MENU_DISPATCH_CHANNEL).toBe('menu:dispatch')
  expect(registeredHandlers.has(sessionBridge.MENU_DISPATCH_CHANNEL)).toBe(true)
  expect(invoke).toHaveBeenCalledWith(sessionBridge.MENU_DISPATCH_CHANNEL, 's1', 'CP')
})

it('resolves dispatchMenu with the run id when main took the dispatch', async () => {
  invoke.mockResolvedValue({ ok: true, runId: 'run-7' })
  const dispatchMenu = exposedApis.get('harness')?.dispatchMenu as (id: string, code: string) => Promise<unknown>

  await expect(dispatchMenu('s1', 'CP')).resolves.toBe('run-7')
})

it('turns a refused menu:dispatch into a rejection carrying the envelope', async () => {
  const error = { code: 'menu/unknown-entry', message: 'menu · this persona has no such entry' }
  invoke.mockResolvedValue({ ok: false, error })
  const dispatchMenu = exposedApis.get('harness')?.dispatchMenu as (id: string, code: string) => Promise<unknown>

  await expect(dispatchMenu('s1', 'ZZ')).rejects.toEqual(error)
})

it('sends stopRun down the stop channel with the run id, on the literal main answers, and resolves with nothing', async () => {
  invoke.mockClear()
  invoke.mockResolvedValue({ ok: true })
  const stopRun = exposedApis.get('harness')?.stopRun as (id: string) => Promise<unknown>

  await expect(stopRun('r1')).resolves.toBeUndefined()
  expect(preload.RUN_STOP_CHANNEL).toBe(sessionBridge.RUN_STOP_CHANNEL)
  expect(preload.RUN_STOP_CHANNEL).toBe('run:stop')
  expect(registeredHandlers.has(sessionBridge.RUN_STOP_CHANNEL)).toBe(true)
  expect(invoke).toHaveBeenCalledWith(sessionBridge.RUN_STOP_CHANNEL, 'r1')
})

it('turns a refused run:stop into a rejection carrying the envelope', async () => {
  const error = { code: 'run/not-found', message: 'run · no such run is in flight' }
  invoke.mockResolvedValue({ ok: false, error })
  const stopRun = exposedApis.get('harness')?.stopRun as (id: string) => Promise<unknown>

  await expect(stopRun('r9')).rejects.toEqual(error)
})

it('hands a session subscriber the contract event and never the IPC event, and unsubscribes that very listener', () => {
  const onSessionEvent = exposedApis.get('harness')?.onSessionEvent as (
    listener: (event: unknown) => void
  ) => () => void
  const received: unknown[] = []

  const unsubscribe = onSessionEvent((event) => received.push(event))
  const added = [...(listeners.get(sessionBridge.SESSION_EVENT_CHANNEL) ?? [])]
  expect(added).toHaveLength(1)

  const event = { name: 'session:awaiting-turn', payload: { sessionId: 's1', at: 1 } }
  ;(added[0] as (event: unknown, payload: unknown) => void)({ sender: 'raw event' }, event)
  expect(received).toEqual([event])

  removed.length = 0
  unsubscribe()
  expect(removed).toEqual([[sessionBridge.SESSION_EVENT_CHANNEL, added[0]]])
  expect(listeners.get(sessionBridge.SESSION_EVENT_CHANNEL)?.size).toBe(0)
})
