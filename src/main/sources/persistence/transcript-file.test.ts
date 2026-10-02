import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { TranscriptRecord } from '../../../shared/conversation'
import {
  TRANSCRIPT_VERSION,
  isInsideProject,
  loadTranscript,
  transcriptFilePath,
  writeTranscript
} from './transcript-file'

let root: string
let project: string
let userData: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'harness-transcript-file-'))
  project = join(root, 'project')
  userData = join(root, 'userData')
  mkdirSync(project)
  mkdirSync(userData)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const entries: TranscriptRecord[] = [
  { kind: 'user', id: 'm-0', at: 1, text: 'hi' },
  { kind: 'persona', id: 'm-1', at: 2, agentId: 'a', messageId: 'msg', text: 'hello' }
]

describe('transcriptFilePath', () => {
  it('is <userData>/conversations/<sha256 of the project path>.json, one per project', () => {
    const one = transcriptFilePath(userData, '/work/one')
    const two = transcriptFilePath(userData, '/work/two')

    expect(one).toMatch(new RegExp(`^${userData}/conversations/[0-9a-f]{64}\\.json$`))
    expect(one).not.toBe(two)
    expect(transcriptFilePath(userData, '/work/one')).toBe(one)
  })
})

describe('writeTranscript and loadTranscript', () => {
  it('round-trips the records as {version, projectPath, entries} JSON', () => {
    const file = transcriptFilePath(userData, project)

    expect(writeTranscript(file, project, entries)).toEqual({ ok: true })
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      version: TRANSCRIPT_VERSION,
      projectPath: project,
      entries
    })
    expect(loadTranscript(file, project)).toEqual(entries)
  })

  it('leaves no temporary file behind, and replaces what was there', () => {
    const file = transcriptFilePath(userData, project)
    writeTranscript(file, project, entries)
    writeTranscript(file, project, entries.slice(0, 1))

    expect(readdirSync(join(userData, 'conversations'))).toEqual([`${file.split('/').pop()}`])
    expect(loadTranscript(file, project)).toEqual(entries.slice(0, 1))
  })

  it('reports the errno code and throws nothing when the write cannot happen', () => {
    // The conversations directory is where a regular file lies.
    writeFileSync(join(userData, 'conversations'), 'in the way')
    const outcome = writeTranscript(transcriptFilePath(userData, project), project, entries)

    expect(outcome).toMatchObject({ ok: false })
    expect(outcome.ok === false && outcome.errno).toMatch(/^[A-Z]+$/)
  })

  it('refuses a file inside the project root, writes nothing and loads nothing', () => {
    const inside = join(project, 'conversations', 'x.json')

    expect(writeTranscript(inside, project, entries)).toEqual({ ok: false, errno: 'inside-project' })
    expect(readdirSync(project)).toEqual([])
    mkdirSync(join(project, 'conversations'))
    writeFileSync(
      inside,
      JSON.stringify({ version: TRANSCRIPT_VERSION, projectPath: project, entries })
    )
    expect(loadTranscript(inside, project)).toEqual([])
  })

  it('sees through a link into the project, and a path that does not exist yet', () => {
    symlinkSync(project, join(userData, 'link'))

    expect(isInsideProject(project, join(userData, 'link', 'a', 'b.json'))).toBe(true)
    expect(isInsideProject(project, join(project, 'not', 'yet', 'b.json'))).toBe(true)
    expect(isInsideProject(project, join(userData, 'conversations', 'b.json'))).toBe(false)
    expect(isInsideProject(project, `${project}-sibling/b.json`)).toBe(false)
    expect(isInsideProject(project, join(project, '..cache', 'b.json'))).toBe(true)
  })

  describe.each([
    ['absent', undefined],
    ['corrupt', '{not json'],
    ['not an object', '[1]'],
    ['a wrong version', JSON.stringify({ version: 2, projectPath: 'P', entries: [] })],
    ['another project’s', JSON.stringify({ version: 1, projectPath: 'other', entries: [] })],
    ['without entries', JSON.stringify({ version: 1, projectPath: 'P' })],
    ['with a malformed record', JSON.stringify({ version: 1, projectPath: 'P', entries: [{ kind: 'user', id: 'm-0' }] })],
    [
      'with an unknown kind',
      JSON.stringify({ version: 1, projectPath: 'P', entries: [{ kind: 'x', id: 'm-0', at: 1, text: '' }] })
    ]
  ])('a file that is %s', (_name, content) => {
    it('loads as an empty transcript and is left as it lies', () => {
      const file = join(userData, 'file.json')
      const text = content?.replace('"P"', JSON.stringify(project))
      if (text !== undefined) writeFileSync(file, text)

      expect(loadTranscript(file, project)).toEqual([])
      if (text !== undefined) {
        expect(readFileSync(file, 'utf8')).toBe(text)
      } else {
        expect(existsSync(file)).toBe(false)
      }
    })
  })
})
