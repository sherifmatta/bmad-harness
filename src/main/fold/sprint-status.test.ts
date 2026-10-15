import { describe, expect, it } from 'vitest'
import { titlesOf } from './epic-titles'
import { foldSprintStatus } from './sprint-status'

const text = (body: string): { state: 'text'; text: string } => ({ state: 'text', text: body })
const file = (...lines: string[]): ReturnType<typeof text> =>
  text(['# a comment', 'generated: 09-25-2026 17:00', 'development_status:', ...lines.map((line) => `  ${line}`), 'action_items:', '  - id: "x"', ''].join('\n'))

function read(body: ReturnType<typeof text>, titles = titlesOf(undefined)) {
  const folded = foldSprintStatus(body, titles)
  if (folded.kind !== 'read') {
    throw new Error(`expected a read, got ${folded.code}`)
  }
  return folded
}

describe('foldSprintStatus', () => {
  it('puts epics in the file’s order, each with its stories in the file’s order and its retrospective apart', () => {
    const { epics, others } = read(
      file('epic-2: done', '2-1-b: done', 'epic-1: in-progress', '1-1-a: done', '1-2-c: backlog', 'epic-1-retrospective: optional', '2-2-d: review')
    )
    expect(epics.map((epic) => [epic.key, epic.stories.map((story) => story.key)])).toEqual([
      ['epic-2', ['2-1-b', '2-2-d']],
      ['epic-1', ['1-1-a', '1-2-c']]
    ])
    expect(epics[1].retrospective).toEqual({ key: 'epic-1-retrospective', status: 'optional', known: true })
    expect(others).toEqual([])
  })

  it('gives each story its number, status and title, and each epic its number', () => {
    const { epics } = read(file('epic-6: in-progress', '6-2-the-sprint-status: ready-for-dev'))
    expect(epics[0]).toMatchObject({ key: 'epic-6', number: 6, status: 'in-progress', known: true })
    expect(epics[0].stories[0]).toEqual({
      key: '6-2-the-sprint-status',
      number: '6.2',
      title: 'the sprint status',
      status: 'ready-for-dev',
      known: true
    })
  })

  it('carries each of the six statuses as written, known', () => {
    const statuses = ['backlog', 'ready-for-dev', 'in-progress', 'review', 'done', 'optional']
    const { epics } = read(file('epic-1: backlog', ...statuses.map((status, at) => `1-${at + 1}-s: ${status}`)))
    expect(epics[0].stories.map((story) => [story.status, story.known])).toEqual(statuses.map((status) => [status, true]))
  })

  it('carries another status as written and flags it unrecognised', () => {
    const { epics } = read(file('epic-1: blocked', '1-1-a: Blocked ', '1-2-b:'))
    expect([epics[0].status, epics[0].known]).toEqual(['blocked', false])
    expect(epics[0].stories.map((story) => [story.status, story.known])).toEqual([
      ['Blocked', false],
      ['', false]
    ])
  })

  it('keeps any other key as an unrecognised row, and never throws on one', () => {
    const { epics, others } = read(
      file('epic-1: done', 'foo: done', '1-x: done', 'epic-x: done', '1-1: done', '7-1-orphan: backlog', 'epic-9-retrospective: optional', '1-1-a: done')
    )
    expect(others.map((other) => other.key)).toEqual(['foo', '1-x', 'epic-x', '1-1', '7-1-orphan', 'epic-9-retrospective'])
    expect(epics[0].stories.map((story) => story.key)).toEqual(['1-1-a'])
  })

  it('takes a story’s title from epics.md and an epic’s from its heading', () => {
    const titles = titlesOf('## Epic 1: The Room\n### Story 1.1: A real title\n')
    const { epics } = read(file('epic-1: done', '1-1-a-cut-sl: done', '1-2-slug-only: done'), titles)
    expect(epics[0].title).toBe('The Room')
    expect(epics[0].stories.map((story) => story.title)).toEqual(['A real title', 'slug only'])
  })

  it('falls back to the slug, uncut and uncompleted, where there is no heading; an epic has no slug so its title is empty', () => {
    const { epics } = read(file('epic-1: done', '1-4-the-accessibility-floor-focus-keyboard-reach-and-one-live-re: done'))
    expect(epics[0].title).toBe('')
    expect(epics[0].stories[0].title).toBe('the accessibility floor focus keyboard reach and one live re')
  })

  it('ignores every top-level key but development_status, the timestamps and a comment at the end of a line', () => {
    const { epics } = read(
      text('generated: 1\nlast_updated: 10-10-2026 10:55\naction_items:\n  - id: "1-1-a"\n    status: open\ndevelopment_status:\n  # note\n\n  epic-1: done # trailing\n  "1-1-a": \'done\'\nproject: x\n')
    )
    expect(epics[0].stories.map((story) => [story.key, story.status])).toEqual([['1-1-a', 'done']])
    expect(epics[0].status).toBe('done')
  })

  it('keeps a second row for an epic, a repeated key and a second retrospective, and drops none', () => {
    const { epics, others } = read(
      file('epic-1: done', 'epic-01: backlog', '1-1-a: done', '1-1-a: review', 'epic-1-retrospective: done', 'epic-1-retrospective: optional', 'epic-1: review')
    )
    expect(epics).toHaveLength(1)
    expect(epics[0].stories.map((story) => story.status)).toEqual(['done', 'review'])
    expect(epics[0].retrospective?.status).toBe('done')
    expect(others.map((other) => [other.key, other.status])).toEqual([
      ['epic-01', 'backlog'],
      ['epic-1-retrospective', 'optional'],
      ['epic-1', 'review']
    ])
  })

  it('leaves a line indented deeper than the map’s own to the value it belongs to', () => {
    const { epics, others } = read(
      text('development_status:\n  epic-1: done\n  1-1-a:\n    status: done\n    owner: x\n  1-2-b: backlog\n')
    )
    expect(epics[0].stories.map((story) => story.key)).toEqual(['1-1-a', '1-2-b'])
    expect(others).toEqual([])
  })

  it('reads text that begins with a byte order mark', () => {
    expect(read(text('\uFEFFdevelopment_status:\n  epic-1: done\n')).epics).toHaveLength(1)
  })

  it('reads CRLF text', () => {
    expect(read(text('development_status:\r\n  epic-1: done\r\n  1-1-a: done\r\n')).epics[0].stories).toHaveLength(1)
  })

  it('says none, with one code and message, for no file, an unreadable one, empty text and what is not a map', () => {
    const outcomes = [
      foldSprintStatus({ state: 'absent' }),
      foldSprintStatus({ state: 'unreadable', errno: 'EACCES' }),
      foldSprintStatus(text('')),
      foldSprintStatus(text(' \n\n')),
      foldSprintStatus(text('- a\n- b\n')),
      foldSprintStatus(text('just words')),
      foldSprintStatus(text('development_status:\n')),
      foldSprintStatus(text('development_status: {}\n')),
      foldSprintStatus(text('other:\n  a: b\n'))
    ]
    expect(outcomes.map((outcome) => outcome.kind === 'none' && outcome.code)).toEqual([
      'board/absent',
      'board/unreadable',
      'board/empty',
      'board/empty',
      'board/not-a-map',
      'board/not-a-map',
      'board/not-a-map',
      'board/not-a-map',
      'board/not-a-map'
    ])
    for (const outcome of outcomes) {
      expect(outcome).toEqual({ kind: 'none', code: expect.any(String), message: expect.stringMatching(/^board · /) })
    }
  })

  it('names an errno and nothing else of why a file was unreadable', () => {
    const outcome = foldSprintStatus({ state: 'unreadable', errno: 'EACCES' })
    expect(outcome).toMatchObject({ message: 'board · the sprint status cannot be read · EACCES' })
  })
})

describe('the files a story and an epic carry (Story 7.1)', () => {
  const DIR = '_bmad/implementation-artifacts/'
  const body = (names: string[], ...lines: string[]) => {
    const folded = foldSprintStatus(text(`development_status:\n${lines.map((line) => `  ${line}`).join('\n')}\n`), undefined, { dir: DIR, names })
    if (folded.kind !== 'read') {
      throw new Error(`expected a read, got ${folded.code}`)
    }
    return folded
  }

  it('carries the path of the one spec for a story, by number and not by its key’s slug', () => {
    const { epics } = body(['spec-5-2-the-systems-theme.md'], 'epic-5: done', '5-2-the-system-s-theme: done')
    expect(epics[0].stories[0].file).toBe(`${DIR}spec-5-2-the-systems-theme.md`)
  })

  it('carries none for no spec, several, or another story whose number begins the same way', () => {
    const { epics } = body(
      ['spec-3-1-a.md', 'spec-3-1-b.md', 'spec-1-10-x.md'],
      'epic-1: in-progress', '1-1-a: done', '1-10-x: done', 'epic-3: backlog', '3-1-a: done', '3-2-b: done', 'epic-2: backlog', '2-14-c: done'
    )
    const stories = epics.flatMap((epic) => epic.stories)
    expect(stories.map((story) => [story.number, story.file])).toEqual([
      ['1.1', undefined],
      ['1.10', `${DIR}spec-1-10-x.md`],
      ['3.1', undefined],
      ['3.2', undefined],
      ['2.14', undefined]
    ])
    for (const story of stories) {
      expect('file' in story, story.number).toBe(story.file !== undefined)
    }
  })

  it('carries an epic’s context file and not its retrospective’s', () => {
    const { epics } = body(['epic-6-context.md', 'epic-6-retro-2026-10-12.md', 'epic-7-retro-x.md'], 'epic-6: done', 'epic-7: backlog')
    expect(epics.map((epic) => epic.file)).toEqual([`${DIR}epic-6-context.md`, undefined])
  })

  it('carries no file for a story outside any epic, a retrospective or an unrecognised row', () => {
    const { others, epics } = body(['spec-9-1-a.md', 'epic-1-context.md'], 'epic-1: done', 'epic-1-retrospective: done', '9-1-a: done', 'notes: backlog')
    expect(others.every((other) => !('file' in other))).toBe(true)
    expect(epics[0].retrospective).toEqual({ key: 'epic-1-retrospective', status: 'done', known: true })
  })

  it('carries no file at all when no listing is given', () => {
    const { epics } = read(text('development_status:\n  epic-1: done\n  1-1-a: done\n'))
    expect('file' in epics[0] || 'file' in epics[0].stories[0]).toBe(false)
  })
})
