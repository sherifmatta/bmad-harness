/**
 * The pure half of the `/` list (Story 7.3): which of the rows main handed over
 * the composer's text narrows to. Nothing here reads a manifest, ranks a row or
 * decides what a row means; the renderer only prefix-filters what it was given,
 * in the order it was given.
 *
 * The list is open only when the text's first character is `/`. What follows
 * the slash is the query, and a whitespace character after the name closes the
 * list: the name is then complete and what comes next is the message. A `/`
 * anywhere else in the text, or after an `@name`, opens nothing.
 *
 * ```
 * "/BMAD-b"      -> query "bmad-b" -> rows whose lower-cased name starts with it
 * "/"            -> query ""       -> every row
 * "/bmad-build " -> closed (a space follows the name)
 * "see /bmad"    -> closed (not the first character)
 * ```
 */

/** One row of the list: a name and the words that say what it is for. */
export type SlashEntry = { name: string; description: string }

/** What follows the leading `/`, or `null` when the text does not open the list. */
export function slashQuery(text: string): string | null {
  if (!text.startsWith('/')) {
    return null
  }
  const rest = text.slice(1)
  return /\s/.test(rest) ? null : rest
}

/** The rows the text narrows to, in the order given. Empty is closed. */
export function slashMatches<T extends SlashEntry>(text: string, entries: readonly T[]): T[] {
  const query = slashQuery(text)
  if (query === null) {
    return []
  }
  const wanted = query.toLowerCase()
  return entries.filter((entry) => entry.name.toLowerCase().startsWith(wanted))
}

/** What a chosen row puts in the composer: the slash, the name and a space after it. */
export function slashText(name: string): string {
  return `/${name} `
}
