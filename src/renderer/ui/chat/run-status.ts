import { sectionName } from '../../../shared/section-plan'
import type { PersonaState } from '../../../shared/events'
import { formatAge } from '../outputs/format-age'
import type { RunNote } from '../feed/memlog'
import { parseMemlog } from '../feed/memlog'
import { formatTurnTime } from './format-turn-time'
import { NO_PROGRESS } from './prose-store'
import type { RunProgress } from './prose-store'
import type { RunCardEntry } from './transcript-entry'

/**
 * The words a run card and its announcements are made of, as pure functions of
 * the card, so they read the same in the head, in the live region and in node.
 * Every state is a word: the dot beside it is never the only carrier.
 */

/** `1 section`, `15 sections`: the count of a document's committed headings. */
export function sectionCount(count: number): string {
  return `${count} ${count === 1 ? 'section' : 'sections'}`
}

/**
 * The names a card's subject has had confirmed written: those of its last
 * confirmed write, as the plan names them. None before one, or with no subject.
 */
export function subjectWritten(entry: RunCardEntry, path: string | undefined): readonly string[] {
  return (entry.documents.find((document) => document.path === path)?.sections ?? []).map(sectionName)
}

/** How many sections the card's subject at `path` has: none before its first confirmed write, or with no subject. */
export function subjectSections(entry: RunCardEntry, path: string | undefined): number {
  return entry.documents.find((document) => document.path === path)?.sections.length ?? 0
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
  if (!hasText) return ''
  const verb = progress.revising ? 'revising' : 'writing'
  return progress.section === undefined ? verb : `${verb} · §${progress.section.n} ${progress.section.name}`
}

/**
 * The head's status string: what the run is doing while it is in flight (see
 * `progressWords`), then `saved · <age> · N sections` with N the subject's,
 * `failed` or `stopped`. No denominator, and no word that stands in for
 * progress. A running card that holds no text (dead air) has an empty string:
 * the head then draws no status at all.
 */
export function runStatusText(
  entry: RunCardEntry,
  now: number,
  sections: number,
  progress: RunProgress = NO_PROGRESS,
  hasText: boolean = true
): string {
  switch (entry.status) {
    case 'running':
      return progressWords(progress, hasText)
    case 'finished':
      return `saved · ${formatAge(entry.endedAt ?? now, now)} · ${sectionCount(sections)}`
    case 'failed':
      return 'failed'
    case 'stopped':
      return 'stopped'
  }
}

/** The head's dot: amber while writing, green once saved, the error dot otherwise. */
export function runDotState(entry: RunCardEntry): PersonaState {
  if (entry.status === 'running') return 'work'
  return entry.status === 'finished' ? 'live' : 'error'
}

/**
 * The one polite announcement a lifecycle event earns: the persona and what
 * became of the run, with the subject's section count once saved. Prose and
 * notes are never announced here.
 */
export function runLifecycleLine(entry: RunCardEntry, name: string, sections: number): string {
  switch (entry.status) {
    case 'running':
      return `${name} · writing`
    case 'finished':
      return `${name} · saved · ${sectionCount(sections)}`
    case 'failed':
      return `${name} · failed`
    case 'stopped':
      return `${name} · stopped`
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
