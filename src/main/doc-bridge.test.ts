import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChangeRow } from '../shared/changes'
import type { DocSnapshot } from '../shared/document'
import type { DocBoundary, DocRead } from './sources/project/watch-document'
import type { DocWindowCloseReason } from './windows/doc-window'

type Handler = (event: { sender: FakeSender }, ...args: unknown[]) => unknown

const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) }
}))

const {
  DOC_CHANGED_CHANNEL,
  DOC_CLOSE_CHANNEL,
  DOC_CLOSED_CHANNEL,
  DOC_EDIT_CHANNEL,
  DOC_GET_CHANNEL,
  DOC_OPEN_CHANNEL,
  DOC_REVEAL_CHANNEL,
  registerDocBridge
} = await import('./doc-bridge')

class FakeSender {
  sent: [string, unknown][] = []
  destroyed = false
  constructor(readonly id: number) {}
  send(channel: string, payload: unknown) {
    this.sent.push([channel, payload])
  }
  isDestroyed() {
    return this.destroyed
  }
  once() {}
}

class FakeParent {
  focused = 0
  destroyed = false
  webContents: FakeSender
  constructor(id: number) {
    this.webContents = new FakeSender(id)
  }
  isDestroyed() {
    return this.destroyed
  }
  focus() {
    this.focused += 1
  }
}

type FakeWatcher = {
  fullPath: string
  boundary: DocBoundary
  deliver: (read: DocRead) => void
  fail: (error: unknown) => void
  closed: boolean
}

type FakeWindow = {
  sender: FakeSender
  fullPath: string
  onClosed: (reason: DocWindowCloseReason) => void
  focusCalls: number
  closeCalls: number
}

let root: string
let outside: string
let parents: Map<number, FakeParent>
let watchers: FakeWatcher[]
let windows: FakeWindow[]
let revealed: unknown[]
let edited: unknown[]
let diagnostics: string[]
let watchThrows: Error | null
let nextDocId: number
/** The output folder the window's project is on: what bounds a document opened now (Story 5.4). */
let folder: string
/** The Changes rows main holds for project window 1 (Story 9.3), or `null` when it holds no list. */
let changeRows: ChangeRow[] | null

beforeEach(() => {
  handlers.clear()
  root = mkdtempSync(join(tmpdir(), 'doc-bridge-'))
  outside = mkdtempSync(join(tmpdir(), 'doc-bridge-outside-'))
  mkdirSync(join(root, '_bmad/planning-artifacts'), { recursive: true })
  writeFileSync(join(root, '_bmad/planning-artifacts/prd.md'), '# prd\n')
  writeFileSync(join(outside, 'secret.md'), 'secret')

  parents = new Map()
  watchers = []
  windows = []
  revealed = []
  edited = []
  diagnostics = []
  watchThrows = null
  nextDocId = 500
  folder = '_bmad/'
  changeRows = null

  registerDocBridge({
    changeRowsFor: (id) => (id === 1 ? changeRows : null),
    projectPathFor: (id) => (id < 100 ? root : undefined),
    folderFor: () => folder,
    parentWindowFor: (contents) => {
      const id = (contents as unknown as FakeSender).id
      if (!parents.has(id)) {
        parents.set(id, new FakeParent(id))
      }
      return parents.get(id) as never
    },
    watch: ({ fullPath, boundary, onRead, onError }) => {
      if (watchThrows !== null) {
        throw watchThrows
      }
      const watcher: FakeWatcher = { fullPath, boundary, deliver: onRead, fail: onError, closed: false }
      watchers.push(watcher)
      return { ready: Promise.resolve(), close: async () => void (watcher.closed = true) }
    },
    openWindow: ({ fullPath, onClosed }) => {
      const existing = windows.find((window) => window.fullPath === fullPath)
      if (existing !== undefined) {
        handleOf(existing).focus()
        return { handle: handleOf(existing), reused: true }
      }
      const window: FakeWindow = {
        sender: new FakeSender(nextDocId++),
        fullPath,
        onClosed,
        focusCalls: 0,
        closeCalls: 0
      }
      windows.push(window)
      return { handle: handleOf(window), reused: false }
    },
    reveal: (target) => revealed.push(target),
    openInEditor: (target) => edited.push(target),
    writeDiagnostic: (line) => diagnostics.push(line)
  })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

function handleOf(window: FakeWindow) {
  return {
    sender: window.sender,
    fullPath: window.fullPath,
    focus: () => void (window.focusCalls += 1),
    close: () => void (window.closeCalls += 1)
  }
}

const call = (channel: string, sender: FakeSender, ...args: unknown[]) =>
  handlers.get(channel)?.({ sender }, ...args)

const PRD = '_bmad/planning-artifacts/prd.md'
const present = (text: string): DocRead => ({ state: 'present', text, truncated: false })

/** Open `path` from project window 1 and hand back the window that opened. */
async function open(path: string = PRD, from = new FakeSender(1)) {
  const reply = await call(DOC_OPEN_CHANNEL, from, path)
  return { reply, window: windows[windows.length - 1], from }
}

describe('registering', () => {
  it('registers exactly the five handlers main answers, and starts nothing', () => {
    expect([...handlers.keys()].sort()).toEqual(
      [
        DOC_OPEN_CHANNEL,
        DOC_GET_CHANNEL,
        DOC_REVEAL_CHANNEL,
        DOC_EDIT_CHANNEL,
        DOC_CLOSE_CHANNEL
      ].sort()
    )
    expect(watchers).toEqual([])
    expect(windows).toEqual([])
  })

  it('names the seven channels', () => {
    expect([
      DOC_OPEN_CHANNEL,
      DOC_CLOSED_CHANNEL,
      DOC_GET_CHANNEL,
      DOC_CHANGED_CHANNEL,
      DOC_REVEAL_CHANNEL,
      DOC_EDIT_CHANNEL,
      DOC_CLOSE_CHANNEL
    ]).toEqual([
      'doc:open',
      'doc:closed',
      'doc:get',
      'doc:changed',
      'doc:reveal',
      'doc:open-in-editor',
      'doc:close'
    ])
  })
})

describe('doc:open', () => {
  it('opens one window and one watcher for a valid path, on the file’s absolute path', async () => {
    const { reply, window } = await open()

    expect(reply).toEqual({ ok: true })
    expect(windows).toHaveLength(1)
    expect(window.fullPath).toBe(join(root, PRD))
    expect(watchers.map((watcher) => watcher.fullPath)).toEqual([join(root, PRD)])
  })

  it.each([
    ['a parent segment', '../x'],
    ['an absolute path', '/etc/hosts'],
    ['a parent segment after _bmad', '_bmad/../x'],
    ['a backslash', 'x\\y'],
    ['an empty string', ''],
    ['a number', 7],
    ['no argument', undefined]
  ])('answers %s with doc/invalid-path and opens nothing', async (_name, path) => {
    const reply = await call(DOC_OPEN_CHANNEL, new FakeSender(1), path)

    expect(reply).toEqual({
      ok: false,
      error: { code: 'doc/invalid-path', message: 'doc · not a document under _bmad/' }
    })
    expect(windows).toEqual([])
    expect(watchers).toEqual([])
  })

  it('answers a document window, or an unknown sender, with doc/no-project and opens nothing', async () => {
    const reply = await call(DOC_OPEN_CHANNEL, new FakeSender(500), PRD)

    expect(reply).toEqual({
      ok: false,
      error: { code: 'doc/no-project', message: 'doc · no project is open for this window' }
    })
    expect(windows).toEqual([])
  })

  it('answers doc/no-project when the project window has gone', async () => {
    const from = new FakeSender(1)
    parents.set(1, Object.assign(new FakeParent(1), { destroyed: true }))

    expect(await call(DOC_OPEN_CHANNEL, from, PRD)).toMatchObject({
      ok: false,
      error: { code: 'doc/no-project' }
    })
    expect(windows).toEqual([])
  })

  it('opens a file that is not there, for a window in the missing state', async () => {
    const { reply } = await open('_bmad/planning-artifacts/gone.md')

    expect(reply).toEqual({ ok: true })
    // The watcher's first result is what the window is told.
    watchers[0].deliver({ state: 'missing' })
    expect(await call(DOC_GET_CHANNEL, windows[0].sender)).toMatchObject({
      ok: true,
      snapshot: { state: 'missing', text: '', path: '_bmad/planning-artifacts/gone.md' }
    })
  })

  it('opens a symlink out of _bmad in the refused state: nothing watched, nothing read', async () => {
    symlinkSync(join(outside, 'secret.md'), join(root, '_bmad/link.md'))

    const { reply, window } = await open('_bmad/link.md')

    expect(reply).toEqual({ ok: true })
    expect(watchers).toEqual([])
    expect(await call(DOC_GET_CHANNEL, window.sender)).toEqual({
      ok: true,
      snapshot: {
        revision: 1,
        path: '_bmad/link.md',
        fullPath: join(root, '_bmad/link.md'),
        kind: 'markdown',
        folder: '_bmad/',
        state: 'refused',
        text: '',
        truncated: false
      }
    })
  })

  it('focuses the window already open for that file and opens no second one', async () => {
    await open()
    await open()

    expect(windows).toHaveLength(1)
    expect(windows[0].focusCalls).toBe(1)
    expect(watchers).toHaveLength(1)
  })

  it('opens a second window for a different file: the registry, not the bridge, replaces the first', async () => {
    await open()
    await open('_bmad/planning-artifacts/other.md')

    expect(windows).toHaveLength(2)
    expect(watchers).toHaveLength(2)
  })

  it('answers doc/unexpected with the class name only, and closes the window it had made', async () => {
    watchThrows = new TypeError('no watcher for you')

    const reply = await call(DOC_OPEN_CHANNEL, new FakeSender(1), PRD)

    expect(reply).toEqual({
      ok: false,
      error: { code: 'doc/unexpected', message: 'doc · unexpected failure', detail: 'TypeError' }
    })
    expect(diagnostics).toEqual(['doc/unexpected · no watcher for you'])
    expect(windows[0].closeCalls).toBe(1)
  })
})

describe('doc:get', () => {
  it('refuses a sender that has no document window', async () => {
    expect(await call(DOC_GET_CHANNEL, new FakeSender(999))).toEqual({
      ok: false,
      error: { code: 'doc/no-document', message: 'doc · no document is open for this window' }
    })
    // A project window has no document of its own to ask for.
    expect(await call(DOC_GET_CHANNEL, new FakeSender(1))).toMatchObject({ ok: false })
  })

  it('waits for the watcher’s first result, then answers with the held snapshot', async () => {
    const { window } = await open()
    let settled = false
    const pending = Promise.resolve(call(DOC_GET_CHANNEL, window.sender)).then((reply) => {
      settled = true
      return reply
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    watchers[0].deliver(present('# hello'))
    const reply = (await pending) as { ok: true; snapshot: DocSnapshot }

    expect(reply.ok).toBe(true)
    expect(reply.snapshot).toEqual({
      revision: 1,
      path: PRD,
      fullPath: join(root, PRD),
      kind: 'markdown',
      folder: '_bmad/',
      state: 'present',
      text: '# hello',
      truncated: false
    })
  })

  it('reads the file itself never: it answers from the projection, however often it is asked', async () => {
    const { window } = await open()
    watchers[0].deliver(present('one'))

    await call(DOC_GET_CHANNEL, window.sender)
    await call(DOC_GET_CHANNEL, window.sender)

    expect(watchers).toHaveLength(1)
  })

  it('reads a non-markdown file as text', async () => {
    const { window } = await open('_bmad/config.toml')
    watchers[0].deliver(present('a = 1'))

    expect(await call(DOC_GET_CHANNEL, window.sender)).toMatchObject({
      snapshot: { kind: 'text', text: 'a = 1' }
    })
  })
})

describe('doc:changed', () => {
  it('pushes a snapshot to the document window when the text differs, with the revision up by one', async () => {
    const { window } = await open()
    watchers[0].deliver(present('one'))
    await call(DOC_GET_CHANNEL, window.sender)

    watchers[0].deliver(present('two'))

    expect(window.sender.sent).toHaveLength(1)
    expect(window.sender.sent[0][0]).toBe(DOC_CHANGED_CHANNEL)
    expect(window.sender.sent[0][1]).toMatchObject({ revision: 2, text: 'two' })
  })

  it('pushes once per distinct content, however many reads repeat it', async () => {
    const { window } = await open()
    watchers[0].deliver(present('a'))

    for (const text of ['b', 'b', 'b', 'c']) {
      watchers[0].deliver(present(text))
    }

    expect(window.sender.sent.map(([, snapshot]) => (snapshot as DocSnapshot).text)).toEqual(['b', 'c'])
  })

  it('keeps the last text when the file goes missing, and says so in the state', async () => {
    const { window } = await open()
    watchers[0].deliver(present('keep me'))

    watchers[0].deliver({ state: 'missing' })

    expect(window.sender.sent[0][1]).toMatchObject({ state: 'missing', text: 'keep me' })
  })

  it('does not push to a destroyed window', async () => {
    const { window } = await open()
    watchers[0].deliver(present('a'))
    window.sender.destroyed = true

    watchers[0].deliver(present('b'))

    expect(window.sender.sent).toEqual([])
  })

  it('writes a watcher error as one line and throws nothing', async () => {
    await open()

    watchers[0].fail(new Error('EMFILE'))

    expect(diagnostics).toEqual(['doc/watch · EMFILE'])
  })
})

describe('the escapes', () => {
  it('reveal and open-in-editor act on the window’s own file, which no argument can change', async () => {
    const { window } = await open()

    expect(await call(DOC_REVEAL_CHANNEL, window.sender, '/etc/passwd')).toEqual({ ok: true })
    expect(await call(DOC_EDIT_CHANNEL, window.sender, '/etc/passwd')).toEqual({ ok: true })

    const target = { fullPath: join(root, PRD), refused: false }
    expect(revealed).toEqual([target])
    expect(edited).toEqual([target])
  })

  it('watches inside the project’s output folder and nowhere wider', async () => {
    await open()

    expect(watchers[0].boundary).toBe(join(root, '_bmad'))
  })

  it('refuses the escapes once the watcher turns the document refused, and allows them again when it is mended', async () => {
    const { window } = await open()
    watchers[0].deliver(present('inside'))

    watchers[0].deliver({ state: 'refused' })
    await call(DOC_REVEAL_CHANNEL, window.sender)
    await call(DOC_EDIT_CHANNEL, window.sender)
    expect(revealed).toEqual([{ fullPath: join(root, PRD), refused: true }])
    expect(edited).toEqual([{ fullPath: join(root, PRD), refused: true }])
    // And the window was told, with the text cleared.
    expect(window.sender.sent[0][1]).toMatchObject({ state: 'refused', text: '' })

    watchers[0].deliver(present('mended'))
    await call(DOC_REVEAL_CHANNEL, window.sender)
    expect(revealed[1]).toEqual({ fullPath: join(root, PRD), refused: false })
  })

  it('tells the escapes when the document is refused, so they do nothing', async () => {
    symlinkSync(join(outside, 'secret.md'), join(root, '_bmad/link.md'))
    const { window } = await open('_bmad/link.md')

    await call(DOC_REVEAL_CHANNEL, window.sender)
    await call(DOC_EDIT_CHANNEL, window.sender)

    expect(revealed).toEqual([{ fullPath: join(root, '_bmad/link.md'), refused: true }])
    expect(edited).toEqual([{ fullPath: join(root, '_bmad/link.md'), refused: true }])
  })

  it.each([DOC_REVEAL_CHANNEL, DOC_EDIT_CHANNEL, DOC_CLOSE_CHANNEL])(
    'refuses an unknown sender on %s',
    async (channel) => {
      expect(await call(channel, new FakeSender(999))).toMatchObject({
        ok: false,
        error: { code: 'doc/no-document' }
      })
      expect(revealed).toEqual([])
      expect(edited).toEqual([])
    }
  )

  it('closes the asking window on doc:close, as the user would', async () => {
    const { window } = await open()

    expect(await call(DOC_CLOSE_CHANNEL, window.sender)).toEqual({ ok: true })
    expect(window.closeCalls).toBe(1)
  })
})

describe('closing returns the room', () => {
  it('focuses the project window and sends doc:closed with the row’s project-relative path', async () => {
    const { window, from } = await open()
    const parent = parents.get(from.id) as FakeParent

    window.onClosed('user')

    expect(parent.focused).toBe(1)
    expect(parent.webContents.sent).toEqual([[DOC_CLOSED_CHANNEL, PRD]])
  })

  it('stops the watcher and pushes nothing more once closed', async () => {
    const { window } = await open()
    watchers[0].deliver(present('a'))

    window.onClosed('user')
    watchers[0].deliver(present('b'))

    expect(watchers[0].closed).toBe(true)
    expect(window.sender.sent).toEqual([])
    expect(await call(DOC_GET_CHANNEL, window.sender)).toMatchObject({ ok: false })
  })

  it('sends nothing for a replaced window: the next one is about to open', async () => {
    const { window, from } = await open()
    const parent = parents.get(from.id) as FakeParent

    window.onClosed('replaced')

    expect(parent.focused).toBe(0)
    expect(parent.webContents.sent).toEqual([])
    expect(watchers[0].closed).toBe(true)
  })

  it('sends nothing when the project window is the reason, or is already destroyed', async () => {
    const { window, from } = await open()
    const parent = parents.get(from.id) as FakeParent

    window.onClosed('parent')
    expect(parent.webContents.sent).toEqual([])

    parent.destroyed = true
    window.onClosed('user')
    expect(parent.focused).toBe(0)
  })

  it('skips the push when the project window’s page is destroyed, but still focuses it', async () => {
    const { window, from } = await open()
    const parent = parents.get(from.id) as FakeParent
    parent.webContents.destroyed = true

    window.onClosed('user')

    expect(parent.focused).toBe(1)
    expect(parent.webContents.sent).toEqual([])
  })

  it('opens again after a close: the path is free to be opened by the next activation', async () => {
    const { window } = await open()
    window.onClosed('user')
    windows.length = 0

    const again = await open()

    expect(again.reply).toEqual({ ok: true })
    expect(watchers).toHaveLength(2)
  })
})

describe('a chosen output folder (Story 5.4)', () => {
  beforeEach(() => {
    mkdirSync(join(root, 'docs/out'), { recursive: true })
    writeFileSync(join(root, 'docs/out/prd.md'), '# chosen\n')
    folder = 'docs/out/'
  })

  it('opens a document under the folder it is on, and refuses the install’s with the folder named', async () => {
    expect((await open('docs/out/prd.md')).reply).toEqual({ ok: true })
    expect(watchers[0].boundary).toBe(join(root, 'docs/out'))

    expect(await call(DOC_OPEN_CHANNEL, new FakeSender(1), PRD)).toEqual({
      ok: false,
      error: { code: 'doc/invalid-path', message: 'doc · not a document under docs/out/' }
    })
  })

  it('tells the window the folder it was opened under', async () => {
    const { window } = await open('docs/out/prd.md')
    watchers[0].deliver(present('# chosen'))

    expect(await call(DOC_GET_CHANNEL, window.sender)).toMatchObject({
      ok: true,
      snapshot: { path: 'docs/out/prd.md', folder: 'docs/out/' }
    })
  })

  it('leaves a window already open its file and its boundary when the folder moves, and takes the new one for what opens after', async () => {
    const { window } = await open('docs/out/prd.md')
    watchers[0].deliver(present('first'))

    // The project's folder moves while the window is open.
    folder = '_bmad/'
    watchers[0].deliver(present('second'))

    expect(watchers[0].boundary).toBe(join(root, 'docs/out'))
    expect(await call(DOC_GET_CHANNEL, window.sender)).toMatchObject({
      ok: true,
      snapshot: { folder: 'docs/out/', state: 'present', text: 'second' }
    })
    expect((await open(PRD)).reply).toEqual({ ok: true })
    expect(watchers[1].boundary).toBe(join(root, '_bmad'))
    expect(await call(DOC_OPEN_CHANNEL, new FakeSender(1), 'docs/out/prd.md')).toMatchObject({
      ok: false,
      error: { code: 'doc/invalid-path', message: 'doc · not a document under _bmad/' }
    })
  })

  it('refuses a symlink out of the folder as it refuses one out of the install’s', async () => {
    symlinkSync(join(outside, 'secret.md'), join(root, 'docs/out/link.md'))

    const { reply, window } = await open('docs/out/link.md')

    expect(reply).toEqual({ ok: true })
    expect(watchers).toEqual([])
    expect(await call(DOC_GET_CHANNEL, window.sender)).toMatchObject({
      ok: true,
      snapshot: { state: 'refused', text: '', folder: 'docs/out/' }
    })
  })
})

describe('the second admission: a Changes row (Story 9.3, AD-13 amended)', () => {
  beforeEach(() => {
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src/a.ts'), 'export const a = 1\n')
    writeFileSync(join(root, '.env'), 'SECRET=1\n')
    symlinkSync(join(root, '.env'), join(root, 'link.env'))
    changeRows = [
      { path: 'src/a.ts', state: 'modified' },
      { path: 'link.env', state: 'untracked' },
      { path: 'gone.ts', state: 'deleted' },
      { path: 'sub/', state: 'untracked', directory: true }
    ]
  })

  it('opens a listed path, passed unchanged, with the project folder as its folder and the real path as its boundary', async () => {
    const { reply, window } = await open('src/a.ts')

    expect(reply).toEqual({ ok: true })
    expect(window?.fullPath).toBe(join(root, 'src/a.ts'))
    expect(watchers[0]?.boundary).toEqual({ realPath: realpathSync(join(root, 'src/a.ts')) })
    watchers[0]?.deliver(present('export const a = 1\n'))
    const got = (await call(DOC_GET_CHANNEL, window!.sender)) as { snapshot: DocSnapshot }
    expect(got.snapshot).toMatchObject({ path: 'src/a.ts', folder: `${basename(root)}/`, kind: 'text', state: 'present' })
  })

  it('refuses an untracked link whose target is not itself listed, with the refusal it always gave', async () => {
    const { reply } = await open('link.env')

    expect(reply).toEqual({ ok: false, error: { code: 'doc/invalid-path', message: 'doc · not a document under _bmad/' } })
    expect(windows).toEqual([])
    expect(watchers).toEqual([])
  })

  it.each([
    ['a deleted row', 'gone.ts'],
    ['a directory row', 'sub/'],
    ['a path not listed', 'src/b.ts'],
    ['a path built from a listed one', './src/a.ts'],
    ['not a string', 42]
  ])('opens nothing for %s', async (_name, path) => {
    const { reply } = await open(path as string)

    expect(reply).toMatchObject({ ok: false, error: { code: 'doc/invalid-path' } })
    expect(windows).toEqual([])
  })

  it('opens nothing from a window main holds no Changes list for', async () => {
    const { reply } = await open('src/a.ts', new FakeSender(2))

    expect(reply).toMatchObject({ ok: false, error: { code: 'doc/invalid-path' } })
  })

  it('tries the output folder first: a listed path under it keeps the output folder’s boundary', async () => {
    changeRows = [{ path: PRD, state: 'modified' }]
    await open(PRD)

    expect(watchers[0]?.boundary).toBe(join(root, '_bmad'))
  })

  it('keeps the window open when its path later leaves the list', async () => {
    const { window } = await open('src/a.ts')
    changeRows = []

    expect(window?.closeCalls).toBe(0)
    expect(watchers[0]?.closed).toBe(false)
  })
})
