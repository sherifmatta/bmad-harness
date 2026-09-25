import { tmpdir } from 'node:os'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const showOpenDialog = vi.fn()

vi.mock('electron', () => ({
  dialog: {
    showOpenDialog: (...args: unknown[]) => showOpenDialog(...args)
  }
}))

const {
  ProjectPathError,
  directoryFromArgument,
  projectPathArgument,
  resolveProjectPath
} = await import('./choose-project')

/** A real directory, because `directoryFromArgument` asks the filesystem. */
const existingDirectory = mkdtempSync(join(tmpdir(), 'harness-project-'))
const missingDirectory = join(existingDirectory, 'not', 'a', 'real', 'directory')

afterAll(() => {
  rmSync(existingDirectory, { recursive: true, force: true })
})

beforeEach(() => {
  showOpenDialog.mockReset()
})

describe('launching with a path', () => {
  it('takes the first positional argument, ignoring switches and the dev entry placeholder', () => {
    expect(projectPathArgument(['/path/to/electron', '.', existingDirectory], false)).toBe(
      existingDirectory
    )
    expect(projectPathArgument(['/path/to/app', existingDirectory], true)).toBe(existingDirectory)
    expect(projectPathArgument(['/path/to/electron', '.', '--inspect'], false)).toBeNull()
  })

  it('opens the current directory for `npm run dev -- .`, rather than the chooser', async () => {
    // The dev entry placeholder is dropped by position, so a `.` the user typed
    // is a project path like any other.
    expect(projectPathArgument(['/path/to/electron', '.', '.'], false)).toBe('.')

    const projectPath = await resolveProjectPath({
      argv: ['/path/to/electron', '.', '.'],
      isPackaged: false,
      useArgument: true
    })

    expect(projectPath).toBe(resolve('.'))
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('is a named startup error for an empty argument, not the working directory', async () => {
    // `resolve('')` is the harness's own cwd, so `npm run dev -- ""` would
    // otherwise open a project nobody asked for.
    expect(projectPathArgument(['/path/to/electron', '.', ''], false)).toBe('')
    expect(() => directoryFromArgument('')).toThrow(ProjectPathError)

    await expect(
      resolveProjectPath({
        argv: ['/path/to/electron', '.', ''],
        isPackaged: false,
        useArgument: true
      })
    ).rejects.toBeInstanceOf(ProjectPathError)

    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('names a file given where a directory was meant', () => {
    const file = join(existingDirectory, 'a-file')
    writeFileSync(file, '')

    expect(() => directoryFromArgument(file)).toThrow(ProjectPathError)
  })

  it('wraps a filesystem failure rather than letting a raw errno escape', () => {
    const unreadable = join(existingDirectory, 'unreadable')
    mkdirSync(unreadable)
    // 0o000: `statSync` on a path *inside* it fails with EACCES.
    chmodSync(unreadable, 0o000)

    try {
      expect(() => directoryFromArgument(join(unreadable, 'project'))).toThrow(ProjectPathError)
    } finally {
      chmodSync(unreadable, 0o700)
    }
  })

  it('opens that project without showing the chooser', async () => {
    const projectPath = await resolveProjectPath({
      argv: ['/path/to/electron', '.', existingDirectory],
      isPackaged: false,
      useArgument: true
    })

    expect(projectPath).toBe(resolve(existingDirectory))
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('is a named startup error when the path is not a directory, never a silent fall back to the chooser', async () => {
    await expect(
      resolveProjectPath({
        argv: ['/path/to/electron', '.', missingDirectory],
        isPackaged: false,
        useArgument: true
      })
    ).rejects.toBeInstanceOf(ProjectPathError)

    expect(() => directoryFromArgument(missingDirectory)).toThrow(ProjectPathError)
    expect(showOpenDialog).not.toHaveBeenCalled()
  })
})

describe('launching with no path', () => {
  it('opens the native folder chooser and uses what was chosen', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [existingDirectory] })

    const projectPath = await resolveProjectPath({
      argv: ['/path/to/electron', '.'],
      isPackaged: false,
      useArgument: true
    })

    expect(projectPath).toBe(existingDirectory)
    expect(showOpenDialog).toHaveBeenCalledTimes(1)
    // A folder chooser, not a file chooser.
    expect(showOpenDialog.mock.calls[0][0].properties).toContain('openDirectory')
  })

  it('answers null when the chooser is cancelled, which is what the caller quits on', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    await expect(
      resolveProjectPath({ argv: ['/path/to/electron', '.'], isPackaged: false, useArgument: true })
    ).resolves.toBeNull()
  })

  it('answers null when the chooser returns nothing at all', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })

    await expect(
      resolveProjectPath({ argv: ['/path/to/electron', '.'], isPackaged: false, useArgument: true })
    ).resolves.toBeNull()
  })
})
