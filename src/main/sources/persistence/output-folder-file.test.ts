import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  OUTPUT_FOLDERS_VERSION,
  outputFoldersFilePath,
  readOutputFoldersFile,
  writeOutputFoldersFile
} from './output-folder-file'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'output-folders-'))
})

afterEach(() => {
  chmodSync(dir, 0o755)
  rmSync(dir, { recursive: true, force: true })
})

describe('the output folders file', () => {
  it('lives under the data directory it is given, by name', () => {
    expect(outputFoldersFilePath('/data')).toBe('/data/output-folders.json')
  })

  it('writes {version, folders} and reads it back as the parsed JSON', () => {
    const file = outputFoldersFilePath(dir)

    expect(writeOutputFoldersFile(file, { '/work/a': 'docs/out/', '/work/b': 'x/' })).toEqual({ ok: true })

    expect(readOutputFoldersFile(file)).toEqual({
      version: OUTPUT_FOLDERS_VERSION,
      folders: { '/work/a': 'docs/out/', '/work/b': 'x/' }
    })
  })

  it('holds a path and a folder per project and nothing else', () => {
    const file = outputFoldersFilePath(dir)
    writeOutputFoldersFile(file, { '/work/a': 'docs/' })

    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')) as object).sort()).toEqual(['folders', 'version'])
  })

  it('creates the directory, and leaves no temporary file beside it', () => {
    const nested = join(dir, 'a', 'b')
    const file = outputFoldersFilePath(nested)

    expect(writeOutputFoldersFile(file, {})).toEqual({ ok: true })
    expect(readdirSync(nested)).toEqual(['output-folders.json'])
  })

  it('reads a missing file, and one that is not JSON, as null, without throwing', () => {
    expect(readOutputFoldersFile(join(dir, 'nope.json'))).toBeNull()
    writeFileSync(join(dir, 'bad.json'), '{not json')
    expect(readOutputFoldersFile(join(dir, 'bad.json'))).toBeNull()
  })

  it('replaces a bad file whole on the next write', () => {
    const file = outputFoldersFilePath(dir)
    writeFileSync(file, 'garbage')

    expect(writeOutputFoldersFile(file, { '/a': 'x/' })).toEqual({ ok: true })
    expect(readOutputFoldersFile(file)).toEqual({ version: 1, folders: { '/a': 'x/' } })
  })

  it('reports an errno name and throws nothing when it cannot write, leaving no temporary file', () => {
    const locked = join(dir, 'locked')
    mkdirSync(locked)
    chmodSync(locked, 0o500)

    const outcome = writeOutputFoldersFile(outputFoldersFilePath(locked), { '/a': 'x/' })

    expect(outcome).toMatchObject({ ok: false })
    expect(outcome.ok ? '' : outcome.errno).toMatch(/^[A-Z0-9_]+$/)
    chmodSync(locked, 0o755)
    expect(readdirSync(locked)).toEqual([])
  })
})
