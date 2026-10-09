import type { JSX } from 'react'

import { StateLine } from '../status/status-dot'

/**
 * The state line under a turn in flight: the persona's own `work` line, its dot and
 * its counter from when the turn began, drawn under the words (or under the caret
 * alone, before the first word) and gone when the turn ends. It is the shared
 * `StateLine` and nothing else, so its one word is the state text's.
 *
 * Hidden from a reader and never announced: the persona's tile says the same state,
 * and a counter read aloud each second would be a live region by another name.
 */
export function TurnState({ since }: { since: number | undefined }): JSX.Element {
  return (
    <div className="turn-state" aria-hidden="true">
      <StateLine state="work" since={since} />
    </div>
  )
}
