import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { artifactsDirOf, boardPaths, readArtifactNames, readSprintStatus } from './read-sprint-status'

const root = mkdtempSync(join(tmpdir(), 'harness-sprint-status-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

const FOLDER = '_bmad/'
const file = join(root, '_bmad/implementation-artifacts/sprint-status.yaml')

describe('boardPaths', () => {
  it('puts both files under the output folder', () => {
    expect(boardPaths('_bmad/')).toEqual({
      sprintStatus: '_bmad/implementation-artifacts/sprint-status.yaml',
      epics: '_bmad/planning-artifacts/epics.md'
    })
    expect(boardPaths('docs/out/').sprintStatus).toBe('docs/out/implementation-artifacts/sprint-status.yaml')
  })
})

describe('readSprintStatus', () => {
  it('says absent for a project with no output folder at all', async () => {
    await expect(readSprintStatus(root, FOLDER)).resolves.toEqual({ state: 'absent' })
  })

  it('reads the file’s text, and leaves its bytes and its mtime alone', async () => {
    mkdirSync(join(root, '_bmad/implementation-artifacts'), { recursive: true })
    writeFileSync(file, 'development_status:\n  epic-1: done\n')
    const before = { bytes: readFileSync(file), mtimeMs: statSync(file).mtimeMs }

    await expect(readSprintStatus(root, FOLDER)).resolves.toEqual({
      state: 'text',
      text: 'development_status:\n  epic-1: done\n'
    })
    await readSprintStatus(root, FOLDER)

    expect(readFileSync(file).equals(before.bytes)).toBe(true)
    expect(statSync(file).mtimeMs).toBe(before.mtimeMs)
  })

  it('says unreadable, with an errno name, for what is there but cannot be read as a file', async () => {
    rmSync(file)
    mkdirSync(file)
    const outcome = await readSprintStatus(root, FOLDER)
    expect(outcome).toEqual({ state: 'unreadable', errno: 'EISDIR' })
  })
})

describe('readArtifactNames', () => {
  const listed = mkdtempSync(join(tmpdir(), 'harness-artifact-names-'))
  afterAll(() => rmSync(listed, { recursive: true, force: true }))

  it('lists the files directly in implementation-artifacts, leaves out a directory, and says where it looks', async () => {
    const dir = join(listed, 'docs/out/implementation-artifacts')
    mkdirSync(join(dir, 'nested'), { recursive: true })
    writeFileSync(join(dir, 'spec-1-1-a.md'), 'x')
    writeFileSync(join(dir, 'epic-1-context.md'), 'x')
    writeFileSync(join(dir, 'nested/spec-1-2-b.md'), 'x')

    expect(artifactsDirOf('docs/out/')).toBe('docs/out/implementation-artifacts/')
    expect((await readArtifactNames(listed, 'docs/out/')).sort()).toEqual(['epic-1-context.md', 'spec-1-1-a.md'])
  })

  it('says nothing for a directory that is not there or is not a directory, and never rejects', async () => {
    await expect(readArtifactNames(listed, 'missing/')).resolves.toEqual([])
    mkdirSync(join(listed, 'plain'), { recursive: true })
    writeFileSync(join(listed, 'plain/implementation-artifacts'), 'a file, not a directory')
    await expect(readArtifactNames(listed, 'plain/')).resolves.toEqual([])
  })
})

describe('the reader’s source', () => {
  it('opens one file and writes nothing', () => {
    const source = readFileSync(join(import.meta.dirname, 'read-sprint-status.ts'), 'utf8')
    expect(source).not.toMatch(/writeFile|appendFile|\brename\b|unlink|\bmkdir|\btruncate|\butimes|\bchmod|createWriteStream/)
    expect(source.match(/readFile\(/g)).toHaveLength(1)
    // The listing is the one other call: a read of the directory's names, never of a file in it.
    expect(source.match(/readdir\(/g)).toHaveLength(1)
  })
})
