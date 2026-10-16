import { nameKey, sectionName } from '../../../shared/section-plan'
import { STOPPED, progressLabel, reachedLabel, sectionCount, terminalLabel } from '../../../shared/section-progress'
import type { TerminalWord } from '../../../shared/section-progress'
import type { PersonaState } from '../../../shared/events'
import { formatAge } from '../outputs/format-age'
import { emphasisSpans } from '../feed/emphasis'
import type { RunNote } from '../feed/memlog'
import { parseMemlog } from '../feed/memlog'
import { formatTurnTime } from './format-turn-time'
import { NO_PROGRESS } from './prose-store'
import type { RunProgress } from './prose-store'
import type { RunCardEntry } from './transcript-entry'
import type { RunCardStep } from '../../../shared/conversation'

/**
 * The words a run card and its announcements are made of, as pure functions of
 * the card, so they read the same in the head, in the live region and in node.
 * Every state is a word: the dot beside it is never the only carrier. The
 * section count is spelled in `shared/section-progress` (`sectionCount`), so
 * the head, the live region and main's own line of a run that ended agree.
 */

/**
 * The names a card's subject has had confirmed written: those of its last
 * confirmed write, as the plan names them. None before one, or with no subject.
 */
export function subjectWritten(entry: RunCardEntry, path: string | undefined): readonly string[] {
  return (entry.documents.find((document) => document.path === path)?.sections ?? []).map(sectionName)
}

/**
 * What a terminal head reads: the word the run ended with, and the section it
 * reached — the last of `written`, by its place among them. The bare word when
 * nothing was confirmed: a section the prose announced but no `tool_result`
 * confirmed is not one reached, and the streamed store is never read for this.
 *
 * The place is counted among the names deduped by key, as the live head counts
 * it (`sectionProgress`): a document with two `## Goals` has one Goals, and a
 * section seen is never renumbered by the run ending.
 */
function reached(word: TerminalWord, written: readonly string[]): string {
  const name = written.at(-1)
  if (name === undefined) return terminalLabel(word)
  const keys: string[] = []
  for (const each of written) {
    const key = nameKey(each)
    if (!keys.includes(key)) keys.push(key)
  }
  return terminalLabel(word, { name, n: keys.indexOf(nameKey(name)) + 1 })
}

/**
 * What the head says of a run in flight: `writing`, then `writing · §N <Name>`
 * once the text shows a section, and `revising · §N <Name>` (or `revising`)
 * from an applied `Edit`. `N` is the section's place among those seen, never a
 * share of a total: there is no total.
 *
 * In dead air, with no document text held for the card, there is no word: no
 * feed states a phase, and `writing` before anything is written is a state
 * nothing drives. It returns with the first piece of prose.
 */
export function progressWords(progress: RunProgress, hasText: boolean = true): string {
  return hasText ? progressLabel(progress.revising, progress.section) : ''
}

/**
 * The head's status string: what the run is doing while it is in flight (see
 * `progressWords`), then `saved · <age> · N sections` with N the subject's,
 * or `failed` / `stopped` with the section the subject's last confirmed write
 * reached (`failed · §N <Name>`), and the bare word when nothing was
 * confirmed. No denominator, and no word that stands in for progress. A running
 * card that holds no text (dead air) has an empty string: the head then draws
 * no status at all.
 *
 * `written` is the subject's confirmed names (`subjectWritten`): the whole of
 * what a terminal head and the saved count are made of.
 */
export function runStatusText(
  entry: RunCardEntry,
  now: number,
  written: readonly string[],
  progress: RunProgress = NO_PROGRESS,
  hasText: boolean = true
): string {
  switch (entry.status) {
    case 'running':
      return progressWords(progress, hasText)
    case 'finished':
      return `saved · ${formatAge(entry.endedAt ?? now, now)} · ${sectionCount(written.length)}`
    case 'failed':
      return reached('failed', written)
    case 'stopped':
      return reached(STOPPED, written)
  }
}

/** The head's dot: amber while writing, green once saved, the error dot otherwise. */
export function runDotState(entry: RunCardEntry): PersonaState {
  if (entry.status === 'running') return 'work'
  return entry.status === 'finished' ? 'live' : 'error'
}

/**
 * The one polite announcement a lifecycle event earns: the persona and what
 * became of the run, with the subject's section count once saved and the
 * section its last confirmed write reached once it ended early. It follows the
 * head word for word (`runStatusText`). Prose and notes are never announced here.
 */
export function runLifecycleLine(entry: RunCardEntry, name: string, written: readonly string[]): string {
  switch (entry.status) {
    case 'running':
      return `${name} · writing`
    case 'finished':
      return `${name} · saved · ${sectionCount(written.length)}`
    case 'failed':
      return `${name} · ${reached('failed', written)}`
    case 'stopped':
      return `${name} · ${reached(STOPPED, written)}`
  }
}

/**
 * One memlog line as the run-note feed draws it: the entry taken apart by the
 * Epic 1 parser, and the time it was observed, since the format carries none.
 */
export function noteOf(text: string, at: number): RunNote {
  const parsed = parseMemlog(text)[0] ?? { kind: null, author: null, time: null, reason: text }
  return { ...parsed, time: formatTurnTime(at) }
}

/**
 * The one reason a collapsed card's line carries (Story 3.5): the reason of the
 * card's last `run:note`, as the feed draws it but plain (its `**` emphasis
 * markers are not shown, the line having no bold); when that is empty, or only
 * whitespace, the section the text has shown (`§N <Name>`, the same words the
 * head says); and with neither, the empty string, for the field to be absent.
 * Nothing stands in for it, and the start row (`run started`) is the feed's own
 * and is never a note.
 */
export function collapsedReason(entry: RunCardEntry, progress: RunProgress): string {
  const last = entry.notes.at(-1)
  if (last !== undefined) {
    const reason = emphasisSpans(noteOf(last.text, last.at).reason)
      .map((span) => span.text)
      .join('')
      .trim()
    if (reason !== '') {
      return reason
    }
  }
  return reachedLabel(progress.section)
}

/**
 * Whether a card is drawn as a line (Story 3.5): in flight, its persona not the
 * one viewed, and its run not one the user expanded. A card with no agent id is
 * never a viewed persona's, so it is collapsed too; a terminal card never is.
 */
export function isCollapsed(entry: RunCardEntry, viewedId: string | undefined, expanded: ReadonlySet<string>): boolean {
  // A skill-first session's card (Story 7.5) is drawn in that session's own thread and no other, so it is in view
  // wherever it is drawn: it never becomes a persona-less line.
  if (entry.skillSession !== undefined) {
    return false
  }
  return entry.status === 'running' && (entry.agentId === undefined || entry.agentId !== viewedId) && !expanded.has(entry.runId)
}

/**
 * The run's own start record, the first row of every card's body: made from the
 * card's `at`, with no kind and the reason `run started`. It is a record of
 * something that happened, not a sentence about waiting, and it is never stored
 * in `notes`: a card's last note stays the last `run:note`, and the fallback
 * before any note has arrived stays true.
 */
export function startNote(entry: RunCardEntry): RunNote {
  return { kind: null, author: null, time: formatTurnTime(entry.at), reason: 'run started' }
}

/** The rows of a card's body above its prose: the start row, then each `run:note` in order. */
export function bodyNotes(entry: RunCardEntry): RunNote[] {
  return [startNote(entry), ...entry.notes.map((note) => noteOf(note.text, note.at))]
}

/**
 * Whether a card writes a document, from what it already holds: a subject path
 * (the prose store's), a plan (the skill template's section spine, absent for a
 * skill without one) or any document a write was confirmed to. A card with none
 * is a run list alone: its head reads `run` and it has no foot (Story 3.17).
 */
export function writesDocument(entry: RunCardEntry, path: string | undefined): boolean {
  return (path !== undefined && path !== '') || (entry.plan?.length ?? 0) > 0 || entry.documents.length > 0
}

/** How a step row draws: a step still running on a card that is not is cut off, and draws as failed. */
export type StepState = 'done' | 'failed' | 'running'

/** One row of the run list, in fold order: a run note, or a step with the state it draws as and how long it took. */
export type RunListRow =
  | { kind: 'note'; note: RunNote }
  | { kind: 'step'; step: RunCardStep; state: StepState; elapsedMs: number }

/**
 * A step's state and duration. Running on a running card it is running, with no
 * duration to draw. Running on any other card it ended failed, at the step's own
 * `endedAt`, else the card's, else its own start: nothing on a terminal card
 * pulses or ticks.
 */
function stepRow(entry: RunCardEntry, step: RunCardStep): RunListRow {
  if (step.status === 'running' && entry.status === 'running') {
    return { kind: 'step', step, state: 'running', elapsedMs: 0 }
  }
  const state: StepState = step.status === 'done' ? 'done' : 'failed'
  const ended = step.endedAt ?? (step.status === 'running' ? entry.endedAt : undefined) ?? step.startedAt
  return { kind: 'step', step, state, elapsedMs: Math.max(0, ended - step.startedAt) }
}

/**
 * The card body's run list above its prose (Story 3.17), in fold order and never
 * by time: the start row, then for each step the notes not yet drawn up to the
 * count it recorded (`notesBefore`, clamped to the notes held), then the step,
 * and the remaining notes last. A card with no step reads as the notes alone.
 */
export function runListRows(entry: RunCardEntry): RunListRow[] {
  const notes = entry.notes.map((note) => noteOf(note.text, note.at))
  const rows: RunListRow[] = [{ kind: 'note', note: startNote(entry) }]
  let drawn = 0
  for (const step of entry.steps) {
    const upTo = Math.min(notes.length, Number.isFinite(step.notesBefore) ? Math.max(0, Math.floor(step.notesBefore)) : 0)
    for (; drawn < upTo; drawn += 1) {
      rows.push({ kind: 'note', note: notes[drawn] as RunNote })
    }
    rows.push(stepRow(entry, step))
  }
  for (; drawn < notes.length; drawn += 1) {
    rows.push({ kind: 'note', note: notes[drawn] as RunNote })
  }
  return rows
}
