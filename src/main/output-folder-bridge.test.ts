import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutputFolderReply } from '../shared/output-folder'
import type { FolderView } from './output-folder-model'
import type { InstallSource, OutputFolderResult } from './sources/install/resolvers'

type Handler = (event: { sender: FakeSender }) => Promise<unknown>
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) },
  BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: vi.fn() }
}))

const { OUTPUT_FOLDER_CHOOSE_CHANNEL, registerOutputFolderBridge } = await import('./output-folder-bridge')
const { forgetOutputFolder, outputFolderNameFor, outputFolderOf } = await import('./output-folder-model')

class FakeSender {
  destroyedListeners: (() => void)[] = []
  constructor(readonly id: number) {}
  send() {}
  isDestroyed() {
    return false
  }
  once(_event: 'destroyed', listener: () => void) {
    this.destroyedListeners.push(listener)
  }
  destroy() {
    this.destroyedListeners.forEach((listener) => listener())
  }
}

let project: string
let userData: string
let outside: string
let resolved: OutputFolderResult | (() => Promise<OutputFolderResult>)
let resolverCalls: number
let picks: (string | null)[]
let dialogs: [unknown, string][]
let diagnostics: string[]

const source = (): InstallSource => ({
  resolveRoster: async () => ({ ok: true, agents: [] }),
  resolveMenu: async () => ({ ok: true, entries: [], problems: [] }),
  resolveOutputFolder: async () => {
    resolverCalls += 1
    return typeof resolved === 'function' ? resolved() : resolved
  },
  resolveSkills: async () => []
})

function register(extra: Parameters<typeof registerOutputFolderBridge>[0] extends infer D ? Partial<D> : never = {}) {
  handlers.clear()
  return registerOutputFolderBridge({
    userDataPath: () => userData,
    projectPathFor: (id) => (id < 100 ? project : undefined),
    createSource: source,
    chooseDirectory: async (parent, defaultPath) => {
      dialogs.push([parent, defaultPath])
      return picks.shift() ?? null
    },
    parentWindowFor: () => null,
    writeDiagnostic: (line) => diagnostics.push(line),
    ...extra
  })
}

const dir = (...parts: string[]): string => {
  const path = join(project, ...parts)
  mkdirSync(path, { recursive: true })
  return path
}

/** Every file of a tree with its bytes, for a comparison that is byte for byte. */
function treeOf(root: string, rel = ''): Record<string, string> {
  const tree: Record<string, string> = {}
  for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
    const path = rel === '' ? entry.name : `${rel}/${entry.name}`
    if (entry.isDirectory()) {
      tree[`${path}/`] = ''
      Object.assign(tree, treeOf(root, path))
    } else {
      tree[path] = readFileSync(join(root, path), 'utf8')
    }
  }
  return tree
}

const storedFile = (): unknown => JSON.parse(readFileSync(join(userData, 'output-folders.json'), 'utf8'))

beforeEach(() => {
  project = realpathSync(mkdtempSync(join(tmpdir(), 'folder-project-')))
  userData = realpathSync(mkdtempSync(join(tmpdir(), 'folder-userdata-')))
  outside = realpathSync(mkdtempSync(join(tmpdir(), 'folder-outside-')))
  resolved = { ok: true, folder: null }
  resolverCalls = 0
  picks = []
  dialogs = []
  diagnostics = []
  dir('_bmad')
})

afterEach(() => {
  for (const path of [project, userData, outside]) rmSync(path, { recursive: true, force: true })
})

const viewOf = async (service: ReturnType<typeof register>, sender = new FakeSender(1)): Promise<FolderView> =>
  service.handleFor(sender, project).refresh()

describe('deriving the folder', () => {
  it('is the install’s folder when BMad says none, and when the project has no resolver', async () => {
    expect(await viewOf(register())).toEqual({ folder: '_bmad/' })
  })

  it('is BMad’s own output folder when it exists inside the project, with no choice made', async () => {
    dir('docs', 'out')
    resolved = { ok: true, folder: '{project-root}/docs/out' }

    expect(await viewOf(register())).toEqual({ folder: 'docs/out/', bmadFolder: 'docs/out/' })
  })

  it('falls back to the install’s folder, silently, when the resolver fails or answers a value that cannot be used', async () => {
    resolved = { ok: false, failure: { kind: 'timeout', detail: 'exceeded 15000ms', diagnostic: 'x' } }
    expect(await viewOf(register())).toEqual({ folder: '_bmad/' })

    resolved = { ok: true, folder: '/somewhere/else' }
    expect(await viewOf(register(), new FakeSender(2))).toEqual({ folder: '_bmad/' })

    resolved = async () => {
      throw new Error('boom')
    }
    expect(await viewOf(register(), new FakeSender(3))).toEqual({ folder: '_bmad/' })
    // No error of its own: the install's own error says what the resolver did.
    expect(diagnostics).toEqual([])
  })

  it('waits for a folder BMad names that is not made yet, and moves to it when it is', async () => {
    resolved = { ok: true, folder: '{project-root}/docs/out' }
    const handle = register().handleFor(new FakeSender(1), project)

    expect(await handle.refresh()).toEqual({ folder: '_bmad/', bmadFolder: 'docs/out/', awaiting: 'docs/out/' })

    dir('docs', 'out')
    expect(await handle.refresh()).toEqual({ folder: 'docs/out/', bmadFolder: 'docs/out/' })
  })

  it('does not take a folder that is a link out of the project for BMad’s', async () => {
    symlinkSync(outside, join(project, 'out-link'))
    resolved = { ok: true, folder: '{project-root}/out-link' }

    expect(await viewOf(register())).toEqual({ folder: '_bmad/', bmadFolder: 'out-link/' })
  })

  it('resolves again on refresh, so a changed configuration moves the folder', async () => {
    dir('docs', 'out')
    const handle = register().handleFor(new FakeSender(1), project)
    expect((await handle.refresh()).folder).toBe('_bmad/')

    resolved = { ok: true, folder: '{project-root}/docs/out' }
    expect((await handle.refresh()).folder).toBe('docs/out/')
    expect(resolverCalls).toBe(2)
  })

  it('is one handle per window, remembered where the other bridges look, and forgotten with the window', async () => {
    const service = register()
    const sender = new FakeSender(7)
    const handle = service.handleFor(sender, project)

    expect(service.handleFor(sender, project)).toBe(handle)
    expect(outputFolderOf(7)).toBe(handle)
    expect(outputFolderNameFor(7)).toBe('_bmad/')
    await handle.refresh()
    expect(outputFolderNameFor(7)).toBe('_bmad/')

    sender.destroy()
    expect(outputFolderOf(7)).toBeUndefined()
    expect(service.ready(7)).toBe(false)
    forgetOutputFolder(7, handle)
  })
})

describe('telling what moved', () => {
  it('tells a subscriber each view that differs from the last, and none that does not', async () => {
    dir('docs', 'out')
    const handle = register().handleFor(new FakeSender(1), project)
    const heard: FolderView[] = []
    handle.subscribe((view) => heard.push(view))

    await handle.refresh()
    await handle.refresh()
    resolved = { ok: true, folder: '{project-root}/docs/out' }
    await handle.refresh()
    await handle.refresh()

    expect(heard.map((view) => view.folder)).toEqual(['_bmad/', 'docs/out/'])
  })

  it('stops telling one that unsubscribed', async () => {
    const handle = register().handleFor(new FakeSender(1), project)
    const heard: FolderView[] = []
    const stop = handle.subscribe((view) => heard.push(view))
    stop()

    await handle.refresh()

    expect(heard).toEqual([])
  })

  it('tells the menu when a window gains a handle and when its folder moves', async () => {
    const service = register()
    const told: number[] = []
    service.onChanged((id) => told.push(id))

    const handle = service.handleFor(new FakeSender(4), project)
    expect(told).toEqual([4])
    await handle.refresh()
    expect(told).toEqual([4, 4])
    await handle.refresh()
    expect(told).toEqual([4, 4])
  })

  it('tells the menu when a window is destroyed, after its handle is gone, so nothing is enabled for a dead id', async () => {
    const service = register()
    const sender = new FakeSender(4)
    await service.handleFor(sender, project).refresh()
    const told: [number, boolean][] = []
    service.onChanged((id) => told.push([id, service.ready(id)]))

    sender.destroy()

    expect(told).toEqual([[4, false]])
    expect(service.hasChoice(4)).toBe(false)
  })

  it('answers a late resolution in the order it was asked, so an older answer never overwrites a newer', async () => {
    dir('docs', 'out')
    const handle = register().handleFor(new FakeSender(1), project)
    let release: () => void = () => {}
    resolved = () =>
      new Promise<OutputFolderResult>((resolve) => {
        release = () => resolve({ ok: true, folder: null })
      })
    const slow = handle.refresh()
    resolved = { ok: true, folder: '{project-root}/docs/out' }
    const fast = handle.refresh()

    release()
    await slow
    expect((await fast).folder).toBe('docs/out/')
    expect(handle.view()?.folder).toBe('docs/out/')
  })
})

describe('choosing a folder', () => {
  it('opens the chooser on the project’s window, in the folder now watched', async () => {
    dir('docs', 'out')
    resolved = { ok: true, folder: '{project-root}/docs/out' }
    const service = register({ parentWindowFor: () => ({ id: 'window' }) as never })
    const sender = new FakeSender(1)
    service.handleFor(sender, project)

    await service.choose(1)

    expect(dialogs).toEqual([[{ id: 'window' }, join(project, 'docs/out/')]])
  })

  it('keeps a folder inside the project, stores it under userData keyed by the project, and re-points', async () => {
    const mine = dir('mine')
    picks = [mine]
    const service = register()
    const handle = service.handleFor(new FakeSender(1), project)
    await handle.refresh()

    expect(await service.choose(1)).toEqual({ kind: 'chosen' })

    expect(handle.view()).toEqual({ folder: 'mine/', chosen: 'mine/' })
    expect(storedFile()).toEqual({ version: 1, folders: { [project]: 'mine/' } })
    expect(service.hasChoice(1)).toBe(true)
  })

  it('writes nothing into the project: the tree is byte for byte what it was', async () => {
    dir('docs', 'out')
    writeFileSync(join(project, '_bmad', 'config.toml'), 'x = 1\n')
    writeFileSync(join(project, 'docs', 'out', 'prd.md'), '# prd\n')
    const before = treeOf(project)
    picks = [join(project, 'docs', 'out')]
    const service = register()
    service.handleFor(new FakeSender(1), project)

    await service.choose(1)
    await service.choose(1)
    service.forget(1)
    await viewOf(service)

    expect(treeOf(project)).toEqual(before)
    // The tree is the same inode-for-inode where it was: no dotfile, no custom config.
    expect(statSync(join(project, '_bmad')).isDirectory()).toBe(true)
    expect(readdirSync(project).sort()).toEqual(['_bmad', 'docs'])
  })

  it('states the difference from BMad’s folder, and none when the two are the same', async () => {
    dir('docs', 'out')
    dir('mine')
    resolved = { ok: true, folder: '{project-root}/docs/out' }
    const service = register()
    const handle = service.handleFor(new FakeSender(1), project)

    picks = [join(project, 'mine')]
    await service.choose(1)
    expect(handle.view()).toEqual({ folder: 'mine/', chosen: 'mine/', bmadFolder: 'docs/out/', state: 'different' })

    picks = [join(project, 'docs', 'out')]
    await service.choose(1)
    expect(handle.view()).toEqual({ folder: 'docs/out/', chosen: 'docs/out/', bmadFolder: 'docs/out/' })
  })

  it.each([
    ['a folder outside the project', () => outside, 'outside this project'],
    ['the project folder itself', () => project, 'the project folder itself'],
    ['.git', () => dir('.git'), 'inside .git'],
    ['inside .git', () => dir('.git', 'refs'), 'inside .git'],
    ['node_modules', () => dir('node_modules'), 'inside node_modules'],
    ['inside node_modules', () => dir('packages', 'node_modules', 'x'), 'inside node_modules'],
    ['a link inside the project that leads out of it', () => {
      symlinkSync(outside, join(project, 'sneaky'))
      return join(project, 'sneaky')
    }, 'outside this project']
  ])('refuses %s, changes nothing and says why', async (_name, pick, reason) => {
    dir('mine')
    const service = register()
    const handle = service.handleFor(new FakeSender(1), project)
    picks = [join(project, 'mine')]
    await service.choose(1)
    const before = handle.view()
    const stored = storedFile()

    picks = [pick()]
    const outcome = await service.choose(1)

    expect(outcome).toEqual({ kind: 'refused', reason })
    expect(handle.view()).toEqual({ ...before, refusal: { reason, seq: 1 } })
    expect(storedFile()).toEqual(stored)
    expect(handle.view()?.folder).toBe('mine/')
  })

  it('numbers each refusal, so the second of the same words is told again', async () => {
    const service = register()
    const handle = service.handleFor(new FakeSender(1), project)
    const heard: (number | undefined)[] = []
    handle.subscribe((view) => heard.push(view.refusal?.seq))
    await handle.refresh()

    picks = [outside, outside]
    await service.choose(1)
    await service.choose(1)

    expect(heard).toEqual([undefined, 1, 2])
  })

  it('clears the refusal at the next choice, whether it is kept or cancelled', async () => {
    const service = register()
    const handle = service.handleFor(new FakeSender(1), project)
    picks = [outside]
    await service.choose(1)
    expect(handle.view()?.refusal).toBeDefined()

    picks = [null]
    expect(await service.choose(1)).toEqual({ kind: 'cancelled' })
    expect(handle.view()?.refusal).toBeUndefined()

    picks = [outside, dir('mine')]
    await service.choose(1)
    expect(handle.view()?.refusal).toBeDefined()
    expect(await service.choose(1)).toEqual({ kind: 'chosen' })
    expect(handle.view()?.refusal).toBeUndefined()
  })

  it('changes nothing and says nothing when the chooser is cancelled', async () => {
    const service = register()
    const handle = service.handleFor(new FakeSender(1), project)
    await handle.refresh()
    picks = [null]

    expect(await service.choose(1)).toEqual({ kind: 'cancelled' })

    expect(handle.view()).toEqual({ folder: '_bmad/' })
    expect(() => readFileSync(join(userData, 'output-folders.json'))).toThrow()
  })

  it('opens one chooser at a time for a window', async () => {
    let release: (path: string | null) => void = () => {}
    const service = register({
      chooseDirectory: () => new Promise<string | null>((resolve) => void (release = resolve))
    })
    await service.handleFor(new FakeSender(1), project).refresh()

    const first = service.choose(1)
    expect(await service.choose(1)).toEqual({ kind: 'cancelled' })
    release(null)
    expect(await first).toEqual({ kind: 'cancelled' })
  })

  it('does nothing for a window it holds no folder for', async () => {
    expect(await register().choose(99)).toEqual({ kind: 'cancelled' })
  })

  it('says to the developer, and nowhere else, when the choice could not be kept, and still applies it from the disk next time', async () => {
    const mine = dir('mine')
    picks = [mine]
    const service = register({ userDataPath: () => join(userData, 'file-not-dir', 'x') })
    writeFileSync(join(userData, 'file-not-dir'), 'x')
    service.handleFor(new FakeSender(1), project)

    expect(await service.choose(1)).toEqual({ kind: 'chosen' })

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatch(/^output-folder\/unwritten · [A-Z]+$/)
  })
})

describe('remembering the choice', () => {
  it('survives a relaunch: a new bridge on the same userData reads it back', async () => {
    dir('mine')
    picks = [join(project, 'mine')]
    const first = register()
    first.handleFor(new FakeSender(1), project)
    await first.choose(1)

    const second = register()

    expect(await viewOf(second, new FakeSender(2))).toEqual({ folder: 'mine/', chosen: 'mine/' })
  })

  it('is kept per project: another project is not moved', async () => {
    dir('mine')
    picks = [join(project, 'mine')]
    const service = register()
    service.handleFor(new FakeSender(1), project)
    await service.choose(1)
    const other = realpathSync(mkdtempSync(join(tmpdir(), 'folder-other-')))
    try {
      mkdirSync(join(other, '_bmad'))
      mkdirSync(join(other, 'mine'))
      const second = register({ projectPathFor: () => other })

      expect((await second.handleFor(new FakeSender(5), other).refresh()).folder).toBe('_bmad/')
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })

  it.each([
    ['not JSON', 'garbage'],
    ['another shape', JSON.stringify({ version: 1, folders: 'nope' })],
    ['an unusable value', JSON.stringify({ version: 1, folders: { PROJECT: '../elsewhere/' } })],
    ['a value of the wrong type', JSON.stringify({ version: 1, folders: { PROJECT: 7 } })]
  ])('reads a store that is %s as no choice, silently', async (_name, body) => {
    writeFileSync(join(userData, 'output-folders.json'), body.replace('PROJECT', project))

    expect(await viewOf(register())).toEqual({ folder: '_bmad/' })
    expect(diagnostics).toEqual([])
  })

  it('keeps a choice whose folder is gone, says so, watches BMad’s folder meanwhile, and returns to it when it returns', async () => {
    dir('docs', 'out')
    resolved = { ok: true, folder: '{project-root}/docs/out' }
    const mine = dir('mine')
    picks = [mine]
    const service = register()
    const handle = service.handleFor(new FakeSender(1), project)
    await service.choose(1)

    rmSync(mine, { recursive: true })
    expect(await handle.refresh()).toEqual({
      folder: 'docs/out/',
      chosen: 'mine/',
      bmadFolder: 'docs/out/',
      state: 'missing',
      awaiting: 'mine/'
    })
    // Remembered, not applied, and not cleared.
    expect(storedFile()).toEqual({ version: 1, folders: { [project]: 'mine/' } })
    expect(service.hasChoice(1)).toBe(true)

    dir('mine')
    expect(await handle.refresh()).toEqual({
      folder: 'mine/',
      chosen: 'mine/',
      bmadFolder: 'docs/out/',
      state: 'different'
    })
  })

  it('reads a chosen folder that has become a link out of the project as no choice, not a missing one', async () => {
    const mine = dir('mine')
    picks = [mine]
    const service = register()
    const handle = service.handleFor(new FakeSender(1), project)
    await service.choose(1)

    rmSync(mine, { recursive: true })
    symlinkSync(outside, mine)

    expect(await handle.refresh()).toEqual({ folder: '_bmad/' })
  })
})

describe('using BMad’s folder again', () => {
  it('forgets the choice, removes it from the store, and the rail returns to BMad’s folder', async () => {
    dir('docs', 'out')
    resolved = { ok: true, folder: '{project-root}/docs/out' }
    picks = [dir('mine')]
    const service = register()
    const handle = service.handleFor(new FakeSender(1), project)
    await service.choose(1)
    expect(service.hasChoice(1)).toBe(true)

    service.forget(1)
    await handle.refresh()

    expect(handle.view()).toEqual({ folder: 'docs/out/', bmadFolder: 'docs/out/' })
    expect(service.hasChoice(1)).toBe(false)
    expect(storedFile()).toEqual({ version: 1, folders: {} })
  })

  it('clears a refusal too, and does nothing for a window it holds no folder for', async () => {
    const service = register()
    const handle = service.handleFor(new FakeSender(1), project)
    picks = [outside]
    await service.choose(1)

    service.forget(1)
    await handle.refresh()
    service.forget(42)

    expect(handle.view()?.refusal).toBeUndefined()
  })
})

describe('the request to choose', () => {
  const ask = (id = 1) => handlers.get(OUTPUT_FOLDER_CHOOSE_CHANNEL)?.({ sender: new FakeSender(id) }) as Promise<OutputFolderReply>

  it('registers the one channel, and answers a window with no project with the no-project envelope', async () => {
    register()

    expect([...handlers.keys()]).toEqual([OUTPUT_FOLDER_CHOOSE_CHANNEL])
    expect(await ask(500)).toEqual({
      ok: false,
      error: { code: 'output-folder/no-project', message: 'output-folder · no project is open for this window' }
    })
  })

  it('answers with what the choice came to, and builds the window’s handle on the way', async () => {
    register()
    picks = [dir('mine')]
    expect(await ask()).toEqual({ ok: true, outcome: { kind: 'chosen' } })

    picks = [outside]
    expect(await ask()).toEqual({ ok: true, outcome: { kind: 'refused', reason: 'outside this project' } })

    picks = [null]
    expect(await ask()).toEqual({ ok: true, outcome: { kind: 'cancelled' } })
  })

  it('answers anything unexpected with the class name only, and the cause to the developer', async () => {
    register({
      chooseDirectory: async () => {
        throw new TypeError('no chooser for you')
      }
    })

    expect(await ask()).toEqual({
      ok: false,
      error: { code: 'output-folder/unexpected', message: 'output-folder · unexpected failure', detail: 'TypeError' }
    })
    expect(diagnostics).toEqual(['output-folder/unexpected · no chooser for you'])
  })

  it('takes nothing from the window: the handler is given the event and no path', () => {
    register()

    expect(handlers.get(OUTPUT_FOLDER_CHOOSE_CHANNEL)?.length).toBe(1)
  })
})
