import type { PersonaSaid } from '../../shared/events'
import type { SyslineRecord, TranscriptRecord } from '../../shared/conversation'
import {
  EMPTY_TRANSCRIPT,
  foldPersonaSaid,
  foldSysline,
  foldUserTurn,
  transcriptFrom
} from '../fold/transcript'
import type { TranscriptState } from '../fold/transcript'
import {
  loadTranscript,
  transcriptFilePath,
  writeTranscript
} from '../sources/persistence/transcript-file'
import type { WriteOutcome } from '../sources/persistence/transcript-file'

/**
 * The transcript read model: one per project path, shared by every window and
 * session that speaks into it, and kept in step with its file.
 *
 * It changes only by recording what was said or sent, or a line the harness wrote. Each change schedules a
 * write through the injected scheduler; a write already scheduled covers the
 * changes that follow it, so the file is at most one interval behind. `flush`
 * writes at once and is what a window's destruction and the app's quitting call.
 * A failed write is logged as `persist/write-failed · <errno>`, never thrown,
 * and leaves the transcript dirty so the next change, or the next flush, tries
 * again.
 *
 * The data directory is asked for on the first project, not at construction,
 * because Electron's `userData` is not to be read before the app is ready.
 */

export type ProjectTranscript = {
  entries(): readonly TranscriptRecord[]
  recordPersonaSaid(said: PersonaSaid): void
  recordUserTurn(text: string, at: number): void
  /** Write the harness's own line into the transcript and return the record it became. */
  recordSysline(text: string, at: number): SyslineRecord
  /**
   * Empty the transcript, the file first: it is written as `entries: []` at
   * once, and only when that succeeds is the in-memory transcript reset, the
   * pending write cancelled and the ids begun again. On a failure the errno is
   * logged and returned, and nothing has changed. Only a deliberate end of the
   * conversation calls it.
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
  /** The file I/O, replaceable by a test that needs a write to fail. */
  load?: (filePath: string, projectPath: string) => TranscriptRecord[]
  write?: (
    filePath: string,
    projectPath: string,
    entries: readonly TranscriptRecord[]
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
  const load = deps.load ?? loadTranscript
  const write = deps.write ?? writeTranscript

  const projects = new Map<string, ProjectTranscript>()

  function create(projectPath: string): ProjectTranscript {
    const filePath = transcriptFilePath(deps.userDataPath(), projectPath)
    let state: TranscriptState = transcriptFrom(load(filePath, projectPath))
    let dirty = false
    let cancel: (() => void) | undefined

    function flush(): void {
      cancel?.()
      cancel = undefined
      if (!dirty) {
        return
      }
      const outcome = write(filePath, projectPath, state.entries)
      if (outcome.ok) {
        dirty = false
      } else {
        log(`persist/write-failed · ${outcome.errno}`)
      }
    }

    function changed(next: TranscriptState): void {
      if (next === state) {
        return
      }
      state = next
      dirty = true
      cancel ??= schedule(() => {
        cancel = undefined
        flush()
      }, debounceMs)
    }

    function clear(): WriteOutcome {
      const outcome = write(filePath, projectPath, [])
      if (!outcome.ok) {
        log(`persist/write-failed · ${outcome.errno}`)
        return outcome
      }
      cancel?.()
      cancel = undefined
      state = EMPTY_TRANSCRIPT
      dirty = false
      return outcome
    }

    function recordSysline(text: string, at: number): SyslineRecord {
      changed(foldSysline(state, text, at))
      return state.entries[state.entries.length - 1] as SyslineRecord
    }

    return {
      entries: () => state.entries,
      recordPersonaSaid: (said) => changed(foldPersonaSaid(state, said)),
      recordUserTurn: (text, at) => changed(foldUserTurn(state, text, at)),
      recordSysline,
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
