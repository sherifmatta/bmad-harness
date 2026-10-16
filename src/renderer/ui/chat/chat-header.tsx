import type { JSX } from 'react'

import './chat-header.css'
import type { AgentView } from '../../../shared/install'
import { Initials, SkillDisc } from '../persona/initials'
import type { PersonaState } from '../status/persona-state'
import { StateLine } from '../status/status-dot'

/**
 * The chat header — FR22, UX-DR17: who the user is talking to and what state
 * they are in. One line (2026-10-09): the persona's 22px initials disc, name and
 * title, and the state on the right. The roster's `description` is not drawn.
 *
 * The shell renders it `key={agent.id}` so that making another tile current
 * rebuilds it in the same frame. There is no hand-off and no composer here —
 * those are later stories'. The one control is a native button, drawn while the
 * persona has a session open and the shell was given a way to close it: a turn
 * that never ends has no other way out. It reads `close session` and, while a turn
 * is in flight (chat or run) and the shell was given a way to stop it, `Stop`
 * (Story 3.19). It is the same element in both, only its label and press change,
 * in the same render the turn starts or ends in, so focus stays on it. `Enter` and
 * `Space` come with it. Neither asks for confirmation, and `Stop` shows no cost, no
 * "stopping…" and no disabled or pending state. Everything project-supplied is
 * React text.
 */
export function ChatHeader({
  agent,
  state,
  since,
  onClose,
  turnInFlight = false,
  onStop
}: {
  agent: AgentView
  state: PersonaState
  /** When the state began; `work` counts its elapsed time from here. */
  since?: number | undefined
  /** Called when the user asks to end this persona's session; absent when it has none open. */
  onClose?: (() => void) | undefined
  /** Whether the persona's session has a turn in flight, a run or a plain chat turn. */
  turnInFlight?: boolean | undefined
  /** Called when the user asks to stop the turn in flight; with none, the control stays `close session`. */
  onStop?: (() => void) | undefined
}): JSX.Element {
  const stops = turnInFlight && onStop !== undefined
  return (
    <div className="chat-head">
      <Initials {...agent} size={22} />
      <div className="chat-head-id">
        <div className="chat-head-line">
          <h2 className="chat-head-name">{agent.name}</h2>
          <span className="chat-head-title">{agent.title}</span>
        </div>
      </div>
      <div className="chat-head-state">
        <StateLine state={state} since={since} />
        {onClose !== undefined && (
          <button
            type="button"
            className="chat-close"
            aria-label={`${stops ? 'Stop' : 'close session'} · ${agent.name}`}
            onClick={stops ? onStop : onClose}
          >
            {stops ? 'Stop' : 'close session'}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * A skill-first session's header (Story 7.5): the skill's `/` disc at 22px, its name in mono and the state as the
 * status pill (`working`, `live`, or `ended` with no dot), with no title or story reference. The one control is a
 * native button, the persona header's own: `Stop` while a turn is in flight and `stop` was given, else `close session`
 * (an ended session keeps it: it removes what the session kept). Neither asks for confirmation.
 */
export function SkillHeader({
  skill,
  state,
  since,
  turnInFlight = false,
  onClose,
  onStop
}: {
  skill: string
  state: 'work' | 'live' | 'ended'
  /** When the turn in flight began; `work` counts its elapsed time from here. */
  since?: number | undefined
  turnInFlight?: boolean | undefined
  onClose: () => void
  onStop?: (() => void) | undefined
}): JSX.Element {
  const stops = turnInFlight && onStop !== undefined
  return (
    <div className="chat-head">
      <SkillDisc size={22} />
      <div className="chat-head-id">
        <div className="chat-head-line">
          <h2 className="chat-head-name chat-head-name--skill">{skill}</h2>
        </div>
      </div>
      <div className="chat-head-state">
        <StateLine state={state} since={since} />
        <button
          type="button"
          className="chat-close"
          aria-label={`${stops ? 'Stop' : 'close session'} · ${skill}`}
          onClick={stops ? onStop : onClose}
        >
          {stops ? 'Stop' : 'close session'}
        </button>
      </div>
    </div>
  )
}

/**
 * The New session chat's header (Story 7.5): the `/` disc at 22px and `New session`, and nothing else: no status pill,
 * no `Stop`, no close. It is no session: a renderer surface with nothing to end.
 */
export function NewSessionHeader(): JSX.Element {
  return (
    <div className="chat-head">
      <SkillDisc size={22} />
      <div className="chat-head-id">
        <div className="chat-head-line">
          <h2 className="chat-head-name">New session</h2>
        </div>
      </div>
    </div>
  )
}
