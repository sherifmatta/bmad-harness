import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LAYOUT_VERSION, layoutFilePath, readLayoutFile, readLayoutToChange, writeLayoutFile } from './layout-file'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'layout-file-'))
})

afterEach(() => {
  chmodSync(dir, 0o755)
  rmSync(dir, { recursive: true, force: true })
})

const LAYOUT = { widths: { rail: 400, room: 300 }, folded: { '/work/a': ['_bmad/', '_bmad/ux/'] }, skillRowOpen: true }

describe('the layout file', () => {
  it('lives under the data directory it is given, by name', () => {
    expect(layoutFilePath('/data')).toBe('/data/layout.json')
  })

  it('writes {version, widths, folded, skillRowOpen} and reads it back as the parsed JSON', () => {
    const file = layoutFilePath(dir)

    expect(writeLayoutFile(file, LAYOUT)).toEqual({ ok: true })

    expect(readLayoutFile(file)).toEqual({ version: LAYOUT_VERSION, ...LAYOUT })
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')) as object).sort()).toEqual(['folded', 'skillRowOpen', 'version', 'widths'])
    expect(LAYOUT_VERSION).toBe(1)
  })

  it('creates the directory, and leaves no temporary file beside it', () => {
    const nested = join(dir, 'a', 'b')

    expect(writeLayoutFile(layoutFilePath(nested), { widths: {}, folded: {}, skillRowOpen: false })).toEqual({ ok: true })
    expect(readdirSync(nested)).toEqual(['layout.json'])
  })

  it('reads a missing file, and one that is not JSON, as null, without throwing', () => {
    expect(readLayoutFile(join(dir, 'nope.json'))).toBeNull()
    writeFileSync(join(dir, 'bad.json'), '{not json')
    expect(readLayoutFile(join(dir, 'bad.json'))).toBeNull()
  })

  it('replaces a bad file whole on the next write', () => {
    const file = layoutFilePath(dir)
    writeFileSync(file, 'garbage')

    expect(writeLayoutFile(file, LAYOUT)).toEqual({ ok: true })
    expect(readLayoutFile(file)).toEqual({ version: 1, ...LAYOUT })
  })

  it('reports the errno of a rename that fails after the temporary file is written, and removes that file', () => {
    // A directory with something in it where the file should be: the temporary file is written, the rename is refused.
    const file = layoutFilePath(dir)
    mkdirSync(file)
    writeFileSync(join(file, 'kept'), 'x')

    const outcome = writeLayoutFile(file, LAYOUT)

    expect(outcome).toMatchObject({ ok: false })
    expect(outcome.ok ? '' : outcome.errno).toMatch(/^(EISDIR|ENOTEMPTY|EEXIST|EPERM)$/)
    expect(readdirSync(dir)).toEqual(['layout.json'])
    expect(readdirSync(file)).toEqual(['kept'])
  })

  it('tells a missing file from one that is there and cannot be read, for a write to start from', () => {
    expect(readLayoutToChange(join(dir, 'nope.json'))).toEqual({ ok: true, raw: null })
    expect(readLayoutToChange(join(dir, 'nope', 'deeper.json'))).toEqual({ ok: true, raw: null })
    writeFileSync(join(dir, 'bad.json'), '{not json')
    expect(readLayoutToChange(join(dir, 'bad.json'))).toEqual({ ok: true, raw: null })
    writeFileSync(join(dir, 'file'), 'x')
    expect(readLayoutToChange(join(dir, 'file', 'under-a-file.json'))).toEqual({ ok: true, raw: null })
    mkdirSync(join(dir, 'a-directory.json'))
    expect(readLayoutToChange(join(dir, 'a-directory.json'))).toEqual({ ok: false, errno: 'EISDIR' })
    expect(readLayoutFile(join(dir, 'a-directory.json'))).toBeNull()
  })

  it('reports an errno name and throws nothing when it cannot write, leaving no temporary file', () => {
    const locked = join(dir, 'locked')
    mkdirSync(locked)
    chmodSync(locked, 0o500)

    const outcome = writeLayoutFile(layoutFilePath(locked), LAYOUT)

    expect(outcome).toMatchObject({ ok: false })
    expect(outcome.ok ? '' : outcome.errno).toMatch(/^[A-Z0-9_]+$/)
    chmodSync(locked, 0o755)
    expect(readdirSync(locked)).toEqual([])
  })
})
