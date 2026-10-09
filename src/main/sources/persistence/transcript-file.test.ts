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
import type { RunCardSnapshot, StoredRun, TranscriptRecord } from '../../../shared/conversation'
import {
  TRANSCRIPT_VERSION,
  isInsideProject,
  loadTranscript,
  setAsideTranscript,
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
  { kind: 'persona', id: 'm-1', at: 2, agentId: 'a', messageId: 'msg', text: 'hello' },
  { kind: 'sysline', id: 'm-2', at: 3, text: 'handed to B' }
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
    expect(loadTranscript(file, project)).toEqual({ kind: 'loaded', entries, runs: [], dropped: 0 })
  })

  it('leaves no temporary file behind, and replaces what was there', () => {
    const file = transcriptFilePath(userData, project)
    writeTranscript(file, project, entries)
    writeTranscript(file, project, entries.slice(0, 1))

    expect(readdirSync(join(userData, 'conversations'))).toEqual([`${file.split('/').pop()}`])
    expect(loadTranscript(file, project)).toEqual({ kind: 'loaded', entries: entries.slice(0, 1), runs: [], dropped: 0 })
  })

  it('keeps every earlier record when a sysline sits among them, at version 1', () => {
    const file = transcriptFilePath(userData, project)
    writeTranscript(file, project, entries)

    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1)
    expect(TRANSCRIPT_VERSION).toBe(1)
    const loaded = loadTranscript(file, project)
    expect(loaded.kind === 'loaded' && loaded.entries.map((record) => record.kind)).toEqual([
      'user',
      'persona',
      'sysline'
    ])
  })

  it('keeps the `room` flag of a sysline through a write and a read, and invents none', () => {
    const file = transcriptFilePath(userData, project)
    const held: TranscriptRecord[] = [
      { kind: 'sysline', id: 'm-0', at: 1, text: 'room opened by you · present · Mary', room: true },
      { kind: 'sysline', id: 'm-1', at: 2, text: 'handed to B' }
    ]
    writeTranscript(file, project, held)

    const loaded = loadTranscript(file, project)
    expect(loaded).toEqual({ kind: 'loaded', entries: held, runs: [], dropped: 0 })
    expect(loaded.kind === 'loaded' && 'room' in loaded.entries[1]).toBe(false)
  })

  it('keeps the `room` flag of a persona turn and a user turn through a write and a read (Story 4.2)', () => {
    const file = transcriptFilePath(userData, project)
    const held: TranscriptRecord[] = [
      { kind: 'user', id: 'm-0', at: 1, text: 'what do you think', room: true },
      { kind: 'persona', id: 'm-1', at: 2, agentId: 'a', messageId: 'msg#1', text: 'Hi.', room: true },
      { kind: 'persona', id: 'm-2', at: 3, agentId: 'a', messageId: 'msg_2', text: 'plain' }
    ]
    writeTranscript(file, project, held)

    const loaded = loadTranscript(file, project)
    expect(loaded).toEqual({ kind: 'loaded', entries: held, runs: [], dropped: 0 })
    expect(loaded.kind === 'loaded' && 'room' in loaded.entries[2]).toBe(false)
  })

  it('keeps a user turn’s `mention` through a write and a read, and invents none (Story 2.15)', () => {
    const file = transcriptFilePath(userData, project)
    const held: TranscriptRecord[] = [
      { kind: 'user', id: 'm-0', at: 1, text: 'go', mention: '@Amelia' },
      { kind: 'user', id: 'm-1', at: 2, text: 'plain' }
    ]
    writeTranscript(file, project, held)

    const loaded = loadTranscript(file, project)
    expect(loaded).toEqual({ kind: 'loaded', entries: held, runs: [], dropped: 0 })
    expect(loaded.kind === 'loaded' && 'mention' in loaded.entries[1]).toBe(false)
  })

  it('loads a file written before `mention` as plain turns, at the same version', () => {
    const file = join(userData, 'before-mention.json')
    const old = [{ kind: 'user', id: 'm-0', at: 1, text: 'implement story 5.6' }]
    writeFileSync(file, JSON.stringify({ version: TRANSCRIPT_VERSION, projectPath: project, entries: old }))

    expect(TRANSCRIPT_VERSION).toBe(1)
    expect(loadTranscript(file, project)).toEqual({ kind: 'loaded', entries: old, runs: [], dropped: 0 })
  })

  it.each([[3], [null], [{}], [['@a']], [true], [''], ['  '], ['Amelia'], ['@'], ['@ a'], ['@a b']])(
    'loads a record whose `mention` is %j as a plain turn, the field ignored and nothing counted as left out',
    (bad) => {
      const file = join(userData, 'bad-mention.json')
      const stored = { kind: 'user', id: 'm-0', at: 1, text: 'kept', mention: bad }
      writeFileSync(file, JSON.stringify({ version: 1, projectPath: project, entries: [stored] }))

      const loaded = loadTranscript(file, project)
      expect(loaded).toEqual({
        kind: 'loaded',
        entries: [{ kind: 'user', id: 'm-0', at: 1, text: 'kept' }],
        runs: [],
        dropped: 0
      })
      expect(loaded.kind === 'loaded' && 'mention' in loaded.entries[0]).toBe(false)
    }
  )

  it('drops a `mention` from a room user record and from a record that is not a user’s, keeping the records', () => {
    const file = join(userData, 'odd-mention-owner.json')
    const stored = [
      { kind: 'user', id: 'm-0', at: 1, text: 'to room', room: true, mention: '@Mary' },
      { kind: 'persona', id: 'm-1', at: 2, agentId: 'a', messageId: 'x', text: 'hi', mention: '@Mary' },
      { kind: 'sysline', id: 'm-2', at: 3, text: 'handed to Mary', mention: '@Mary' }
    ]
    writeFileSync(file, JSON.stringify({ version: 1, projectPath: project, entries: stored }))

    const loaded = loadTranscript(file, project)
    expect(loaded).toEqual({
      kind: 'loaded',
      entries: stored.map((record) => {
        const plain: Record<string, unknown> = { ...record }
        delete plain.mention
        return plain
      }),
      runs: [],
      dropped: 0
    })
  })

  it('counts a record whose `room` is anything but true as left out', () => {
    const file = join(userData, 'odd-room.json')
    const good = { kind: 'user', id: 'm-0', at: 1, text: 'kept' }
    writeFileSync(
      file,
      JSON.stringify({ version: 1, projectPath: project, entries: [good, { ...good, id: 'm-1', room: 'yes' }] })
    )

    expect(loadTranscript(file, project)).toEqual({ kind: 'loaded', entries: [good], runs: [], dropped: 1 })
  })

  it('reports the errno code and throws nothing when the write cannot happen', () => {
    // The conversations directory is where a regular file lies.
    writeFileSync(join(userData, 'conversations'), 'in the way')
    const outcome = writeTranscript(transcriptFilePath(userData, project), project, entries)

    expect(outcome).toMatchObject({ ok: false })
    expect(outcome.ok === false && outcome.errno).toMatch(/^[A-Z]+$/)
  })

  it('refuses a file inside the project root, writes nothing and reads nothing of it', () => {
    const inside = join(project, 'conversations', 'x.json')

    expect(writeTranscript(inside, project, entries)).toEqual({ ok: false, errno: 'inside-project' })
    expect(readdirSync(project)).toEqual([])
    mkdirSync(join(project, 'conversations'))
    writeFileSync(
      inside,
      JSON.stringify({ version: TRANSCRIPT_VERSION, projectPath: project, entries })
    )
    expect(loadTranscript(inside, project)).toEqual({ kind: 'missing' })
    expect(setAsideTranscript(inside, project)).toEqual({ ok: false, errno: 'inside-project' })
    expect(existsSync(inside)).toBe(true)
  })

  it('sees through a link into the project, and a path that does not exist yet', () => {
    symlinkSync(project, join(userData, 'link'))

    expect(isInsideProject(project, join(userData, 'link', 'a', 'b.json'))).toBe(true)
    expect(isInsideProject(project, join(project, 'not', 'yet', 'b.json'))).toBe(true)
    expect(isInsideProject(project, join(userData, 'conversations', 'b.json'))).toBe(false)
    expect(isInsideProject(project, `${project}-sibling/b.json`)).toBe(false)
    expect(isInsideProject(project, join(project, '..cache', 'b.json'))).toBe(true)
  })

  it('keeps the first character of a first segment that does not exist, whose parent is the root', () => {
    // Two different directories at the root that differ only in their first character: the old
    // reading dropped it from both, so each was the other's.
    expect(isInsideProject('/xa-harness-missing-dir', '/ya-harness-missing-dir')).toBe(false)
    expect(isInsideProject('/xa-harness-missing-dir', '/xa-harness-missing-dir/inside/b.json')).toBe(true)
    expect(isInsideProject('/xa-harness-missing-dir/p', '/xa-harness-missing-dir/p-sibling/b.json')).toBe(false)
    expect(isInsideProject('/xa-harness-missing-dir', '/a-harness-missing-dir')).toBe(false)
  })

  describe.each([
    ['not JSON', '{not json', { kind: 'corrupt' }],
    ['truncated', '{"version":1,"projectPath":"P","entries":[{"kind":"us', { kind: 'corrupt' }],
    ['empty', '', { kind: 'corrupt' }],
    ['not an object', '[1]', { kind: 'corrupt' }],
    ['null', 'null', { kind: 'corrupt' }],
    ['of a version this build does not write', JSON.stringify({ version: 2, projectPath: 'P', entries: [] }), { kind: 'unknown-version' }],
    ['of version 0', JSON.stringify({ version: 0, projectPath: 'P', entries: [] }), { kind: 'unknown-version' }],
    ['with no version', JSON.stringify({ projectPath: 'P', entries: [] }), { kind: 'corrupt' }],
    ['another project’s', JSON.stringify({ version: 1, projectPath: 'other', entries: [] }), { kind: 'corrupt' }],
    ['without entries', JSON.stringify({ version: 1, projectPath: 'P' }), { kind: 'corrupt' }],
    ['with entries that are not a list', JSON.stringify({ version: 1, projectPath: 'P', entries: {} }), { kind: 'corrupt' }]
  ])('a file that is %s', (_name, content, expected) => {
    it('says which way it is not a transcript, and is left exactly as it lies', () => {
      const file = join(userData, 'file.json')
      const text = content.replace('"P"', JSON.stringify(project))
      writeFileSync(file, text)

      expect(loadTranscript(file, project)).toEqual(expected)
      expect(readFileSync(file, 'utf8')).toBe(text)
    })
  })

  it('says a file that is absent is missing, which is not a problem, and creates nothing', () => {
    const file = join(userData, 'conversations', 'none.json')

    expect(loadTranscript(file, project)).toEqual({ kind: 'missing' })
    expect(existsSync(file)).toBe(false)
  })

  it('says a file it cannot read is unreadable, with the errno and nothing of the system’s own words', () => {
    // A directory where the file should be: reading it is an error that is not "no such file".
    const file = join(userData, 'a-directory.json')
    mkdirSync(file)
    const outcome = loadTranscript(file, project)

    expect(outcome).toMatchObject({ kind: 'unreadable' })
    expect(outcome.kind === 'unreadable' && outcome.errno).toMatch(/^[A-Z0-9_]+$/)
    expect(JSON.stringify(outcome)).not.toContain(userData)
  })

  describe('a file with a record that is not one', () => {
    const good = { kind: 'user', id: 'm-0', at: 1, text: 'kept' }
    const write = (listed: unknown[]): string => {
      const file = join(userData, 'partly.json')
      writeFileSync(file, JSON.stringify({ version: 1, projectPath: project, entries: listed }))
      return file
    }

    it.each([
      ['a user record with no text', { kind: 'user', id: 'm-1', at: 2 }],
      ['a sysline with no text', { kind: 'sysline', id: 'm-1', at: 2 }],
      ['an unknown kind', { kind: 'x', id: 'm-1', at: 2, text: '' }],
      ['a persona with no agent', { kind: 'persona', id: 'm-1', at: 2, messageId: 'x', text: '' }],
      ['a time that is not a number', { kind: 'user', id: 'm-1', at: 'now', text: 'x' }],
      ['null', null],
      ['a string', 'm-1']
    ])('keeps the others and counts %s as left out', (_name, bad) => {
      const file = write([good, bad, { kind: 'user', id: 'm-2', at: 3, text: 'also kept' }])
      const before = readFileSync(file, 'utf8')

      expect(loadTranscript(file, project)).toEqual({
        kind: 'loaded',
        entries: [good, { kind: 'user', id: 'm-2', at: 3, text: 'also kept' }],
        runs: [],
        dropped: 1
      })
      expect(readFileSync(file, 'utf8')).toBe(before)
    })

    it('is loaded with nothing left out when every record is one, and when there are none', () => {
      expect(loadTranscript(write([good]), project)).toEqual({ kind: 'loaded', entries: [good], runs: [], dropped: 0 })
      expect(loadTranscript(write([]), project)).toEqual({ kind: 'loaded', entries: [], runs: [], dropped: 0 })
    })
  })
})

/** A run card as the transcript keeps it: only the fields a stored card is checked by are spelled out. */
const card = (runId: string, status = 'finished'): RunCardSnapshot => ({
  runId,
  sessionId: 's1',
  code: 'CP',
  startedAt: 10,
  status: status as RunCardSnapshot['status'],
  notes: [],
  steps: [],
  documents: []
})

describe('the run cards stored beside the entries', () => {
  const stored = (runId: string, status?: string): StoredRun => ({ card: card(runId, status), lastAt: 40 })

  it('are written under `runs` at version 1, and read back as they were written', () => {
    const file = transcriptFilePath(userData, project)
    const runs = [stored('r1'), stored('r2', 'running')]

    expect(writeTranscript(file, project, entries, runs)).toEqual({ ok: true })
    const written = JSON.parse(readFileSync(file, 'utf8'))
    expect(written).toEqual({ version: 1, projectPath: project, entries, runs })
    expect(loadTranscript(file, project)).toEqual({ kind: 'loaded', entries, runs, dropped: 0 })
  })

  it('leave a file with no run cards the file it always was, and a file without them loads with none', () => {
    const file = transcriptFilePath(userData, project)
    writeTranscript(file, project, entries, [])

    expect(Object.keys(JSON.parse(readFileSync(file, 'utf8')))).toEqual(['version', 'projectPath', 'entries'])
    expect(loadTranscript(file, project)).toMatchObject({ kind: 'loaded', runs: [], dropped: 0 })
  })

  const filed = (runs: unknown): string => {
    const file = join(userData, 'runs.json')
    writeFileSync(file, JSON.stringify({ version: 1, projectPath: project, entries, runs }))
    return file
  }

  it.each([
    ['null', null],
    ['a string', 'r1'],
    ['a stored run with no card', { lastAt: 1 }],
    ['a card that is a string', { card: 'r1', lastAt: 1 }],
    ['a card with no run id', { card: { ...card('r1'), runId: undefined }, lastAt: 1 }],
    ['a card with no session id', { card: { ...card('r1'), sessionId: 7 }, lastAt: 1 }],
    ['a card with no code', { card: { ...card('r1'), code: undefined }, lastAt: 1 }],
    ['a card with a start that is not a number', { card: { ...card('r1'), startedAt: 'now' }, lastAt: 1 }],
    ['a card of a status nobody knows', { card: card('r1', 'paused'), lastAt: 1 }],
    ['a card with no notes', { card: { ...card('r1'), notes: undefined }, lastAt: 1 }],
    ['a card with no documents', { card: { ...card('r1'), documents: 'none' }, lastAt: 1 }],
    ['a time that is not a number', { card: card('r1'), lastAt: 'then' }],
    ['a time that is not finite', { card: card('r1'), lastAt: null }]
  ])('keep the others and count %s as left out', (_name, bad) => {
    const file = filed([stored('keep-1'), bad, stored('keep-2', 'running')])
    const before = readFileSync(file, 'utf8')

    expect(loadTranscript(file, project)).toEqual({
      kind: 'loaded',
      entries,
      runs: [stored('keep-1'), stored('keep-2', 'running')],
      dropped: 1
    })
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  describe('steps', () => {
    const step = (callId: string, over: Record<string, unknown> = {}) => ({
      callId,
      label: `read ${callId}.md`,
      status: 'done',
      startedAt: 11,
      endedAt: 12,
      notesBefore: 0,
      ...over
    })
    const withSteps = (steps: unknown): StoredRun => ({ card: { ...card('r1'), steps } as unknown as RunCardSnapshot, lastAt: 40 })

    it('are written with the card and read back as written', () => {
      const file = transcriptFilePath(userData, project)
      const runs = [withSteps([step('a'), step('b', { status: 'running', endedAt: undefined, notesBefore: 2 })])]
      writeTranscript(file, project, entries, runs)

      expect(loadTranscript(file, project)).toEqual({ kind: 'loaded', entries, runs: [{ ...runs[0], card: { ...runs[0].card, steps: [step('a'), { ...step('b', { status: 'running', notesBefore: 2 }), endedAt: undefined }] } }], dropped: 0 })
    })

    it('load as none from a card written before steps, counting nothing left out', () => {
      const old = { ...card('r1') } as Partial<RunCardSnapshot>
      delete old.steps
      const file = filed([{ card: old, lastAt: 40 }])

      expect(loadTranscript(file, project)).toEqual({ kind: 'loaded', entries, runs: [stored('r1')], dropped: 0 })
    })

    it.each([['a string', 'oops'], ['an object', { a: 1 }], ['null', null], ['a number', 3]])('load %s as none, counting nothing left out', (_name, bad) => {
      expect(loadTranscript(filed([withSteps(bad)]), project)).toEqual({ kind: 'loaded', entries, runs: [stored('r1')], dropped: 0 })
    })

    it('keep the well-formed steps of a list and drop the malformed ones', () => {
      const good = step('good')
      const loaded = loadTranscript(
        filed([
          withSteps([
            good,
            null,
            'x',
            step('no-label', { label: 7 }),
            step('bad-status', { status: 'paused' }),
            step('bad-start', { startedAt: 'now' }),
            step('bad-end', { endedAt: 'later' }),
            step('bad-notes', { notesBefore: -1 }),
            step('frac-notes', { notesBefore: 1.5 }),
            { label: 'no call id', status: 'done', startedAt: 1, notesBefore: 0 }
          ])
        ]),
        project
      )
      expect(loaded).toMatchObject({ kind: 'loaded', dropped: 0 })
      expect(loaded.kind === 'loaded' && loaded.runs[0].card.steps).toEqual([good])
    })

    it('keep at most the newest 300', () => {
      const many = Array.from({ length: 320 }, (_, n) => step(`c${n}`))
      const loaded = loadTranscript(filed([withSteps(many)]), project)
      const steps = loaded.kind === 'loaded' ? loaded.runs[0].card.steps : []
      expect(steps).toHaveLength(300)
      expect(steps[0].callId).toBe('c20')
    })
  })

  it('count a `runs` that is not a list as one thing left out, with the entries kept', () => {
    expect(loadTranscript(filed({ r1: 1 }), project)).toEqual({ kind: 'loaded', entries, runs: [], dropped: 1 })
  })

  it('add to the entries left out when both are damaged', () => {
    const file = join(userData, 'both.json')
    writeFileSync(file, JSON.stringify({ version: 1, projectPath: project, entries: [...entries, null], runs: [null, stored('r1')] }))

    expect(loadTranscript(file, project)).toEqual({ kind: 'loaded', entries, runs: [stored('r1')], dropped: 2 })
  })
})

describe('setAsideTranscript', () => {
  it('moves the very file to a name beside it, byte for byte, and leaves nothing at the old one', () => {
    const file = transcriptFilePath(userData, project)
    mkdirSync(join(userData, 'conversations'))
    writeFileSync(file, '{not json')

    const outcome = setAsideTranscript(file, project)

    expect(outcome).toEqual({ ok: true, to: `${file}.aside` })
    expect(existsSync(file)).toBe(false)
    expect(readFileSync(`${file}.aside`, 'utf8')).toBe('{not json')
    expect(loadTranscript(file, project)).toEqual({ kind: 'missing' })
  })

  it('never overwrites an earlier one that was set aside', () => {
    const file = transcriptFilePath(userData, project)
    mkdirSync(join(userData, 'conversations'))
    writeFileSync(file, 'first')
    setAsideTranscript(file, project)
    writeFileSync(file, 'second')
    setAsideTranscript(file, project)
    writeFileSync(file, 'third')
    const outcome = setAsideTranscript(file, project)

    expect(outcome).toEqual({ ok: true, to: `${file}.aside-3` })
    expect([`${file}.aside`, `${file}.aside-2`, `${file}.aside-3`].map((path) => readFileSync(path, 'utf8'))).toEqual([
      'first',
      'second',
      'third'
    ])
  })

  it('is not loaded or listed as a transcript, and a later write leaves it alone', () => {
    const file = transcriptFilePath(userData, project)
    mkdirSync(join(userData, 'conversations'))
    writeFileSync(file, 'bad')
    setAsideTranscript(file, project)
    writeTranscript(file, project, entries)

    expect(readFileSync(`${file}.aside`, 'utf8')).toBe('bad')
    expect(loadTranscript(file, project)).toMatchObject({ kind: 'loaded' })
  })

  it('reports the errno and throws nothing when there is nothing to move', () => {
    const outcome = setAsideTranscript(join(userData, 'nothing-here.json'), project)

    expect(outcome).toEqual({ ok: false, errno: 'ENOENT' })
  })
})
