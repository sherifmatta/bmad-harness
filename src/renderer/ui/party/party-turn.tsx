import type { JSX } from 'react'

import type { AgentView } from '../../../shared/install'
import { Head, Words } from '../chat/turn'
import { TurnState } from '../chat/turn-state'
import { Initials } from '../persona/initials'

/**
 * A turn in the room (Story 4.2, FR68): the persona's initials disc, name, role, time and their
 * words, and nothing else. It is a persona's turn drawn with the same head and words, so the words
 * are rendered as untrusted text, whole, and never framed, tagged, quoted or classified.
 *
 * The latest turn of the persona speaking now (`live`) carries an accent edge down its left side; the
 * caller says so, and only while that persona is the room's current speaker. While the room's turn is
 * in flight and these are its words (`writing`), the caret sits at their tail and the `work` state line,
 * counted from the room's turn, under them.
 */
export function PartyTurn({
  agent,
  at,
  text,
  live,
  writing
}: {
  agent: AgentView
  at: number
  text: string
  live: boolean
  /** Set while the room's turn is in flight and this turn holds its words: since when it began. */
  writing?: { since: number | undefined }
}): JSX.Element {
  return (
    <div className={live ? 'turn turn--persona turn--party-live' : 'turn turn--persona'}>
      <div className="turn-av">
        <Initials {...agent} size={26} />
      </div>
      <div className="turn-body">
        <Head name={agent.name} ident={agent.title} at={at} />
        <Words text={text} caret={writing !== undefined} />
        {writing !== undefined && <TurnState since={writing.since} />}
      </div>
    </div>
  )
}

/**
 * The room's turn in flight before anyone has said a word of it: a row at the foot of the room
 * thread with no disc and no caret, since nobody is yet known to be speaking, only the `work`
 * state line counted from the user's send (or the room's open). Hidden from a reader, like the line
 * under a turn, and gone when a speaker's first word lands or the room's turn ends.
 */
export function PartyPending({ since }: { since: number | undefined }): JSX.Element {
  return (
    <div className="turn turn--pending" aria-hidden="true">
      <div className="turn-body">
        <TurnState since={since} />
      </div>
    </div>
  )
}
