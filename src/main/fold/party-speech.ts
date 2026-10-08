/**
 * Who is speaking in a room, read from the room's own text — pure, no I/O, no clock.
 *
 * The party skill weaves one conversation and marks each turn with
 * `{icon} **{name}:**` (`.claude/skills/bmad-party-mode/SKILL.md`, "One exchange,
 * woven"). That marker is the only thing the harness attributes by: it never
 * guesses who spoke, and it writes no word of its own. A marker is, at the start
 * of a line, an optional icon (up to eight characters that are not blanks, then a
 * space), then `**Name:**` or `**Name**:`, and the blanks after it.
 *
 * Text streams in pieces, so a marker can arrive split. The scan holds back the
 * start of a line only while that text could still become a marker: never more
 * than one line, never more than `HOLD_MAX` characters. A line that cannot be a
 * marker is released as speech at once; a held line is released the same way at
 * the end of its block (`flushScan`).
 *
 * What comes out is a sequence of pieces, in order: a marker (the name it gave,
 * untouched) or speech (the characters between markers, untouched). Matching a name
 * to the roster, counting turns and saying who spoke is the caller's.
 */

/** The longest line held back while it may still turn out to be a marker. */
export const HOLD_MAX = 80

/** The scan's memory between pieces of text. */
export type Scan = {
  /** The start of a line that may still become a marker, held until it can be told. */
  held: string
  /** Whether the next character begins a line: a block begins at one, and so does what follows a `\n`. */
  lineStart: boolean
  /** A marker just ended the text: blanks that arrive next belong to it. */
  skipBlanks: boolean
}

export const initialScan: Scan = { held: '', lineStart: true, skipBlanks: false }

/** What the scan found, in the order it was read. */
export type Piece = { kind: 'marker'; name: string } | { kind: 'speech'; text: string }

/** `**Name:**` or `**Name**:`, the optional icon before it and the blanks after. */
const MARKER = /^(?:(\S{1,8}) )?\*\*([^*\n]+?)(?::\*\*|\*\*:)[ \t]*/u

/**
 * Whether a line with no end yet could still become a marker. Either an icon is
 * being written (only non-blanks so far), or what follows the icon is a prefix of
 * `**Name:**` / `**Name**:`.
 */
function couldBecomeMarker(line: string): boolean {
  if (/^\S{0,8}$/u.test(line)) return true
  const icon = /^\S{1,8} /u.exec(line)
  return namePart(line) || (icon !== null && namePart(line.slice(icon[0].length)))
}

/** Whether `rest` is a prefix of `**Name:**` or `**Name**:` (with blanks after). */
function namePart(rest: string): boolean {
  if (rest === '' || rest === '*') return true
  if (!rest.startsWith('**')) return false
  const after = rest.slice(2)
  return /^[^*]*$/u.test(after) || /^[^*]*\*$/u.test(after) || /^[^*]+\*\*$/u.test(after)
}

type Found = { kind: 'marker'; name: string; icon: boolean; length: number } | { kind: 'partial' } | { kind: 'none' }

/** What the text at the start of a line is: a marker, the start of one, or neither. */
function matchMarker(rest: string): Found {
  const end = rest.indexOf('\n')
  const line = end === -1 ? rest : rest.slice(0, end)
  const found = MARKER.exec(line)
  // Only a non-ASCII prefix is an icon: `-` or `1.` before a bold label is the speaker's own list.
  if (found !== null) {
    return { kind: 'marker', name: found[2].trim(), icon: /[^\x00-\x7f]/u.test(found[1] ?? ''), length: found[0].length }
  }
  if (end !== -1 || line.length > HOLD_MAX) return { kind: 'none' }
  return couldBecomeMarker(line) ? { kind: 'partial' } : { kind: 'none' }
}

/**
 * Whether a marker found at a line start is one: the caller says, by the name it gave and whether an
 * icon (a prefix with a non-ASCII character) came before it. What it refuses is plain speech, as written:
 * a persona's own bold label (`**Pros:** x`) is a line like any other.
 */
export type Accepts = (name: string, icon: boolean) => boolean

/** Take one piece of text from a block: the pieces it yields, and the memory for the next. */
export function scanText(
  scan: Scan,
  delta: string,
  accepts: Accepts = () => true
): { scan: Scan; pieces: Piece[] } {
  const pieces: Piece[] = []
  let text = scan.held + delta
  let lineStart = scan.lineStart
  let skipBlanks = scan.skipBlanks
  let speech = ''
  const say = (): void => {
    if (speech !== '') pieces.push({ kind: 'speech', text: speech })
    speech = ''
  }

  // The blanks that follow a marker split from it belong to the marker.
  if (skipBlanks && scan.held === '') {
    text = text.replace(/^[ \t]+/u, '')
    skipBlanks = text === ''
  } else {
    skipBlanks = false
  }

  let held = ''
  let at = 0
  while (at < text.length) {
    if (!lineStart) {
      const end = text.indexOf('\n', at)
      if (end === -1) {
        speech += text.slice(at)
        break
      }
      speech += text.slice(at, end + 1)
      at = end + 1
      lineStart = true
      continue
    }
    const found = matchMarker(text.slice(at))
    if (found.kind === 'marker' && accepts(found.name, found.icon)) {
      say()
      pieces.push({ kind: 'marker', name: found.name })
      at += found.length
      lineStart = false
      skipBlanks = at >= text.length
    } else if (found.kind === 'partial') {
      held = text.slice(at)
      break
    } else {
      lineStart = false
    }
  }
  say()
  return { scan: { held, lineStart, skipBlanks }, pieces }
}

/** The end of a block: what is still held is speech, as it was written. */
export function flushScan(scan: Scan): { scan: Scan; pieces: Piece[] } {
  return {
    scan: { held: '', lineStart: true, skipBlanks: false },
    pieces: scan.held === '' ? [] : [{ kind: 'speech', text: scan.held }]
  }
}

/** The roster's id for the name a marker gave: case-insensitive after trimming, else no one. */
export function speakerNamed(name: string, roster: readonly { id: string; name: string }[]): string | undefined {
  const wanted = name.trim().toLowerCase()
  if (wanted === '') return undefined
  return roster.find((member) => member.name.trim().toLowerCase() === wanted)?.id
}
