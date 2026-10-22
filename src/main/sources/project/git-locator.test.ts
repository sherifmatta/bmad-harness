import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import {
  candidatesOf,
  FIXED_CANDIDATES,
  isMachO,
  isRegularFile,
  locateGit,
  readHeadBytes,
  realpathOrNull
} from './git-locator'

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values)

const THIN_64_LE = bytes(0xcf, 0xfa, 0xed, 0xfe, 0x07, 0x00, 0x00, 0x01)
const THIN_32_BE = bytes(0xfe, 0xed, 0xfa, 0xce, 0, 0, 0, 0)
const FAT_2 = bytes(0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2)
const JAVA_CLASS = bytes(0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 52)
const SCRIPT = new TextEncoder().encode('#!/bin/s')

type FakeFile = { head: Uint8Array; real?: string }

/** A scripted file system: path to what is there; everything else is no file. Records every look. */
function fakeFs(files: Record<string, FakeFile>) {
  const looked: string[] = []
  const realOf = (path: string): string | null => {
    const file = files[path]
    return file === undefined ? null : (file.real ?? path)
  }
  return {
    looked,
    deps: {
      isFile: async (path: string) => {
        looked.push(`isFile ${path}`)
        return files[path] !== undefined
      },
      realpath: async (path: string) => realOf(path),
      readHead: async (path: string) => {
        looked.push(`readHead ${path}`)
        const entry = Object.entries(files).find(([key, file]) => (file.real ?? key) === path)
        return entry === undefined ? null : entry[1].head
      }
    }
  }
}

describe('isMachO', () => {
  it('takes a thin binary in either byte order and a universal one with a believable arch count', () => {
    expect(isMachO(THIN_64_LE)).toBe(true)
    expect(isMachO(THIN_32_BE)).toBe(true)
    expect(isMachO(bytes(0xce, 0xfa, 0xed, 0xfe))).toBe(true)
    expect(isMachO(bytes(0xfe, 0xed, 0xfa, 0xcf))).toBe(true)
    expect(isMachO(FAT_2)).toBe(true)
    expect(isMachO(bytes(0xca, 0xfe, 0xba, 0xbf, 0, 0, 0, 1))).toBe(true)
  })

  it('refuses a script, a Java class file, a short read and nothing at all', () => {
    expect(isMachO(SCRIPT)).toBe(false)
    expect(isMachO(JAVA_CLASS)).toBe(false)
    expect(isMachO(bytes(0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 0))).toBe(false)
    expect(isMachO(bytes(0xca, 0xfe, 0xba, 0xbe))).toBe(false)
    expect(isMachO(bytes(0xcf, 0xfa))).toBe(false)
    expect(isMachO(null)).toBe(false)
  })
})

describe('candidatesOf', () => {
  it('lists AD-31’s four first, then <dir>/git for each absolute login-path dir, each once, skipping relative ones', () => {
    expect(FIXED_CANDIDATES).toEqual([
      '/Library/Developer/CommandLineTools/usr/bin/git',
      '/Applications/Xcode.app/Contents/Developer/usr/bin/git',
      '/opt/homebrew/bin/git',
      '/usr/local/bin/git'
    ])
    expect(candidatesOf('/opt/homebrew/bin:bin:./x::/Users/me/.local/bin:/usr/bin')).toEqual([
      ...FIXED_CANDIDATES,
      '/Users/me/.local/bin/git',
      '/usr/bin/git'
    ])
  })
})

describe('locateGit over a scripted file system', () => {
  it('takes the CommandLineTools git first, by its real path', async () => {
    const { deps } = fakeFs({
      '/Library/Developer/CommandLineTools/usr/bin/git': { head: FAT_2 },
      '/opt/homebrew/bin/git': { head: THIN_64_LE }
    })
    expect(await locateGit({ ...deps, path: '' })).toBe('/Library/Developer/CommandLineTools/usr/bin/git')
  })

  it('follows a Homebrew link to its real file and answers with that', async () => {
    const { deps } = fakeFs({ '/opt/homebrew/bin/git': { head: THIN_64_LE, real: '/opt/homebrew/Cellar/git/2.50/bin/git' } })
    expect(await locateGit({ ...deps, path: '' })).toBe('/opt/homebrew/Cellar/git/2.50/bin/git')
  })

  it('answers null when only the stub is there, even on PATH, and never reads the stub', async () => {
    const { deps, looked } = fakeFs({ '/usr/bin/git': { head: THIN_64_LE } })
    expect(await locateGit({ ...deps, path: '/usr/bin:/bin' })).toBeNull()
    expect(looked).not.toContain('readHead /usr/bin/git')
  })

  it('passes over a candidate whose real path is a stub', async () => {
    const { deps } = fakeFs({
      '/usr/local/bin/git': { head: THIN_64_LE, real: '/usr/bin/git' },
      '/opt/tools/git': { head: THIN_64_LE, real: '/usr/bin/xcrun' }
    })
    expect(await locateGit({ ...deps, path: '/opt/tools' })).toBeNull()
  })

  it('skips a script candidate and takes the next', async () => {
    const { deps } = fakeFs({
      '/opt/homebrew/bin/git': { head: SCRIPT },
      '/usr/local/bin/git': { head: THIN_64_LE }
    })
    expect(await locateGit({ ...deps, path: '' })).toBe('/usr/local/bin/git')
  })

  it('never takes a relative PATH entry, so bare git is never a candidate', async () => {
    const { deps, looked } = fakeFs({ 'bin/git': { head: THIN_64_LE }, git: { head: THIN_64_LE } })
    expect(await locateGit({ ...deps, path: 'bin:.:' })).toBeNull()
    expect(looked.filter((look) => !look.includes(' /'))).toEqual([])
  })
})

describe('the real file system helpers', () => {
  const root = mkdtempSync(join(tmpdir(), 'git-locator-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('take a link to a Mach-O file as a regular file, resolve it to its target, and read the target’s header', async () => {
    const target = join(root, 'real-git')
    writeFileSync(target, Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0x07, 0x00, 0x00, 0x01, 0xaa, 0xbb]))
    const link = join(root, 'git')
    symlinkSync(target, link)

    expect(await isRegularFile(link)).toBe(true)
    expect(await realpathOrNull(link)).toBe(realpathSync(target))
    const head = await readHeadBytes(link)
    expect([...(head ?? [])]).toEqual([0xcf, 0xfa, 0xed, 0xfe, 0x07, 0x00, 0x00, 0x01])
    expect(isMachO(head)).toBe(true)
  })

  it('read a script’s header, which isMachO refuses', async () => {
    const script = join(root, 'script-git')
    writeFileSync(script, '#!/bin/sh\nexec /usr/bin/git "$@"\n')

    expect(await isRegularFile(script)).toBe(true)
    expect(isMachO(await readHeadBytes(script))).toBe(false)
  })

  it('say no file, no real path and no header for what is not there, and no regular file for a directory', async () => {
    const dir = join(root, 'a-dir')
    mkdirSync(dir)

    expect(await isRegularFile(join(root, 'missing'))).toBe(false)
    expect(await realpathOrNull(join(root, 'missing'))).toBeNull()
    expect(await readHeadBytes(join(root, 'missing'))).toBeNull()
    expect(await isRegularFile(dir)).toBe(false)
  })
})
