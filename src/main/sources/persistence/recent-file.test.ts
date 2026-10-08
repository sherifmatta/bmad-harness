import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { RECENT_VERSION, readRecentFile, recentFilePath, writeRecentFile } from './recent-file'

const root = mkdtempSync(join(tmpdir(), 'harness-recent-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

let userData: string
beforeEach(() => {
  userData = mkdtempSync(join(root, 'userdata-'))
})

describe('where it lives', () => {
  it('is one file directly under the app data directory', () => {
    expect(recentFilePath('/data')).toBe('/data/recent-projects.json')
  })
})

describe('reading', () => {
  it('is null for a file that is not there', () => {
    expect(readRecentFile(recentFilePath(userData))).toBeNull()
  })

  it('is null for a file that is not JSON, and for one that cannot be read at all', () => {
    const path = recentFilePath(userData)
    writeFileSync(path, '{ not json')
    expect(readRecentFile(path)).toBeNull()

    // A directory where the file should be: reading it fails, and says nothing.
    const asDirectory = join(userData, 'dir.json')
    mkdirSync(asDirectory)
    expect(readRecentFile(asDirectory)).toBeNull()
  })

  it('hands back whatever JSON it found, for the fold to judge', () => {
    const path = recentFilePath(userData)
    writeFileSync(path, JSON.stringify({ anything: [1, 2] }))

    expect(readRecentFile(path)).toEqual({ anything: [1, 2] })
  })
})

describe('writing', () => {
  it('writes the version and each entry’s path and time, and nothing else', () => {
    const path = recentFilePath(userData)

    const outcome = writeRecentFile(path, [
      { path: '/a', openedAt: 2, branch: 'main', agents: 5 } as { path: string; openedAt: number },
      { path: '/b', openedAt: 1 }
    ])

    expect(outcome).toEqual({ ok: true })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({
      version: RECENT_VERSION,
      entries: [
        { path: '/a', openedAt: 2 },
        { path: '/b', openedAt: 1 }
      ]
    })
  })

  it('creates the data directory when it is not there yet', () => {
    const path = recentFilePath(join(userData, 'not', 'yet'))

    expect(writeRecentFile(path, [{ path: '/a', openedAt: 1 }])).toEqual({ ok: true })
    expect(readRecentFile(path)).not.toBeNull()
  })

  it('leaves no temporary file behind', () => {
    const path = recentFilePath(userData)

    writeRecentFile(path, [{ path: '/a', openedAt: 1 }])
    writeRecentFile(path, [{ path: '/b', openedAt: 2 }])

    expect(readdirSync(userData)).toEqual(['recent-projects.json'])
  })

  it('writes afresh over a file that was bad', () => {
    const path = recentFilePath(userData)
    writeFileSync(path, 'garbage')

    writeRecentFile(path, [{ path: '/a', openedAt: 1 }])

    expect(readRecentFile(path)).toEqual({ version: 1, entries: [{ path: '/a', openedAt: 1 }] })
  })

  it('reports the errno and does not throw when it cannot write', () => {
    // The data directory is a file: nothing can be created under it.
    const blocker = join(userData, 'blocker')
    writeFileSync(blocker, '')

    const outcome = writeRecentFile(recentFilePath(blocker), [{ path: '/a', openedAt: 1 }])

    expect(outcome.ok).toBe(false)
    expect(outcome).toMatchObject({ errno: expect.stringMatching(/^[A-Z_]+$/) })
  })
})
