/**
 * What a persona asked, read out of its own words — Story 2.10.
 *
 * Headless `claude -p` has no structured ask frame, so a persona that stops to
 * ask a lettered or numbered question has only its prose to ask it in. This reads
 * that prose and nothing else: no marker the harness asked for, no injection, no
 * tool. It never changes the text it reads and never decides anything about the
 * options but where they are: their order is the persona's, and their wording is
 * the persona's, a stated lean included.
 *
 * Pure, and importing nothing, so it can be held without a DOM or a stylesheet.
 */

/** A question a persona put: its title line, and its options in the persona's order. */
export type Decision = { title: string; options: string[] }

type Marker = { kind: 'letter' | 'number'; ordinal: number }

/** `A.`, `A)`, `(A)` or `1.`, `1)`, `(1)` at the start of a line, then the option's words. */
const OPTION = /^(?:\(([A-Z]|\d+)\)|([A-Z]|\d+)[.)])[ \t]+(\S.*)$/

type Option = { marker: Marker; text: string }

function optionOf(line: string): Option | null {
  const found = OPTION.exec(line)
  if (found === null) {
    return null
  }
  const mark = found[1] ?? found[2]
  const letter = /^[A-Z]$/.test(mark)
  return {
    marker: letter
      ? { kind: 'letter', ordinal: mark.charCodeAt(0) - 'A'.charCodeAt(0) + 1 }
      : { kind: 'number', ordinal: Number.parseInt(mark, 10) },
    text: found[3].trim()
  }
}

/** A line indented under an option, carrying on its words (an option itself starts in column 0). */
function isContinuation(line: string): boolean {
  return /^[ \t]+\S/.test(line)
}

/**
 * The decision a turn's text ends in, or `null` when it does not end in one.
 *
 * A run is two or more consecutive options in order from `A` (or `1`) with only
 * blank lines after it; the title is the last non-blank line above the run and
 * must not itself be an option. A run is found from the end, so a turn with more
 * than one uses the last, and a list followed by anything else is no decision.
 */
export function decisionOf(text: string): Decision | null {
  const lines = text.split(/\r?\n/)
  let end = lines.length - 1
  while (end >= 0 && lines[end].trim() === '') {
    end -= 1
  }

  // Walk up from the end, collecting options with the lines that continue them.
  const found: Option[] = []
  let first = end + 1
  let pending: string[] = []
  for (let at = end; at >= 0; at -= 1) {
    const line = lines[at]
    if (isContinuation(line)) {
      pending.unshift(line.trim())
      continue
    }
    const option = optionOf(line)
    if (option === null) {
      break
    }
    const next = found[0]
    if (
      next !== undefined &&
      (next.marker.kind !== option.marker.kind || next.marker.ordinal !== option.marker.ordinal + 1)
    ) {
      return null
    }
    found.unshift({ marker: option.marker, text: [option.text, ...pending].join(' ') })
    pending = []
    first = at
    // An `A` or a `1` opens the run; anything above it is an earlier list.
    if (option.marker.ordinal === 1) {
      break
    }
  }

  if (found.length < 2 || found[0].marker.ordinal !== 1) {
    return null
  }

  // The title is the last non-blank line above the run, and is not an option.
  let above = first - 1
  while (above >= 0 && lines[above].trim() === '') {
    above -= 1
  }
  if (above < 0 || optionOf(lines[above]) !== null) {
    return null
  }
  return { title: lines[above].trim(), options: found.map((option) => option.text) }
}
