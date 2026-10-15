import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { epicFileOf, storyFileOf } from './board-files'
import { foldSprintStatus } from './sprint-status'

describe('storyFileOf', () => {
  it('finds the one spec for a story by its two numbers', () => {
    expect(storyFileOf(['spec-5-2-choose-light-dark-or-the-systems-theme.md', 'spec-5-3-x.md'], 5, 2)).toBe('spec-5-2-choose-light-dark-or-the-systems-theme.md')
  })

  it('says nothing for no match, and for several', () => {
    expect(storyFileOf(['spec-2-13-a.md'], 2, 14)).toBeUndefined()
    expect(storyFileOf(['spec-3-1-a.md', 'spec-3-1-b.md'], 3, 1)).toBeUndefined()
  })

  it('reads the number in full: spec-1-10 is 1.10’s and never 1.1’s', () => {
    expect(storyFileOf(['spec-1-10-x.md'], 1, 1)).toBeUndefined()
    expect(storyFileOf(['spec-1-10-x.md'], 1, 10)).toBe('spec-1-10-x.md')
    expect(storyFileOf(['spec-11-1-x.md'], 1, 1)).toBeUndefined()
  })

  it('matches nothing that is not `spec-<epic>-<story>-*.md`', () => {
    for (const name of ['bmad-build-auto-result-6-8-x.md', 'spec-6-8.md', 'spec-6-8-x.yaml', 'spec-6-8-', 'judgement-6-8-x.md', 'spec-chat-look-flat.md']) {
      expect(storyFileOf([name], 6, 8), name).toBeUndefined()
    }
  })
})

describe('epicFileOf', () => {
  it('is `epic-<n>-context.md` and only that', () => {
    expect(epicFileOf(['epic-6-context.md', 'epic-6-retro-2026-10-12.md'], 6)).toBe('epic-6-context.md')
    expect(epicFileOf(['epic-6-retro-2026-10-12.md', 'epic-6-context.md.bak', 'epic-16-context.md'], 6)).toBeUndefined()
    expect(epicFileOf([], 6)).toBeUndefined()
  })
})

describe('this repository’s own listing (Story 7.1)', () => {
  const here = resolve(import.meta.dirname, '../../../_bmad/implementation-artifacts')
  const names = readdirSync(here, { withFileTypes: true }).filter((entry) => !entry.isDirectory()).map((entry) => entry.name)
  const body = foldSprintStatus({ state: 'text', text: readFileSync(resolve(here, 'sprint-status.yaml'), 'utf8') }, undefined, {
    dir: '_bmad/implementation-artifacts/',
    names
  })
  if (body.kind !== 'read') {
    throw new Error('the sprint status is not read')
  }
  const stories = body.epics.flatMap((epic) => epic.stories)
  const story = (number: string) => stories.find((one) => one.number === number)

  it('resolves 5.2 though its key spells the theme differently from its file', () => {
    expect(story('5.2')?.key).toBe('5-2-choose-light-dark-or-the-system-s-theme')
    expect(story('5.2')?.file).toBe('_bmad/implementation-artifacts/spec-5-2-choose-light-dark-or-the-systems-theme.md')
  })

  it('leaves 2.14 with no file, and 6.8, cut from the plan, with no row at all', () => {
    expect(story('2.14')).toBeDefined()
    expect(story('2.14')?.file).toBeUndefined()
    // The `bmad-build-auto-result-6-8-…` file is not a spec, and a file does not make a row.
    expect(story('6.8')).toBeUndefined()
  })

  it('gives every story with exactly one spec its path, and every other none', () => {
    for (const one of stories) {
      const [epic, number] = one.number.split('.').map(Number)
      const specs = names.filter((name) => new RegExp(`^spec-${epic}-${number}-.+\\.md$`).test(name))
      expect(one.file, one.number).toBe(specs.length === 1 ? `_bmad/implementation-artifacts/${specs[0]}` : undefined)
    }
  })

  it('gives an epic its context file, and never its retrospective', () => {
    for (const epic of body.epics) {
      expect(epic.file, epic.key).toBe(names.includes(`epic-${epic.number}-context.md`) ? `_bmad/implementation-artifacts/epic-${epic.number}-context.md` : undefined)
    }
    expect(body.epics.find((epic) => epic.number === 6)?.file).toBe('_bmad/implementation-artifacts/epic-6-context.md')
  })
})
