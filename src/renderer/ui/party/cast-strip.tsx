import type { JSX } from 'react'

import './cast-strip.css'
import type { AgentView } from '../../../shared/install'
import { artParamsFor } from '../persona/art-params'
import { portrait } from '../persona/portrait'

/** A persona the roster no longer names is still in the room, under its id. */
function unnamed(id: string): AgentView {
  return { id, module: '', name: id, title: '', icon: '', description: '' }
}

/**
 * The cast strip (Story 4.2, FR66, UX-DR26): one card for every persona chosen for the room,
 * in cast order, for the whole life of the room. Presence is opacity and never removal: a card
 * sits dimmed, and the one who is speaking is lit, with the equaliser running beside the status.
 *
 * Who is speaking is the caller's (`speaker`, a pure function of the conversation); nothing here
 * decides it, and nothing else lights a card or draws the equaliser. The strip does not announce:
 * it has no live region and no role, so a speaker changing is for the eye alone.
 */
export function CastStrip({
  agents,
  cast,
  speaker
}: {
  agents: readonly AgentView[]
  /** The agent ids chosen for the room, in roster order. */
  cast: readonly string[]
  /** The agent id of the persona speaking now, or `undefined` when no one is. */
  speaker: string | undefined
}): JSX.Element {
  return (
    <div className="cast-strip">
      {cast.map((id) => {
        const agent = agents.find((held) => held.id === id) ?? unnamed(id)
        const speaking = id === speaker
        return (
          <div key={id} className={speaking ? 'cast-card cast-card--speaking' : 'cast-card'}>
            <span className="cast-portrait" aria-hidden="true">
              {portrait(artParamsFor(id), 44, 'idle', agent)}
            </span>
            <span className="cast-info">
              <span className="cast-name">{agent.name}</span>
              <span className="cast-title">{agent.title}</span>
              <span className="cast-status">
                {speaking && (
                  <span className="cast-eq" aria-hidden="true">
                    <span className="cast-eq-bar" />
                    <span className="cast-eq-bar" />
                    <span className="cast-eq-bar" />
                  </span>
                )}
                {speaking ? 'speaking' : 'in the room'}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
