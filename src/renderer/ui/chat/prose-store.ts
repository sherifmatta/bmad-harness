import type { RunCardDocument, RunCardProse } from '../../../shared/conversation'

/** One document of a run as the store holds it: its text and its weight, without the sections. */
export type HeldDocument = Omit<RunCardDocument, 'sections'>

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
  /** Called at most once a frame while the run's text changes; returns the way to stop. */
  subscribe(runId: string, listener: () => void): () => void
  clear(): void
}

type RunDocuments = { byPath: Map<string, HeldDocument>; paths: readonly string[] }

const NO_PATHS: readonly string[] = []

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
    const run = runs.get(runId) ?? { byPath: new Map<string, HeldDocument>(), paths: NO_PATHS }
    const held = run.byPath.get(path)
    const next = change(held)
    if (next === undefined || next === held) return
    run.byPath.set(path, next)
    if (held === undefined) run.paths = [...run.paths, path]
    runs.set(runId, run)
    changed(runId)
  }

  return {
    append(runId, callId, path, text) {
      put(runId, path, (held) => {
        const grown = held !== undefined && held.callId === callId ? held.text + text : text
        return { path, callId, text: grown, written: Math.max(held?.written ?? 0, grown.length) }
      })
    },

    commit(runId, path, callId, text) {
      put(runId, path, (held) => {
        if (held === undefined) return { path, callId, text: text ?? '', written: 0 }
        return text === undefined ? held : { ...held, callId, text }
      })
    },

    seed(runId, documents) {
      if (documents.length === 0) {
        runs.delete(runId)
      } else {
        runs.set(runId, {
          byPath: new Map(documents.map(({ path, callId, text, written }) => [path, { path, callId, text, written }])),
          paths: documents.map((document) => document.path)
        })
      }
      changed(runId)
    },

    get(runId) {
      const run = runs.get(runId)
      if (run === undefined) return undefined
      let subject: HeldDocument | undefined
      for (const path of run.paths) {
        const document = run.byPath.get(path)
        if (document !== undefined && document.written > (subject?.written ?? 0)) subject = document
      }
      return subject === undefined ? undefined : { callId: subject.callId, path: subject.path, text: subject.text }
    },

    paths: (runId) => runs.get(runId)?.paths ?? NO_PATHS,

    documents(runId) {
      const run = runs.get(runId)
      return run === undefined ? [] : run.paths.flatMap((path) => run.byPath.get(path) ?? [])
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
