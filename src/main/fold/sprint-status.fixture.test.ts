import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { titlesOf } from './epic-titles'
import { foldSprintStatus } from './sprint-status'

/**
 * A committed copy of this repository's own `_bmad/implementation-artifacts/sprint-status.yaml`
 * as it stood when Epic 6 began, and the heading lines of `_bmad/planning-artifacts/epics.md`.
 * The live files change with every story; the copies do not.
 */
const FIXTURES = resolve(import.meta.dirname, '../../../fixtures/sprint-status')
const read = (name: string): string => readFileSync(resolve(FIXTURES, name), 'utf8')

describe('the repository’s own sprint status', () => {
  const body = foldSprintStatus({ state: 'text', text: read('sprint-status.yaml') }, titlesOf(read('epics.md')))
  if (body.kind !== 'read') {
    throw new Error('the fixture is not a sprint status')
  }

  it('has six epics and seventy stories, every story in an epic', () => {
    expect(body.epics.map((epic) => epic.key)).toEqual(['epic-1', 'epic-2', 'epic-3', 'epic-4', 'epic-5', 'epic-6'])
    expect(body.epics.flatMap((epic) => epic.stories)).toHaveLength(70)
    expect(body.epics.map((epic) => epic.stories.length)).toEqual([14, 15, 19, 8, 5, 9])
    expect(body.others).toEqual([])
  })

  it('has a retrospective for each epic, left out of the stories', () => {
    expect(body.epics.map((epic) => epic.retrospective?.key)).toEqual([1, 2, 3, 4, 5, 6].map((n) => `epic-${n}-retrospective`))
  })

  it('titles each epic from its heading and a story from its heading or its slug', () => {
    expect(body.epics[5].title).toBe('The room as a Board')
    expect(body.epics[5].stories[1]).toMatchObject({ number: '6.2', title: 'The sprint status, read once in main', status: 'backlog' })
    // A slug cut short in the file reads cut short when no heading names it.
    const bare = foldSprintStatus({ state: 'text', text: read('sprint-status.yaml') })
    expect(bare.kind === 'read' && bare.epics[0].stories[3].title).toBe('the accessibility floor focus keyboard reach and one live re')
  })

  it('carries only the six known statuses', () => {
    const entries = body.epics.flatMap((epic) => [epic, ...epic.stories])
    expect(entries.every((entry) => entry.known)).toBe(true)
  })
})
