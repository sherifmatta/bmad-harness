import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { BoardEpic, BoardSnapshot, BoardStory } from '../../../shared/board'
import type { AgentView } from '../../../shared/install'
import type { PersonaState } from '../persona/portrait'
import { BoardView } from './board-view'

const none: BoardSnapshot = { revision: 1, kind: 'none', code: 'board/absent', message: 'board · no sprint status' }
const read: BoardSnapshot = { revision: 2, kind: 'read', epics: [], others: [] }
const story = (number: string, title: string, status: string): BoardStory => ({
  key: `${number.replace('.', '-')}-slug`,
  number,
  title,
  status,
  known: true
})
const withStories = (...stories: BoardStory[]): BoardSnapshot => ({
  revision: 3,
  kind: 'read',
  epics: [{ key: 'epic-6', number: 6, title: 'Board', status: 'in-progress', known: true, stories }],
  others: []
})
const headings = (html: string): string[] =>
  [...html.matchAll(/<h3 class="board-column-head">([^<]*)<\/h3>/g)].map((match) => match[1])
const agent = (id: string): AgentView => ({ id, module: 'bmm', name: id, title: 'Role', icon: 'i', description: 'd' })
const ROSTER = ['a', 'b', 'c', 'd', 'e'].map(agent)
const NO_STATES = new Map<string, PersonaState>()
const epicOf = (number: number, status: string, title: string, stories: BoardStory[]): BoardEpic => ({
  key: `epic-${number}`,
  number,
  title,
  status,
  known: true,
  stories
})
const failure = { code: 'board/unexpected', message: 'board · unexpected failure' }

const markup = (
  snapshot: BoardSnapshot | null,
  error: typeof failure | null = null,
  ...folder: [string | undefined] | []
): string =>
  renderToStaticMarkup(
    <BoardView
      snapshot={snapshot}
      failure={error}
      folder={folder.length === 0 ? '_bmad/' : folder[0]}
      states={NO_STATES}
      installed={ROSTER}
    />
  )

describe('BoardView', () => {
  it('reads `no sprint status` with the watched path beneath, for a snapshot that says none', () => {
    const html = markup(none)

    expect(html).toContain('>no sprint status<')
    expect(html).toContain('>_bmad/implementation-artifacts/sprint-status.yaml<')
    expect(html.indexOf('no sprint status')).toBeLessThan(html.indexOf('sprint-status.yaml'))
  })

  it('names the path under the folder the rail holds', () => {
    expect(markup(none, null, 'docs/out/')).toContain('>docs/out/implementation-artifacts/sprint-status.yaml<')
  })

  it('says the same for a rejected ask, and shows neither the code nor the message', () => {
    const html = markup(null, failure)

    expect(html).toContain('>no sprint status<')
    expect(html).not.toContain('unexpected')
    expect(html).not.toContain('board/')
    expect(markup(none)).not.toContain('absent')
  })

  it('draws no path line while there is no rail snapshot', () => {
    const html = markup(none, null, undefined)

    expect(html).toContain('>no sprint status<')
    expect(html).not.toContain('sprint-status.yaml')
  })

  it('draws nothing before the first snapshot', () => {
    expect(markup(null)).toBe('')
  })

  it('draws no region, control, spinner or live region', () => {
    const html = markup(none)

    expect(html).not.toMatch(/<button|<input|<a |role=|aria-|<h\d|<ul|<table|loading|spinner|skeleton/i)
  })

  describe('a snapshot that was read', () => {
    it('draws the five headings in order, as the file writes them, with no count and no card (each empty column says so instead)', () => {
      const html = markup(read)
      const board = html.slice(html.indexOf('board-stories'), html.indexOf('board-epics'))

      expect(headings(html)).toEqual(['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'])
      expect(board.match(/<li/g)).toHaveLength(5)
      expect(board.match(/<li class="board-cards-empty">no stories<\/li>/g)).toHaveLength(5)
      expect(board.replace(/<[^>]*>/g, '')).not.toMatch(/\d/)
      expect(html).not.toContain('no sprint status')
    })

    it('draws a card as the number then the title, and nothing else, under its status', () => {
      const html = markup(withStories(story('6.4', 'Every story, in its column', 'review')))

      expect(html).toContain(
        '<li class="board-card"><span class="board-card-number">6.4</span><span class="board-card-title">Every story, in its column</span></li>'
      )
      const review = html.slice(html.indexOf('>review<'), html.indexOf('>done<'))
      expect(review).toContain('6.4')
      expect(html.slice(0, html.indexOf('>review<'))).not.toContain('6.4')
    })

    it('draws a column with no card as its heading and a `no stories` line', () => {
      const html = markup(withStories(story('6.4', 'T', 'review')))

      expect(html).toContain('<ul class="board-cards"><li class="board-cards-empty">no stories</li></ul>')
      // One card, and four columns that say they are empty.
      expect(html.slice(0, html.indexOf('board-epics')).match(/<li class="board-card"/g)).toHaveLength(1)
      expect(html.slice(0, html.indexOf('board-epics')).match(/board-cards-empty/g)).toHaveLength(4)
    })

    it('draws an extra column after done for a status outside the five', () => {
      const html = markup(withStories(story('6.4', 'T', 'optional')))

      expect(headings(html)).toEqual(['backlog', 'ready-for-dev', 'in-progress', 'review', 'done', 'optional'])
    })

    it('draws no control, tab stop, handler, live region, input or text of its own', () => {
      const html = markup(withStories(story('6.4', 'T', 'review'))).replace(/<span class="board-epic-track"[^>]*><span [^>]*><\/span><\/span>/g, '')

      expect(html).not.toMatch(/<button|<input|<a |tabindex|onclick|role=|aria-|loading|spinner|skeleton/i)
    })
  })

  describe('the overview and the epics', () => {
    const text = (html: string, className: string): string[] =>
      [...html.matchAll(new RegExp(`<[a-z]+ class="${className}">([^<]*)<`, 'g'))].map((match) => match[1])
    const render = (snapshot: BoardSnapshot, states: Map<string, PersonaState> = NO_STATES): string =>
      renderToStaticMarkup(<BoardView snapshot={snapshot} failure={null} folder="_bmad/" states={states} installed={ROSTER} />)
    const snapshot: BoardSnapshot = {
      revision: 4,
      kind: 'read',
      epics: [
        epicOf(1, 'done', 'Shell', [story('1.1', 'T', 'done'), story('1.2', 'T', 'done')]),
        epicOf(6, 'in-progress', 'Board', [story('6.1', 'T', 'done'), story('6.2', 'T', 'in-progress'), story('6.3', 'T', 'backlog')]),
        epicOf(7, 'backlog', '', []),
        epicOf(8, 'backlog', 'Later', [story('8.1', 'T', 'blocked')])
      ],
      others: []
    }

    it('draws two equal cells, label then figure then line, and no third', () => {
      const html = render(snapshot, new Map<string, PersonaState>([['a', 'work'], ['b', 'work'], ['c', 'live'], ['ghost', 'work']]))

      expect(text(html, 'board-figure-label')).toEqual(['agents running', 'stories in progress'])
      expect(text(html, 'board-figure-value')).toEqual(['2', '1'])
      expect(text(html, 'board-figure-line')).toEqual(['of 5 installed', 'of 4 stories'])
      expect(html.match(/class="board-figure"/g)).toHaveLength(2)
      expect(html.indexOf('board-overview')).toBeLessThan(html.indexOf('board-stories'))
      expect(html.indexOf('board-stories')).toBeLessThan(html.indexOf('board-epics'))
    })

    it('draws one row per epic in the file’s order, with the id, the title and the words at the right', () => {
      const html = render(snapshot)

      expect([...html.matchAll(/<h3 class="board-epics-head">([^<]*)</g)].map((match) => match[1])).toEqual(['epics'])
      expect(text(html, 'board-epic-id')).toEqual(['Epic 1', 'Epic 6', 'Epic 7', 'Epic 8'])
      expect(text(html, 'board-epic-progress')).toEqual(['2 of 2 stories done', '1 of 3 stories done', 'no stories', '0 of 1 stories done'])
      expect(html).toContain(
        '<li class="board-epic"><span class="board-epic-id">Epic 6</span><span class="board-epic-title">Board</span><span class="board-epic-track" aria-hidden="true"><span class="board-epic-fill" style="width:33%"></span></span><span class="board-epic-progress">1 of 3 stories done</span></li>'
      )
    })

    it('reads the id alone for an empty title', () => {
      const html = render(snapshot)
      const row = html.slice(html.indexOf('>Epic 7<'), html.indexOf('>no stories<'))

      expect(row).not.toContain('board-epic-title')
      expect(text(html, 'board-epic-title')).toEqual(['Shell', 'Board', 'Later'])
    })

    it('draws neither figures nor rows for none, a failure or no snapshot', () => {
      for (const html of [markup(none), markup(null, failure), markup(null)]) {
        expect(html).not.toMatch(/board-overview|board-epics|board-figure/)
      }
    })

    it('is not a control, a meter, a native progress or a live region; its one drawn mark is an aria-hidden track', () => {
      const html = render(snapshot)
      const regions = (html.slice(0, html.indexOf('board-stories')) + html.slice(html.indexOf('board-epics'))).replace(
        /<span class="board-epic-track"[^>]*><span [^>]*><\/span><\/span>/g,
        ''
      )

      expect(regions).not.toMatch(/<button|<input|<a |tabindex|onclick|role=|aria-|<progress|<meter|style=|%|title=/i)
      // One track for each epic that has stories, filled to the share done: 2 of 2, 1 of 3, none for an empty epic, 0 of 1.
      expect([...html.matchAll(/board-epic-fill" style="width:(\d+)%"/g)].map((match) => match[1])).toEqual(['100', '33', '0'])
    })
  })
})
