import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DOC_MAX_BYTES } from '../../../shared/document'
import { readDocument, watchDocument } from './watch-document'
import type { DocRead, DocumentReader, DocumentWatcher } from './watch-document'

let root: string
let outside: string
let file: string
let watcher: DocumentWatcher | null = null
let reads: DocRead[]
let errors: unknown[]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Wait for a condition rather than a fixed time; chokidar and the OS set the
 * pace. The OS file-event stream is shared by every test file running at once
 * and now and then drops an event, so `nudge` re-does the last change once a
 * second while waiting: it repeats the state the test is waiting for, never a
 * different one.
 */
async function until(
  condition: () => boolean,
  nudge: () => void = () => {},
  timeoutMs = 6000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let nudgedAt = Date.now()
  while (!condition() && Date.now() < deadline) {
    await sleep(20)
    if (!condition() && Date.now() - nudgedAt >= 1000) {
      nudgedAt = Date.now()
      nudge()
    }
  }
}
/** Long enough for chokidar's atomic window (100 ms) and fs events to land. */
const SETTLED = 450

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'watch-document-'))
  outside = mkdtempSync(join(tmpdir(), 'watch-document-outside-'))
  mkdirSync(join(root, '_bmad'), { recursive: true })
  file = join(root, '_bmad/doc.md')
  reads = []
  errors = []
})

afterEach(async () => {
  await watcher?.close()
  watcher = null
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
  // The OS event stream is shared and still delivering the removal of this
  // directory; let it drain before the next test starts a watcher of its own.
  await sleep(300)
})

async function start(
  extra: Partial<Parameters<typeof watchDocument>[0]> = {},
  waitForFirst = true
): Promise<void> {
  watcher = watchDocument({
    fullPath: file,
    onRead: (read) => reads.push(read),
    onError: (error) => errors.push(error),
    ...extra
  })
  if (waitForFirst) {
    await watcher.ready
  }
}

/** A reader the test holds: each call stays in flight until the test resolves it. */
function heldReader() {
  const calls: { resolve: (read: DocRead) => void }[] = []
  let inFlight = 0
  let peak = 0
  const read: DocumentReader = () =>
    new Promise<DocRead>((resolve) => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      calls.push({
        resolve: (result) => {
          inFlight -= 1
          resolve(result)
        }
      })
    })
  return { read, calls, peak: () => peak }
}

const last = (): DocRead | undefined => reads[reads.length - 1]
const texts = (): string[] => reads.flatMap((read) => (read.state === 'present' ? [read.text] : []))

describe('readDocument', () => {
  it('reads a small file whole, as present and not truncated', async () => {
    writeFileSync(file, '# hello\n')

    expect(await readDocument(file)).toEqual({ state: 'present', text: '# hello\n', truncated: false })
  })

  it('reads an empty file as present and empty', async () => {
    writeFileSync(file, '')

    expect(await readDocument(file)).toEqual({ state: 'present', text: '', truncated: false })
  })

  it('drops a byte order mark and decodes bad UTF-8 without throwing', async () => {
    writeFileSync(file, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('ok '), Buffer.from([0xff])]))

    expect(await readDocument(file)).toEqual({ state: 'present', text: 'ok �', truncated: false })
  })

  it('reads at most DOC_MAX_BYTES of a larger file and says so', async () => {
    writeFileSync(file, 'a'.repeat(3 * 1024 * 1024))

    const read = await readDocument(file)

    expect(read.state).toBe('present')
    if (read.state === 'present') {
      expect(read.text.length).toBe(DOC_MAX_BYTES)
      expect(read.truncated).toBe(true)
    }
  })

  it('does not call a file of exactly DOC_MAX_BYTES truncated', async () => {
    writeFileSync(file, 'a'.repeat(DOC_MAX_BYTES))

    expect(await readDocument(file)).toMatchObject({ state: 'present', truncated: false })
  })

  it('calls a NUL in the first 8 KiB binary, with no text', async () => {
    writeFileSync(file, Buffer.concat([Buffer.from('text'), Buffer.from([0]), Buffer.from('more')]))

    expect(await readDocument(file)).toEqual({ state: 'binary' })
  })

  it('does not look for a NUL past the first 8 KiB', async () => {
    writeFileSync(file, Buffer.concat([Buffer.from('a'.repeat(9000)), Buffer.from([0])]))

    expect(await readDocument(file)).toMatchObject({ state: 'present' })
  })

  it('calls a file that is not there missing, and reports no error', async () => {
    const seen: unknown[] = []

    expect(await readDocument(join(root, '_bmad/nope.md'), (error) => seen.push(error))).toEqual({
      state: 'missing'
    })
    expect(await readDocument(join(root, '_bmad/doc.md/under-a-file'))).toEqual({ state: 'missing' })
    expect(seen).toEqual([])
  })

  it('calls a directory unreadable and reports why', async () => {
    const seen: unknown[] = []

    expect(await readDocument(join(root, '_bmad'), (error) => seen.push(error))).toEqual({
      state: 'unreadable'
    })
    expect(seen).toHaveLength(1)
  })

  it.skipIf(process.getuid?.() === 0)('calls a file that cannot be read unreadable (EACCES)', async () => {
    writeFileSync(file, 'secret')
    chmodSync(file, 0o000)
    const seen: unknown[] = []
    try {
      expect(await readDocument(file, (error) => seen.push(error))).toEqual({ state: 'unreadable' })
      expect(seen).toHaveLength(1)
    } finally {
      chmodSync(file, 0o644)
    }
  })
})

describe('watchDocument', () => {
  it('reads the file on the initial scan, and is ready once it has', async () => {
    writeFileSync(file, 'first\n')
    await start()

    expect(reads).toEqual([{ state: 'present', text: 'first\n', truncated: false }])
  })

  it('reads missing and is ready when there is no file, then reads it when it appears', async () => {
    await start()
    expect(reads).toEqual([{ state: 'missing' }])

    writeFileSync(file, 'arrived')
    await until(
      () => texts().includes('arrived'),
      () => writeFileSync(file, 'arrived')
    )

    expect(last()).toEqual({ state: 'present', text: 'arrived', truncated: false })
  })

  it('reads the new content when the file is appended to', async () => {
    writeFileSync(file, 'one\n')
    await start()

    appendFileSync(file, 'two\n')
    await until(
      () => texts().includes('one\ntwo\n'),
      () => writeFileSync(file, 'one\ntwo\n')
    )

    expect(last()).toEqual({ state: 'present', text: 'one\ntwo\n', truncated: false })
  })

  it('folds write-temp-then-rename into a change: never a missing, never an empty read', async () => {
    writeFileSync(file, 'old\n')
    await start()
    reads.length = 0

    writeFileSync(`${file}.tmp`, 'new\n')
    renameSync(`${file}.tmp`, file)
    await until(
      () => texts().includes('new\n'),
      () => {
        writeFileSync(`${file}.tmp`, 'new\n')
        renameSync(`${file}.tmp`, file)
      }
    )
    await sleep(SETTLED)

    expect(reads.some((read) => read.state !== 'present')).toBe(false)
    expect(texts().every((text) => text === 'old\n' || text === 'new\n')).toBe(true)
    expect(last()).toEqual({ state: 'present', text: 'new\n', truncated: false })
  })

  it('ends a burst of writes on the latest content, never delivering an older one after a newer', async () => {
    let content = '0'
    const read: DocumentReader = async () => ({ state: 'present', text: content, truncated: false })
    writeFileSync(file, content)
    await start({ read })
    reads.length = 0

    for (const n of [1, 2, 3, 4, 5]) {
      content = String(n)
      writeFileSync(file, content)
      await sleep(40)
    }
    await until(
      () => texts().includes('5'),
      () => writeFileSync(file, '5')
    )
    await sleep(SETTLED)

    expect(last()).toEqual({ state: 'present', text: '5', truncated: false })
    // Serialised: the sequence only ever moves forward.
    expect(texts()).toEqual([...texts()].sort())
    expect(reads.length).toBeLessThanOrEqual(5)
  })

  it('reads again exactly once after the one in flight, however many changes arrive during it, and ends on the latest', async () => {
    const held = heldReader()
    writeFileSync(file, 'first')
    await start({ read: held.read }, false)
    await until(() => held.calls.length === 1)

    for (const n of [1, 2, 3, 4, 5, 6]) {
      writeFileSync(file, `during ${n}`)
      await sleep(60)
    }
    await sleep(SETTLED)
    // Every change arrived while the first read was in flight: none started a read.
    expect(held.calls).toHaveLength(1)

    held.calls[0].resolve({ state: 'present', text: 'one', truncated: false })
    await until(() => held.calls.length === 2)
    await sleep(SETTLED)
    // Six events, one follow-up.
    expect(held.calls).toHaveLength(2)

    held.calls[1].resolve({ state: 'present', text: 'latest', truncated: false })
    await until(() => texts().includes('latest'))
    await sleep(SETTLED)

    expect(texts()).toEqual(['one', 'latest'])
    expect(held.calls).toHaveLength(2)
    expect(held.peak()).toBe(1)
  })

  it('delivers nothing present after missing when the file goes while a read is in flight', async () => {
    const held = heldReader()
    writeFileSync(file, 'here')
    await start({ read: held.read }, false)
    await until(() => held.calls.length === 1)

    rmSync(file)
    await until(() => reads.some((read) => read.state === 'missing'))

    held.calls[0].resolve({ state: 'present', text: 'stale', truncated: false })
    await sleep(SETTLED)

    expect(reads).toEqual([{ state: 'missing' }])
  })

  it('reports missing when the file is removed, and present again when it is recreated', async () => {
    writeFileSync(file, 'here')
    await start()

    rmSync(file)
    await until(
      () => last()?.state === 'missing',
      () => rmSync(file, { force: true })
    )
    expect(last()).toEqual({ state: 'missing' })

    writeFileSync(file, 'back')
    await until(
      () => texts().includes('back'),
      () => writeFileSync(file, 'back')
    )
    expect(last()).toEqual({ state: 'present', text: 'back', truncated: false })
  })

  it('bounds the read of a large file and says it was truncated', async () => {
    writeFileSync(file, 'x'.repeat(3 * 1024 * 1024))
    await start()

    const first = reads[0]
    expect(first.state).toBe('present')
    if (first.state === 'present') {
      expect(first.text.length).toBe(DOC_MAX_BYTES)
      expect(first.truncated).toBe(true)
    }
  })

  it('reads a file with a NUL in its first 8 KiB as binary', async () => {
    writeFileSync(file, Buffer.from([0x50, 0x4b, 0x00, 0x04]))
    await start()

    expect(reads).toEqual([{ state: 'binary' }])
  })

  it.skipIf(process.getuid?.() === 0)('reports an unreadable file, and tells onError why', async () => {
    writeFileSync(file, 'secret')
    chmodSync(file, 0o000)
    try {
      await start()

      expect(reads).toEqual([{ state: 'unreadable' }])
      // The read's own failure; chokidar may add one of its own for the same file.
      expect(errors.map(String).filter((line) => /EACCES.*open/.test(line))).toHaveLength(1)
    } finally {
      chmodSync(file, 0o644)
    }
  })

  it('delivers nothing once closed', async () => {
    writeFileSync(file, 'a')
    await start()
    await watcher?.close()
    const seen = reads.length

    appendFileSync(file, 'b')
    rmSync(file)
    await sleep(SETTLED)

    expect(reads).toHaveLength(seen)
  })
})

describe('readDocument with a boundary (NFR8)', () => {
  const boundary = () => join(root, '_bmad')

  it('reads a file inside it, and through a link that stays inside', async () => {
    writeFileSync(file, 'inside')
    symlinkSync(file, join(root, '_bmad/alias.md'))

    expect(await readDocument(file, () => {}, boundary())).toMatchObject({ state: 'present', text: 'inside' })
    expect(await readDocument(join(root, '_bmad/alias.md'), () => {}, boundary())).toMatchObject({
      state: 'present',
      text: 'inside'
    })
  })

  it('refuses a file that is a link out, and reads nothing of what it points at', async () => {
    writeFileSync(join(outside, 'secret.md'), 'OUTSIDE SECRET')
    symlinkSync(join(outside, 'secret.md'), file)

    expect(await readDocument(file, () => {}, boundary())).toEqual({ state: 'refused' })
  })

  it('refuses a file under a directory that is a link out', async () => {
    writeFileSync(join(outside, 'doc.md'), 'OUTSIDE SECRET')
    symlinkSync(outside, join(root, '_bmad/linked'))

    expect(await readDocument(join(root, '_bmad/linked/doc.md'), () => {}, boundary())).toEqual({
      state: 'refused'
    })
  })

  it('keeps a file that is not there missing, not refused', async () => {
    expect(await readDocument(file, () => {}, boundary())).toEqual({ state: 'missing' })
    expect(await readDocument(join(root, '_bmad/nope/doc.md'), () => {}, boundary())).toEqual({
      state: 'missing'
    })
  })

  it('refuses when the boundary itself cannot be resolved', async () => {
    writeFileSync(file, 'x')

    expect(await readDocument(file, () => {}, join(root, 'no-such-boundary'))).toEqual({
      state: 'refused'
    })
  })

  it('refuses a link loop', async () => {
    symlinkSync(join(root, '_bmad/b.md'), file)
    symlinkSync(file, join(root, '_bmad/b.md'))

    expect(await readDocument(file, () => {}, boundary())).toEqual({ state: 'refused' })
  })
})

describe('watchDocument with a boundary', () => {
  const boundary = () => join(root, '_bmad')
  const delivered = (): string => JSON.stringify(reads)

  it('turns refused, and never delivers the outside text, when the file is swapped for a link out', async () => {
    writeFileSync(join(outside, 'secret.md'), 'OUTSIDE SECRET')
    writeFileSync(file, 'inside')
    await start({ boundary: boundary() })
    expect(reads).toEqual([{ state: 'present', text: 'inside', truncated: false }])

    const swap = () => {
      rmSync(file, { force: true })
      symlinkSync(join(outside, 'secret.md'), file)
    }
    swap()
    await until(() => last()?.state === 'refused', () => {
      rmSync(file, { force: true })
      symlinkSync(join(outside, 'secret.md'), file)
    })

    expect(last()).toEqual({ state: 'refused' })
    expect(delivered()).not.toContain('OUTSIDE SECRET')
  })

  it('turns refused when a file missing under a directory linked out is created later', async () => {
    symlinkSync(outside, join(root, '_bmad/linked'))
    file = join(root, '_bmad/linked/doc.md')
    await start({ boundary: boundary() })
    expect(reads).toEqual([{ state: 'missing' }])

    writeFileSync(join(outside, 'doc.md'), 'OUTSIDE SECRET')
    await until(() => last()?.state === 'refused', () => writeFileSync(join(outside, 'doc.md'), 'OUTSIDE SECRET'))

    expect(last()).toEqual({ state: 'refused' })
    expect(delivered()).not.toContain('OUTSIDE SECRET')
  })

  it('still reads a file reached through a link that stays inside', async () => {
    writeFileSync(join(root, '_bmad/real.md'), 'inside')
    symlinkSync(join(root, '_bmad/real.md'), file)
    await start({ boundary: boundary() })

    expect(reads).toEqual([{ state: 'present', text: 'inside', truncated: false }])
  })

  it('hands the boundary to the reader it is given', async () => {
    const seen: (string | undefined)[] = []
    writeFileSync(file, 'x')
    await start({
      boundary: boundary(),
      read: async (_path, _onError, given) => {
        seen.push(given)
        return { state: 'missing' }
      }
    })

    expect(seen).toEqual([boundary()])
  })
})
