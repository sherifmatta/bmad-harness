import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ArtifactObservation } from '../../../shared/rail'
import { ignored, watchArtifacts } from './watch-artifacts'
import type { ArtifactWatcher } from './watch-artifacts'

let root: string
let watcher: ArtifactWatcher | null = null
let seen: ArtifactObservation[]
let errors: unknown[]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wait for a condition rather than a fixed time. chokidar throttles the re-read
 * of a directory to one a second, so a file created soon after a scan can be
 * reported up to a second late; a test that needs the `add` waits for it.
 */
async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!condition() && Date.now() < deadline) {
    await sleep(20)
  }
}
/** Long enough for chokidar's atomic window (100 ms) and fs events to land. */
const SETTLED = 450

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'watch-artifacts-'))
  mkdirSync(join(root, '_bmad/planning-artifacts'), { recursive: true })
  seen = []
  errors = []
})

afterEach(async () => {
  await watcher?.close()
  watcher = null
  rmSync(root, { recursive: true, force: true })
  // On macOS the OS file-event stream is shared and still delivering the
  // removal of this directory; a watcher started right after can miss its own
  // first `add`. Let it drain before the next test starts one.
  await sleep(300)
})

async function start(): Promise<void> {
  // The watcher is rooted at the project, so the creation of `_bmad` a moment
  // ago is an event it can still be handed after `ready`, reporting the files
  // the scan already found as written. Let the OS deliver what the fixture just
  // did before the watcher starts.
  await sleep(200)
  watcher = watchArtifacts({
    projectRoot: root,
    onObservation: (observation) => seen.push(observation),
    onError: (error) => errors.push(error)
  })
  await watcher.ready
}

const paths = (type?: ArtifactObservation['type']): string[] =>
  seen.filter((o) => type === undefined || o.type === type).map((o) => o.path)

describe('ignored', () => {
  it('is path-shaped: a .DS_Store basename or a .tmp suffix, and nothing else', () => {
    expect(ignored('/p/_bmad/.DS_Store')).toBe(true)
    expect(ignored('/p/_bmad/a/.DS_Store')).toBe(true)
    expect(ignored('/p/_bmad/x.tmp')).toBe(true)
    expect(ignored('/p/_bmad/.memlog.md.tmp')).toBe(true)
    expect(ignored('/p/_bmad/.memlog.md')).toBe(false)
    expect(ignored('/p/_bmad/prd.md')).toBe(false)
    expect(ignored('/p/_bmad')).toBe(false)
    expect(ignored('/p/_bmad/a.tmp/prd.md')).toBe(false)
  })
})

describe('watchArtifacts', () => {
  it('reports what the initial scan finds as found, with the stat it took', async () => {
    const file = join(root, '_bmad/planning-artifacts/prd.md')
    writeFileSync(file, 'hello\n')
    writeFileSync(join(root, '_bmad/empty.md'), '')
    await start()

    expect(seen.map((o) => o.type)).toEqual(expect.arrayContaining(['artifact:found']))
    expect(seen.every((o) => o.type === 'artifact:found')).toBe(true)
    const prd = seen.find((o) => o.path === '_bmad/planning-artifacts/prd.md')
    expect(prd).toEqual({
      type: 'artifact:found',
      path: '_bmad/planning-artifacts/prd.md',
      size: 6,
      mtimeMs: statSync(file).mtimeMs
    })
    expect(seen.find((o) => o.path === '_bmad/empty.md')?.size).toBe(0)
  })

  it('reports a file created or appended to after ready as written, project-relative and POSIX', async () => {
    await start()

    writeFileSync(join(root, '_bmad/planning-artifacts/x.md'), 'a')
    await until(() => seen.length > 0)
    appendFileSync(join(root, '_bmad/planning-artifacts/x.md'), 'b')
    await sleep(SETTLED)

    // The file-level event for the append is chokidar's and, on macOS, is now
    // and then dropped by the OS; what is held here is what the watcher says
    // about the events it does deliver.
    //
    // The first event's size is 1 or 2, not always 1: chokidar can report the
    // `add` up to a second late (see `until`), by which time the append has
    // already landed, and a loaded machine makes that the common case. The
    // bound below is the property; the size of the first event is the race.
    expect(seen[0]).toMatchObject({
      type: 'artifact:written',
      path: '_bmad/planning-artifacts/x.md'
    })
    expect(seen.every((o) => o.type === 'artifact:written' && o.size >= 1 && o.size <= 2)).toBe(true)
    expect(seen.every((o) => o.path === '_bmad/planning-artifacts/x.md')).toBe(true)
  })

  it('folds write-temp-then-rename into one path: no .tmp row, no remove and add flicker', async () => {
    const target = join(root, '_bmad/planning-artifacts/.memlog.md')
    writeFileSync(target, 'one\n')
    await start()
    seen.length = 0

    writeFileSync(`${target}.tmp`, 'one\ntwo\n')
    renameSync(`${target}.tmp`, target)
    await sleep(SETTLED)

    expect(paths().some((path) => path.endsWith('.tmp'))).toBe(false)
    expect(paths('artifact:removed')).toEqual([])
    expect(paths('artifact:written')).toContain('_bmad/planning-artifacts/.memlog.md')
    expect(seen.every((o) => o.path === '_bmad/planning-artifacts/.memlog.md')).toBe(true)
  })

  it('reports three writes inside the coalescing window, all as written on one path', async () => {
    const file = join(root, '_bmad/planning-artifacts/burst.md')
    writeFileSync(file, 'x')
    await start()
    seen.length = 0

    for (const chunk of ['a', 'b', 'c']) {
      appendFileSync(file, chunk)
      await sleep(40)
    }
    await sleep(SETTLED)

    expect(seen.length).toBeGreaterThanOrEqual(1)
    expect(new Set(paths())).toEqual(new Set(['_bmad/planning-artifacts/burst.md']))
    expect(seen.every((o) => o.type === 'artifact:written')).toBe(true)
    // chokidar throttles a path's change events to one per 50 ms, so the last
    // append can go unreported; sizes are still only ever ones the file had.
    expect(seen.every((o) => o.size >= 1 && o.size <= 4)).toBe(true)
  })

  it('never reports .DS_Store or a .tmp file', async () => {
    writeFileSync(join(root, '_bmad/.DS_Store'), 'x')
    await start()

    writeFileSync(join(root, '_bmad/planning-artifacts/.DS_Store'), 'x')
    writeFileSync(join(root, '_bmad/planning-artifacts/x.tmp'), 'x')
    await sleep(SETTLED)

    expect(seen).toEqual([])
  })

  it('reports a deleted file as removed, and a deleted directory’s files with it', async () => {
    writeFileSync(join(root, '_bmad/planning-artifacts/a.md'), 'a')
    writeFileSync(join(root, '_bmad/planning-artifacts/b.md'), 'b')
    await start()
    seen.length = 0

    rmSync(join(root, '_bmad/planning-artifacts'), { recursive: true })
    await sleep(SETTLED)

    expect(paths('artifact:removed').sort()).toEqual([
      '_bmad/planning-artifacts/a.md',
      '_bmad/planning-artifacts/b.md'
    ])
  })

  it('finds rows when _bmad is created after the watcher started, and reports nothing before', async () => {
    rmSync(join(root, '_bmad'), { recursive: true })
    await start()
    expect(seen).toEqual([])
    expect(errors).toEqual([])

    await sleep(100)
    mkdirSync(join(root, '_bmad/a'), { recursive: true })
    await sleep(100)
    writeFileSync(join(root, '_bmad/a/x.md'), 'hi')
    await until(() => paths('artifact:written').includes('_bmad/a/x.md'))

    expect(paths('artifact:written')).toContain('_bmad/a/x.md')
  })

  it('reports the files of an _bmad created whole after launch as written, never as found', async () => {
    rmSync(join(root, '_bmad'), { recursive: true })
    // Let the OS finish reporting the removal, or it can swallow the creation
    // below that reuses the same paths.
    await sleep(SETTLED)
    await start()

    mkdirSync(join(root, '_bmad/planning-artifacts'), { recursive: true })
    writeFileSync(join(root, '_bmad/planning-artifacts/prd.md'), 'hi')
    await until(() => paths('artifact:written').includes('_bmad/planning-artifacts/prd.md'))

    expect(paths('artifact:written')).toContain('_bmad/planning-artifacts/prd.md')
    expect(paths('artifact:found')).toEqual([])
    expect(errors).toEqual([])
  })

  it('reports the files of a project whose own directory is named like a temp file', async () => {
    // The noise test is for names inside the project; the root's name is the
    // user's, and `ignored` alone would drop the whole project.
    rmSync(root, { recursive: true, force: true })
    root = join(mkdtempSync(join(tmpdir(), 'watch-artifacts-')), 'client.tmp')
    mkdirSync(join(root, '_bmad/planning-artifacts'), { recursive: true })
    writeFileSync(join(root, '_bmad/planning-artifacts/prd.md'), 'hi')
    await start()

    expect(paths('artifact:found')).toEqual(['_bmad/planning-artifacts/prd.md'])
  })

  it('watches _bmad only: a sibling directory standing for userData is silent', async () => {
    mkdirSync(join(root, 'userData/transcripts'), { recursive: true })
    mkdirSync(join(root, '.claude/skills/x'), { recursive: true })
    await start()

    writeFileSync(join(root, 'userData/transcripts/run.log'), 'x')
    writeFileSync(join(root, 'userData/window-state.json'), '{}')
    writeFileSync(join(root, '.claude/skills/x/customize.toml'), 'a = 1')
    writeFileSync(join(root, 'notes.md'), 'x')
    await sleep(SETTLED)

    expect(seen).toEqual([])
  })

  it('stops delivering after close', async () => {
    await start()
    await watcher?.close()

    writeFileSync(join(root, '_bmad/planning-artifacts/late.md'), 'x')
    await sleep(SETTLED)

    expect(seen).toEqual([])
  })
})
