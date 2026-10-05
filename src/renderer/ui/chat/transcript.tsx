import type { JSX } from 'react'

import { decisionOf } from './decision'
import type { ProseStore } from './prose-store'
import { RunCard } from './run-card'
import { RunCardLine } from './run-card-line'
import { isCollapsed } from './run-status'
import { Sysline } from './sysline'
import { PersonaTurn, UserTurn } from './turn'
import type { RunCardEntry, TranscriptEntry } from './transcript-entry'

/**
 * The transcript — a thread of turns in time order (UX-DR25).
 *
 * Entries arrive however the projection holds them; the transcript shows them
 * ascending by `at`, ties keeping their input order. Persona and user turns, and
 * the harness's own sysline between them, and the decision block, drawn inside the
 * last persona turn when it can be answered. A run's card sits among them where
 * its run started (Story 3.1), drawn when the window holds the prose store its
 * text is written from.
 * The markup is the shell's `.thread`, which already caps at `--thread-max`.
 */

export type { PersonaEntry, RunCardEntry, SyslineEntry, TranscriptEntry, UserEntry } from './transcript-entry'

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
  onStop
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
}): JSX.Element {
  const ordered = orderEntries(entries)
  const last = ordered.length - 1
  return (
    <>
      {ordered.map((entry, index) => {
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
          return (
            <RunCard
              key={entry.id}
              entry={entry}
              prose={prose}
              focusOnMount={focusing}
              onFocused={focusing ? collapse?.onFocused : undefined}
              onStop={onStop}
            />
          )
        }
        if (entry.kind === 'persona') {
          // A decision is read only from the last entry, and only while its persona can
          // take a reply: any later entry, a turn in flight or no session removes it.
          const agentId = entry.agent.id
          const decision =
            index === last && onChoose !== undefined && canAnswer?.(agentId) === true
              ? decisionOf(entry.text)
              : null
          return (
            <PersonaTurn
              key={entry.id}
              agent={entry.agent}
              at={entry.at}
              text={entry.text}
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
            user={entry.user}
            queuedFor={entry.queuedFor}
            onCancel={onCancel === undefined ? undefined : () => onCancel(entry.id)}
          />
        )
      })}
    </>
  )
}

export function Transcript({ entries }: { entries: readonly TranscriptEntry[] }): JSX.Element {
  return (
    <div className="thread">
      <Turns entries={entries} />
    </div>
  )
}
