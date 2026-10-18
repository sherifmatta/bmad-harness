import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { RunCardSnapshot } from '../../shared/conversation'
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

  it('records a typed mention beside the user’s text, writes it and loads it again after a relaunch (Story 2.15)', () => {
    const first = registry()
    const transcript = first.forProject(project)
    transcript.recordUserTurn('go', 5, undefined, '@Amelia')
    transcript.recordUserTurn('plain', 6)
    tick()

    expect(onDisk().entries).toEqual([
      { kind: 'user', id: 'm-0', at: 5, text: 'go', mention: '@Amelia' },
      { kind: 'user', id: 'm-1', at: 6, text: 'plain' }
    ])
    expect(registry().forProject(project).entries()).toEqual(onDisk().entries)
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

    expect(onDisk()).toEqual({ version: 1, projectPath: project, entries: [], attributed: true })
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
    const record = transcript.recordSysline('handed to B', 5)

    expect(record).toEqual({ kind: 'sysline', id: 'm-1', at: 5, text: 'handed to B' })
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
    transcript.recordSysline('handed to B', 5)

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

describe('run cards kept with the transcript (Story 3.7)', () => {
  const card = (runId: string, over: Partial<RunCardSnapshot> = {}): RunCardSnapshot => ({
    runId,
    sessionId: 's1',
    agentId: 'bmad-agent-pm',
    code: 'CP',
    startedAt: 10,
    status: 'running',
    notes: [],
    steps: [],
    documents: [],
    ...over
  })

  it('writes each card with the moment of the last event of its run, at the next write, with the entries', () => {
    const transcripts = registry()
    const transcript = transcripts.forProject(project)
    transcript.recordUserTurn('hi', 1)
    transcript.recordRun(card('r1'), 11)
    transcript.recordRun(card('r1', { notes: [{ text: '- (decision) x', at: 14 }] }), 14)
    transcript.recordRun(card('r2'), 15)
    tick()

    expect(onDisk()).toEqual({
      version: 1,
      projectPath: project,
      entries: [{ kind: 'user', id: 'm-0', at: 1, text: 'hi' }],
      runs: [
        { card: card('r1', { notes: [{ text: '- (decision) x', at: 14 }] }), lastAt: 14 },
        { card: card('r2'), lastAt: 15 }
      ],
      attributed: true
    })
  })

  it('schedules the one debounced write for a run event alone, and a write already scheduled covers the events after it', () => {
    const transcript = registry().forProject(project)

    transcript.recordRun(card('r1'), 11)
    transcript.recordRun(card('r1'), 12)
    transcript.recordRun(card('r1'), 13)

    expect(timers.filter((timer) => !timer.cancelled)).toHaveLength(1)
    expect(readdirSync(userData)).toEqual([])
    tick()
    expect(onDisk().runs).toHaveLength(1)
  })

  it('is written by a flush, which a window going and the app quitting call, with no timer to wait for', () => {
    const transcripts = registry()
    transcripts.forProject(project).recordRun(card('r1'), 11)

    transcripts.flush(project)

    expect(onDisk().runs).toEqual([{ card: card('r1'), lastAt: 11 }])
  })

  it('holds the cards this launch recorded too, after those the file held, each as it ended: a run still running reads as the run its session ended', () => {
    const first = registry()
    first.forProject(project).recordRun(card('r1', { status: 'finished', endedAt: 5 }), 5)
    first.flushAll()
    const transcript = registry().forProject(project)
    transcript.recordRun(card('r2'), 11)
    transcript.recordRun(card('r3', { status: 'stopped', endedAt: 13 }), 13)
    transcript.recordRun(card('r2', { notes: [{ text: '- (note) a', at: 12 }] }), 12)

    expect(transcript.storedRuns().map((run) => [run.runId, run.status, run.endedAt])).toEqual([
      ['r1', 'finished', 5],
      ['r2', 'failed', 12],
      ['r3', 'stopped', 13]
    ])
    expect(transcript.storedRuns()[1].error).toEqual({ code: 'run/session-ended', message: 'run · the session ended' })
    // What is kept is the card as it stands, not as it is read: the file holds r2 still running.
    transcript.flush()
    expect(onDisk().runs.map((run: { card: RunCardSnapshot }) => run.card.status)).toEqual(['finished', 'running', 'stopped'])
  })

  it('reads a later launch’s earlier runs from the file, in the order they started, each as it ended', () => {
    const first = registry()
    first.forProject(project).recordRun(card('r1', { status: 'finished', endedAt: 20 }), 20)
    first.forProject(project).recordRun(card('r2', { status: 'stopped', endedAt: 30 }), 30)
    first.flushAll()

    const next = registry().forProject(project)

    expect(next.storedRuns()).toEqual([
      card('r1', { status: 'finished', endedAt: 20 }),
      card('r2', { status: 'stopped', endedAt: 30 })
    ])
  })

  it('keeps a card’s steps through a relaunch, and reads the steps of a run cut off as failed at its last event', () => {
    const steps = [
      { callId: 'a', label: 'read a.md', status: 'done' as const, startedAt: 11, endedAt: 12, notesBefore: 0 },
      { callId: 'b', label: 'run git', status: 'running' as const, startedAt: 13, notesBefore: 1 }
    ]
    const first = registry()
    first.forProject(project).recordRun(card('r1', { status: 'finished', endedAt: 20, steps: [steps[0]] }), 20)
    first.forProject(project).recordRun(card('r2', { steps }), 18)
    first.flushAll()

    const [finished, cut] = registry().forProject(project).storedRuns()

    expect(finished.steps).toEqual([steps[0]])
    expect(cut.steps).toEqual([steps[0], { ...steps[1], status: 'failed', endedAt: 18 }])
  })

  it('reads a card that was still running as the run its session ended, at the moment it was last heard of', () => {
    const first = registry()
    first.forProject(project).recordRun(card('r1', { notes: [{ text: '- (note) a', at: 18 }] }), 18)
    first.flushAll()

    const [dead] = registry().forProject(project).storedRuns()

    expect(dead).toEqual({
      ...card('r1', { notes: [{ text: '- (note) a', at: 18 }] }),
      status: 'failed',
      endedAt: 18,
      error: { code: 'run/session-ended', message: 'run · the session ended' }
    })
  })

  it('keeps the earlier runs in the file when this launch writes it, as they were read: the dead card, and its last moment', () => {
    const first = registry()
    first.forProject(project).recordRun(card('r1'), 18)
    first.flushAll()

    const second = registry()
    const transcript = second.forProject(project)
    transcript.recordRun(card('r2'), 50)
    second.flushAll()

    expect(onDisk().runs.map((run: { card: RunCardSnapshot; lastAt: number }) => [run.card.runId, run.card.status, run.lastAt])).toEqual([
      ['r1', 'failed', 18],
      ['r2', 'running', 50]
    ])
    // A third launch sees both, the first dead as before and the second dead now.
    expect(registry().forProject(project).storedRuns().map((run) => [run.runId, run.status])).toEqual([
      ['r1', 'failed'],
      ['r2', 'failed']
    ])
  })

  it('loads a file written before the cards were kept with none, and a damaged one with the rest kept and the damage counted', () => {
    mkdirSync(join(userData, 'conversations'), { recursive: true })
    writeFileSync(fileOf(), JSON.stringify({ version: 1, projectPath: project, entries: [{ kind: 'user', id: 'm-0', at: 1, text: 'hi' }] }))
    expect(registry().forProject(project).storedRuns()).toEqual([])
    expect(logs).toEqual([])

    writeFileSync(
      fileOf(),
      JSON.stringify({
        version: 1,
        projectPath: project,
        entries: [{ kind: 'user', id: 'm-0', at: 1, text: 'hi' }],
        runs: [{ card: card('r1', { status: 'finished', endedAt: 20 }), lastAt: 20 }, { card: 'not a card', lastAt: 1 }]
      })
    )
    const transcript = registry({ now: () => 9 }).forProject(project)

    expect(logs).toEqual(['persist/entries-dropped · 1'])
    expect(transcript.storedRuns().map((run) => run.runId)).toEqual(['r1'])
    // The file that was damaged is kept whole beside the one that is written now.
    expect(readFileSync(`${fileOf()}.aside`, 'utf8')).toContain('not a card')
  })

  it('is cleared with the entries by clear(): the file written first holds neither, and no stored run is left', () => {
    const first = registry()
    first.forProject(project).recordRun(card('r1', { status: 'finished', endedAt: 20 }), 20)
    first.flushAll()
    const transcripts = registry()
    const transcript = transcripts.forProject(project)
    transcript.recordRun(card('r2'), 30)
    expect(transcript.storedRuns()).toHaveLength(2)

    expect(transcript.clear()).toEqual({ ok: true })

    expect(onDisk()).toEqual({ version: 1, projectPath: project, entries: [], attributed: true })
    expect(transcript.storedRuns()).toEqual([])
    transcripts.flushAll()
    expect(onDisk().runs).toBeUndefined()
    expect(registry().forProject(project).storedRuns()).toEqual([])
  })

  it('keeps no card of a run of the conversation that ended, even when its last event comes after the clear', () => {
    const transcripts = registry()
    const transcript = transcripts.forProject(project)
    transcript.recordRun(card('r1'), 11)
    transcripts.flushAll()

    expect(transcript.clear()).toEqual({ ok: true })
    // Ending the conversation closes the session after the file is cleared, and the run in flight ends with it.
    transcript.recordRun(card('r1', { status: 'failed', endedAt: 12 }), 12)
    transcripts.flushAll()
    tick()

    expect(timers.filter((timer) => !timer.cancelled)).toEqual([])
    expect(onDisk()).toEqual({ version: 1, projectPath: project, entries: [], attributed: true })
    // A run begun in the new conversation is kept as any other.
    transcript.recordRun(card('r2'), 20)
    transcripts.flushAll()
    expect(onDisk().runs.map((run: { card: RunCardSnapshot }) => run.card.runId)).toEqual(['r2'])
  })

  it('does not clear when the write of the empty file fails: every card is still held', () => {
    let failing = false
    const first = registry()
    first.forProject(project).recordRun(card('r1', { status: 'finished', endedAt: 20 }), 20)
    first.flushAll()
    const transcript = registry({
      write: (file, path, entries, runs) => (failing ? { ok: false, errno: 'EACCES' } : writeTranscript(file, path, entries, runs))
    }).forProject(project)
    failing = true

    expect(transcript.clear()).toEqual({ ok: false, errno: 'EACCES' })

    expect(transcript.storedRuns()).toHaveLength(1)
  })

  it('keeps one project’s cards out of another’s file', () => {
    const other = join(root, 'other')
    const transcripts = registry()
    transcripts.forProject(project).recordRun(card('r1'), 11)
    transcripts.forProject(other).recordRun(card('r2'), 12)
    transcripts.flushAll()

    expect(onDisk(project).runs.map((run: { card: RunCardSnapshot }) => run.card.runId)).toEqual(['r1'])
    expect(onDisk(other).runs.map((run: { card: RunCardSnapshot }) => run.card.runId)).toEqual(['r2'])
  })

  it('does not write a file it was told it must not: a conversation that could not be set aside stores no cards either', () => {
    mkdirSync(join(userData, 'conversations'), { recursive: true })
    writeFileSync(fileOf(), '{not json')
    const transcripts = registry({ setAside: () => ({ ok: false, errno: 'EPERM' }) })
    transcripts.forProject(project).recordRun(card('r1'), 11)
    transcripts.flushAll()

    expect(readFileSync(fileOf(), 'utf8')).toBe('{not json')
  })
})

describe('the skill-first sessions a transcript lists (Story 7.5)', () => {
  const card = (runId: string, sessionId: string): RunCardSnapshot => ({
    runId,
    sessionId,
    code: 'bmad-build',
    skill: 'bmad-build',
    startedAt: 1,
    status: 'running',
    notes: [],
    steps: [],
    documents: []
  })

  it('lists each once, in start order, and writes the list with the transcript', () => {
    const transcript = registry().forProject(project)
    transcript.openSkillSession({ sessionId: 's1', skill: 'bmad-build', at: 1 })
    transcript.openSkillSession({ sessionId: 's2', skill: 'bmad-build-auto', at: 2 })
    transcript.openSkillSession({ sessionId: 's1', skill: 'bmad-build', at: 3 })
    tick()

    expect(transcript.skillSessions().map(({ sessionId }) => sessionId)).toEqual(['s1', 's2'])
    expect(onDisk().skillSessions).toEqual([
      { sessionId: 's1', skill: 'bmad-build', at: 1 },
      { sessionId: 's2', skill: 'bmad-build-auto', at: 2 }
    ])
  })

  it('takes one session’s records, stored cards and list item away, and no other’s, and keeps none of its late cards', () => {
    const transcript = registry().forProject(project)
    transcript.openSkillSession({ sessionId: 's1', skill: 'bmad-build', at: 1 })
    transcript.openSkillSession({ sessionId: 's2', skill: 'bmad-build', at: 2 })
    transcript.recordUserTurn('one', 1, undefined, undefined, 's1')
    transcript.recordUserTurn('two', 2, undefined, undefined, 's2')
    transcript.recordUserTurn('shared', 3)
    transcript.recordRun(card('r1', 's1'), 1)
    transcript.recordRun(card('r2', 's2'), 2)

    expect(transcript.removeSkillSession('s1')).toBe(true)
    transcript.recordRun({ ...card('r1', 's1'), status: 'failed' }, 5)

    expect(transcript.entries().map((entry) => entry.text)).toEqual(['two', 'shared'])
    expect(transcript.storedRuns().map(({ runId }) => runId)).toEqual(['r2'])
    expect(transcript.skillSessions().map(({ sessionId }) => sessionId)).toEqual(['s2'])
    expect(transcript.removeSkillSession('s1')).toBe(false)
    tick()
    expect(onDisk().entries.map((entry: { text: string }) => entry.text)).toEqual(['two', 'shared'])
  })

  it('keeps nothing that flags a session which is not listed: a late word, turn or line after it was ended', () => {
    const transcript = registry().forProject(project)
    transcript.openSkillSession({ sessionId: 's1', skill: 'bmad-build', at: 1 })
    transcript.recordUserTurn('one', 1, undefined, undefined, 's1')
    transcript.removeSkillSession('s1')

    transcript.recordPersonaSaid({ sessionId: 's1', messageId: 'm', text: 'late', at: 2, skillSession: 's1' })
    transcript.recordUserTurn('late', 3, undefined, undefined, 's1')
    const line = transcript.recordSysline('late', 4, undefined, 's1')
    transcript.recordUserTurn('never listed', 5, undefined, undefined, 'nobody')

    expect(transcript.entries()).toEqual([])
    expect(line).toMatchObject({ kind: 'sysline', text: 'late', skillSession: 's1' })
    tick()
    expect(timers).toEqual([])
  })

  it('lists the session before its first turn is kept, so that turn is kept with it', () => {
    const transcript = registry().forProject(project)
    transcript.openSkillSession({ sessionId: 's1', skill: 'bmad-build', at: 1 })
    transcript.recordUserTurn('first', 1, undefined, undefined, 's1')

    expect(transcript.entries()).toHaveLength(1)
  })

  it('is cleared with the transcript, and read back after a relaunch', () => {
    const first = registry().forProject(project)
    first.openSkillSession({ sessionId: 's1', skill: 'bmad-build', at: 1 })
    first.flush()

    expect(registry().forProject(project).skillSessions()).toEqual([{ sessionId: 's1', skill: 'bmad-build', at: 1 }])
    expect(first.clear()).toEqual({ ok: true })
    expect(first.skillSessions()).toEqual([])
    expect(onDisk().skillSessions).toBeUndefined()
  })
})

describe('a persona thread’s tags and the one-time attribution (Story 8.1)', () => {
  const plantFile = (file: object): void => {
    mkdirSync(join(userData, 'conversations'), { recursive: true })
    writeFileSync(fileOf(), JSON.stringify({ version: 1, projectPath: project, ...file }))
  }
  const persona = (id: string, agentId: string, at: number) => ({ kind: 'persona', id, at, agentId, messageId: `x-${id}`, text: id })
  const legacy = [
    { kind: 'user', id: 'm-0', at: 1, text: 'to john' },
    persona('m-1', 'john', 2),
    { kind: 'sysline', id: 'm-2', at: 3, text: 'session closed · John' },
    { kind: 'user', id: 'm-3', at: 4, text: 'to mary' },
    persona('m-4', 'mary', 5),
    { kind: 'user', id: 'm-5', at: 6, text: 'the room', room: true }
  ]
  const tagsOf = (entries: readonly object[]) => entries.map((entry) => ('agentId' in entry ? entry.agentId : undefined))

  it('keeps the agentId on a user turn and a harness line, none on a record recorded without one, and loads them again after a relaunch', () => {
    const first = registry()
    const transcript = first.forProject(project)
    transcript.recordUserTurn('hi', 1, undefined, undefined, undefined, 'john')
    transcript.recordUserTurn('room', 2, true)
    transcript.recordUserTurn('plain', 3)
    const line = transcript.recordSysline('quiet', 4, undefined, undefined, 'john')
    first.flushAll()

    expect(line).toEqual({ kind: 'sysline', id: 'm-3', at: 4, text: 'quiet', agentId: 'john' })
    expect(tagsOf(onDisk().entries)).toEqual(['john', undefined, undefined, 'john'])
    expect(registry().forProject(project).entries()).toEqual(onDisk().entries)
  })

  it('attributes a file without the marker once on first read, and changes nothing else', () => {
    plantFile({ entries: legacy })

    const transcript = registry().forProject(project)

    expect(tagsOf(transcript.entries())).toEqual(['john', 'john', 'john', 'mary', 'mary', undefined])
    expect(transcript.entries().map((entry) => entry.id)).toEqual(legacy.map((entry) => entry.id))
    expect(transcript.entries()).toHaveLength(legacy.length)
  })

  it('does not mark the transcript dirty: the tags and the marker reach the file with the next write, at version 1', () => {
    plantFile({ entries: legacy })
    const transcripts = registry()
    const transcript = transcripts.forProject(project)

    expect(timers.filter((timer) => !timer.cancelled)).toHaveLength(0)
    transcripts.flushAll()
    expect(onDisk().entries).toEqual(legacy)
    expect(onDisk().attributed).toBeUndefined()

    transcript.recordSysline('later', 9, undefined, undefined, 'mary')
    transcripts.flushAll()
    expect(onDisk().version).toBe(1)
    expect(onDisk().attributed).toBe(true)
    expect(tagsOf(onDisk().entries)).toEqual(['john', 'john', 'john', 'mary', 'mary', undefined, 'mary'])
  })

  it('never attributes a file that carries the marker: an unplaced record stays in no thread after a persona has since spoken', () => {
    plantFile({
      attributed: true,
      entries: [
        { kind: 'user', id: 'm-0', at: 1, text: 'nobody had answered' },
        { kind: 'sysline', id: 'm-1', at: 2, text: 'a line' },
        persona('m-2', 'john', 3)
      ]
    })

    const transcript = registry().forProject(project)

    expect(tagsOf(transcript.entries())).toEqual([undefined, undefined, 'john'])
  })

  it('leaves a set-aside notice in no thread across a relaunch, even after a persona speaks', () => {
    mkdirSync(join(userData, 'conversations'), { recursive: true })
    writeFileSync(fileOf(), '{not json')
    const first = registry({ now: () => 5 })
    const transcript = first.forProject(project)
    transcript.recordPersonaSaid(said('m1', 'hi', 7))
    first.flushAll()
    expect(onDisk().attributed).toBe(true)

    const second = registry().forProject(project)
    expect(tagsOf(second.entries())).toEqual([undefined, 'a'])
    second.recordPersonaSaid({ ...said('m2', 'again', 9), agentId: 'b' })
    const third = registry()
    third.forProject(project)
    expect(tagsOf(third.forProject(project).entries())).toEqual([undefined, 'a'])
  })

  it('attributes before the set-aside line is added, so the line is never tagged', () => {
    plantFile({
      entries: [
        { kind: 'user', id: 'm-0', at: 1, text: 'hi' },
        persona('m-1', 'john', 2),
        { kind: 'user', id: 'm-2', at: 3, text: 'bad', room: 'yes' }
      ]
    })

    const transcript = registry({ now: () => 77 }).forProject(project)

    expect(transcript.entries()[0]).toEqual({ kind: 'sysline', id: 'm-2', at: 77, text: 'earlier conversation could not be read · kept aside' })
    expect(tagsOf(transcript.entries())).toEqual([undefined, 'john', 'john'])
  })

  it('counts a missing file as attributed: a first record is tagged only by main, and nothing is attributed later', () => {
    const transcripts = registry()
    const transcript = transcripts.forProject(project)
    transcript.recordUserTurn('hi', 1)
    transcripts.flushAll()

    expect(onDisk().attributed).toBe(true)
    expect(tagsOf(registry().forProject(project).entries())).toEqual([undefined])
  })
})
