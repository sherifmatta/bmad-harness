import type { PersonaState } from '../persona/portrait'
import { formatAge } from '../outputs/format-age'
import type { RunNote } from '../feed/memlog'
import { parseMemlog } from '../feed/memlog'
import { formatTurnTime } from './format-turn-time'
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

/** How many sections the card's subject at `path` has: none before its first confirmed write, or with no subject. */
export function subjectSections(entry: RunCardEntry, path: string | undefined): number {
  return entry.documents.find((document) => document.path === path)?.sections.length ?? 0
}

/**
 * The head's status string: `writing` while the run is in flight, then
 * `saved · <age> · N sections` with N the subject's, `failed` or `stopped`. No
 * denominator, and no word that stands in for progress.
 */
export function runStatusText(entry: RunCardEntry, now: number, sections: number): string {
  switch (entry.status) {
    case 'running':
      return 'writing'
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
