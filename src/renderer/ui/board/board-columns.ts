import type { BoardSnapshot, BoardStory } from '../../../shared/board'

/** The five statuses a column is always drawn for, in the file's order of progress. */
const FIXED = ['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'] as const

export type BoardColumn = { status: string; stories: BoardStory[] }

/**
 * The story board's columns (Story 6.4): the five fixed ones, then one more per
 * distinct status that is not one of them, in order of first appearance. Stories
 * stay in snapshot order. A `done` epic's stories draw no card; a story with no
 * epic row (`others`) carries no number or title and draws none either: those
 * are left out by design, and nothing else is. Nothing is sorted or thrown.
 */
export function columnsOf(body: BoardSnapshot): BoardColumn[] {
  const columns: BoardColumn[] = FIXED.map((status) => ({ status, stories: [] }))
  if (body.kind !== 'read') {
    return columns
  }
  for (const epic of body.epics) {
    if (epic.status === 'done') {
      continue
    }
    for (const story of epic.stories) {
      let column = columns.find((candidate) => candidate.status === story.status)
      if (column === undefined) {
        column = { status: story.status, stories: [] }
        columns.push(column)
      }
      column.stories.push(story)
    }
  }
  return columns
}
