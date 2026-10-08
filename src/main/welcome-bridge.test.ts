import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenAck, RecentRow } from '../shared/welcome'

type Handler = (event: { sender: { id: number } }, ...args: unknown[]) => unknown

const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) }
}))
// The real chooser is an Electron dialog; the bridge is handed one in every test.
vi.mock('./windows/choose-project', () => ({ chooseProjectDirectory: vi.fn() }))
vi.mock('./windows/welcome-window', () => ({ isWelcomeWindow: () => false }))

const {
  WELCOME_CHOOSE_CHANNEL,
  WELCOME_OPEN_DROPPED_CHANNEL,
  WELCOME_OPEN_RECENT_CHANNEL,
  WELCOME_RECENT_CHANNEL,
  checkFolder,
  createRecentList,
  registerWelcomeBridge
} = await import('./welcome-bridge')

const WELCOME = 7
const OTHER = 8

const root = mkdtempSync(join(tmpdir(), 'harness-welcome-bridge-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const folder = (name: string): string => {
  const path = join(root, name)
  mkdirSync(path, { recursive: true })
  return path
}
const file = (name: string): string => {
  const path = join(root, name)
  writeFileSync(path, '')
  return path
}

let userData: string
let clock: number
const opened: string[] = []
let chooserAnswers: (string | null)[]
let chooserCalls: number
let releaseChooser: (() => void) | null

function setUp(home = '/Users/me') {
  userData = mkdtempSync(join(root, 'userdata-'))
  const recent = createRecentList({
    userDataPath: () => userData,
    now: () => clock,
    writeDiagnostic: () => {}
  })
  const bridge = registerWelcomeBridge({
    recent,
    openProject: (path) => opened.push(path),
    chooseDirectory: async () => {
      chooserCalls += 1
      if (releaseChooser !== null) {
        await new Promise<void>((resolve) => (releaseChooser = resolve))
      }
      return chooserAnswers.shift() ?? null
    },
    isWelcomeSender: (id) => id === WELCOME,
    home
  })
  return { recent, bridge }
}

const ask = (channel: string, id = WELCOME, ...args: unknown[]): unknown =>
  handlers.get(channel)?.({ sender: { id } }, ...args)

beforeEach(() => {
  handlers.clear()
  opened.length = 0
  chooserAnswers = []
  chooserCalls = 0
  releaseChooser = null
  clock = 1_000
})

describe('the four requests', () => {
  it('registers exactly the four channels, spelled once in shared/channels', () => {
    setUp()

    expect([...handlers.keys()].sort()).toEqual(
      [
        WELCOME_CHOOSE_CHANNEL,
        WELCOME_OPEN_DROPPED_CHANNEL,
        WELCOME_OPEN_RECENT_CHANNEL,
        WELCOME_RECENT_CHANNEL
      ].sort()
    )
    expect([WELCOME_RECENT_CHANNEL, WELCOME_CHOOSE_CHANNEL, WELCOME_OPEN_RECENT_CHANNEL, WELCOME_OPEN_DROPPED_CHANNEL]).toEqual([
      'welcome:recent',
      'welcome:choose',
      'welcome:open-recent',
      'welcome:open-dropped'
    ])
  })

  it('refuses a sender that is not the Welcome, on every channel, and opens nothing', async () => {
    const { recent } = setUp()
    const project = folder('refused-project')
    recent.record(project)

    expect(await ask(WELCOME_RECENT_CHANNEL, OTHER)).toEqual([])
    expect(await ask(WELCOME_CHOOSE_CHANNEL, OTHER)).toEqual({ ok: false })
    expect(await ask(WELCOME_OPEN_RECENT_CHANNEL, OTHER, project)).toEqual({ ok: false })
    expect(await ask(WELCOME_OPEN_DROPPED_CHANNEL, OTHER, [project])).toEqual({ ok: false })

    expect(opened).toEqual([])
    expect(chooserCalls).toBe(0)
  })
})

describe('the recent rows', () => {
  it('are the recorded folders newest first, each with name, ~-parent, time and whether it is there', async () => {
    const { recent } = setUp(root)
    const a = folder('recent-a')
    const gone = join(root, 'recent-gone')
    clock = 100
    recent.record(a)
    clock = 200
    recent.record(gone)

    const rows = (await ask(WELCOME_RECENT_CHANNEL)) as RecentRow[]

    expect(rows).toEqual([
      { path: gone, name: 'recent-gone', parent: '~', openedAt: 200, exists: false },
      { path: a, name: 'recent-a', parent: '~', openedAt: 100, exists: true }
    ])
  })

  it('carries nothing but what a row shows: no install state, count, branch or version', async () => {
    const { recent } = setUp()
    recent.record(folder('recent-b'))

    const [row] = (await ask(WELCOME_RECENT_CHANNEL)) as RecentRow[]

    expect(Object.keys(row).sort()).toEqual(['exists', 'name', 'openedAt', 'parent', 'path'])
  })

  it('is empty when there is no file, and when the file is bad', async () => {
    setUp()
    expect(await ask(WELCOME_RECENT_CHANNEL)).toEqual([])

    writeFileSync(join(userData, 'recent-projects.json'), '{ nope')
    expect(await ask(WELCOME_RECENT_CHANNEL)).toEqual([])
  })

  it('reads the file each time it is asked, so what another launch wrote is what is shown', async () => {
    setUp()
    expect(await ask(WELCOME_RECENT_CHANNEL)).toEqual([])

    writeFileSync(
      join(userData, 'recent-projects.json'),
      JSON.stringify({ version: 1, entries: [{ path: root, openedAt: 5 }] })
    )

    expect(((await ask(WELCOME_RECENT_CHANNEL)) as RecentRow[]).map((row) => row.path)).toEqual([root])
  })
})

describe('recording', () => {
  it('writes the folder first in one file under userData, at most eight, with no repeat', () => {
    const { recent } = setUp()
    for (let n = 0; n < 10; n += 1) {
      clock = n
      recent.record(`/projects/p${n}`)
    }
    clock = 99
    recent.record('/projects/p5')

    const written = JSON.parse(readFileSync(join(userData, 'recent-projects.json'), 'utf8')) as {
      entries: { path: string; openedAt: number }[]
    }
    expect(written.entries).toHaveLength(8)
    expect(written.entries[0]).toEqual({ path: '/projects/p5', openedAt: 99 })
    expect(new Set(written.entries.map(({ path }) => path)).size).toBe(8)
  })

  it('starts the file afresh after a bad one', () => {
    const { recent } = setUp()
    writeFileSync(join(userData, 'recent-projects.json'), 'garbage')

    recent.record('/projects/a')

    expect(recent.read()).toEqual([{ path: '/projects/a', openedAt: 1_000 }])
  })

  it('reports a file it could not write and carries on', () => {
    const lines: string[] = []
    const blocker = file('blocker-for-userdata')
    const recent = createRecentList({
      userDataPath: () => blocker,
      writeDiagnostic: (line) => lines.push(line)
    })

    expect(() => recent.record('/projects/a')).not.toThrow()
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^welcome\/recent-unwritten · [A-Z_]+$/)
  })

  it('reads the data directory only when it is first needed', () => {
    const userDataPath = vi.fn(() => userData)
    setUp()

    createRecentList({ userDataPath })

    expect(userDataPath).not.toHaveBeenCalled()
  })
})

describe('choosing a folder', () => {
  it('opens a chosen folder', async () => {
    setUp()
    const project = folder('chosen')
    chooserAnswers = [project]

    expect(await ask(WELCOME_CHOOSE_CHANNEL)).toEqual({ ok: true })

    expect(opened).toEqual([project])
  })

  it('opens nothing when the chooser is cancelled', async () => {
    setUp()
    chooserAnswers = [null]

    expect(await ask(WELCOME_CHOOSE_CHANNEL)).toEqual({ ok: false })

    expect(opened).toEqual([])
  })

  it('re-checks that what was chosen is a folder', async () => {
    setUp()
    chooserAnswers = [file('chosen-file')]

    expect(await ask(WELCOME_CHOOSE_CHANNEL)).toEqual({ ok: false })

    expect(opened).toEqual([])
  })

  it('has one chooser at a time, whether it is the button or the menu that asked', async () => {
    const { bridge } = setUp()
    const project = folder('single-flight')
    chooserAnswers = [project]
    releaseChooser = () => {}

    const first = bridge.chooseFolder()
    const button = ask(WELCOME_CHOOSE_CHANNEL)
    const second = bridge.chooseFolder()

    await expect(second).resolves.toBe('busy')
    await expect(button).resolves.toEqual({ ok: false })
    expect(chooserCalls).toBe(1)

    releaseChooser?.()
    await expect(first).resolves.toBe('opened')
    expect(opened).toEqual([project])

    // And it is free again once the first has finished.
    chooserAnswers = [null]
    releaseChooser = null
    await expect(bridge.chooseFolder()).resolves.toBe('cancelled')
    expect(chooserCalls).toBe(2)
  })

  it('frees the chooser when it throws', async () => {
    setUp()
    const failing = registerWelcomeBridge({
      recent: createRecentList({ userDataPath: () => userData }),
      openProject: () => {},
      chooseDirectory: () => Promise.reject(new Error('dialog failed')),
      isWelcomeSender: () => true
    })

    await expect(failing.chooseFolder()).rejects.toThrow('dialog failed')
    await expect(failing.chooseFolder()).rejects.toThrow('dialog failed')
  })
})

describe('a recent row', () => {
  it('opens a recorded folder that is still there', async () => {
    const { recent } = setUp()
    const project = folder('row-open')
    recent.record(project)

    expect(await ask(WELCOME_OPEN_RECENT_CHANNEL, WELCOME, project)).toEqual({ ok: true })

    expect(opened).toEqual([project])
  })

  it('does nothing for a folder that is gone', async () => {
    const { recent } = setUp()
    const gone = join(root, 'row-gone')
    recent.record(gone)

    expect(await ask(WELCOME_OPEN_RECENT_CHANNEL, WELCOME, gone)).toEqual({ ok: false })

    expect(opened).toEqual([])
  })

  it('opens only a path the list holds, however the page asks', async () => {
    const { recent } = setUp()
    recent.record(folder('row-listed'))
    const unlisted = folder('row-unlisted')

    for (const path of [unlisted, 42, null, undefined, { path: unlisted }, [unlisted], '']) {
      expect(await ask(WELCOME_OPEN_RECENT_CHANNEL, WELCOME, path), String(path)).toEqual({ ok: false })
    }

    expect(opened).toEqual([])
  })
})

describe('a drop', () => {
  it('opens exactly one folder, like a chosen one', async () => {
    setUp()
    const project = folder('dropped-folder')

    expect(await ask(WELCOME_OPEN_DROPPED_CHANNEL, WELCOME, [project])).toEqual({ ok: true })

    expect(opened).toEqual([project])
  })

  it('opens nothing for a file, and names it', async () => {
    setUp()
    const dropped = file('dropped-file.txt')

    expect(await ask(WELCOME_OPEN_DROPPED_CHANNEL, WELCOME, [dropped])).toEqual({
      ok: false,
      name: 'dropped-file.txt'
    })

    expect(opened).toEqual([])
  })

  it('opens nothing for a path that is not there, and names it', async () => {
    setUp()

    expect(await ask(WELCOME_OPEN_DROPPED_CHANNEL, WELCOME, [join(root, 'no-such-thing')])).toEqual({
      ok: false,
      name: 'no-such-thing'
    })
  })

  it('opens nothing for several items, naming the first that is not a folder, even if one is a folder', async () => {
    setUp()
    const project = folder('dropped-with-others')
    const dropped = file('dropped-other.txt')

    expect(await ask(WELCOME_OPEN_DROPPED_CHANNEL, WELCOME, [project, dropped])).toEqual({
      ok: false,
      name: 'dropped-other.txt'
    })
    // Two folders are still two items: nothing opens, and the first is named.
    expect(await ask(WELCOME_OPEN_DROPPED_CHANNEL, WELCOME, [project, folder('dropped-second')])).toEqual({
      ok: false,
      name: 'dropped-with-others'
    })

    expect(opened).toEqual([])
  })

  it.each([[undefined], [null], ['/a/folder'], [{ 0: '/a/folder' }], [[]], [[7]], [['']], [['/a', 3]]])(
    'refuses what is not a list of paths (%j), and opens nothing',
    async (argument) => {
      setUp()

      expect(await ask(WELCOME_OPEN_DROPPED_CHANNEL, WELCOME, argument)).toEqual({ ok: false })

      expect(opened).toEqual([])
    }
  )

  it('answers a refusal as a plain ack, with a name only when there is one', async () => {
    setUp()

    const ack = (await ask(WELCOME_OPEN_DROPPED_CHANNEL, WELCOME, [file('ack.txt')])) as OpenAck

    expect(Object.keys(ack).sort()).toEqual(['name', 'ok'])
  })
})

describe('the folder check', () => {
  it('is a folder for a directory, and anything else for a file, a missing path or a link to nothing', () => {
    expect(checkFolder(root)).toBe('folder')
    expect(checkFolder(file('check-file'))).toBe('other')
    expect(checkFolder(join(root, 'nothing-here'))).toBe('other')
  })
})
