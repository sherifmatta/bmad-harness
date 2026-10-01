import type { JSX } from 'react'

import type { AgentView } from '../../../shared/install'
import { PersonaTurn, UserTurn } from './turn'
import type { UserIdentity } from './turn'

/**
 * The transcript — a thread of turns in time order (UX-DR25).
 *
 * Entries arrive however the projection holds them; the transcript shows them
 * ascending by `at`, ties keeping their input order. Only persona and user
 * turns exist here: the sysline, decision block and queued marker are later
 * stories'. The markup is the shell's `.thread`, which already caps at
 * `--thread-max`.
 */

export type PersonaEntry = {
  kind: 'persona'
  id: string
  at: number
  agent: AgentView
  text: string
}

export type UserEntry = {
  kind: 'user'
  id: string
  at: number
  text: string
  user?: UserIdentity
}

export type TranscriptEntry = PersonaEntry | UserEntry

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

export function Transcript({ entries }: { entries: readonly TranscriptEntry[] }): JSX.Element {
  return (
    <div className="thread">
      {orderEntries(entries).map((entry) =>
        entry.kind === 'persona' ? (
          <PersonaTurn key={entry.id} agent={entry.agent} at={entry.at} text={entry.text} />
        ) : (
          <UserTurn key={entry.id} at={entry.at} text={entry.text} user={entry.user} />
        )
      )}
    </div>
  )
}
