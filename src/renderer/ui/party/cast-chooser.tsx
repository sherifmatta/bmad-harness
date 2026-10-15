import { useState } from 'react'
import type { FormEvent, JSX } from 'react'

import './cast-chooser.css'
import type { AgentView } from '../../../shared/install'
import { Initials } from '../persona/initials'
import { CORE_AGENT_IDS } from '../welcome/personas'

/**
 * The cast chooser (Story 4.1, FR64): every agent of the roster as a labelled native
 * checkbox, with the five core personas ticked, and *Open the room*, which asks for the
 * room of whoever is ticked and is disabled with nobody ticked.
 *
 * What the user changed is held as overrides of the defaults, never as a copy of the
 * roster, so a roster that changes under the chooser lands in one frame: an agent the
 * user never touched is ticked while it is one of the five. The cast sent is the
 * ticked agents in roster order. Name, title and the initials disc are the roster's; the whole
 * label names the checkbox, so the disc is hidden from assistive technology.
 */
export function CastChooser({
  agents,
  onOpen
}: {
  agents: readonly AgentView[]
  /** Called with the ticked agent ids, in roster order, when *Open the room* is pressed. */
  onOpen: (cast: readonly string[]) => void
}): JSX.Element {
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map())
  const ticked = (id: string): boolean => overrides.get(id) ?? CORE_AGENT_IDS.includes(id)
  const cast = agents.filter((agent) => ticked(agent.id)).map((agent) => agent.id)

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (cast.length > 0) {
      onOpen(cast)
    }
  }

  return (
    <form className="cast-chooser" onSubmit={submit}>
      <fieldset className="cast-chooser-set">
        <legend className="cast-chooser-legend">Choose who is in the room</legend>
        <ul className="cast-chooser-list">
          {agents.map((agent) => (
            <li key={agent.id} className="cast-chooser-item">
              <label className="cast-chooser-label">
                <input
                  type="checkbox"
                  className="cast-chooser-check"
                  checked={ticked(agent.id)}
                  onChange={(event) =>
                    setOverrides((held) => new Map(held).set(agent.id, event.target.checked))
                  }
                />
                <span className="cast-chooser-face" aria-hidden="true">
                  <Initials {...agent} size={26} />
                </span>
                <span className="cast-chooser-who">
                  <span className="cast-chooser-name">{agent.name}</span>
                  <span className="cast-chooser-title">{agent.title}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <button type="submit" className="cast-chooser-open" disabled={cast.length === 0}>
        Open the room
      </button>
    </form>
  )
}
