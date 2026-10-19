import type { JSX } from 'react'

import './turn.css'
import type { AgentView } from '../../../shared/install'
import { MarkdownBody } from '../doc/markdown-body'
import { Initials, SkillDisc } from '../persona/initials'
import { Caret } from './caret'
import { DecisionBlock } from './decision-block'
import type { Decision } from './decision'
import { formatTurnTime } from './format-turn-time'
import type { UserIdentity } from './transcript-entry'
import { TurnState } from './turn-state'

/**
 * The conversation turn — UX-DR25, DESIGN.md's *Conversation turn*. A flat row:
 * an initials disc, a head line and the words, for a persona and for the user.
 *
 * **The words are not the harness's to touch.** `text` is never prefixed, framed,
 * labelled, summarised or classified. The user's turn, a turn still in flight and a
 * turn the sanitiser could not draw are `Words`: split only on blank lines into
 * paragraphs, set with `pre-wrap`. A persona's completed turn is read as markdown
 * (Story 7.2, FR130) through the document window's one pipeline and `MarkdownBody`,
 * under the chat's own `turn-md`; nothing a project or a persona supplies reaches
 * the page except through that pipeline's allow-list. The persona's name, role and
 * the user's words are React text, so they render as text and never as markup.
 */

/** Blank lines (a line holding only spaces or tabs counts) separate paragraphs. */
const PARAGRAPH_BREAK = /\r?\n(?:[ \t]*\r?\n)+/

/** The paragraphs of a turn's text; nothing else about it is changed. */
function paragraphsOf(text: string): string[] {
  return text.split(PARAGRAPH_BREAK).filter((paragraph) => paragraph.trim() !== '')
}

/**
 * A turn's words, one paragraph to each run between blank lines. While they are
 * still being written (`caret`), the caret sits at the tail of the last paragraph,
 * after the words and apart from them; with no word yet it is the body alone. The
 * words themselves are the same either way.
 */
export function Words({ text, caret = false }: { text: string; caret?: boolean }): JSX.Element {
  const paragraphs = paragraphsOf(text)
  const last = paragraphs.length - 1
  return (
    <div className="turn-words">
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          {paragraph}
          {caret && index === last && <Caret />}
        </p>
      ))}
      {caret && last === -1 && (
        <p>
          <Caret />
        </p>
      )}
    </div>
  )
}

/**
 * A persona's words, for the thread and the room alike. While the turn is in
 * flight (`writing` set) they are plain text with the caret at the tail, and the
 * markdown pipeline is not touched. Once it is not in flight, including a turn
 * read back from a stored transcript, they are drawn once through `MarkdownBody`
 * under the chat's own `turn-md`. Where the pipeline gives nothing back for words
 * that were not blank, they stay plain text.
 */
export function PersonaWords({ text, writing }: { text: string; writing?: Writing }): JSX.Element {
  if (writing !== undefined) {
    return <Words text={text} caret />
  }
  return <MarkdownBody className="turn-md" text={text} fallback={<Words text={text} />} />
}

/** A turn in flight: when it began, where that is known. */
export type Writing = { since: number | undefined }

export function Head({ name, ident, at, mono = false }: { name: string; ident?: string; at: number; mono?: boolean }): JSX.Element {
  return (
    <div className="turn-head">
      {mono ? <span className="turn-name turn-name--mono">{name}</span> : <span className="turn-name">{name}</span>}
      {ident !== undefined && <span className="turn-role">{ident}</span>}
      <span className="turn-time">{formatTurnTime(at)}</span>
    </div>
  )
}

/**
 * A skill-first session's turn (Story 7.5): the `/` disc, the skill's name in mono, the time, and its words, with no role or
 * title slot. Read as a persona's are, as markdown once complete and plain text with the caret while in flight.
 */
export function SkillTurn({
  name,
  at,
  text,
  writing
}: {
  /** The speaker: the name of the skill the session was started with. */
  name: string
  at: number
  text: string
  writing?: Writing
}): JSX.Element {
  return (
    <div className="turn turn--persona">
      <div className="turn-av">
        <SkillDisc size={26} />
      </div>
      <div className="turn-body">
        <Head name={name} at={at} mono />
        <PersonaWords text={text} writing={writing} />
        {writing !== undefined && <TurnState since={writing.since} />}
      </div>
    </div>
  )
}

/** A skill's turn in flight before its first word: the same disc and head, the caret as the body, hidden from a reader as a persona's pending turn is. */
export function PendingSkillTurn({ name, since }: { name: string; since: number }): JSX.Element {
  return (
    <div className="turn turn--persona turn--pending" aria-hidden="true">
      <div className="turn-av">
        <SkillDisc size={26} />
      </div>
      <div className="turn-body">
        <Head name={name} at={since} mono />
        <Words text="" caret />
        <TurnState since={since} />
      </div>
    </div>
  )
}

/**
 * A persona's turn: their initials disc, name, role, time, and their words. A
 * decision they raised draws after the words, inside the turn; the words are
 * rendered whole either way. While the turn is still in flight (`writing`), the
 * caret sits at the tail of the words and the `work` state line under them.
 */
export function PersonaTurn({
  agent,
  at,
  lead,
  text,
  writing,
  decision,
  onChoose
}: {
  agent: AgentView
  at: number
  /**
   * The words of the activation reply this turn is drawn joined with (Story 8.3): their own block above `text`, whole,
   * under the one head. Absent on every turn that is not that join.
   */
  lead?: string
  text: string
  /** Set while this is the turn in flight: the words so far, with the caret and the state line. */
  writing?: Writing
  /** The question this turn ends in, when it can be answered now. */
  decision?: Decision
  /** Send an option's text as the user's turn. */
  onChoose?: (text: string) => void
}): JSX.Element {
  return (
    <div className="turn turn--persona">
      <div className="turn-av">
        <Initials {...agent} size={26} />
      </div>
      <div className="turn-body">
        <Head name={agent.name} ident={agent.title} at={at} />
        {lead !== undefined && <PersonaWords text={lead} />}
        <PersonaWords text={text} writing={writing} />
        {writing !== undefined && <TurnState since={writing.since} />}
        {decision !== undefined && onChoose !== undefined && (
          <DecisionBlock decision={decision} onChoose={onChoose} />
        )}
      </div>
    </div>
  )
}

/**
 * A persona's turn in flight before its first word: the same disc and head
 * (timed from when the turn began), the caret as the whole body, and the `work`
 * state line under it. It is no entry: it is drawn from the persona's state and
 * goes when the words arrive or the turn ends. Hidden from a reader as a whole,
 * since everything in it is the indicator and the tile says the same state.
 */
export function PendingTurn({ agent, since }: { agent: AgentView; since: number }): JSX.Element {
  return (
    <div className="turn turn--persona turn--pending" aria-hidden="true">
      <div className="turn-av">
        <Initials {...agent} size={26} />
      </div>
      <div className="turn-body">
        <Head name={agent.name} ident={agent.title} at={since} />
        <Words text="" caret />
        <TurnState since={since} />
      </div>
    </div>
  )
}

export type { UserIdentity } from './transcript-entry'

const YOU: UserIdentity = { name: 'You', title: 'you' }

/**
 * The user's turn: the same flat row as a persona's, with the initials disc
 * tinted for you alone, since the person has no generated face.
 */
export function UserTurn({
  at,
  text,
  mention,
  user = YOU,
  queuedFor,
  onCancel
}: {
  at: number
  text: string
  /** The `@name` typed to hand off to this persona (AD-25): drawn as a chip before the words, never part of them. */
  mention?: string
  user?: UserIdentity
  /** The persona this message waits for; set while it is queued, dimmed and marked. */
  queuedFor?: string
  onCancel?: () => void
}): JSX.Element {
  return (
    <div className={queuedFor === undefined ? 'turn turn--user' : 'turn turn--user turn--queued'}>
      <div className="turn-av">
        <Initials {...user} size={26} you />
      </div>
      <div className="turn-body">
        <Head name={user.name} ident={user.title} at={at} />
        {mention === undefined ? (
          <Words text={text} />
        ) : (
          <div className="turn-said">
            <span className="turn-mention">{mention}</span>{' '}
            <Words text={text} />
          </div>
        )}
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
