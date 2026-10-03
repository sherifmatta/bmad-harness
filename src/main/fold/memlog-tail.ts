/**
 * The new entries of a `.memlog.md`: given how many entries were already seen
 * and the file as it stands now, the entry lines past that count, in file
 * order, and the new count. Pure: text in, lines out.
 *
 * An entry is a body line starting `- `, which is how `_bmad/scripts/memlog.py`
 * counts them (`entry_count`) and how the renderer's `parseMemlog` reads them;
 * the frontmatter between the two `---` fences is never an entry. Appends
 * always go to the end of the body, so file order is time order and the entries
 * past the count are the ones appended since.
 *
 * A file with fewer entries than were seen was rewritten, not appended to: it
 * yields nothing, and its count becomes what it now holds, so an append after
 * it is read from there.
 */

export type MemlogTail = { entries: string[]; count: number }

function body(lines: string[]): string[] {
  if (lines[0] !== '---') return lines
  const close = lines.indexOf('---', 1)
  return close === -1 ? lines : lines.slice(close + 1)
}

/** Every entry line of a memlog, in file order. */
export function memlogEntries(text: string): string[] {
  return body(text.split(/\r?\n/)).filter((line) => line.startsWith('- '))
}

export function tailMemlog(emitted: number, text: string): MemlogTail {
  const entries = memlogEntries(text)
  if (entries.length <= emitted) {
    return { entries: [], count: entries.length }
  }
  return { entries: entries.slice(emitted), count: entries.length }
}
