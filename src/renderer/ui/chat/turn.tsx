import type { JSX } from 'react'

import './turn.css'
import type { AgentView } from '../../../shared/install'
import { artParamsFor } from '../persona/art-params'
import { Initials } from '../persona/initials'
import { portrait } from '../persona/portrait'
import type { PersonaState } from '../persona/portrait'
import { DecisionBlock } from './decision-block'
import type { Decision } from './decision'
import { formatTurnTime } from './format-turn-time'
import type { UserIdentity } from './transcript-entry'

/**
 * The conversation turn — UX-DR25, DESIGN.md's *Conversation turn*. One
 * container, two grounds: a persona's turn and the user's own.
 *
 * **The words are not the harness's to touch.** `text` is rendered exactly as
 * given: split only on blank lines into paragraphs, set with `pre-wrap`, and
 * wrapped in nothing — no prefix, frame, label, summary or classification. The
 * persona's name, role and every word are React text, so anything a project or
 * a persona supplies renders as text and never as markup.
 */

/** Blank lines (a line holding only spaces or tabs counts) separate paragraphs. */
const PARAGRAPH_BREAK = /\r?\n(?:[ \t]*\r?\n)+/

/** The paragraphs of a turn's text; nothing else about it is changed. */
function paragraphsOf(text: string): string[] {
  return text.split(PARAGRAPH_BREAK).filter((paragraph) => paragraph.trim() !== '')
}

export function Words({ text }: { text: string }): JSX.Element {
  return (
    <div className="turn-words">
      {paragraphsOf(text).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  )
}

export function Head({ name, ident, at }: { name: string; ident: string; at: number }): JSX.Element {
  return (
    <div className="turn-head">
      <span className="turn-name">{name}</span>
      <span className="turn-role">{ident}</span>
      <span className="turn-time">{formatTurnTime(at)}</span>
    </div>
  )
}

/**
 * A persona's turn: their 32px portrait, name, role, time, and their words. A
 * decision they raised draws after the words, inside the turn; the words are
 * rendered whole either way.
 */
export function PersonaTurn({
  agent,
  at,
  text,
  state = 'idle',
  decision,
  onChoose
}: {
  agent: AgentView
  at: number
  text: string
  state?: PersonaState
  /** The question this turn ends in, when it can be answered now. */
  decision?: Decision
  /** Send an option's text as the user's turn. */
  onChoose?: (text: string) => void
}): JSX.Element {
  return (
    <div className="turn turn--persona">
      <div className="turn-av">{portrait(artParamsFor(agent.id), 32, state, agent)}</div>
      <div className="turn-body">
        <Head name={agent.name} ident={agent.title} at={at} />
        <Words text={text} />
        {decision !== undefined && onChoose !== undefined && (
          <DecisionBlock decision={decision} onChoose={onChoose} />
        )}
      </div>
    </div>
  )
}

export type { UserIdentity } from './transcript-entry'

const YOU: UserIdentity = { name: 'You', title: 'you' }

/**
 * The user's turn: the same container on the accent wash with its left rule,
 * and the 32px initials disc, since the person has no generated face.
 */
export function UserTurn({
  at,
  text,
  user = YOU,
  queuedFor,
  onCancel
}: {
  at: number
  text: string
  user?: UserIdentity
  /** The persona this message waits for; set while it is queued, dimmed and marked. */
  queuedFor?: string
  onCancel?: () => void
}): JSX.Element {
  return (
    <div className={queuedFor === undefined ? 'turn turn--user' : 'turn turn--user turn--queued'}>
      <div className="turn-av">
        <Initials {...user} size={32} />
      </div>
      <div className="turn-body">
        <Head name={user.name} ident={user.title} at={at} />
        <Words text={text} />
        {queuedFor !== undefined && (
          <div className="turn-queued">
            <span className="turn-queued-mark">{`queued · sends when ${queuedFor} finishes`}</span>
            {onCancel !== undefined && (
              <button
                type="button"
                className="turn-cancel"
                aria-label="cancel queued message"
                onClick={onCancel}
              >
                cancel
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
