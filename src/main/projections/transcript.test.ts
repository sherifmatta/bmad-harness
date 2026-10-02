import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
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

  it('treats a file that is not this project’s as empty and leaves it until the first write', () => {
    const other = join(root, 'other')
    writeTranscript(fileOf(), other, [{ kind: 'user', id: 'm-7', at: 1, text: 'foreign' }])
    const before = readFileSync(fileOf(), 'utf8')
    const transcript = registry().forProject(project)

    expect(transcript.entries()).toEqual([])
    expect(readFileSync(fileOf(), 'utf8')).toBe(before)

    transcript.recordUserTurn('mine', 2)
    transcript.flush()
    expect(onDisk().entries).toEqual([{ kind: 'user', id: 'm-0', at: 2, text: 'mine' }])
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
