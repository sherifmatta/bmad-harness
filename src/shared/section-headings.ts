/**
 * The sections a written document names: its ATX level-2 headings, in order,
 * as a reader would say them. Pure: text in, names out.
 *
 * - Only `## ` at the start of a line (up to three spaces of indent, as
 *   CommonMark allows) is a section. `#` is the title and `###` a subsection.
 * - A line inside a fenced code block is code, not a heading: a ```` ``` ```` or
 *   `~~~` fence opens a block that only a fence of the same character, at least
 *   as long and followed by nothing but whitespace, closes — ```` ```js ```` inside
 *   a block opens nothing and closes nothing. An unclosed fence runs to the end.
 * - The optional closing `#`s are dropped, and so is emphasis: every `*` and
 *   backtick, and an `_` that is not inside a word, so `## **Goals**` is `Goals`
 *   and `## Non_Goals` keeps its underscore.
 * - A heading with nothing left after that is no section.
 *
 * Repeats are kept: what is distinct is the reader's question, not the text's.
 */

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const CLOSING_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/
const HEADING = /^ {0,3}##(?:[ \t]+(.*?))?[ \t]*$/
const CLOSING = /(?:^|[ \t]+)#+$/
const EMPHASIS = /[*`]|(?<![\p{L}\p{N}])_+|_+(?![\p{L}\p{N}])/gu

function headingText(raw: string): string {
  return raw.replace(CLOSING, '').replace(EMPHASIS, '').replace(/\s+/g, ' ').trim()
}

/** One level-2 heading: its name as a reader would say it, and where its line starts in the text. */
export type ScannedHeading = { name: string; offset: number }

/** Which headings a scan reads: those in running text, or those inside fenced code blocks. */
export type HeadingWhere = 'outside' | 'inside'

/**
 * The level-2 headings of `text`, in order, each with the offset of its line.
 * `where` picks the headings outside fenced code blocks (the default: the
 * sections of a document) or those inside them (a template that shows its
 * document in a fence).
 */
export function scanHeadings(text: string, where: HeadingWhere = 'outside'): ScannedHeading[] {
  const found: ScannedHeading[] = []
  let fence: string | null = null
  let offset = 0
  while (offset <= text.length) {
    const end = text.indexOf('\n', offset)
    const stop = end === -1 ? text.length : end
    const line = text.slice(offset, stop).replace(/\r$/, '')
    const lineOffset = offset
    offset = stop + 1
    if (fence !== null) {
      const closing = CLOSING_FENCE.exec(line)
      if (closing !== null && closing[1][0] === fence[0] && closing[1].length >= fence.length) {
        fence = null
        continue
      }
    } else {
      const fenced = FENCE.exec(line)
      if (fenced !== null) {
        fence = fenced[1]
        continue
      }
    }
    if ((fence !== null) !== (where === 'inside')) continue
    const heading = HEADING.exec(line)
    if (heading === null) continue
    const name = headingText(heading[1] ?? '')
    if (name !== '') found.push({ name, offset: lineOffset })
  }
  return found
}

export function sectionHeadings(text: string): string[] {
  return scanHeadings(text).map(({ name }) => name)
}
