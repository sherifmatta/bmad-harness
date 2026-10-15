/**
 * Which file in `implementation-artifacts/` holds a story or an epic (Story 7.1). Pure: a list of
 * file names in, a name or nothing out. Matching is by number and never by building a name from a
 * sprint key, so a key whose slug differs from its file's still finds it.
 */

const SPEC_NAME = /^spec-(\d+)-(\d+)-.+\.md$/

/**
 * The one `spec-<epic>-<story>-*.md` for a story, matched by the two numbers. Zero or several
 * matches is no file. `spec-1-10-x.md` is story 1.10's and never story 1.1's.
 */
export function storyFileOf(names: readonly string[], epic: number, story: number): string | undefined {
  const matches = names.filter((name) => {
    const match = SPEC_NAME.exec(name)
    return match !== null && Number(match[1]) === epic && Number(match[2]) === story
  })
  return matches.length === 1 ? matches[0] : undefined
}

/** `epic-<n>-context.md` and nothing else: a retrospective or any other `epic-<n>-*` file is not an epic's. */
export function epicFileOf(names: readonly string[], epic: number): string | undefined {
  const wanted = `epic-${epic}-context.md`
  return names.includes(wanted) ? wanted : undefined
}
