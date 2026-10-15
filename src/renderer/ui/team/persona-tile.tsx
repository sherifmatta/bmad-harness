import type { JSX, KeyboardEvent } from 'react'

import './team.css'
import type { AgentView } from '../../../shared/install'
import { Initials } from '../persona/initials'
import { STATE_TEXT } from '../status/persona-state'
import type { PersonaState } from '../status/persona-state'
import { StateLine } from '../status/status-dot'

/** How many menu codes the hint shows before the rest collapse into `+N`. */
const HINT_CODES = 6

/**
 * One persona tile — FR18, FR19, UX-DR16.
 *
 * A native button, so `Enter` and `Space` are the browser's own click and no
 * key handler here needs to name them. `name` and `title` come from the
 * resolved agent, never a table of this harness's. The `aria-label` is the
 * whole announcement — name, title, state — so the disc, the text and the
 * dot are read once rather than three times.
 *
 * The hint carries menu *codes* only (AD-3): skill names and descriptions go
 * stale and are never shown here. Everything project-supplied is React text.
 * No hooks: which tile holds the tab stop, and how focus moves, is `Team`'s.
 */
export function PersonaTile({
  agent,
  codes,
  state,
  since,
  current,
  tabStop,
  onSelect,
  onKeyDown,
  tileRef
}: {
  agent: AgentView
  codes: readonly string[]
  state: PersonaState
  /** When the state began; a `work` tile counts its elapsed time from here. */
  since?: number | undefined
  current: boolean
  tabStop: boolean
  onSelect: (id: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  tileRef: (element: HTMLButtonElement | null) => void
}): JSX.Element {
  const hidden = codes.length - HINT_CODES

  return (
    <button
      type="button"
      className="persona-tile focus-inset"
      aria-label={`${agent.name}, ${agent.title}, ${STATE_TEXT[state]}`}
      aria-current={current ? 'true' : undefined}
      tabIndex={tabStop ? 0 : -1}
      ref={tileRef}
      onClick={() => onSelect(agent.id)}
      onKeyDown={onKeyDown}
    >
      <Initials {...agent} size={26} />
      <span className="tile-who">
        <span className="tile-ident">
          <span className="tile-name">{agent.name}</span>
          <span className="tile-title">{agent.title}</span>
        </span>
        <span className="tile-state">
          <StateLine state={state} since={since} />
        </span>
        {codes.length > 0 && (
          <span className="menu-hint">
            {codes.slice(0, HINT_CODES).map((code, index) => (
              <span key={`${code}-${index}`} className="code-tag">
                {code}
              </span>
            ))}
            {hidden > 0 && <span className="code-tag">{`+${hidden}`}</span>}
          </span>
        )}
      </span>
    </button>
  )
}
