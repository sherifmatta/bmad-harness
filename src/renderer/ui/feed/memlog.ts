/**
 * The `.memlog.md` entry format, read back.
 *
 * The format is not specified anywhere in prose that binds; it is whatever
 * `_bmad/scripts/memlog.py` writes, so every rule below is taken from that
 * writer rather than from a planning document:
 *
 *  - `cmd_append` collapses the entry's text with `" ".join(text.split())`
 *    before writing it, so **a multi-line entry is structurally impossible**
 *    and one line is one note.
 *  - The tag is `f"({label}) "` and is emitted only `if label`, so `- ()` is
 *    unreachable — but an empty `--text` is not, and `- (kind) ` with nothing
 *    after it is a real line the parser must keep rather than drop.
 *  - `label = f"{type} by {by}".strip()`, and the `.strip()` is the whole
 *    reason the kindless `(by author)` form exists: an entry recorded with an
 *    author and no type writes `- (by coach) …`.
 *  - `--type` and `--by` are free strings with no `choices=`, which is the
 *    executable form of FR41's "the vocabulary is open". Nothing here may
 *    reject a kind it has not seen.
 *  - Appends always go to the end of the body, so **file order is time order**,
 *    newest last. The parser preserves it and sorts nothing.
 *
 * There is no per-entry timestamp anywhere in the format, so `time` is always
 * `null` here. It is on `RunNote` regardless because Epic 3 fills it from when
 * the harness *observed* the append, and the row that renders an absent time
 * is the one this story has to get right (FR40).
 *
 * DOM-free by construction: `tests/` imports this into the node program, which
 * has no DOM lib — the same constraint `a11y/roving-tabindex.ts` states.
 */

/** One entry of a memlog, with its tag taken apart. */
export type RunNote = {
  /** The entry's kind, lower-cased and trimmed, or `null` for an untagged entry. */
  kind: string | null
  /** Who the entry was recorded for, or `null` when no authorship was recorded. */
  author: string | null
  /** Always `null` from a file: the format carries no per-entry timestamp. */
  time: string | null
  /** Everything after the tag, verbatim. Empty is a legal entry, not a defect. */
  reason: string
}

/**
 * The tag, matched non-greedily. This is not a style choice: 139 of the 267
 * entries in this repository's five memlogs contain a `)` in the reason, so
 * `\((.*)\)` swallows to the last paren and yields a kind like
 * `event) Create from … harness-mockup.html` for the majority of the corpus.
 * `[^)]*` stops at the first `)`, which is where the writer's tag ends.
 *
 * The single optional space after the tag is the one the writer emits; a
 * reason that begins with further whitespace keeps it, because the writer
 * collapsed the text before writing and anything left is the text itself.
 */
const TAGGED = /^- \(([^)]*)\)\s?(.*)$/

/** The attribution separator the writer inserts between type and author. */
const BY = ' by '

/** What disqualifies a parenthesis from being a tag: a kind is one word. */
const WHITESPACE = /\s/

/**
 * Split `label` into kind and author at the **first** ` by `, so the author
 * keeps any ` by ` of its own.
 *
 * The writer inserts exactly one ` by ` — at the boundary between `--type` and
 * `--by` — and both are unvalidated free strings, so a label carrying two is
 * ambiguous on re-read and the parser has to pick which side keeps the extra.
 * It gives it to the author: `--by` is the free-text half in practice (it
 * names a person or a role), while every kind in the corpus is a single word.
 * So `(idea by van by der)` reads as `idea` recorded by `van by der`, and the
 * author is recovered verbatim.
 */
function splitLabel(label: string): { kind: string | null; author: string | null } | null {
  if (label === '') {
    return { kind: null, author: null }
  }

  // The kindless form: `.strip()` in the writer turns " by coach" into
  // "by coach", which carries no leading space for `indexOf` to find. There is
  // no kind to validate, and an author may be any free text.
  if (label.startsWith('by ')) {
    return { kind: null, author: label.slice(3) || null }
  }

  const at = label.indexOf(BY)
  const kind = normalise(at === -1 ? label : label.slice(0, at))

  // A kind is one word. `--type` is a single token in every entry the corpus
  // holds, and the writer puts nothing else on that side of ` by `, so a
  // parenthesis carrying a phrase was never a tag: an untagged entry whose
  // text happens to open with one — `- (see note A) real text` — must keep
  // its words rather than lose them to a kind nobody wrote.
  if (kind !== null && WHITESPACE.test(kind)) {
    return null
  }

  return at === -1
    ? { kind, author: null }
    : { kind, author: label.slice(at + BY.length) || null }
}

/** A kind as the treatment lookup expects it: trimmed, lower-cased, never empty. */
function normalise(kind: string): string | null {
  const trimmed = kind.trim().toLowerCase()
  return trimmed === '' ? null : trimmed
}

/**
 * The body, with the frontmatter block removed.
 *
 * The fences are a line that is *exactly* `---`, which is `memlog.py`'s own
 * rule and is why a `---` inside a free-text field never truncates the block.
 * An unterminated block is left alone rather than swallowing the file: the
 * dash-space test below already rejects a fence, so nothing is rendered from
 * it either way, and refusing to parse would break the promise that this
 * function does not throw.
 */
function body(text: string): string[] {
  const lines = text.split('\n')
  if (lines[0] !== '---') {
    return lines
  }
  const close = lines.indexOf('---', 1)
  return close === -1 ? lines : lines.slice(close + 1)
}

/**
 * Every entry of a memlog, in file order, newest last.
 *
 * Total by design: no input throws, and an empty file, a frontmatter-only file
 * and a file of prose all answer `[]`. A leading parenthesis that carries a
 * phrase rather than a one-word kind is not a tag, so the entry keeps its text. A body line that does not start with
 * `- ` is not an entry and is ignored — which is also how the writer counts
 * them (`entry_count`), and why the `---` fences can never be read as one.
 */
export function parseMemlog(text: string): RunNote[] {
  const notes: RunNote[] = []

  for (const line of body(text)) {
    if (!line.startsWith('- ')) {
      continue
    }

    const tagged = TAGGED.exec(line)
    if (tagged === null) {
      notes.push({ kind: null, author: null, time: null, reason: line.slice(2) })
      continue
    }

    const label = splitLabel(tagged[1].trim())
    if (label === null) {
      notes.push({ kind: null, author: null, time: null, reason: line.slice(2) })
      continue
    }
    notes.push({ ...label, time: null, reason: tagged[2] })
  }

  return notes
}
