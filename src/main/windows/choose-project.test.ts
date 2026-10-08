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
  chooseProjectDirectory,
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

  it('opens the current directory for `npm run dev -- .`, rather than the Welcome', () => {
    // The dev entry placeholder is dropped by position, so a `.` the user typed
    // is a project path like any other.
    expect(projectPathArgument(['/path/to/electron', '.', '.'], false)).toBe('.')

    const projectPath = resolveProjectPath({
      argv: ['/path/to/electron', '.', '.'],
      isPackaged: false
    })

    expect(projectPath).toBe(resolve('.'))
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('is a named startup error for an empty argument, not the working directory', () => {
    // `resolve('')` is the harness's own cwd, so `npm run dev -- ""` would
    // otherwise open a project nobody asked for.
    expect(projectPathArgument(['/path/to/electron', '.', ''], false)).toBe('')
    expect(() => directoryFromArgument('')).toThrow(ProjectPathError)

    expect(() =>
      resolveProjectPath({ argv: ['/path/to/electron', '.', ''], isPackaged: false })
    ).toThrow(ProjectPathError)

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

  it('opens that project without showing the chooser', () => {
    const projectPath = resolveProjectPath({
      argv: ['/path/to/electron', '.', existingDirectory],
      isPackaged: false
    })

    expect(projectPath).toBe(resolve(existingDirectory))
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  it('is a named startup error when the path is not a directory, never a silent fall back to the Welcome', () => {
    expect(() =>
      resolveProjectPath({ argv: ['/path/to/electron', '.', missingDirectory], isPackaged: false })
    ).toThrow(ProjectPathError)

    expect(() => directoryFromArgument(missingDirectory)).toThrow(ProjectPathError)
    expect(showOpenDialog).not.toHaveBeenCalled()
  })
})

describe('launching with no path', () => {
  it('names no project, and opens no native dialog: the Welcome is what opens', () => {
    expect(resolveProjectPath({ argv: ['/path/to/electron', '.'], isPackaged: false })).toBeNull()
    expect(resolveProjectPath({ argv: ['/path/to/app'], isPackaged: true })).toBeNull()
    // A switch Electron appended is not a project path.
    expect(
      resolveProjectPath({ argv: ['/path/to/electron', '.', '--inspect'], isPackaged: false })
    ).toBeNull()
    expect(showOpenDialog).not.toHaveBeenCalled()
  })
})

describe('the native folder chooser', () => {
  it('opens with the options it has always had: a folder, with create-folder allowed', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [existingDirectory] })

    await expect(chooseProjectDirectory()).resolves.toBe(existingDirectory)

    expect(showOpenDialog).toHaveBeenCalledTimes(1)
    expect(showOpenDialog).toHaveBeenCalledWith({
      title: 'open a bmad project',
      buttonLabel: 'open',
      properties: ['openDirectory', 'createDirectory']
    })
  })

  it('answers null when cancelled, which is what leaves the Welcome as it was', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    await expect(chooseProjectDirectory()).resolves.toBeNull()
  })

  it('answers null when it returns nothing at all', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })

    await expect(chooseProjectDirectory()).resolves.toBeNull()
  })
})
