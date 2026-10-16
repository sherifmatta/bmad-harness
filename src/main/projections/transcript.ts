import type { PersonaSaid } from '../../shared/events'
import type {
  RunCardSnapshot,
  StoredRun,
  StoredSkillSession,
  SyslineRecord,
  TranscriptRecord
} from '../../shared/conversation'
import type { EpochMs } from '../../shared/ids'
import {
  EMPTY_TRANSCRIPT,
  foldNoticeAtTop,
  foldPersonaSaid,
  foldSysline,
  foldUserTurn,
  foldWithoutSkillSession,
  transcriptFrom
} from '../fold/transcript'
import type { TranscriptState } from '../fold/transcript'
import { deadOf, withRun } from '../fold/stored-runs'
import {
  loadTranscript,
  setAsideTranscript,
  transcriptFilePath,
  writeTranscript
} from '../sources/persistence/transcript-file'
import type {
  AsideOutcome,
  LoadOutcome,
  WriteOutcome
} from '../sources/persistence/transcript-file'

/**
 * The transcript read model: one per project path, shared by every window and
 * session that speaks into it, and kept in step with its file.
 *
 * It changes only by recording what was said or sent, a line the harness wrote, or
 * a run's card as it stands after an event of the run. Each change schedules a
 * write through the injected scheduler; a write already scheduled covers the
 * changes that follow it, so the file is at most one interval behind. `flush`
 * writes at once and is what a window's destruction and the app's quitting call.
 * A failed write is logged as `persist/write-failed · <errno>`, never thrown,
 * and leaves the transcript dirty so the next change, or the next flush, tries
 * again.
 *
 * A file that is there and cannot be used whole is never written over. It is
 * moved aside before the first write (`persist/quarantined`, or
 * `persist/entries-dropped` when only some records were not records and the rest
 * are kept), and the conversation opens with a line of the harness's own at the
 * top saying so. If it cannot be moved, the conversation of this launch is not
 * stored at all (`persist/quarantine-failed`) and the line says that instead.
 *
 * The run cards ride beside the entries, in the same file and under the same
 * write: the card of every run, as it stood at its last event, each with the
 * moment of that event. `storedRuns` hands back every card kept, those the file
 * held when it was loaded and those recorded since, each as it ended: a run that
 * was still running is read as the run its session ended (`fold/stored-runs`).
 * Ending the conversation clears them with the entries.
 *
 * The data directory is asked for on the first project, not at construction,
 * because Electron's `userData` is not to be read before the app is ready.
 */

/** At the top of a conversation whose stored file could not be read and was set aside. */
export const SET_ASIDE_LINE = 'earlier conversation could not be read · kept aside'

/** At the top of one whose stored file could not be read and could not be set aside either. */
export const NOT_SAVED_LINE =
  'earlier conversation could not be read · this conversation is not being saved'

export type ProjectTranscript = {
  entries(): readonly TranscriptRecord[]
  recordPersonaSaid(said: PersonaSaid): void
  /**
   * `room` marks what the user sent into the room (Story 4.2): it belongs to the party thread.
   * `skillSession` marks what the user sent into a skill-first session (Story 7.5): its own thread.
   */
  recordUserTurn(text: string, at: number, room?: true, mention?: string, skillSession?: string): void
  /**
   * Write the harness's own line into the transcript and return the record it became;
   * `room` marks a line about a room (it opened, its turns, its process); every such line belongs to the party thread.
   * `skillSession` marks a line about a skill-first session (Story 7.5): its own thread.
   */
  recordSysline(text: string, at: number, room?: true, skillSession?: string): SyslineRecord
  /**
   * A run's card as it stands after the event at `at`, kept with the transcript:
   * replaces the run's earlier copy, if any. A run of a conversation that has
   * since ended (`clear`) is not kept.
   */
  recordRun(card: RunCardSnapshot, at: EpochMs): void
  /**
   * Every run card the transcript keeps, those loaded from the file and then
   * those recorded since, in the order they were kept, each as it ended: one
   * that was still running is `failed`, with `endedAt` at its last event.
   */
  storedRuns(): readonly RunCardSnapshot[]
  /** A skill-first session started (Story 7.5): listed, in start order, and kept with the transcript. One already listed is not listed twice. */
  openSkillSession(session: StoredSkillSession): void
  /** The skill-first sessions the transcript lists, in start order: those the file held and those started since. */
  skillSessions(): readonly StoredSkillSession[]
  /**
   * A skill-first session ended by the user (Story 7.5): its records, its stored run cards and its list item
   * go, written with the transcript. Nothing else is touched; a run of it that ends afterwards is not kept.
   * False when it was not listed.
   */
  removeSkillSession(sessionId: string): boolean
  /**
   * Empty the transcript, the file first: it is written as `entries: []` at
   * once, with no run cards, and only when that succeeds is the in-memory
   * transcript reset, the pending write cancelled and the ids begun again. On a
   * failure the errno is logged and returned, and nothing has changed. Only a
   * deliberate end of the conversation calls it.
   */
  clear(): WriteOutcome
  flush(): void
}

export type TranscriptRegistry = {
  /** The transcript of one project, loaded from its file the first time it is asked for. */
  forProject(projectPath: string): ProjectTranscript
  /** Write a project's transcript now if it has unwritten changes; does nothing for one never loaded. */
  flush(projectPath: string): void
  flushAll(): void
}

export type TranscriptRegistryDeps = {
  userDataPath: () => string
  /** Run `run` after `ms`; returns the way to cancel it. */
  schedule?: (run: () => void, ms: number) => () => void
  debounceMs?: number
  /** One diagnostic line, without its newline. */
  log?: (line: string) => void
  /** The clock the line at the top of a damaged conversation is stamped from. */
  now?: () => number
  /** The file I/O, replaceable by a test that needs a write to fail. */
  load?: (filePath: string, projectPath: string) => LoadOutcome
  /** Move a file that could not be used out of the way, before anything writes. */
  setAside?: (filePath: string, projectPath: string) => AsideOutcome
  write?: (
    filePath: string,
    projectPath: string,
    entries: readonly TranscriptRecord[],
    runs: readonly StoredRun[],
    skillSessions: readonly StoredSkillSession[]
  ) => WriteOutcome
}

const DEFAULT_DEBOUNCE_MS = 500

function defaultSchedule(run: () => void, ms: number): () => void {
  const timer = setTimeout(run, ms)
  timer.unref()
  return () => clearTimeout(timer)
}

export function createTranscriptRegistry(deps: TranscriptRegistryDeps): TranscriptRegistry {
  const schedule = deps.schedule ?? defaultSchedule
  const debounceMs = deps.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const log = deps.log ?? ((line: string) => void process.stderr.write(`${line}\n`))
  const now = deps.now ?? (() => Date.now())
  const load = deps.load ?? loadTranscript
  const setAside = deps.setAside ?? setAsideTranscript
  const write = deps.write ?? writeTranscript

  const projects = new Map<string, ProjectTranscript>()

  /** What a file that is there but cannot be used whole is called in the log. */
  function troubleOf(outcome: LoadOutcome): string | undefined {
    switch (outcome.kind) {
      case 'unreadable':
        return `unreadable ${outcome.errno}`
      case 'corrupt':
      case 'unknown-version':
        return outcome.kind
      default:
        return undefined
    }
  }

  function create(projectPath: string): ProjectTranscript {
    const filePath = transcriptFilePath(deps.userDataPath(), projectPath)
    const outcome = load(filePath, projectPath)
    let state: TranscriptState = transcriptFrom(outcome.kind === 'loaded' ? outcome.entries : [])
    // What the file held, as this launch reads it, and then every run this launch kept.
    let runs: StoredRun[] = outcome.kind === 'loaded' ? outcome.runs.map(deadOf) : []
    /** The skill-first sessions the file listed, then those started since, in start order (Story 7.5). */
    let skillSessions: StoredSkillSession[] = outcome.kind === 'loaded' ? [...outcome.skillSessions] : []
    /**
     * The runs of a conversation that has ended. Ending it closes its sessions after the
     * file is cleared, and a run in flight ends with its session: that last event is of a
     * run the conversation no longer holds, and is not kept.
     */
    const ended = new Set<string>()
    let dirty = false
    let cancel: (() => void) | undefined
    /** The stored file is one that must not be written over and could not be moved: nothing is written. */
    let blocked = false

    function flush(): void {
      cancel?.()
      cancel = undefined
      if (!dirty || blocked) {
        return
      }
      const stored = write(filePath, projectPath, state.entries, runs, skillSessions)
      if (stored.ok) {
        dirty = false
      } else {
        log(`persist/write-failed · ${stored.errno}`)
      }
    }

    /** Something changed that the file does not hold: it is written once the interval is up. */
    function touched(): void {
      dirty = true
      cancel ??= schedule(() => {
        cancel = undefined
        flush()
      }, debounceMs)
    }

    function changed(next: TranscriptState): void {
      if (next === state) {
        return
      }
      state = next
      touched()
    }

    // A file that cannot be used whole is moved aside before anything is written, so no write
    // replaces it; what could be read of it stays, and a line at the top says what happened.
    const trouble = troubleOf(outcome)
    const dropped = outcome.kind === 'loaded' ? outcome.dropped : 0
    if (trouble !== undefined || dropped > 0) {
      log(trouble === undefined ? `persist/entries-dropped · ${dropped}` : `persist/quarantined · ${trouble}`)
      const aside = setAside(filePath, projectPath)
      if (aside.ok) {
        changed(foldNoticeAtTop(state, SET_ASIDE_LINE, now()))
      } else {
        log(`persist/quarantine-failed · ${aside.errno}`)
        blocked = true
        state = foldNoticeAtTop(state, NOT_SAVED_LINE, now())
      }
    }

    function clear(): WriteOutcome {
      // A file that could not be moved aside is left as it is, even by this: the
      // conversation of this launch is all there is to end.
      const outcome: WriteOutcome = blocked ? { ok: true } : write(filePath, projectPath, [], [], [])
      if (!outcome.ok) {
        log(`persist/write-failed · ${outcome.errno}`)
        return outcome
      }
      cancel?.()
      cancel = undefined
      state = EMPTY_TRANSCRIPT
      for (const { card } of runs) ended.add(card.runId)
      runs = []
      skillSessions = []
      dirty = false
      return outcome
    }

    /** A record flagged for a skill-first session that is not listed (it was ended, or never listed) is no one's and is not kept. */
    const unlisted = (skillSession: string | undefined): boolean =>
      skillSession !== undefined && !skillSessions.some((held) => held.sessionId === skillSession)

    function recordSysline(text: string, at: number, room?: true, skillSession?: string): SyslineRecord {
      if (unlisted(skillSession)) {
        // Said to the window all the same, with the id it would have had, but never stored: nothing could remove it.
        return { kind: 'sysline', id: `m-${state.nextId}`, at, text, skillSession: skillSession as string }
      }
      changed(foldSysline(state, text, at, room, skillSession))
      return state.entries[state.entries.length - 1] as SyslineRecord
    }

    return {
      entries: () => state.entries,
      recordPersonaSaid: (said) => unlisted(said.skillSession) || changed(foldPersonaSaid(state, said)),
      recordUserTurn: (text, at, room, mention, skillSession) =>
        unlisted(skillSession) || changed(foldUserTurn(state, text, at, room, mention, skillSession)),
      recordSysline,
      recordRun(card, at) {
        if (ended.has(card.runId)) {
          return
        }
        runs = withRun(runs, card, at)
        touched()
      },
      storedRuns: () => runs.map((stored) => deadOf(stored).card),
      openSkillSession(session) {
        if (skillSessions.some((held) => held.sessionId === session.sessionId)) {
          return
        }
        skillSessions = [...skillSessions, session]
        touched()
      },
      skillSessions: () => skillSessions,
      removeSkillSession(sessionId) {
        if (!skillSessions.some((held) => held.sessionId === sessionId)) {
          return false
        }
        skillSessions = skillSessions.filter((held) => held.sessionId !== sessionId)
        for (const { card } of runs) {
          if (card.sessionId === sessionId) {
            ended.add(card.runId)
          }
        }
        runs = runs.filter(({ card }) => card.sessionId !== sessionId)
        state = foldWithoutSkillSession(state, sessionId)
        touched()
        return true
      },
      clear,
      flush
    }
  }

  return {
    forProject(projectPath) {
      let transcript = projects.get(projectPath)
      if (transcript === undefined) {
        transcript = create(projectPath)
        projects.set(projectPath, transcript)
      }
      return transcript
    },
    flush(projectPath) {
      projects.get(projectPath)?.flush()
    },
    flushAll() {
      for (const transcript of projects.values()) {
        transcript.flush()
      }
    }
  }
}
