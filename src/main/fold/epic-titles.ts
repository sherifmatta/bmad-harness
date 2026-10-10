/**
 * Titles for the Board, from the project's own `epics.md` (Story 6.2): the text
 * of each `## Epic N:` and `### Story N.M:` heading. Pure: text in, titles out.
 * A heading inside a fenced block is an example and not a heading, and the first
 * heading for a number wins. The epic list's `### Epic N:` lines are not epic
 * headings and are not read.
 */

export type Titles = {
  /** An epic's title by its number. */
  epics: ReadonlyMap<number, string>
  /** A story's title by its `N.M`. */
  stories: ReadonlyMap<string, string>
}

const EPIC_HEADING = /^## Epic (\d+):\s*(.*?)\s*$/
const STORY_HEADING = /^### Story (\d+\.\d+):\s*(.*?)\s*$/
const FENCE = /^\s*(```|~~~)/

export function titlesOf(text: string | undefined): Titles {
  const epics = new Map<number, string>()
  const stories = new Map<string, string>()
  let fenced = false
  for (const line of (text ?? '').split('\n')) {
    if (FENCE.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) {
      continue
    }
    const epic = EPIC_HEADING.exec(line)
    if (epic !== null) {
      const number = Number(epic[1])
      if (!epics.has(number)) {
        epics.set(number, epic[2])
      }
      continue
    }
    const story = STORY_HEADING.exec(line)
    if (story !== null && !stories.has(story[1])) {
      stories.set(story[1], story[2])
    }
  }
  return { epics, stories }
}
