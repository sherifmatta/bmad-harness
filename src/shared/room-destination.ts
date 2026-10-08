/**
 * What the room is about and where its summary will land (Story 4.3, FR67, FR69). Pure, and in
 * `shared/` because Story 4.4 reads the same destination the header and the side panel show.
 *
 * The harness holds no topic field: the user's own first message into the room is the topic, kept
 * as they typed it but for its shape. Nothing here invents, completes or summarises one.
 */

/** The longest topic the header and panel hold, in characters. */
const TOPIC_MAX = 80

/** The longest slug a destination holds, in characters. */
const SLUG_MAX = 48

/** The directory under the output folder a room's summary goes in. */
const PARTY_DIR = 'party'

const cut = (text: string, length: number): string => Array.from(text).slice(0, length).join('')

/**
 * The topic of a room from the user's first message: its first non-blank line, whitespace runs
 * collapsed to one space, trimmed, cut to 80 characters. A message with no text in it has none (`''`).
 */
export function roomTopicOf(text: string): string {
  const line = text.split(/\r\n|\r|\n/).find((candidate) => candidate.trim() !== '') ?? ''
  return cut(line.replace(/\s+/g, ' ').trim(), TOPIC_MAX).trim()
}

/**
 * The file-name part of a topic: lower-cased, every run of characters outside `a-z0-9` one `-`,
 * edge hyphens trimmed, cut to 48 characters and trimmed again. `''` when nothing is left.
 */
export function roomSlug(topic: string): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cut(slug, SLUG_MAX).replace(/^-+|-+$/g, '')
}

const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * `<F>party/<YYYY-MM-DD>-<slug>.md`, where `F` is the project's output folder, project-relative with
 * a trailing `/` (Story 5.4): the date is the local calendar day of `openedAt` (epoch milliseconds),
 * the slug that of `topic`. With no slug (no topic, or one with no `a-z0-9`) the literal `<topic>`
 * stands in its place, and an `openedAt` that is no instant leaves `<date>`.
 */
export function roomDestination(
  openedAt: number | undefined,
  topic: string | undefined,
  folder: string
): string {
  const opened = openedAt === undefined ? undefined : new Date(openedAt)
  const date =
    opened === undefined || Number.isNaN(opened.getTime())
      ? '<date>'
      : `${opened.getFullYear()}-${pad(opened.getMonth() + 1)}-${pad(opened.getDate())}`
  const slug = roomSlug(topic ?? '')
  return `${folder}${PARTY_DIR}/${date}-${slug === '' ? '<topic>' : slug}.md`
}
