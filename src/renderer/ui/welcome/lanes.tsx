import type { JSX } from 'react'

import { artParamsFor } from '../persona/art-params'
import { portrait } from '../persona/portrait'
import { LANES, TEAM_META, personasIn } from './personas'

/**
 * The five core personas in the four lanes of the method (FR109). It reads no
 * project and says nothing about what any project has installed; the lanes say
 * where a role works in the method, not where the project is, and nothing here
 * is current, highlighted, ordered by relevance or recommended.
 *
 * A card is content, not a control: no tab stop, no hover state, no handler. Its
 * portrait is the face the app already draws for that persona, at 44px and full
 * opacity, since nobody is in a room here.
 */
export function Lanes(): JSX.Element {
  return (
    <section className="welcome-team" aria-labelledby="welcome-team-label">
      <div className="welcome-team-head">
        <h2 className="welcome-label" id="welcome-team-label">
          the team
        </h2>
        <p className="welcome-team-meta">{TEAM_META}</p>
      </div>
      <div className="welcome-lanes">
        {LANES.map((lane, index) => (
          <div key={lane} className="welcome-lane" role="group" aria-label={lane}>
            <div className="welcome-lane-head">
              <span className="welcome-label">{lane}</span>
              <span className="welcome-lane-number" aria-hidden="true">
                {index + 1}
              </span>
            </div>
            <ul className="welcome-cards">
              {personasIn(lane).map((persona) => (
                <li key={persona.id} className="welcome-card">
                  <div className="welcome-card-who">
                    {portrait(artParamsFor(persona.id), 44, 'idle', persona)}
                    <div>
                      <div className="welcome-card-name">{persona.name}</div>
                      <div className="welcome-card-title">{persona.title}</div>
                    </div>
                  </div>
                  <p className="welcome-card-description">{persona.description}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  )
}
