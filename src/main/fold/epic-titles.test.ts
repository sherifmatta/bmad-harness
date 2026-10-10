import { describe, expect, it } from 'vitest'
import { titlesOf } from './epic-titles'

describe('titlesOf', () => {
  it('reads an epic’s title from its `## Epic N:` heading', () => {
    expect(titlesOf('## Epic 6: The room as a Board\n').epics.get(6)).toBe('The room as a Board')
  })

  it('reads a story’s title with `Story N.M:` stripped', () => {
    expect(titlesOf('### Story 6.2: The sprint status, read once in main\n').stories.get('6.2')).toBe(
      'The sprint status, read once in main'
    )
  })

  it('does not take the epic list’s `### Epic N:` lines', () => {
    expect(titlesOf('### Epic 1: Listed\n').epics.size).toBe(0)
  })

  it('takes the first heading for a number', () => {
    expect(titlesOf('## Epic 1: First\n## Epic 1: Second\n').epics.get(1)).toBe('First')
  })

  it('skips headings inside a fenced block', () => {
    expect(titlesOf('```\n### Story 1.1: Not a heading\n```\n').stories.size).toBe(0)
  })

  it('is empty for no text', () => {
    const none = titlesOf(undefined)
    expect([none.epics.size, none.stories.size]).toEqual([0, 0])
  })

  it('keeps a title’s own colons and trims the line', () => {
    expect(titlesOf('### Story 1.2:   One: two  \r\n').stories.get('1.2')).toBe('One: two')
  })
})
