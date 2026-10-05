import type { RunCardDocument, RunCardProse } from '../../../shared/conversation'
import { commonPrefix, sectionProgress } from '../../../shared/section-progress'
import type { SectionPlace } from '../../../shared/section-progress'

/** One document of a run as the store holds it: its text and its weight, without the sections. */
export type HeldDocument = Omit<RunCardDocument, 'sections'>

/**
 * Where a run's subject has got to, as the head says it: the section being
 * written, or while an applied `Edit` stands the section it changed. `n` is the
 * section's 1-based place in the subject's `seen` list. No section until the
 * subject's text has a heading.
 */
export type RunProgress = { revising: boolean; section?: SectionPlace }

/** Before any heading, and for a run with no subject. */
export const NO_PROGRESS: RunProgress = { revising: false }

/**
 * The document text of each run, held apart from the conversation state so
 * that a piece of prose is never a React state change.
 *
 * A run holds one document per path, in the order first seen, folded as main's
 * card fold folds them (`src/main/fold/run-card.ts`): a `doc:prose` piece of
 * the call that set a path's text grows it, a piece of another call replaces
 * it, and the path's weight is the longest text any one `Write` gave it; an
 * `ok` commit that carries text replaces the path's text, and one of a path not
 * yet seen adds it empty. `get` is the run's subject, the document with the
 * greatest weight above zero (the earlier on a tie), and `paths` every path the
 * run holds.
 *
 * **Progress** is read from the subject's text and never held as state of the
 * window's: `seen` is the names of the headings the subject's text has shown,
 * in the order they were first seen, and only ever appended to (a name is never
 * renumbered), kept per path; `progress` is the section being written, the last
 * heading of the text, or, from an applied `Edit` until the next `Write` piece,
 * the section holding the first changed character. Both are recomputed lazily,
 * only when the run's text changed (so at most once a frame while it streams),
 * and stay the same value until their words change.
 *
 * Whoever draws a run's text subscribes to it and is called at most once per
 * animation frame, however many pieces came in that frame, and reads the whole
 * text from `get` — so what it draws never depends on having seen an earlier
 * piece. `seed` puts a run's documents as main held them when a window
 * (re)connects.
 *
 * The frame is injected (`raf`), so the store runs in node with a hand-cranked
 * frame and in the window on the real one.
 */
export type ProseStore = {
  append(runId: string, callId: string, path: string, text: string): void
  /** An `ok` commit: `text`, when given, replaces the path's text under `callId`. */
  commit(runId: string, path: string, callId: string, text?: string): void
  seed(runId: string, documents: readonly RunCardDocument[]): void
  /** The run's subject: the document its card shows. */
  get(runId: string): RunCardProse | undefined
  /** Every path the run holds, in the order first seen; the same array until a path is added. */
  paths(runId: string): readonly string[]
  /** Every document the run holds, in the order first seen. */
  documents(runId: string): readonly HeldDocument[]
  /** The section the subject is at; the same value until its words change. */
  progress(runId: string): RunProgress
  /** The names of the headings the subject's text has shown, in the order first seen; the same array until one is added. */
  seen(runId: string): readonly string[]
  /** Called at most once a frame while the run's text changes; returns the way to stop. */
  subscribe(runId: string, listener: () => void): () => void
  clear(): void
}

type RunDocuments = {
  byPath: Map<string, HeldDocument>
  paths: readonly string[]
  /** The names each path's text has shown, in the order first seen. */
  seenByPath: Map<string, readonly string[]>
  /** An applied `Edit` of the subject, where its first changed character is, until the next `Write` piece. */
  revision: { path: string; offset: number } | undefined
  /** Counts every change to the run's documents; `settled` is the count `progress` and `subjectSeen` are read at. */
  version: number
  settled: number
  progress: RunProgress
  subjectSeen: readonly string[]
}

const NO_PATHS: readonly string[] = []
const NO_SEEN: readonly string[] = []

function emptyRun(): RunDocuments {
  return {
    byPath: new Map(),
    paths: NO_PATHS,
    seenByPath: new Map(),
    revision: undefined,
    version: 0,
    settled: -1,
    progress: NO_PROGRESS,
    subjectSeen: NO_SEEN
  }
}

/** The document with the greatest weight above zero, the earlier on a tie. */
function subjectOf(run: RunDocuments): HeldDocument | undefined {
  let subject: HeldDocument | undefined
  for (const path of run.paths) {
    const document = run.byPath.get(path)
    if (document !== undefined && document.written > (subject?.written ?? 0)) subject = document
  }
  return subject
}

/** Read the subject's text again, if the run changed since: grow its `seen`, and say where it is. */
function settle(run: RunDocuments): void {
  if (run.settled === run.version) return
  run.settled = run.version
  const subject = subjectOf(run)
  if (subject === undefined) {
    run.progress = NO_PROGRESS
    run.subjectSeen = NO_SEEN
    return
  }
  // The section and the names seen are read by the one function the rail's annotation reads them by.
  const held = run.seenByPath.get(subject.path) ?? NO_SEEN
  const revision = run.revision?.path === subject.path ? run.revision : undefined
  const { seen, section } = sectionProgress(subject.text, held, revision?.offset)
  if (seen !== held) run.seenByPath.set(subject.path, seen)
  run.subjectSeen = seen

  const revising = revision !== undefined
  const before = run.progress
  if (before.revising === revising && before.section?.name === section?.name && before.section?.n === section?.n) return
  run.progress = section === undefined ? (revising ? { revising } : NO_PROGRESS) : { revising, section }
}

export function createProseStore({ raf }: { raf: (callback: () => void) => unknown }): ProseStore {
  const runs = new Map<string, RunDocuments>()
  const listeners = new Map<string, Set<() => void>>()
  const dirty = new Set<string>()
  let framed = false

  function frame(): void {
    framed = false
    const changedRuns = [...dirty]
    dirty.clear()
    for (const runId of changedRuns) {
      const run = runs.get(runId)
      if (run !== undefined) settle(run)
      for (const listener of [...(listeners.get(runId) ?? [])]) listener()
    }
  }

  function changed(runId: string): void {
    dirty.add(runId)
    if (!framed) {
      framed = true
      raf(frame)
    }
  }

  /** Put the document at `path` as `change` makes it, adding the path when it is new. */
  function put(runId: string, path: string, change: (held: HeldDocument | undefined) => HeldDocument | undefined): void {
    const run = runs.get(runId) ?? emptyRun()
    const held = run.byPath.get(path)
    const next = change(held)
    if (next === undefined || next === held) return
    run.version += 1
    run.byPath.set(path, next)
    if (held === undefined) run.paths = [...run.paths, path]
    runs.set(runId, run)
    changed(runId)
  }

  return {
    append(runId, callId, path, text) {
      // The next `Write` piece ends a revision.
      const run = runs.get(runId)
      if (run !== undefined) run.revision = undefined
      put(runId, path, (held) => {
        const grown = held !== undefined && held.callId === callId ? held.text + text : text
        return { path, callId, text: grown, written: Math.max(held?.written ?? 0, grown.length) }
      })
    },

    commit(runId, path, callId, text) {
      const before = runs.get(runId)?.byPath.get(path)?.text ?? ''
      put(runId, path, (held) => {
        if (held === undefined) return { path, callId, text: text ?? '', written: 0 }
        return text === undefined ? held : { ...held, callId, text }
      })
      // An applied `Edit` of the subject: its first changed character is where the head says it is revising.
      const run = runs.get(runId)
      if (text !== undefined && run !== undefined && subjectOf(run)?.path === path) {
        run.revision = { path, offset: commonPrefix(before, text) }
        run.version += 1
      }
    },

    seed(runId, documents) {
      if (documents.length === 0) {
        runs.delete(runId)
      } else {
        // What the window has seen of the run's headings is its text's: `seen` is read from it again.
        runs.set(runId, {
          ...emptyRun(),
          byPath: new Map(documents.map(({ path, callId, text, written }) => [path, { path, callId, text, written }])),
          paths: documents.map((document) => document.path)
        })
      }
      changed(runId)
    },

    get(runId) {
      const run = runs.get(runId)
      if (run === undefined) return undefined
      const subject = subjectOf(run)
      return subject === undefined ? undefined : { callId: subject.callId, path: subject.path, text: subject.text }
    },

    paths: (runId) => runs.get(runId)?.paths ?? NO_PATHS,

    documents(runId) {
      const run = runs.get(runId)
      return run === undefined ? [] : run.paths.flatMap((path) => run.byPath.get(path) ?? [])
    },

    progress(runId) {
      const run = runs.get(runId)
      if (run === undefined) return NO_PROGRESS
      settle(run)
      return run.progress
    },

    seen(runId) {
      const run = runs.get(runId)
      if (run === undefined) return NO_SEEN
      settle(run)
      return run.subjectSeen
    },

    subscribe(runId, listener) {
      const set = listeners.get(runId) ?? new Set()
      set.add(listener)
      listeners.set(runId, set)
      return () => {
        set.delete(listener)
        if (set.size === 0) listeners.delete(runId)
      }
    },

    clear() {
      for (const runId of runs.keys()) changed(runId)
      runs.clear()
    }
  }
}
