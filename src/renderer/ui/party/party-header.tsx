import type { JSX } from 'react'

import './party-header.css'
import { useNow } from '../outputs/use-now'
import { formatElapsed } from '../status/format-elapsed'
import { COUNTER_TICK_MS } from '../status/status-dot'

/**
 * How long the room has run, re-read each second. Its own component, so that its interval
 * exists only while a room is on screen and the rest of the header does not re-render with it.
 * Data and not news: it is in no live region and is never announced.
 */
function Elapsed({ since }: { since: number }): JSX.Element {
  const now = useNow(COUNTER_TICK_MS)
  return <>{formatElapsed(now - since)}</>
}

/**
 * The party header (Story 4.3, FR67): what the room is about, how many are in it, how many turns
 * it has had and for how long, and the button that asks the room to write its summary. Drawn only while a room
 * is live, above the cast strip and across the full width.
 *
 * The topic is the user's own first message, handed in as it was shaped (a string drawn as text);
 * with none it reads `no topic yet`. The button is a native `<button>` that takes the shared
 * `:focus-visible` ring. It has no handler of its own: `onWriteSummary` is the caller's (Story 4.4: the room's
 * session is asked, as one turn, to write the file), and without one the button is disabled. There is no pause control, no disagreement chip and no
 * title, and nothing here announces.
 */
export function PartyHeader({
  topic,
  participants,
  openedAt,
  turns,
  onWriteSummary
}: {
  /** What the room is about, or `undefined` until the user's first message. */
  topic: string | undefined
  /** How many personas are in the room. */
  participants: number
  /** When the room opened, in epoch milliseconds. */
  openedAt: number | undefined
  /** How many turns the room has had. */
  turns: number
  /** Called when *Write summary to `_bmad/`* is pressed; the button is disabled without it. */
  onWriteSummary?: (() => void) | undefined
}): JSX.Element {
  return (
    <div className="party-head">
      <span className="party-head-topic">
        {topic ?? 'no topic yet'}
      </span>
      <span className="party-chip">{participants === 1 ? '1 participant' : `${participants} participants`}</span>
      <span className="party-chip">
        {`turn ${turns}`}
        {openedAt !== undefined && (
          <>
            {' · '}
            <Elapsed since={openedAt} />
          </>
        )}
      </span>
      <button type="button" className="party-write" disabled={onWriteSummary === undefined} onClick={onWriteSummary}>
        Write summary to _bmad/
      </button>
    </div>
  )
}
