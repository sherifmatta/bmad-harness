import type {
  BoardBody,
  BoardEntry,
  BoardEpic,
  BoardOther,
  BoardRetrospective,
  BoardStory,
  SprintStatusRead
} from '../../shared/board'
import { titlesOf } from './epic-titles'
import type { Titles } from './epic-titles'

/**
 * The project's `sprint-status.yaml` as one snapshot body (Story 6.2). Pure: the
 * file's text and the titles in, a body out; no file, clock or environment.
 *
 * The file's format is the one `artifact-owner.ts` records. `development_status`
 * is a flat map whose keys carry the structure: `epic-N` is an epic, `N-M-<slug>`
 * a story, `epic-N-retrospective` a retrospective, and anything else is kept as
 * an unrecognised row. The map is read line by line, since a flat `key: value`
 * block needs no YAML library; every other top-level key, `action_items` and the
 * timestamps are ignored and never parsed.
 *
 * Nothing here throws on what a file holds. A status is carried as written, with
 * `known` false when it is not one of the six the file defines.
 */

const KNOWN_STATUSES: ReadonlySet<string> = new Set(['backlog', 'ready-for-dev', 'in-progress', 'review', 'done', 'optional'])

const EPIC_KEY = /^epic-(\d+)$/
const RETROSPECTIVE_KEY = /^epic-(\d+)-retrospective$/
const STORY_KEY = /^(\d+)-(\d+)-(.+)$/

const NONE = {
  absent: { code: 'board/absent', message: 'board · no sprint status' },
  empty: { code: 'board/empty', message: 'board · the sprint status is empty' },
  notAMap: { code: 'board/not-a-map', message: 'board · the sprint status has no development_status map' }
} as const

function none(reason: { code: string; message: string }): BoardBody {
  return { kind: 'none', ...reason }
}

/** The unquoted text of a scalar, without a trailing comment. */
function scalarOf(raw: string): string {
  const trimmed = raw.trim()
  const quote = trimmed[0]
  if (quote === '"' || quote === "'") {
    const close = trimmed.indexOf(quote, 1)
    if (close > 0) {
      return trimmed.slice(1, close)
    }
  }
  const comment = trimmed.search(/(^|\s)#/)
  return (comment === -1 ? trimmed : trimmed.slice(0, comment)).trim()
}

const ENTRY_LINE = /^[ \t]+("[^"]*"|'[^']*'|[^\s#:][^:#]*?)[ \t]*:(?:[ \t]+(.*))?$/

/** The `key: value` pairs of the `development_status` block in file order, or `undefined` when it is not a block map. */
function entriesOf(text: string): [string, string][] | undefined {
  const lines = text.replace(/^\uFEFF/, '').split('\n').map((line) => line.replace(/\r$/, ''))
  const start = lines.findIndex((line) => /^development_status:[ \t]*(#.*)?$/.test(line))
  if (start === -1) {
    return undefined
  }
  const entries: [string, string][] = []
  // The map is flat: a line indented deeper than its first entry belongs to a value, not to the map.
  let indent: number | undefined
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '' || /^[ \t]*#/.test(line)) {
      continue
    }
    if (!/^[ \t]/.test(line)) {
      break
    }
    const match = ENTRY_LINE.exec(line)
    if (match === null) {
      continue
    }
    const depth = line.length - line.trimStart().length
    indent ??= depth
    if (depth > indent) {
      continue
    }
    const key = scalarOf(match[1])
    if (key !== '') {
      entries.push([key, scalarOf(match[2] ?? '')])
    }
  }
  return entries.length === 0 ? undefined : entries
}

const entryOf = (status: string): BoardEntry => ({ status, known: KNOWN_STATUSES.has(status) })

/** A key's slug with its hyphens read as spaces, as written: a slug cut short stays cut short. */
const slugTitle = (slug: string): string => slug.replace(/-/g, ' ')

export function foldSprintStatus(read: SprintStatusRead, titles: Titles = titlesOf(undefined)): BoardBody {
  if (read.state === 'absent') {
    return none(NONE.absent)
  }
  if (read.state === 'unreadable') {
    return none({ code: 'board/unreadable', message: `board · the sprint status cannot be read · ${read.errno}` })
  }
  if (read.text.trim() === '') {
    return none(NONE.empty)
  }
  const entries = entriesOf(read.text)
  if (entries === undefined) {
    return none(NONE.notAMap)
  }

  // The first row for an epic number is the epic; a second one is kept as an unrecognised row, never dropped.
  const epics = new Map<number, BoardEpic>()
  const asEpic = new Set<number>()
  entries.forEach(([key, status], at) => {
    const epic = EPIC_KEY.exec(key)
    const number = Number(epic?.[1])
    if (epic !== null && !epics.has(number)) {
      epics.set(number, { key, number, title: titles.epics.get(number) ?? '', ...entryOf(status), stories: [] })
      asEpic.add(at)
    }
  })

  const others: BoardOther[] = []
  for (const [at, [key, status]] of entries.entries()) {
    if (asEpic.has(at)) {
      continue
    }
    const retro = RETROSPECTIVE_KEY.exec(key)
    const story = STORY_KEY.exec(key)
    const epic = epics.get(Number((retro ?? story)?.[1]))
    if (retro !== null && epic !== undefined && epic.retrospective === undefined) {
      const retrospective: BoardRetrospective = { key, ...entryOf(status) }
      epic.retrospective = retrospective
    } else if (story !== null && epic !== undefined) {
      const number = `${Number(story[1])}.${Number(story[2])}`
      const placed: BoardStory = { key, number, title: titles.stories.get(number) ?? slugTitle(story[3]), ...entryOf(status) }
      epic.stories.push(placed)
    } else {
      others.push({ key, ...entryOf(status) })
    }
  }
  return { kind: 'read', epics: [...epics.values()], others }
}
