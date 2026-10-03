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

export function sectionHeadings(text: string): string[] {
  const found: string[] = []
  let fence: string | null = null
  for (const line of text.split(/\r?\n/)) {
    if (fence !== null) {
      const closing = CLOSING_FENCE.exec(line)
      if (closing !== null && closing[1][0] === fence[0] && closing[1].length >= fence.length) {
        fence = null
      }
      continue
    }
    const fenced = FENCE.exec(line)
    if (fenced !== null) {
      fence = fenced[1]
      continue
    }
    const heading = HEADING.exec(line)
    if (heading === null) continue
    const name = headingText(heading[1] ?? '')
    if (name !== '') found.push(name)
  }
  return found
}
