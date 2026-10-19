import type { JSX } from 'react'

import type { AgentView } from '../../../shared/install'
import { decisionOf } from './decision'
import type { ProseStore } from './prose-store'
import { RunCard } from './run-card'
import { RunCardLine } from './run-card-line'
import { isCollapsed } from './run-status'
import { Sysline } from './sysline'
import { PendingSkillTurn, PendingTurn, PersonaTurn, SkillTurn, UserTurn } from './turn'
import { isEntryInPersonaThread } from './transcript-entry'
import type { PersonaEntry, RunCardEntry, TranscriptEntry } from './transcript-entry'

/**
 * The transcript — a thread of turns in time order (UX-DR25).
 *
 * Entries arrive however the projection holds them; the transcript shows them
 * ascending by `at`, ties keeping their input order, except that the user's messages
 * still queued come last, as they have not been sent. Persona and user turns, and
 * the harness's own sysline between them, and the decision block, drawn inside the
 * last persona turn when it can be answered. A run's card sits among them where
 * its run started (Story 3.1), drawn when the window holds the prose store its
 * text is written from.
 * The markup is the shell's `.thread`, which already caps at `--thread-max`.
 */

export type { PersonaEntry, RunCardEntry, SkillEntry, SyslineEntry, TranscriptEntry, UserEntry } from './transcript-entry'

/**
 * The entries ascending by `at`, stable: equal times keep the order they came
 * in. Insertion from the tail, so an already-ordered transcript — the usual
 * case — costs one comparison per entry. Returns a new array and leaves the
 * input as it was.
 */
export function orderEntries<T extends { at: number }>(entries: readonly T[]): T[] {
  const ordered: T[] = []
  for (const entry of entries) {
    let at = ordered.length
    while (at > 0 && ordered[at - 1].at > entry.at) {
      at -= 1
    }
    ordered.splice(at, 0, entry)
  }
  return ordered
}

/**
 * The one card pinned to the top of the chat column (Story 3.14): among the
 * entries, the run card of `agentId` that is in flight. With several sessions of
 * that persona running, the greatest `at` wins, ties going to the later entry;
 * the others stay in the thread. A card with no agent id is never pinned, and
 * with no viewed persona (`agentId` undefined) nothing is.
 */
export function pinnedRun(entries: readonly TranscriptEntry[], agentId: string | undefined): RunCardEntry | null {
  if (agentId === undefined) {
    return null
  }
  let pinned: RunCardEntry | null = null
  for (const entry of entries) {
    if (
      entry.kind === 'run' &&
      entry.status === 'running' &&
      entry.agentId === agentId &&
      (pinned === null || entry.at >= pinned.at)
    ) {
      pinned = entry
    }
  }
  return pinned
}

/**
 * How the window has the run cards of personas that are not viewed (Story 3.5):
 * a card in flight for another persona is drawn as one line, unless the user
 * expanded its run. Without it every card is drawn full.
 */
export type RunCollapse = {
  /** The viewed persona's id: its running card is the pinned one, never a line. */
  viewedId: string | undefined
  /** The ids of the runs the user expanded; the window holds them. */
  expanded: ReadonlySet<string>
  /** A persona's name as a card says it: the roster's, else an orphan's, else the id. */
  nameOf: (agentId: string | undefined) => string
  /** The line was activated: the window records the run as expanded. */
  onExpand: (runId: string) => void
  /** The run whose card, drawn now in place of its line, takes focus as it mounts. */
  focusRunId?: string | undefined
  /** That card took focus: the request is spent. */
  onFocused?: () => void
  /** The run main raised the window for (Story 3.10): its card scrolls into view once. */
  revealRunId?: string | undefined
  /** That card scrolled into view: the request is spent. */
  onRevealed?: () => void
}

/**
 * A persona's turn in flight, as the 1:1 thread draws it (`personaTurnsInFlight`, with the persona
 * resolved): when it began, and the entry its words are being written into, if any yet.
 */
export type PersonaInFlight = { agent: AgentView; since: number; entryId: string | undefined }

/**
 * The skill-first session a thread is drawn for (Story 7.5): its id, the skill's name as every line of it is
 * spoken, and the turn in flight there, if one is (`skillTurnInFlight`). A thread drawn with none is the shared
 * one, which draws nothing a skill-first session made.
 */
export type SkillView = {
  sessionId: string
  name: string
  inFlight?: { since: number; entryId: string | undefined } | undefined
}

/** Whether an entry is a message of the user's still queued: those stay at the very foot. */
function isQueuedEntry(entry: TranscriptEntry): boolean {
  return entry.kind === 'user' && entry.queuedFor !== undefined
}

/**
 * The turns alone, with no thread around them: for a surface, like the shell,
 * that already provides the `.thread` they sit in.
 */
export function Turns({
  entries,
  onCancel,
  canAnswer,
  onChoose,
  prose,
  pinnedRunId,
  collapse,
  onStop,
  inFlight = [],
  skillView,
  personaView
}: {
  entries: readonly TranscriptEntry[]
  /** Take a queued message back, by its entry id. */
  onCancel?: (entryId: string) => void
  /** Whether a persona has a live session with no turn in flight, so a reply can be sent now. */
  canAnswer?: (agentId: string) => boolean
  /** Send an option's text to a persona as the user's turn. */
  onChoose?: (agentId: string, text: string) => void
  /** Where each run's document text is held; without it no run card is drawn. */
  prose?: ProseStore
  /** The run whose card is drawn in the shell's pinned slot instead (Story 3.14): its entry is skipped here. */
  pinnedRunId?: string
  /** A card in flight for a persona not viewed draws as one line (Story 3.5); without this every card is full. */
  collapse?: RunCollapse
  /** Handed to each run card and line as it is, for the control it draws while its run is in flight. */
  onStop?: (runId: string) => void
  /**
   * The personas with a turn in flight, by main's state alone. One with words so far has the caret
   * and its state line on the entry they are in; one with none yet has a pending turn at the foot,
   * above the user's messages still queued.
   */
  inFlight?: readonly PersonaInFlight[]
  /**
   * Draw one skill-first session's thread (Story 7.5) instead of the shared one: only the entries flagged as
   * that session's, spoken as the skill. Left out, no entry of any skill-first session is drawn.
   */
  skillView?: SkillView
  /**
   * Draw one persona's thread (Story 8.1): only the entries that are in it (`isEntryInPersonaThread`), and only
   * that persona's turn in flight. This is the one filter of the persona chat: another persona's turns, the user's
   * turns to it, harness lines about its session and its run cards are in the stored transcript and drawn in theirs.
   * Left out (and no `skillView`), the entries of no skill-first session and of no room are drawn, as before.
   */
  personaView?: string
}): JSX.Element {
  // What the room said, or the user said into it, belongs to the party thread (Stories 4.1, 4.2):
  // a persona's thread never draws it. What a skill-first session made belongs to its own thread alone (Story 7.5):
  // the shared one draws none of it, and its own draws nothing else. A persona's chat draws its own thread alone (Story 8.1).
  const own = orderEntries(
    personaView !== undefined && skillView === undefined
      ? entries.filter((entry) => isEntryInPersonaThread(entry, personaView))
      : entries.filter(
          (entry) =>
            entry.skillSession === skillView?.sessionId && (entry.kind === 'run' || entry.room !== true)
        )
  )
  // Only the viewed persona's turn in flight: another persona's is drawn in its own chat.
  const turns = personaView === undefined ? inFlight : inFlight.filter((turn) => turn.agent.id === personaView)
  // A message still queued is drawn after everything else, in its own order: it has not been sent, so
  // a reply that lands meanwhile goes above it, where the pending turn stood, and never jumps across it.
  const ordered = [...own.filter((entry) => !isQueuedEntry(entry)), ...own.filter(isQueuedEntry)]
  const last = ordered.length - 1
  const writing = new Map<string, number>()
  for (const turn of turns) {
    if (turn.entryId !== undefined) {
      writing.set(turn.entryId, turn.since)
    }
  }
  if (skillView?.inFlight?.entryId !== undefined) {
    writing.set(skillView.inFlight.entryId, skillView.inFlight.since)
  }
  const unspoken = turns.filter((turn) => turn.entryId === undefined)
  // The pending turns sit after the last entry that is not a queued message of the user's.
  const foot = ordered.length - own.filter(isQueuedEntry).length
  // The activation reply and the persona turn directly after it are one turn (Story 8.3): only an entry main flagged
  // `activation` joins, and only the next entry of the same persona that is not itself flagged. Adjacency alone joins nothing.
  const joinedTo = (index: number): PersonaEntry | undefined => {
    const first = ordered[index]
    const next = ordered[index + 1]
    return first?.kind === 'persona' &&
      first.activation === true &&
      next?.kind === 'persona' &&
      next.activation !== true &&
      next.agent.id === first.agent.id
      ? next
      : undefined
  }
  const consumed = (index: number): boolean => index > 0 && joinedTo(index - 1) !== undefined
  const drawn = (entry: TranscriptEntry, index: number): JSX.Element | null => {
    if (consumed(index)) {
      return null
    }
    if (entry.kind === 'sysline') {
      return <Sysline key={entry.id} text={entry.text} />
    }
    if (entry.kind === 'run') {
      if (prose === undefined || entry.id === pinnedRunId) {
        return null
      }
      if (collapse !== undefined && isCollapsed(entry, collapse.viewedId, collapse.expanded)) {
        return (
          <RunCardLine
            key={entry.id}
            entry={entry}
            name={collapse.nameOf(entry.agentId)}
            prose={prose}
            onExpand={collapse.onExpand}
            onStop={onStop}
          />
        )
      }
      const focusing = collapse?.focusRunId === entry.runId
      const revealing = collapse?.revealRunId === entry.runId
      return (
        <RunCard
          key={entry.id}
          entry={entry}
          prose={prose}
          focusOnMount={focusing}
          onFocused={focusing ? collapse?.onFocused : undefined}
          onStop={onStop}
          reveal={revealing}
          onRevealed={revealing ? collapse?.onRevealed : undefined}
        />
      )
    }
    if (entry.kind === 'skill') {
      const since = writing.get(entry.id)
      return (
        <SkillTurn
          key={entry.id}
          name={skillView?.name ?? ''}
          at={entry.at}
          text={entry.text}
          writing={writing.has(entry.id) ? { since } : undefined}
        />
      )
    }
    if (entry.kind === 'persona') {
      // A decision is read only from the last entry, and only while its persona can
      // take a reply: any later entry, a turn in flight or no session removes it.
      const agentId = entry.agent.id
      const answer = joinedTo(index)
      // Joined, the words and the decision are the answer's; the turn is in flight if either part is, and keeps the reply's key.
      const spoken = answer ?? entry
      const decision =
        index + (answer === undefined ? 0 : 1) === last && onChoose !== undefined && canAnswer?.(agentId) === true
          ? decisionOf(spoken.text)
          : null
      const writer = writing.has(spoken.id) ? spoken.id : entry.id
      const since = writing.get(writer)
      return (
        <PersonaTurn
          key={entry.id}
          agent={entry.agent}
          at={entry.at}
          {...(answer === undefined ? {} : { lead: entry.text })}
          text={spoken.text}
          writing={writing.has(writer) ? { since } : undefined}
          decision={decision ?? undefined}
          onChoose={onChoose === undefined ? undefined : (text) => onChoose(agentId, text)}
        />
      )
    }
    return (
      <UserTurn
        key={entry.id}
        at={entry.at}
        text={entry.text}
        mention={entry.mention}
        user={entry.user}
        queuedFor={entry.queuedFor}
        onCancel={onCancel === undefined ? undefined : () => onCancel(entry.id)}
      />
    )
  }
  // One list, keyed, so an entry keeps its node when the pending turns come and go above it.
  const drawnEntries = ordered.map(drawn)
  const pendingSkill = skillView?.inFlight !== undefined && skillView.inFlight.entryId === undefined ? skillView : undefined
  drawnEntries.splice(
    foot,
    0,
    ...unspoken.map((turn) => <PendingTurn key={`in-flight-${turn.agent.id}`} agent={turn.agent} since={turn.since} />)
  )
  if (pendingSkill?.inFlight !== undefined) {
    drawnEntries.splice(foot + unspoken.length, 0, <PendingSkillTurn key={`in-flight-${pendingSkill.sessionId}`} name={pendingSkill.name} since={pendingSkill.inFlight.since} />)
  }
  return <>{drawnEntries}</>
}

export function Transcript({ entries }: { entries: readonly TranscriptEntry[] }): JSX.Element {
  return (
    <div className="thread">
      <Turns entries={entries} />
    </div>
  )
}
