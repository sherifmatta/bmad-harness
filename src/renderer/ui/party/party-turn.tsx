import type { JSX } from 'react'

import type { AgentView } from '../../../shared/install'
import { Head, Words } from '../chat/turn'
import { artParamsFor } from '../persona/art-params'
import { portrait } from '../persona/portrait'

/**
 * A turn in the room (Story 4.2, FR68): the persona's 32px portrait, name, role, time and their
 * words, and nothing else. It is a persona's turn drawn with the same head and words, so the words
 * are rendered as untrusted text, whole, and never framed, tagged, quoted or classified.
 *
 * The latest turn of the persona speaking now (`live`) carries an accent edge down its left side; the
 * caller says so, and only while that persona is the room's current speaker.
 */
export function PartyTurn({
  agent,
  at,
  text,
  live
}: {
  agent: AgentView
  at: number
  text: string
  live: boolean
}): JSX.Element {
  return (
    <div className={live ? 'turn turn--persona turn--party-live' : 'turn turn--persona'}>
      <div className="turn-av">{portrait(artParamsFor(agent.id), 32, 'idle', agent)}</div>
      <div className="turn-body">
        <Head name={agent.name} ident={agent.title} at={at} />
        <Words text={text} />
      </div>
    </div>
  )
}
