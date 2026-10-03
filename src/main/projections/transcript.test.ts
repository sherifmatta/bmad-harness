import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PersonaSaid } from '../../shared/events'
import { transcriptFilePath, writeTranscript } from '../sources/persistence/transcript-file'
import { createTranscriptRegistry } from './transcript'
import type { TranscriptRegistry, TranscriptRegistryDeps } from './transcript'

let root: string
let project: string
let userData: string
let timers: { run: () => void; ms: number; cancelled: boolean }[]
let logs: string[]

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'harness-transcript-'))
  project = join(root, 'project')
  userData = join(root, 'userData')
  mkdirSync(project)
  mkdirSync(userData)
  timers = []
  logs = []
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function registry(over: Partial<TranscriptRegistryDeps> = {}): TranscriptRegistry {
  return createTranscriptRegistry({
    userDataPath: () => userData,
    schedule: (run, ms) => {
      const timer = { run, ms, cancelled: false }
      timers.push(timer)
      return () => void (timer.cancelled = true)
    },
    log: (line) => void logs.push(line),
    ...over
  })
}

/** Fire every scheduled write that has not been cancelled. */
function tick(): void {
  for (const timer of timers.splice(0)) {
    if (!timer.cancelled) timer.run()
  }
}

const said = (messageId: string, text: string, at = 1): PersonaSaid => ({
  sessionId: 's1',
  agentId: 'a',
  messageId,
  text,
  at
})
const fileOf = (path = project): string => transcriptFilePath(userData, path)
const onDisk = (path = project) => JSON.parse(readFileSync(fileOf(path), 'utf8'))

describe('the transcript registry', () => {
  it('reads the data directory when a project is first asked for, not before', () => {
    let asked = 0
    const lazy = registry({ userDataPath: () => (asked += 1, userData) })

    expect(asked).toBe(0)
    lazy.forProject(project)
    lazy.forProject(project)
    expect(asked).toBe(1)
  })

  it('records what was said and sent, and holds it as one transcript per project path', () => {
    const transcripts = registry()
    const one = transcripts.forProject(project)
    one.recordPersonaSaid(said('m1', 'Hel'))
    one.recordPersonaSaid(said('m1', 'lo'))
    one.recordUserTurn('hi', 5)

    expect(transcripts.forProject(project)).toBe(one)
    expect(one.entries()).toEqual([
      { kind: 'persona', id: 'm-0', at: 1, agentId: 'a', messageId: 'm1', text: 'Hello' },
      { kind: 'user', id: 'm-1', at: 5, text: 'hi' }
    ])
  })

  it('writes nothing until the scheduler fires, then once for every change before it', () => {
    const transcripts = registry({ debounceMs: 250 })
    const transcript = transcripts.forProject(project)
    transcript.recordPersonaSaid(said('m1', 'a'))
    transcript.recordPersonaSaid(said('m1', 'b'))
    transcript.recordUserTurn('c', 2)

    expect(timers).toHaveLength(1)
    expect(timers[0].ms).toBe(250)
    expect(() => readdirSync(join(userData, 'conversations'))).toThrow()

    tick()
    expect(onDisk().entries).toHaveLength(2)
    expect(onDisk().entries[0].text).toBe('ab')

    transcript.recordUserTurn('d', 3)
    expect(timers).toHaveLength(1)
    tick()
    expect(onDisk().entries).toHaveLength(3)
  })

  it('writes at once on flush, cancelling the schedule, and does nothing when nothing changed', () => {
    const transcripts = registry()
    const transcript = transcripts.forProject(project)
    transcript.recordUserTurn('hi', 1)
    transcripts.flush(project)

    expect(onDisk().entries).toEqual([{ kind: 'user', id: 'm-0', at: 1, text: 'hi' }])
    expect(timers.every((timer) => timer.cancelled)).toBe(true)

    rmSync(fileOf())
    transcripts.flushAll()
    expect(() => readFileSync(fileOf())).toThrow()
  })

  it('flushes every project on flushAll, and a project never asked for is left alone', () => {
    const other = join(root, 'other')
    const transcripts = registry()
    transcripts.forProject(project).recordUserTurn('one', 1)
    transcripts.forProject(other).recordUserTurn('two', 2)
    transcripts.flush(join(root, 'never'))
    transcripts.flushAll()

    expect(onDisk(project).entries[0].text).toBe('one')
    expect(onDisk(other).entries[0].text).toBe('two')
    expect(onDisk(project).projectPath).toBe(project)
    expect(readdirSync(join(userData, 'conversations'))).toHaveLength(2)
  })

  it('loads what an earlier launch wrote, and continues its ids', () => {
    const first = registry()
    first.forProject(project).recordPersonaSaid(said('m1', 'Hello'))
    first.flushAll()

    const second = registry().forProject(project)
    second.recordUserTurn('hi', 9)

    expect(second.entries()).toMatchObject([
      { id: 'm-0', text: 'Hello' },
      { id: 'm-1', text: 'hi' }
    ])
  })

  it('says nothing and moves nothing for a project that has no file yet', () => {
    const transcript = registry().forProject(project)

    expect(transcript.entries()).toEqual([])
    expect(logs).toEqual([])
    expect(timers).toEqual([])
    expect(() => readdirSync(join(userData, 'conversations'))).toThrow()
  })

  it('keeps two projects in two files without mixing them', () => {
    const other = join(root, 'other')
    const transcripts = registry()
    transcripts.forProject(project).recordUserTurn('one', 1)
    transcripts.forProject(other).recordUserTurn('two', 2)
    transcripts.flushAll()

    expect(fileOf(project)).not.toBe(fileOf(other))
    expect(onDisk(project).entries.map((e: { text: string }) => e.text)).toEqual(['one'])
    expect(onDisk(other).entries.map((e: { text: string }) => e.text)).toEqual(['two'])
  })

  it.each(['EACCES', 'ENOSPC'])(
    'logs a failed write as persist/write-failed · %s, throws nothing, and retries on the next change',
    (errno) => {
      let failing = true
      const writes: number[] = []
      const transcripts = registry({
        write: (file, path, entries) => {
          writes.push(entries.length)
          return failing ? { ok: false, errno } : writeTranscript(file, path, entries)
        }
      })
      const transcript = transcripts.forProject(project)
      transcript.recordUserTurn('one', 1)
      expect(() => tick()).not.toThrow()

      expect(logs).toEqual([`persist/write-failed · ${errno}`])
      expect(transcript.entries()).toHaveLength(1)

      failing = false
      transcript.recordUserTurn('two', 2)
      tick()
      expect(writes).toEqual([1, 2])
      expect(onDisk().entries).toHaveLength(2)
      expect(logs).toHaveLength(1)
    }
  )

  it('writes nothing and logs when the data directory lies inside the project root', () => {
    const inside = join(project, 'userData')
    mkdirSync(inside)
    const transcripts = registry({ userDataPath: () => inside })
    transcripts.forProject(project).recordUserTurn('x', 1)
    transcripts.flushAll()

    expect(readdirSync(inside)).toEqual([])
    expect(logs).toEqual(['persist/write-failed · inside-project'])
  })

  it('writes to stderr by default, and schedules with a real timer', () => {
    const lines: string[] = []
    const original = process.stderr.write
    process.stderr.write = ((chunk: string) => (lines.push(chunk), true)) as typeof process.stderr.write
    try {
      const transcripts = createTranscriptRegistry({
        userDataPath: () => userData,
        write: () => ({ ok: false, errno: 'EACCES' })
      })
      transcripts.forProject(project).recordUserTurn('x', 1)
      transcripts.flushAll()
    } finally {
      process.stderr.write = original
    }

    expect(lines).toEqual(['persist/write-failed · EACCES\n'])
  })
})

describe('clearing a transcript', () => {
  it('writes entries: [] first, empties the transcript, cancels the pending write and begins ids again at m-0', () => {
    const transcripts = registry()
    const transcript = transcripts.forProject(project)
    transcript.recordUserTurn('one', 1)
    transcript.recordPersonaSaid(said('m1', 'two'))
    transcripts.flush(project)
    transcript.recordUserTurn('three', 3)
    expect(timers.filter((timer) => !timer.cancelled)).toHaveLength(1)

    expect(transcript.clear()).toEqual({ ok: true })

    expect(onDisk()).toEqual({ version: 1, projectPath: project, entries: [] })
    expect(transcript.entries()).toEqual([])
    expect(timers.every((timer) => timer.cancelled)).toBe(true)
    transcripts.flushAll()
    expect(onDisk().entries).toEqual([])

    transcript.recordUserTurn('again', 9)
    expect(transcript.entries()).toEqual([{ kind: 'user', id: 'm-0', at: 9, text: 'again' }])
    tick()
    expect(onDisk().entries).toEqual([{ kind: 'user', id: 'm-0', at: 9, text: 'again' }])
  })

  it.each(['EACCES', 'ENOSPC'])(
    'on a failed write (%s) logs it, returns the errno and changes nothing',
    (errno) => {
      let failing = false
      const transcripts = registry({
        write: (file, path, entries) =>
          failing ? { ok: false, errno } : writeTranscript(file, path, entries)
      })
      const transcript = transcripts.forProject(project)
      transcript.recordUserTurn('one', 1)
      transcripts.flush(project)
      transcript.recordUserTurn('two', 2)
      failing = true

      expect(transcript.clear()).toEqual({ ok: false, errno })

      expect(logs).toEqual([`persist/write-failed · ${errno}`])
      expect(transcript.entries()).toHaveLength(2)
      expect(timers.filter((timer) => !timer.cancelled)).toHaveLength(1)
      expect(onDisk().entries).toHaveLength(1)

      // The pending write still covers the unwritten change.
      failing = false
      tick()
      expect(onDisk().entries).toHaveLength(2)
    }
  )

  it('clears only its own project', () => {
    const other = join(root, 'other')
    const transcripts = registry()
    transcripts.forProject(project).recordUserTurn('one', 1)
    transcripts.forProject(other).recordUserTurn('two', 2)
    transcripts.flushAll()

    transcripts.forProject(project).clear()

    expect(onDisk(project).entries).toEqual([])
    expect(onDisk(other).entries).toHaveLength(1)
    expect(transcripts.forProject(other).entries()).toHaveLength(1)
  })

  it('refuses a data directory inside the project root', () => {
    const inside = join(project, 'userData')
    mkdirSync(inside)
    const transcript = registry({ userDataPath: () => inside }).forProject(project)
    transcript.recordUserTurn('x', 1)

    expect(transcript.clear()).toEqual({ ok: false, errno: 'inside-project' })
    expect(transcript.entries()).toHaveLength(1)
    expect(readdirSync(inside)).toEqual([])
  })
})

describe('a sysline in the registry', () => {
  it('is recorded, returned as the record it became, written with the rest and loaded again after a relaunch', () => {
    const first = registry()
    const transcript = first.forProject(project)
    transcript.recordUserTurn('hi', 1)
    const record = transcript.recordSysline('handed off · A → B', 5)

    expect(record).toEqual({ kind: 'sysline', id: 'm-1', at: 5, text: 'handed off · A → B' })
    expect(transcript.entries()).toEqual([{ kind: 'user', id: 'm-0', at: 1, text: 'hi' }, record])
    first.flushAll()
    expect(onDisk().version).toBe(1)
    expect(onDisk().entries[1]).toEqual(record)

    const second = registry().forProject(project)
    expect(second.entries()).toEqual([{ kind: 'user', id: 'm-0', at: 1, text: 'hi' }, record])
    expect(second.recordSysline('again', 9).id).toBe('m-2')
  })

  it('is cleared with everything else when the conversation ends', () => {
    const transcript = registry().forProject(project)
    transcript.recordUserTurn('hi', 1)
    transcript.recordSysline('handed off · A → B', 5)

    expect(transcript.clear()).toEqual({ ok: true })
    expect(transcript.entries()).toEqual([])
    expect(onDisk().entries).toEqual([])
  })
})

describe('a file that cannot be used whole', () => {
  const NOTICE = 'earlier conversation could not be read · kept aside'
  const asideOf = (): string => `${fileOf()}.aside`
  const plant = (content: string): void => {
    mkdirSync(join(userData, 'conversations'), { recursive: true })
    writeFileSync(fileOf(), content)
  }
  const listing = (): string[] => readdirSync(join(userData, 'conversations')).sort()

  it.each([
    ['not JSON', '{not json', 'corrupt'],
    ['of another version', JSON.stringify({ version: 2, projectPath: 'P', entries: [] }), 'unknown-version'],
    ['another project’s', JSON.stringify({ version: 1, projectPath: 'other', entries: [] }), 'corrupt']
  ])('moves a file that is %s aside before any write, logs it, and opens with a line saying so', (_name, content, kind) => {
    const original = content.replace('"P"', JSON.stringify(project))
    plant(original)

    const transcript = registry({ now: () => 77 }).forProject(project)

    // Before anything is written: the file is gone from its place and whole beside it.
    expect(readFileSync(asideOf(), 'utf8')).toBe(original)
    expect(listing()).toEqual([`${fileOf().split('/').pop()}.aside`])
    expect(logs).toEqual([`persist/quarantined · ${kind}`])
    expect(transcript.entries()).toEqual([{ kind: 'sysline', id: 'm-0', at: 77, text: NOTICE }])
  })

  it('never lets a later write replace it: the file written afterwards is a new one, and the original stays whole', () => {
    plant('{not json')
    const transcripts = registry({ now: () => 5 })
    const transcript = transcripts.forProject(project)
    transcript.recordUserTurn('hello', 6)
    tick()
    transcript.recordPersonaSaid(said('m1', 'hi', 7))
    transcripts.flushAll()
    transcript.clear()

    expect(readFileSync(asideOf(), 'utf8')).toBe('{not json')
    expect(onDisk().entries).toEqual([])
  })

  it('writes the line with the first change, so it is in the stored conversation, ahead of everything', () => {
    plant('{not json')
    const transcripts = registry({ now: () => 5 })
    const transcript = transcripts.forProject(project)
    expect(timers.filter((timer) => !timer.cancelled)).toHaveLength(1)
    transcript.recordUserTurn('hello', 6)
    transcripts.flushAll()

    expect(onDisk().entries).toEqual([
      { kind: 'sysline', id: 'm-0', at: 5, text: NOTICE },
      { kind: 'user', id: 'm-1', at: 6, text: 'hello' }
    ])
    // A later launch finds a good file, with the line in it, and moves nothing.
    logs.length = 0
    const next = registry().forProject(project)
    expect(next.entries()).toHaveLength(2)
    expect(logs).toEqual([])
    expect(listing()).toHaveLength(2)
  })

  it('keeps the records that are records, drops the others, moves the original aside and says so at the top', () => {
    const good = { kind: 'user', id: 'm-3', at: 1, text: 'kept' }
    const original = JSON.stringify({
      version: 1,
      projectPath: project,
      entries: [good, { kind: 'user', id: 'm-4' }, { kind: 'sysline', id: 'm-5', at: 2, text: 'line' }]
    })
    plant(original)

    const transcript = registry({ now: () => 9 }).forProject(project)

    expect(logs).toEqual(['persist/entries-dropped · 1'])
    expect(readFileSync(asideOf(), 'utf8')).toBe(original)
    expect(transcript.entries()).toEqual([
      { kind: 'sysline', id: 'm-6', at: 9, text: NOTICE },
      good,
      { kind: 'sysline', id: 'm-5', at: 2, text: 'line' }
    ])
    // The next record's id goes on past the highest the file held.
    expect(transcript.recordUserTurn('next', 10)).toBeUndefined()
    expect(transcript.entries().at(-1)).toMatchObject({ id: 'm-7' })
  })

  it('writes the kept records as a file of their own, and the original is still there whole', () => {
    const original = JSON.stringify({
      version: 1,
      projectPath: project,
      entries: [{ kind: 'user', id: 'm-0', at: 1, text: 'kept' }, 'junk']
    })
    plant(original)
    const transcripts = registry({ now: () => 9 })
    transcripts.forProject(project)
    transcripts.flushAll()

    expect(onDisk().entries.map((entry: { text: string }) => entry.text)).toEqual([NOTICE, 'kept'])
    expect(readFileSync(asideOf(), 'utf8')).toBe(original)
  })

  it('treats a file it cannot read as one to move aside, logging the errno', () => {
    plant('whatever')
    const transcript = registry({ load: () => ({ kind: 'unreadable', errno: 'EACCES' }) }).forProject(project)

    expect(logs).toEqual(['persist/quarantined · unreadable EACCES'])
    expect(readFileSync(asideOf(), 'utf8')).toBe('whatever')
    expect(transcript.entries()).toMatchObject([{ kind: 'sysline', text: NOTICE }])
  })

  describe('that cannot be moved either', () => {
    const stuck = (over: Partial<TranscriptRegistryDeps> = {}) =>
      registry({ setAside: () => ({ ok: false, errno: 'EPERM' }), now: () => 3, ...over })

    it('logs it, opens with the line that says this conversation is not being saved, and writes nothing at all', () => {
      plant('{not json')
      const transcripts = stuck()
      const transcript = transcripts.forProject(project)
      transcript.recordUserTurn('hello', 4)
      tick()
      transcripts.flushAll()

      expect(logs).toEqual(['persist/quarantined · corrupt', 'persist/quarantine-failed · EPERM'])
      expect(transcript.entries().map((entry) => entry.text)).toEqual([
        'earlier conversation could not be read · this conversation is not being saved',
        'hello'
      ])
      expect(readFileSync(fileOf(), 'utf8')).toBe('{not json')
    })

    it('ends the conversation in memory without touching the file it could not move', () => {
      plant('{not json')
      const transcript = stuck().forProject(project)
      transcript.recordUserTurn('hello', 4)

      expect(transcript.clear()).toEqual({ ok: true })
      expect(transcript.entries()).toEqual([])
      expect(readFileSync(fileOf(), 'utf8')).toBe('{not json')
    })
  })

  it('does a file inside the project root no harm: it is neither moved nor written to', () => {
    const inside = join(project, 'userData')
    mkdirSync(join(inside, 'conversations'), { recursive: true })
    const file = transcriptFilePath(inside, project)
    writeFileSync(file, '{not json')
    const transcripts = registry({ userDataPath: () => inside })
    transcripts.forProject(project).recordUserTurn('x', 1)
    transcripts.flushAll()

    expect(readFileSync(file, 'utf8')).toBe('{not json')
    expect(readdirSync(join(inside, 'conversations'))).toEqual([file.split('/').pop()])
  })

  it('is not a file that is merely absent: that is quiet', () => {
    const transcript = registry().forProject(project)

    expect(transcript.entries()).toEqual([])
    expect(logs).toEqual([])
  })
})
