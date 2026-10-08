import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { readThemeFile, themeFilePath, writeThemeFile } from './theme-file'

const root = mkdtempSync(join(tmpdir(), 'harness-theme-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

let userData: string
beforeEach(() => {
  userData = mkdtempSync(join(root, 'userdata-'))
})

describe('where it lives', () => {
  it('is one file directly under the app data directory', () => {
    expect(themeFilePath('/data')).toBe('/data/theme.json')
  })
})

describe('reading', () => {
  it('is null for a file that is not there', () => {
    expect(readThemeFile(themeFilePath(userData))).toBeNull()
  })

  it('is null for a file that is not JSON, and for one that cannot be read at all', () => {
    const path = themeFilePath(userData)
    writeFileSync(path, '{ not json')
    expect(readThemeFile(path)).toBeNull()

    const asDirectory = join(userData, 'dir.json')
    mkdirSync(asDirectory)
    expect(readThemeFile(asDirectory)).toBeNull()
  })

  it('hands back whatever JSON it found, for the fold to judge', () => {
    const path = themeFilePath(userData)
    writeFileSync(path, JSON.stringify({ anything: [1, 2] }))

    expect(readThemeFile(path)).toEqual({ anything: [1, 2] })
  })
})

describe('writing', () => {
  it.each(['system', 'light', 'dark'] as const)('writes %s as the one word, and nothing else', (choice) => {
    const path = themeFilePath(userData)

    expect(writeThemeFile(path, choice)).toEqual({ ok: true })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ theme: choice })
  })

  it('replaces a file that was there, including one that was not a theme at all', () => {
    const path = themeFilePath(userData)
    writeFileSync(path, 'garbage')

    writeThemeFile(path, 'dark')

    expect(readThemeFile(path)).toEqual({ theme: 'dark' })
  })

  it('makes the directory it lives in, and leaves no temporary file behind', () => {
    const path = join(userData, 'nested', 'deeper', 'theme.json')

    expect(writeThemeFile(path, 'light')).toEqual({ ok: true })
    expect(readdirSync(join(userData, 'nested', 'deeper'))).toEqual(['theme.json'])
  })

  it('reports the errno and throws nothing when the file cannot be written, leaving no temporary file', () => {
    // A file where the directory should be.
    const blocker = join(userData, 'blocker')
    writeFileSync(blocker, '')

    const outcome = writeThemeFile(join(blocker, 'theme.json'), 'light')

    expect(outcome.ok).toBe(false)
    expect(outcome.ok === false && outcome.errno).toMatch(/^[A-Z0-9_]+$/)
    expect(readdirSync(userData)).toEqual(['blocker'])
  })
})
