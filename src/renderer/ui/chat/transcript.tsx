import type { JSX } from 'react'

import { Sysline } from './sysline'
import { PersonaTurn, UserTurn } from './turn'
import type { TranscriptEntry } from './transcript-entry'

/**
 * The transcript — a thread of turns in time order (UX-DR25).
 *
 * Entries arrive however the projection holds them; the transcript shows them
 * ascending by `at`, ties keeping their input order. Persona and user turns, and
 * the harness's own sysline between them; the decision block is a later story's.
 * The markup is the shell's `.thread`, which already caps at `--thread-max`.
 */

export type { PersonaEntry, SyslineEntry, TranscriptEntry, UserEntry } from './transcript-entry'

/**
 * The entries ascending by `at`, stable: equal times keep the order they came
 * in. Insertion from the tail, so an already-ordered transcript — the usual
 * case — costs one comparison per entry. Returns a new array and leaves the
 * input as it was.
 */
export function orderEntries<T extends { at: number }>(entries: readonly T[]): T[] {
  const ordered: T[] = []
  for (const entry of entries) {
    let at = ordered.length
    while (at > 0 && ordered[at - 1].at > entry.at) {
      at -= 1
    }
    ordered.splice(at, 0, entry)
  }
  return ordered
}

/**
 * The turns alone, with no thread around them: for a surface, like the shell,
 * that already provides the `.thread` they sit in.
 */
export function Turns({
  entries,
  onCancel
}: {
  entries: readonly TranscriptEntry[]
  /** Take a queued message back, by its entry id. */
  onCancel?: (entryId: string) => void
}): JSX.Element {
  return (
    <>
      {orderEntries(entries).map((entry) => {
        if (entry.kind === 'sysline') {
          return <Sysline key={entry.id} text={entry.text} />
        }
        if (entry.kind === 'persona') {
          return <PersonaTurn key={entry.id} agent={entry.agent} at={entry.at} text={entry.text} />
        }
        return (
          <UserTurn
            key={entry.id}
            at={entry.at}
            text={entry.text}
            user={entry.user}
            queuedFor={entry.queuedFor}
            onCancel={onCancel === undefined ? undefined : () => onCancel(entry.id)}
          />
        )
      })}
    </>
  )
}

export function Transcript({ entries }: { entries: readonly TranscriptEntry[] }): JSX.Element {
  return (
    <div className="thread">
      <Turns entries={entries} />
    </div>
  )
}
