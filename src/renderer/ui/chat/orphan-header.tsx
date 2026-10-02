import type { JSX } from 'react'

import './orphan-header.css'
import type { AgentView } from '../../../shared/install'
import { artParamsFor } from '../persona/art-params'
import { portrait } from '../persona/portrait'

/**
 * The header of a session that outlived the install changing under it (FR6,
 * Story 2.11): a persona the roster no longer names whose session is still
 * open. It has no tile, so this is the only place the session is shown and the
 * only place it can be ended.
 *
 * It takes the chat header's own form: the same 38px portrait, the name and
 * title as text, and one quiet mono line saying what is the matter. The one
 * control is a native button, so `Enter` and `Space` come with it and the shared
 * focus ring draws on `:focus-visible` with no rule of this component's own.
 * There is no tooltip, `title`, badge, confirm step or live region: the header
 * is there while the session is, and goes when main reports it closed.
 * Everything project-supplied is React text.
 */
export function OrphanHeader({
  agent,
  onClose
}: {
  agent: AgentView
  /** Called when the user asks to end this session; the header goes when main says it ended. */
  onClose: (agentId: string) => void
}): JSX.Element {
  return (
    <div className="chat-head orphan-head">
      {portrait(artParamsFor(agent.id), 38, 'idle', agent)}
      <div className="chat-head-id">
        <div className="chat-head-line">
          <h2 className="chat-head-name">{agent.name}</h2>
          <span className="chat-head-title">{agent.title}</span>
        </div>
        <div className="chat-head-sub orphan-head-note">
          no longer in the install · session still open
        </div>
      </div>
      <div className="chat-head-state">
        <button
          type="button"
          className="orphan-close"
          aria-label={`close session · ${agent.name}`}
          onClick={() => onClose(agent.id)}
        >
          close session
        </button>
      </div>
    </div>
  )
}
