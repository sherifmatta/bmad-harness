import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Layout } from '../shared/layout'

type Invoke = (event: { sender: { id: number } }, ...args: unknown[]) => unknown
type Listener = (event: { sender: { id: number }; returnValue?: unknown }) => void

const handlers = new Map<string, Invoke>()
const listeners = new Map<string, Listener>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Invoke) => handlers.set(channel, handler),
    on: (channel: string, listener: Listener) => listeners.set(channel, listener)
  }
}))

const { LAYOUT_GET_CHANNEL, LAYOUT_SET_FOLDED_CHANNEL, LAYOUT_SET_WIDTH_CHANNEL, registerLayoutBridge } = await import(
  './layout-bridge'
)

const root = mkdtempSync(join(tmpdir(), 'harness-layout-bridge-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const WINDOW_A = 1
const WINDOW_B = 2
const WELCOME = 100

let userData: string
let projectA: string
let projectB: string
let diagnostics: string[]

function register(): void {
  handlers.clear()
  listeners.clear()
  registerLayoutBridge({
    userDataPath: () => userData,
    projectPathFor: (id) => (id === WINDOW_A ? projectA : id === WINDOW_B ? projectB : undefined),
    writeDiagnostic: (line) => diagnostics.push(line)
  })
}

beforeEach(() => {
  userData = mkdtempSync(join(root, 'userdata-'))
  projectA = mkdtempSync(join(root, 'project-a-'))
  projectB = mkdtempSync(join(root, 'project-b-'))
  diagnostics = []
  register()
})

/** The layout a window is given on its synchronous ask. */
function read(id: number): Layout {
  const event: { sender: { id: number }; returnValue?: unknown } = { sender: { id } }
  listeners.get(LAYOUT_GET_CHANNEL)?.(event)
  return event.returnValue as Layout
}

const setWidth = (id: number, ...args: unknown[]): unknown => handlers.get(LAYOUT_SET_WIDTH_CHANNEL)?.({ sender: { id } }, ...args)
const setFolded = (id: number, ...args: unknown[]): unknown => handlers.get(LAYOUT_SET_FOLDED_CHANNEL)?.({ sender: { id } }, ...args)
const stored = (): unknown => JSON.parse(readFileSync(join(userData, 'layout.json'), 'utf8'))

/** Every file and directory under a tree, with each file's bytes: the whole of what a project holds. */
function snapshotOf(dir: string): Record<string, string | null> {
  const found: Record<string, string | null> = {}
  const walk = (at: string): void => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      const path = join(at, entry.name)
      if (entry.isDirectory()) {
        found[path] = null
        walk(path)
      } else {
        found[path] = readFileSync(path, 'utf8')
      }
    }
  }
  walk(dir)
  return found
}

describe('the layout bridge: the read', () => {
  it('answers each window synchronously, with the defaults while nothing is stored', () => {
    expect(read(WINDOW_A)).toEqual({ sidebar: null, rail: null, room: null, folded: [] })
  })

  it('answers with the stored widths, and the folded set of the asking window’s own project', () => {
    setWidth(WINDOW_A, 'sidebar', 220)
    setWidth(WINDOW_A, 'rail', 400)
    setWidth(WINDOW_A, 'room', 300)
    setFolded(WINDOW_A, ['_bmad/'])
    setFolded(WINDOW_B, ['docs/', 'docs/x/'])

    expect(read(WINDOW_A)).toEqual({ sidebar: 220, rail: 400, room: 300, folded: ['_bmad/'] })
    // The widths are the user's, so the other window has them; the fold is the project's, so it has its own.
    expect(read(WINDOW_B)).toEqual({ sidebar: 220, rail: 400, room: 300, folded: ['docs/', 'docs/x/'] })
  })

  it('answers a window with no project the widths and nothing folded', () => {
    setWidth(WINDOW_A, 'rail', 400)
    setFolded(WINDOW_A, ['_bmad/'])

    expect(read(WELCOME)).toEqual({ sidebar: null, rail: 400, room: null, folded: [] })
  })

  it.each([
    ['a file that is not JSON', 'not json'],
    ['a file of the wrong shape', '[1,2,3]'],
    ['widths out of range', JSON.stringify({ version: 1, widths: { sidebar: 12, rail: 12, room: 9999 }, folded: 'x' })],
    ['the old rail’s widths, which the new rail does not hold', JSON.stringify({ version: 1, widths: { rail: 560 } })],
    ['widths that are not integers', JSON.stringify({ version: 1, widths: { sidebar: 244.5, rail: 300.5, room: '250' } })]
  ])('reads %s as the defaults and nothing folded, silently', (_name, content) => {
    writeFileSync(join(userData, 'layout.json'), content)

    expect(read(WINDOW_A)).toEqual({ sidebar: null, rail: null, room: null, folded: [] })
    expect(diagnostics).toEqual([])
  })
})

describe('the layout bridge: a width', () => {
  it('keeps one value per panel, and the two are independent', () => {
    setWidth(WINDOW_A, 'rail', 400)
    expect(stored()).toEqual({ version: 1, widths: { rail: 400 }, folded: {} })

    setWidth(WINDOW_A, 'room', 300)
    setWidth(WINDOW_A, 'rail', 450)
    setWidth(WINDOW_A, 'sidebar', 220)
    expect(stored()).toEqual({ version: 1, widths: { rail: 450, room: 300, sidebar: 220 }, folded: {} })
  })

  it('forgets a width for null, which is the reset, and leaves the other', () => {
    setWidth(WINDOW_A, 'rail', 400)
    setWidth(WINDOW_A, 'room', 300)

    setWidth(WINDOW_A, 'rail', null)

    expect(stored()).toEqual({ version: 1, widths: { room: 300 }, folded: {} })
  })

  it('ignores a panel that is not one and a width the panel would not read, and writes nothing', () => {
    for (const args of [
      ['sidebar', 199],
      ['sidebar', 401],
      ['sidebar', 244.5],
      ['rail', 12],
      ['rail', 9999],
      ['rail', 560],
      ['rail', 300.5],
      ['rail', '400'],
      ['rail', undefined],
      ['room', 500],
      ['chat', 300],
      [undefined, 400],
      [{ toString: () => 'rail' }, 400],
      []
    ]) {
      setWidth(WINDOW_A, ...args)
    }

    expect(() => statSync(join(userData, 'layout.json'))).toThrow()
    expect(diagnostics).toEqual([])
  })

  it('lets a window with no project keep a width: widths are the user’s, not the project’s', () => {
    setWidth(WELCOME, 'rail', 420)

    expect(stored()).toEqual({ version: 1, widths: { rail: 420 }, folded: {} })
  })
})

describe('the layout bridge: a fold', () => {
  it('keeps a window’s set under its own project, leaving the other projects’ alone', () => {
    setFolded(WINDOW_A, ['_bmad/', '_bmad/ux/'])
    setFolded(WINDOW_B, ['docs/'])

    expect(stored()).toEqual({
      version: 1,
      widths: {},
      folded: { [projectA]: ['_bmad/', '_bmad/ux/'], [projectB]: ['docs/'] }
    })
  })

  it('keys the set by `projectKey` the window’s own, and a window cannot name another', () => {
    setFolded(WINDOW_A, ['x/'], projectB)

    expect(Object.keys((stored() as { folded: object }).folded)).toEqual([projectA])
  })

  it('replaces the set, so unfolding the last removes the project’s entry', () => {
    setFolded(WINDOW_A, ['_bmad/'])
    setFolded(WINDOW_A, [])

    expect(stored()).toEqual({ version: 1, widths: {}, folded: {} })
  })

  it('keeps entries for directories that are not there: it judges nothing against the disk', () => {
    setFolded(WINDOW_A, ['vanished/'])

    expect(read(WINDOW_A).folded).toEqual(['vanished/'])
  })

  it('answers a window with no project that there is none, and writes nothing', () => {
    expect(setFolded(WELCOME, ['x/'])).toEqual({
      ok: false,
      error: { code: 'layout/no-project', message: 'layout · no project is open for this window' }
    })
    expect(() => statSync(join(userData, 'layout.json'))).toThrow()
  })

  it('ignores a set that is not an array of strings, or is without bound, and writes nothing', () => {
    for (const bad of ['x/', null, undefined, { 0: 'x/' }, [1], ['x/', 2], [['x/']], Array.from({ length: 5000 }, (_, i) => `d${i}/`), ['y'.repeat(5000)]]) {
      setFolded(WINDOW_A, bad)
    }

    expect(() => statSync(join(userData, 'layout.json'))).toThrow()
  })
})

describe('the layout bridge: a failure to write', () => {
  it('says so once on the developer’s terminal, and the call still answers', () => {
    // A file where the data directory should be: the write fails with ENOTDIR.
    const blocker = join(root, 'blocker')
    writeFileSync(blocker, 'x')
    handlers.clear()
    registerLayoutBridge({
      userDataPath: () => join(blocker, 'inside'),
      projectPathFor: () => projectA,
      writeDiagnostic: (line) => diagnostics.push(line)
    })

    expect(setWidth(WINDOW_A, 'rail', 400)).toEqual({ ok: true })
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatch(/^layout\/unwritten · [A-Z0-9_]+$/)
  })
})

describe('the layout bridge: nothing is written into a project', () => {
  it('leaves a project’s whole tree byte-identical after widths and folds are stored and read back', () => {
    mkdirSync(join(projectA, '_bmad', 'ux'), { recursive: true })
    writeFileSync(join(projectA, '_bmad', 'epics.md'), '# epics\n')
    writeFileSync(join(projectA, '_bmad', 'ux', 'design.md'), '# design\n')
    writeFileSync(join(projectA, 'README.md'), 'readme')
    const before = snapshotOf(projectA)
    const mtimes = Object.fromEntries(Object.keys(before).map((path) => [path, statSync(path).mtimeMs]))

    setWidth(WINDOW_A, 'rail', 480)
    setWidth(WINDOW_A, 'room', 260)
    setFolded(WINDOW_A, ['_bmad/', '_bmad/ux/'])
    read(WINDOW_A)
    setFolded(WINDOW_A, [])
    setWidth(WINDOW_A, 'rail', null)

    expect(snapshotOf(projectA)).toEqual(before)
    expect(Object.fromEntries(Object.keys(before).map((path) => [path, statSync(path).mtimeMs]))).toEqual(mtimes)
    // And what was stored is under `userData`, in one file beside nothing of the project's.
    expect(readdirSync(userData)).toEqual(['layout.json'])
  })
})

describe('the layout bridge: the channels', () => {
  it('registers the read as a synchronous listener and the two writes as handlers, and nothing else', () => {
    expect([...listeners.keys()]).toEqual(['layout:get'])
    expect([...handlers.keys()].sort()).toEqual(['layout:set-folded', 'layout:set-width'])
  })
})
