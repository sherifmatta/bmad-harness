import type { RunCardProse } from '../../../shared/conversation'

/**
 * The document text of each run, held apart from the conversation state so
 * that a piece of prose is never a React state change.
 *
 * `doc:prose` pieces are appended here as they arrive; a piece of a different
 * call starts the run's text again under that call's path, as main's card fold
 * does (`src/main/fold/run-card.ts`). Whoever draws a run's text subscribes to
 * it and is called at most once per animation frame, however many pieces came
 * in that frame, and reads the whole text from `get` — so what it draws never
 * depends on having seen an earlier piece. `seed` puts a run's text as main
 * held it when a window (re)connects.
 *
 * The frame is injected (`raf`), so the store runs in node with a hand-cranked
 * frame and in the window on the real one.
 */
export type ProseStore = {
  append(runId: string, callId: string, path: string, text: string): void
  seed(runId: string, prose: RunCardProse | null): void
  get(runId: string): RunCardProse | undefined
  /** Called at most once a frame while the run's text changes; returns the way to stop. */
  subscribe(runId: string, listener: () => void): () => void
  clear(): void
}

export function createProseStore({ raf }: { raf: (callback: () => void) => unknown }): ProseStore {
  const texts = new Map<string, RunCardProse>()
  const listeners = new Map<string, Set<() => void>>()
  const dirty = new Set<string>()
  let framed = false

  function frame(): void {
    framed = false
    const runs = [...dirty]
    dirty.clear()
    for (const runId of runs) {
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

  return {
    append(runId, callId, path, text) {
      const held = texts.get(runId)
      texts.set(
        runId,
        held !== undefined && held.callId === callId ? { ...held, text: held.text + text } : { callId, path, text }
      )
      changed(runId)
    },

    seed(runId, prose) {
      if (prose === null) {
        texts.delete(runId)
      } else {
        texts.set(runId, prose)
      }
      changed(runId)
    },

    get: (runId) => texts.get(runId),

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
      for (const runId of texts.keys()) changed(runId)
      texts.clear()
    }
  }
}
