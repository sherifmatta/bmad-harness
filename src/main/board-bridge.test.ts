import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BoardReply, BoardSnapshot, SprintStatusRead } from '../shared/board'
import type { ArtifactObservation } from '../shared/rail'
import type { FolderView, OutputFolderHandle } from './output-folder-model'

type Handler = (event: { sender: FakeSender }) => Promise<unknown>

const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) }
}))

const { BOARD_CHANGED_CHANNEL, BOARD_GET_CHANNEL, registerBoardBridge } = await import('./board-bridge')

class FakeSender {
  sent: [string, BoardSnapshot][] = []
  destroyed = false
  destroyedListeners: (() => void)[] = []
  constructor(readonly id: number) {}
  send(channel: string, payload: BoardSnapshot) {
    this.sent.push([channel, payload])
  }
  get pushes(): BoardSnapshot[] {
    return this.sent.filter(([channel]) => channel === BOARD_CHANGED_CHANNEL).map(([, payload]) => payload)
  }
  isDestroyed() {
    return this.destroyed
  }
  once(_event: 'destroyed', listener: () => void) {
    this.destroyedListeners.push(listener)
  }
  destroy() {
    this.destroyed = true
    this.destroyedListeners.forEach((listener) => listener())
  }
}

const SPRINT = '_bmad/implementation-artifacts/sprint-status.yaml'
const EPICS = '_bmad/planning-artifacts/epics.md'
const observation = (path: string, type: ArtifactObservation['type'] = 'artifact:written'): ArtifactObservation => ({
  type,
  path,
  size: 1,
  mtimeMs: 1
})
const text = (...lines: string[]): SprintStatusRead => ({ state: 'text', text: `development_status:\n${lines.map((line) => `  ${line}`).join('\n')}\n` })

let sprint: SprintStatusRead
let titles: string | undefined
let names: string[]
let nameReads: [string, string][]
let namesFail = false
let reads: [string, string][]
let titleReads: string[]
let diagnostics: string[]
let folderListeners: ((view: FolderView) => void)[]
let folder: string
let bridge: ReturnType<typeof registerBoardBridge>

const folderHandle: OutputFolderHandle = {
  view: () => ({ folder }),
  refresh: () => Promise.resolve({ folder }),
  subscribe: (listener) => {
    folderListeners.push(listener)
    return () => void (folderListeners = folderListeners.filter((held) => held !== listener))
  },
  hasChoice: () => false
}

const get = async (sender: FakeSender): Promise<BoardReply> =>
  (await handlers.get(BOARD_GET_CHANNEL)!({ sender })) as BoardReply

beforeEach(() => {
  handlers.clear()
  sprint = text('epic-1: in-progress', '1-1-a: backlog')
  titles = '## Epic 1: Room\n### Story 1.1: A\n'
  names = []
  nameReads = []
  namesFail = false
  reads = []
  titleReads = []
  diagnostics = []
  folderListeners = []
  folder = '_bmad/'
  vi.useFakeTimers()
  bridge = registerBoardBridge({
    projectPathFor: (id) => (id < 100 ? `/project-${id}` : undefined),
    outputFolder: () => folderHandle,
    read: (root, where) => {
      reads.push([root, where])
      return Promise.resolve(sprint)
    },
    readNames: (root, where) => {
      nameReads.push([root, where])
      return namesFail ? Promise.reject(new Error('EACCES')) : Promise.resolve(names)
    },
    readTitles: (path) => {
      titleReads.push(path)
      return Promise.resolve(titles)
    },
    writeDiagnostic: (line) => diagnostics.push(line),
    quietMs: 50
  })
})

afterEach(() => vi.useRealTimers())

describe('board.get', () => {
  it('answers the one reading, with titles from epics.md', async () => {
    const reply = await get(new FakeSender(1))
    expect(reply).toMatchObject({ ok: true, snapshot: { revision: 1, kind: 'read' } })
    expect(reply.ok && reply.snapshot.kind === 'read' && reply.snapshot.epics[0]).toMatchObject({ title: 'Room', stories: [{ title: 'A' }] })
    expect(reads).toEqual([['/project-1', '_bmad/']])
    expect(titleReads).toEqual(['/project-1/_bmad/planning-artifacts/epics.md'])
  })

  it('reads once for a reload and a second ask, which finds the projection warm', async () => {
    const sender = new FakeSender(1)
    await get(sender)
    const again = await get(sender)
    expect(again).toMatchObject({ ok: true, snapshot: { revision: 1 } })
    expect(reads).toHaveLength(1)
  })

  it('refuses a window that holds no project, in the envelope', async () => {
    expect(await get(new FakeSender(100))).toEqual({
      ok: false,
      error: { code: 'board/no-project', message: 'board · no project is open for this window' }
    })
  })

  it('says none, with no title read, when there is no file', async () => {
    sprint = { state: 'absent' }
    const reply = await get(new FakeSender(1))
    expect(reply).toMatchObject({ ok: true, snapshot: { kind: 'none', code: 'board/absent' } })
    expect(titleReads).toEqual([])
  })

  it('falls back to slugs when epics.md cannot be read', async () => {
    titles = undefined
    const reply = await get(new FakeSender(1))
    expect(reply.ok && reply.snapshot.kind === 'read' && reply.snapshot.epics[0].stories[0].title).toBe('a')
  })
})

describe('the files a card carries', () => {
  it('lists the names beside the other reads and carries the path of a story’s and an epic’s file', async () => {
    names = ['spec-1-1-the-a.md', 'epic-1-context.md', 'epic-1-retro-2026-10-01.md']
    const reply = await get(new FakeSender(1))

    expect(nameReads).toEqual([['/project-1', '_bmad/']])
    expect(reply.ok && reply.snapshot.kind === 'read' && reply.snapshot.epics[0]).toMatchObject({
      file: '_bmad/implementation-artifacts/epic-1-context.md',
      stories: [{ file: '_bmad/implementation-artifacts/spec-1-1-the-a.md' }]
    })
  })

  it('lists where the output folder is, and lists nothing when there is no sprint status', async () => {
    folder = 'docs/out/'
    names = ['spec-1-1-a.md']
    const reply = await get(new FakeSender(1))
    expect(reply.ok && reply.snapshot.kind === 'read' && reply.snapshot.epics[0].stories[0].file).toBe('docs/out/implementation-artifacts/spec-1-1-a.md')

    sprint = { state: 'absent' }
    await get(new FakeSender(2))
    expect(nameReads).toHaveLength(1)
  })

  it('carries no file, and the Board is the same, when the listing fails', async () => {
    namesFail = true
    const reply = await get(new FakeSender(1))

    expect(reply).toMatchObject({ ok: true, snapshot: { kind: 'read', epics: [{ key: 'epic-1', stories: [{ key: '1-1-a' }] }] } })
    expect(reply.ok && reply.snapshot.kind === 'read' && ('file' in reply.snapshot.epics[0] || 'file' in reply.snapshot.epics[0].stories[0])).toBe(false)
    expect(diagnostics).toEqual([])
  })
})

describe('board:changed', () => {
  it('pushes nothing for the first reading, and one snapshot per revision after it', async () => {
    const sender = new FakeSender(1)
    await get(sender)
    expect(sender.pushes).toEqual([])

    sprint = text('epic-1: in-progress', '1-1-a: done')
    bridge.observeArtifact(sender, '/project-1', observation(SPRINT))
    await vi.advanceTimersByTimeAsync(50)

    expect(sender.pushes).toHaveLength(1)
    expect(sender.pushes[0]).toMatchObject({ revision: 2, kind: 'read' })
    expect(await get(sender)).toMatchObject({ snapshot: { revision: 2 } })
  })

  it('reads a burst of writes once', async () => {
    const sender = new FakeSender(1)
    await get(sender)
    for (let at = 0; at < 4; at += 1) {
      bridge.observeArtifact(sender, '/project-1', observation(SPRINT))
      await vi.advanceTimersByTimeAsync(10)
    }
    sprint = text('epic-1: done')
    await vi.advanceTimersByTimeAsync(50)

    expect(reads).toHaveLength(2)
    expect(sender.pushes).toHaveLength(1)
  })

  it('pushes nothing for a write that changes nothing the Board shows', async () => {
    const sender = new FakeSender(1)
    await get(sender)
    bridge.observeArtifact(sender, '/project-1', observation(SPRINT))
    await vi.advanceTimersByTimeAsync(50)
    expect(reads).toHaveLength(2)
    expect(sender.pushes).toEqual([])
  })

  it('fills the snapshot when the file appears later, and says none again when it goes', async () => {
    const sender = new FakeSender(1)
    sprint = { state: 'absent' }
    await get(sender)

    sprint = text('epic-1: backlog')
    bridge.observeArtifact(sender, '/project-1', observation(SPRINT, 'artifact:found'))
    await vi.advanceTimersByTimeAsync(50)
    expect(sender.pushes.map((snapshot) => snapshot.kind)).toEqual(['read'])

    sprint = { state: 'absent' }
    bridge.observeArtifact(sender, '/project-1', observation(SPRINT, 'artifact:removed'))
    await vi.advanceTimersByTimeAsync(50)
    expect(sender.pushes.map((snapshot) => snapshot.kind)).toEqual(['read', 'none'])
  })

  it('rereads for a change of epics.md, which holds the titles', async () => {
    const sender = new FakeSender(1)
    await get(sender)
    titles = '## Epic 1: Renamed\n'
    bridge.observeArtifact(sender, '/project-1', observation(EPICS))
    await vi.advanceTimersByTimeAsync(50)
    expect(sender.pushes[0]).toMatchObject({ kind: 'read', epics: [{ title: 'Renamed' }] })
  })

  it('ignores any other file, and an observation before a window has asked', async () => {
    const sender = new FakeSender(1)
    bridge.observeArtifact(sender, '/project-1', observation(SPRINT))
    await vi.advanceTimersByTimeAsync(100)
    expect(reads).toEqual([])

    await get(sender)
    bridge.observeArtifact(sender, '/project-1', observation('_bmad/implementation-artifacts/notes.txt'))
    bridge.observeArtifact(sender, '/project-1', observation('_bmad/implementation-artifacts/deeper/spec-1-1-a.md'))
    bridge.observeArtifact(sender, '/project-1', observation('_bmad/planning-artifacts/spec-1-1-a.md'))
    bridge.observeArtifact(sender, '/project-1', observation('other/implementation-artifacts/sprint-status.yaml'))
    await vi.advanceTimersByTimeAsync(100)
    expect(reads).toHaveLength(1)
  })

  it('rereads when a .md directly in implementation-artifacts is found, written or removed, so a file’s arrival reaches its card', async () => {
    const sender = new FakeSender(1)
    sprint = text('epic-1: in-progress', '1-1-a: backlog')
    await get(sender)
    const spec = '_bmad/implementation-artifacts/spec-1-1-a.md'

    names = ['spec-1-1-a.md']
    bridge.observeArtifact(sender, '/project-1', observation(spec, 'artifact:found'))
    await vi.advanceTimersByTimeAsync(50)
    expect(sender.pushes).toHaveLength(1)
    expect(sender.pushes[0]).toMatchObject({ epics: [{ stories: [{ file: spec }] }] })

    names = []
    bridge.observeArtifact(sender, '/project-1', observation(spec, 'artifact:removed'))
    await vi.advanceTimersByTimeAsync(50)
    expect(sender.pushes).toHaveLength(2)
    expect(sender.pushes[1].kind === 'read' && 'file' in sender.pushes[1].epics[0].stories[0]).toBe(false)
  })

  it('reads again at the new folder when the output folder moves', async () => {
    const sender = new FakeSender(1)
    await get(sender)
    folder = 'docs/out/'
    sprint = text('epic-2: backlog')
    folderListeners.forEach((listener) => listener({ folder }))
    await vi.advanceTimersByTimeAsync(50)
    expect(reads.at(-1)).toEqual(['/project-1', 'docs/out/'])
    expect(sender.pushes).toHaveLength(1)

    bridge.observeArtifact(sender, '/project-1', observation('docs/out/implementation-artifacts/sprint-status.yaml'))
    await vi.advanceTimersByTimeAsync(50)
    expect(reads).toHaveLength(3)
  })

  it('reads a change that comes during a reading after it, never two at once', async () => {
    let release: (read: SprintStatusRead) => void = () => {}
    const held = new Promise<SprintStatusRead>((resolve) => (release = resolve))
    let calls = 0
    let inFlight = 0
    let most = 0
    handlers.clear()
    bridge = registerBoardBridge({
      projectPathFor: () => '/project-9',
      outputFolder: () => folderHandle,
      read: async () => {
        calls += 1
        inFlight += 1
        most = Math.max(most, inFlight)
        const answer = calls === 1 ? await held : text('epic-1: review')
        inFlight -= 1
        return answer
      },
      readTitles: () => Promise.resolve(undefined),
      quietMs: 50
    })
    const other = new FakeSender(9)
    const first = get(other)
    await vi.advanceTimersByTimeAsync(0)
    bridge.observeArtifact(other, '/project-9', observation(SPRINT))
    await vi.advanceTimersByTimeAsync(50)
    expect(calls).toBe(1)

    release(text('epic-1: done'))
    await first
    await vi.advanceTimersByTimeAsync(0)

    expect(calls).toBe(2)
    expect(most).toBe(1)
    expect(other.pushes.map((snapshot) => snapshot.revision)).toEqual([2])
  })

  it('answers none, never no-project, when the first reading fails', async () => {
    handlers.clear()
    let calls = 0
    registerBoardBridge({
      projectPathFor: () => '/project-5',
      outputFolder: () => folderHandle,
      read: () => (++calls === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(text('epic-1: done'))),
      readTitles: () => Promise.resolve(undefined),
      writeDiagnostic: (line) => diagnostics.push(line)
    })
    const sender = new FakeSender(5)

    expect(await get(sender)).toMatchObject({ ok: true, snapshot: { kind: 'none', code: 'board/unreadable' } })
    expect(diagnostics).toEqual(['board/read · boom'])
  })

  it('starts the service again for the next ask when its start failed', async () => {
    handlers.clear()
    let refreshes = 0
    registerBoardBridge({
      projectPathFor: () => '/project-6',
      outputFolder: () => ({
        ...folderHandle,
        view: () => undefined,
        refresh: () => (++refreshes === 1 ? Promise.reject(new Error('no folder')) : Promise.resolve({ folder })),
        subscribe: () => () => {}
      }),
      read: () => Promise.resolve(text('epic-1: done')),
      readTitles: () => Promise.resolve(undefined),
      writeDiagnostic: (line) => diagnostics.push(line)
    })
    const sender = new FakeSender(6)

    expect(await get(sender)).toMatchObject({ ok: false, error: { code: 'board/unexpected' } })
    expect(await get(sender)).toMatchObject({ ok: true, snapshot: { kind: 'read' } })
    expect(refreshes).toBe(2)
  })

  it('goes quiet when its window is destroyed', async () => {
    const sender = new FakeSender(1)
    await get(sender)
    bridge.observeArtifact(sender, '/project-1', observation(SPRINT))
    sender.destroy()
    sprint = text('epic-1: done')
    await vi.advanceTimersByTimeAsync(200)
    expect(sender.pushes).toEqual([])
    expect(reads).toHaveLength(1)
    expect(folderListeners).toEqual([])
  })

  it('keeps one service per window', async () => {
    const [a, b] = [new FakeSender(1), new FakeSender(2)]
    await get(a)
    await get(b)
    sprint = text('epic-1: done')
    bridge.observeArtifact(a, '/project-1', observation(SPRINT))
    await vi.advanceTimersByTimeAsync(50)
    expect(a.pushes).toHaveLength(1)
    expect(b.pushes).toEqual([])
  })
})

describe('over a real project', () => {
  const root = mkdtempSync(join(tmpdir(), 'harness-board-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('reads the real files, rereads on an observation, and writes nothing of its own to the file', async () => {
    vi.useRealTimers()
    handlers.clear()
    const file = join(root, SPRINT)
    mkdirSync(join(root, '_bmad/implementation-artifacts'), { recursive: true })
    mkdirSync(join(root, '_bmad/planning-artifacts'), { recursive: true })
    writeFileSync(file, 'development_status:\n  epic-1: in-progress\n  1-1-a: review\n')
    writeFileSync(join(root, EPICS), '## Epic 1: Real\n')

    const lines: string[] = []
    const real = registerBoardBridge({ projectPathFor: () => root, quietMs: 5, writeDiagnostic: (line) => lines.push(line) })
    const sender = new FakeSender(1)
    const reply = await get(sender)
    expect(reply).toMatchObject({ ok: true, snapshot: { kind: 'read', epics: [{ title: 'Real', stories: [{ status: 'review' }] }] } })

    // The test is the writer here; what is held is that the bridge never is.
    writeFileSync(file, 'development_status:\n  epic-1: in-progress\n  1-1-a: done\n')
    const before = { bytes: readFileSync(file), mtimeMs: statSync(file).mtimeMs }
    real.observeArtifact(sender, root, observation(SPRINT))
    await vi.waitFor(() => expect(sender.pushes).toHaveLength(1))

    expect(sender.pushes[0]).toMatchObject({ revision: 2, epics: [{ stories: [{ status: 'done' }] }] })
    expect(readFileSync(file).equals(before.bytes)).toBe(true)
    expect(statSync(file).mtimeMs).toBe(before.mtimeMs)
    expect(lines).toEqual([])
  })
})
