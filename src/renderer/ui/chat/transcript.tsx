import type { JSX } from 'react'

import { decisionOf } from './decision'
import { Sysline } from './sysline'
import { PersonaTurn, UserTurn } from './turn'
import type { TranscriptEntry } from './transcript-entry'

/**
 * The transcript — a thread of turns in time order (UX-DR25).
 *
 * Entries arrive however the projection holds them; the transcript shows them
 * ascending by `at`, ties keeping their input order. Persona and user turns, and
 * the harness's own sysline between them, and the decision block, drawn inside the
 * last persona turn when it can be answered.
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
  onCancel,
  canAnswer,
  onChoose
}: {
  entries: readonly TranscriptEntry[]
  /** Take a queued message back, by its entry id. */
  onCancel?: (entryId: string) => void
  /** Whether a persona has a live session with no turn in flight, so a reply can be sent now. */
  canAnswer?: (agentId: string) => boolean
  /** Send an option's text to a persona as the user's turn. */
  onChoose?: (agentId: string, text: string) => void
}): JSX.Element {
  const ordered = orderEntries(entries)
  const last = ordered.length - 1
  return (
    <>
      {ordered.map((entry, index) => {
        if (entry.kind === 'sysline') {
          return <Sysline key={entry.id} text={entry.text} />
        }
        if (entry.kind === 'persona') {
          // A decision is read only from the last entry, and only while its persona can
          // take a reply: any later entry, a turn in flight or no session removes it.
          const agentId = entry.agent.id
          const decision =
            index === last && onChoose !== undefined && canAnswer?.(agentId) === true
              ? decisionOf(entry.text)
              : null
          return (
            <PersonaTurn
              key={entry.id}
              agent={entry.agent}
              at={entry.at}
              text={entry.text}
              decision={decision ?? undefined}
              onChoose={onChoose === undefined ? undefined : (text) => onChoose(agentId, text)}
            />
          )
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
