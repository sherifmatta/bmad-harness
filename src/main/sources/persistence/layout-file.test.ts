import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LAYOUT_VERSION, layoutFilePath, readLayoutFile, writeLayoutFile } from './layout-file'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'layout-file-'))
})

afterEach(() => {
  chmodSync(dir, 0o755)
  rmSync(dir, { recursive: true, force: true })
})

const LAYOUT = { widths: { rail: 400, room: 300 }, folded: { '/work/a': ['_bmad/', '_bmad/ux/'] } }

describe('the layout file', () => {
  it('lives under the data directory it is given, by name', () => {
    expect(layoutFilePath('/data')).toBe('/data/layout.json')
  })

  it('writes {version, widths, folded} and reads it back as the parsed JSON', () => {
    const file = layoutFilePath(dir)

    expect(writeLayoutFile(file, LAYOUT)).toEqual({ ok: true })

    expect(readLayoutFile(file)).toEqual({ version: LAYOUT_VERSION, ...LAYOUT })
    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')) as object).sort()).toEqual(['folded', 'version', 'widths'])
    expect(LAYOUT_VERSION).toBe(1)
  })

  it('creates the directory, and leaves no temporary file beside it', () => {
    const nested = join(dir, 'a', 'b')

    expect(writeLayoutFile(layoutFilePath(nested), { widths: {}, folded: {} })).toEqual({ ok: true })
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
