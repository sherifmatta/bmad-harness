import { scanHeadings } from './section-headings'
import { nameKey, sectionName } from './section-plan'

/**
 * Where a document's text has got to, as the card's head and the rail's
 * annotation both say it: one definition, so the two cannot disagree. Pure:
 * text in, progress out, no clock and no I/O.
 *
 * A section is *seen* once its heading has been streamed whole: a heading on the
 * text's last line with no newline after it may be half streamed (`## 3. Glo`)
 * and is not yet seen. `seen` is the names the text has shown, in the order they
 * were first seen, and only ever appended to by its holder: a name seen is never
 * renumbered, and there is no total to count against.
 */

/** A section's name and its 1-based place among those seen. */
export type SectionPlace = { name: string; n: number }

/** The names seen so far, and the section the text is at: none until it shows a heading. */
export type SectionProgress = { seen: readonly string[]; section?: SectionPlace }

/** How many characters two texts share from their starts: where an `Edit` first changed the document. */
export function commonPrefix(a: string, b: string): number {
  const limit = Math.min(a.length, b.length)
  let at = 0
  while (at < limit && a.charCodeAt(at) === b.charCodeAt(at)) at += 1
  return at
}

/**
 * Read `text` against the names `held` has seen: the names it adds, appended in
 * the order they appear (`held` itself when it adds none), and the section it is
 * at. That is the last heading of the text, or, given a `revisionOffset` (where
 * an applied `Edit` first changed the document), the heading of the section
 * holding that character. The section is placed by its index in the names seen,
 * and is absent while the text shows no heading.
 */
export function sectionProgress(text: string, held: readonly string[], revisionOffset?: number): SectionProgress {
  const unterminated = !text.endsWith('\n')
  const headings = scanHeadings(text).filter(({ offset }) => !unterminated || text.indexOf('\n', offset) !== -1)
  const keys = new Set(held.map(nameKey))
  const added: string[] = []
  for (const heading of headings) {
    const name = sectionName(heading.name)
    const key = nameKey(name)
    if (keys.has(key)) continue
    keys.add(key)
    added.push(name)
  }
  const seen = added.length === 0 ? held : [...held, ...added]

  let at: string | undefined
  if (revisionOffset === undefined) {
    const last = headings.at(-1)
    at = last === undefined ? undefined : sectionName(last.name)
  } else {
    for (const heading of headings) {
      if (heading.offset > revisionOffset) break
      at = sectionName(heading.name)
    }
  }
  const key = at === undefined ? undefined : nameKey(at)
  const n = key === undefined ? 0 : seen.findIndex((name) => nameKey(name) === key) + 1
  return at === undefined || n === 0 ? { seen } : { seen, section: { name: at, n } }
}

/**
 * The words for where a document is: `writing`, then `writing · §N <Name>` once
 * the text shows a section, and `revising` / `revising · §N <Name>` from an
 * applied `Edit`. `N` is the section's place among those seen, never a share of
 * a total.
 */
export function progressLabel(revising: boolean, section?: SectionPlace): string {
  return placed(revising ? 'revising' : 'writing', section)
}

/**
 * The word a stopped run reads, in the card's head and on the rail's row alike.
 * The row says no more than this for a run that failed either: it is told only
 * that the stream is no longer writing the file, never why.
 */
export const STOPPED = 'stopped'

/**
 * The word a row reads while two or more runs that have not ended each hold it,
 * on the rail alone: a run holds a file from its first piece of it until its own
 * run ends, however long ago it last wrote it. It says that more than one holds
 * the file, and who; never which wrote last, because the harness does not know,
 * and never what to do about it.
 */
export const CONTENTION = 'contention'

/** The two words a run can end with: the rail says only the first, the card's head says either. */
export type TerminalWord = typeof STOPPED | 'failed'

/**
 * A section's place as every label spells it: `§N <Name>`, and the empty string
 * with no section. One definition, so the head, the rail, the collapsed line and
 * a terminal card cannot spell it differently.
 */
export function reachedLabel(section?: SectionPlace): string {
  return section === undefined ? '' : `§${section.n} ${section.name}`
}

/** A word and the place it is at, joined; the bare word when there is no place. */
function placed(word: string, section?: SectionPlace): string {
  const place = reachedLabel(section)
  return place === '' ? word : `${word} · ${place}`
}

/**
 * What a terminal card's head reads: the word a run ended with, and the place
 * its last confirmed write reached, when it had one.
 */
export function terminalLabel(word: TerminalWord, section?: SectionPlace): string {
  return placed(word, section)
}
