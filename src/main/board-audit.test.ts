import { createHash } from 'node:crypto'
import type * as NodeFs from 'node:fs'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { RunCardSnapshot } from '../shared/conversation'
import type { BoardSnapshot } from '../shared/board'
import type { ArtifactObservation } from '../shared/rail'

/**
 * Story 6.9, the write audit (AD-1): the Board writes nothing into the project, ever. The real
 * `registerBoardBridge` runs over a real temporary project through a file changing and a run ending,
 * with every write the process makes counted at the file system (`node:fs` and `node:fs/promises`
 * wrapped, not replaced), and the project's whole file tree compared before and after. The one file
 * that changes is changed by the test, which is the writer here, through the unwrapped module; what is
 * held is that nothing else is. A run's stored card is kept under `userData`, never the project.
 */

const { writes, counted } = vi.hoisted(() => {
  const writes: { fn: string; path: string }[] = []
  /** The calls that change a file system, by name; `open` is one only when it opens to write. */
  const WRITING = /^(?:write|append|mkdir|rm|rmdir|unlink|rename|copy|cp|truncate|symlink|link|chmod|chown|utimes|lutimes|mkdtemp|createWriteStream)/

  /** A path argument as a string; a file descriptor (a number) names no path and is skipped. */
  function pathOf(argument: unknown): string | undefined {
    if (typeof argument === 'string') {
      return argument
    }
    if (argument instanceof URL) {
      return decodeURIComponent(argument.pathname)
    }
    return Buffer.isBuffer(argument) ? argument.toString() : undefined
  }
  /** The calls that name two paths, both of which are written to or from. */
  const TWO_PATHS = /^(?:rename|copyFile|cp|link|symlink)/

  function wrapped(actual: object): Record<string, unknown> {
    const wrappedModule: Record<string, unknown> = { ...(actual as Record<string, unknown>) }
    for (const [name, value] of Object.entries(actual)) {
      if (typeof value !== 'function') {
        continue
      }
      const opens = name === 'open' || name === 'openSync'
      if (!WRITING.test(name) && !opens) {
        continue
      }
      wrappedModule[name] = (...args: unknown[]) => {
        const flags = args[1]
        if (!opens || (typeof flags === 'string' && /[wa+]/.test(flags))) {
          for (const argument of TWO_PATHS.test(name) ? args.slice(0, 2) : args.slice(0, 1)) {
            const path = pathOf(argument)
            if (path !== undefined) {
              writes.push({ fn: name, path })
            }
          }
        }
        return (value as (...rest: unknown[]) => unknown)(...args)
      }
    }
    return wrappedModule
  }

  /** A module with its writing calls wrapped, and `fs.promises` reached through `node:fs` wrapped the same way. */
  function counted<T extends object>(actual: T): T {
    const module = wrapped(actual)
    const held = (actual as { promises?: object }).promises
    if (held !== undefined) {
      module.promises = wrapped(held)
    }
    return { ...module, default: module } as T
  }
  return { writes, counted }
})

vi.mock('node:fs', async (importOriginal) => counted(await importOriginal<typeof NodeFs>()))
vi.mock('node:fs/promises', async (importOriginal) => counted(await importOriginal<typeof import('node:fs/promises')>()))

type Handler = (event: { sender: FakeSender }) => Promise<unknown>
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: Handler) => handlers.set(channel, handler) }
}))

class FakeSender {
  pushes: BoardSnapshot[] = []
  constructor(readonly id: number) {}
  send(_channel: string, payload: BoardSnapshot) {
    this.pushes.push(payload)
  }
  isDestroyed() {
    return false
  }
  once() {}
}

const { registerBoardBridge, BOARD_GET_CHANNEL } = await import('./board-bridge')
const { createTranscriptRegistry } = await import('./projections/transcript')
const { isInsideProject } = await import('./sources/persistence/transcript-file')
// The test's own writes go through the real module: they are the file changing, not the harness.
const real = await vi.importActual<typeof NodeFs>('node:fs')

const SPRINT = '_bmad/implementation-artifacts/sprint-status.yaml'
const EPICS = '_bmad/planning-artifacts/epics.md'
const SPEC = '_bmad/implementation-artifacts/spec-1-1-a.md'

const observation = (path: string, type: ArtifactObservation['type'] = 'artifact:written'): ArtifactObservation => ({ type, path, size: 1, mtimeMs: 1 })

/** Every file under a root, by relative path, with its bytes' hash, size and mtime; and every directory. */
function treeOf(root: string): { files: Record<string, { sha: string; size: number; mtimeMs: number }>; directories: string[] } {
  const files: Record<string, { sha: string; size: number; mtimeMs: number }> = {}
  const directories: string[] = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        directories.push(relative(root, path))
        walk(path)
      } else {
        const stat = statSync(path)
        files[relative(root, path)] = { sha: createHash('sha256').update(readFileSync(path)).digest('hex'), size: stat.size, mtimeMs: stat.mtimeMs }
      }
    }
  }
  walk(root)
  return { files, directories: directories.sort() }
}

const card = (over: Partial<RunCardSnapshot> = {}): RunCardSnapshot => ({
  runId: 'r1',
  sessionId: 's1',
  agentId: 'bmad-agent-pm',
  code: 'CP',
  startedAt: 10,
  status: 'running',
  notes: [],
  steps: [],
  documents: [],
  ...over
})

describe('the Board’s life over a real project', () => {
  const base = mkdtempSync(join(tmpdir(), 'harness-board-audit-'))
  const project = join(base, 'project')
  const userData = join(base, 'userData')
  afterAll(() => rmSync(base, { recursive: true, force: true }))

  it('writes nothing inside the project while a file changes and a run ends, and leaves sprint-status.yaml as the test last wrote it', async () => {
    mkdirSync(join(project, '_bmad/implementation-artifacts'), { recursive: true })
    mkdirSync(join(project, '_bmad/planning-artifacts'), { recursive: true })
    mkdirSync(join(project, 'src'), { recursive: true })
    mkdirSync(userData, { recursive: true })
    real.writeFileSync(join(project, SPRINT), 'development_status:\n  epic-1: in-progress\n  1-1-a: review\n')
    real.writeFileSync(join(project, EPICS), '## Epic 1: Real\n')
    real.writeFileSync(join(project, SPEC), '# a spec a run is writing\n')
    real.writeFileSync(join(project, 'src/index.ts'), 'export {}\n')

    const lines: string[] = []
    const setup = writes.length
    const bridge = registerBoardBridge({ projectPathFor: () => project, quietMs: 5, writeDiagnostic: (line) => lines.push(line) })
    const sender = new FakeSender(1)
    const first = (await handlers.get(BOARD_GET_CHANNEL)!({ sender })) as { ok: boolean; snapshot: BoardSnapshot }
    expect(first).toMatchObject({ ok: true, snapshot: { kind: 'read', epics: [{ stories: [{ status: 'review' }] }] } })
    // Story 7.1: the listing of implementation-artifacts finds the spec, and the reading wrote nothing doing it.
    expect(first).toMatchObject({ snapshot: { epics: [{ stories: [{ file: SPEC }] }] } })
    expect(writes.slice(setup)).toEqual([])

    // A file changes: the test is the writer. The tree is taken after it, so what follows is the Board's alone.
    real.writeFileSync(join(project, SPRINT), 'development_status:\n  epic-1: in-progress\n  1-1-a: done\n')
    const original = treeOf(project)
    const sprint = { bytes: readFileSync(join(project, SPRINT)), mtimeMs: statSync(join(project, SPRINT)).mtimeMs }
    writes.length = 0
    bridge.observeArtifact(sender, project, observation(SPRINT))
    await vi.waitFor(() => expect(sender.pushes).toHaveLength(1))
    expect(sender.pushes[0]).toMatchObject({ revision: 2, epics: [{ stories: [{ status: 'done' }] }] })

    // A run ends: its card is kept as the window keeps it, and the rail sees the document it wrote.
    const transcripts = createTranscriptRegistry({ userDataPath: () => userData, log: (line) => lines.push(line) })
    const transcript = transcripts.forProject(project)
    transcript.recordRun(card(), 11)
    transcript.recordRun(card({ status: 'finished', endedAt: 20 }), 20)
    transcripts.flushAll()
    bridge.observeArtifact(sender, project, observation(SPEC, 'artifact:found'))
    bridge.observeArtifact(sender, project, observation(EPICS))
    // A spec appearing in the directory is read again through the listing, and nothing is written for it.
    bridge.observeArtifact(sender, project, observation('_bmad/implementation-artifacts/spec-1-2-b.md', 'artifact:found'))
    await vi.waitFor(() => expect(sender.pushes.length).toBeGreaterThanOrEqual(1))
    await new Promise((resolve) => setTimeout(resolve, 30))

    // The counting is live: the stored run was written, and under userData.
    expect(writes.length).toBeGreaterThan(0)
    expect(writes.some((write) => /conversations/.test(write.path))).toBe(true)
    // Every write made while the Board lived is outside the project.
    expect(writes.filter((write) => isInsideProject(project, write.path))).toEqual([])
    expect(writes.filter((write) => !isInsideProject(userData, write.path))).toEqual([])

    // The whole tree is as the test left it: no file added, removed, renamed or touched.
    expect(treeOf(project)).toEqual(original)
    expect(readFileSync(join(project, SPRINT)).equals(sprint.bytes)).toBe(true)
    expect(statSync(join(project, SPRINT)).mtimeMs).toBe(sprint.mtimeMs)
    expect(lines).toEqual([])
  })

  it('counts a write inside the project when there is one, so an empty list is a finding and not a blind spot', () => {
    mkdirSync(join(project, 'src'), { recursive: true })
    const before = writes.length
    writeFileSync(join(project, 'src/probe.ts'), 'export {}\n')

    expect(writes.slice(before).map((write) => write.fn)).toEqual(['writeFileSync'])
    expect(isInsideProject(project, writes.at(-1)!.path)).toBe(true)
    rmSync(join(project, 'src/probe.ts'))
  })
})
