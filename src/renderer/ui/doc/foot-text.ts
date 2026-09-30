import type { DocSnapshot, DocState } from '../../../shared/document'

/**
 * What the document window's foot says (UX-DR27). The vocabulary is fixed, in
 * the harness's microcopy: lower case, `·` between facts, and never a sentence
 * that advises what to do next.
 */
const STATE_LINE: Record<DocState, string> = {
  present: 'separate window · read-only preview · reloads on write',
  missing: 'no longer on disk',
  refused: 'outside _bmad/ · not opened',
  unreadable: 'could not be read',
  binary: 'not text · not shown'
}

/** The state line for one state. */
export function stateLine(state: DocState): string {
  return STATE_LINE[state]
}

/** The foot's left side: the state line, or nothing before the first snapshot. */
export function footLeft(snapshot: DocSnapshot | null): string {
  return snapshot === null ? '' : stateLine(snapshot.state)
}

/**
 * The foot's right side: how the text is being read, and — only when the file
 * was larger than the window reads — how much of it.
 */
export function footRight(snapshot: DocSnapshot | null): string {
  if (snapshot === null) {
    return ''
  }
  const read = `${snapshot.kind} · utf-8`
  return snapshot.truncated ? `${read} · first 1 MiB` : read
}
