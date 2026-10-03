import type { JSX } from 'react'

import './chat-header.css'
import type { AgentView } from '../../../shared/install'
import { artParamsFor } from '../persona/art-params'
import { portrait } from '../persona/portrait'
import type { PersonaState } from '../persona/portrait'
import { StateLine } from '../status/status-dot'

/**
 * The chat header — FR22, UX-DR17: who the user is talking to and what state
 * they are in. The current persona's 38px portrait, name, title, the roster's
 * own `description` as a single quiet line, and the state on the right.
 *
 * The shell renders it `key={agent.id}` so that making another tile current
 * rebuilds it in the same frame. There is no hand-off and no composer here —
 * those are later stories'. The one control is `close session`, drawn while the
 * persona has a session open and the shell was given a way to close it: a turn
 * that never ends has no other way out. It is a native button, so `Enter` and
 * `Space` come with it, and it asks for no confirmation. Everything
 * project-supplied is React text.
 */
export function ChatHeader({
  agent,
  state,
  since,
  onClose
}: {
  agent: AgentView
  state: PersonaState
  /** When the state began; `work` counts its elapsed time from here. */
  since?: number | undefined
  /** Called when the user asks to end this persona's session; absent when it has none open. */
  onClose?: (() => void) | undefined
}): JSX.Element {
  return (
    <div className="chat-head">
      {portrait(artParamsFor(agent.id), 38, state, agent)}
      <div className="chat-head-id">
        <div className="chat-head-line">
          <h2 className="chat-head-name">{agent.name}</h2>
          <span className="chat-head-title">{agent.title}</span>
        </div>
        {agent.description.trim() !== '' && (
          <div className="chat-head-sub">{agent.description}</div>
        )}
      </div>
      <div className="chat-head-state">
        <StateLine state={state} since={since} />
        {onClose !== undefined && (
          <button
            type="button"
            className="chat-close"
            aria-label={`close session · ${agent.name}`}
            onClick={onClose}
          >
            close session
          </button>
        )}
      </div>
    </div>
  )
}
