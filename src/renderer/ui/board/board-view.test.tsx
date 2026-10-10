import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { BoardSnapshot, BoardStory } from '../../../shared/board'
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
const headings = (html: string): string[] => [...html.matchAll(/<h3[^>]*>([^<]*)<\/h3>/g)].map((match) => match[1])
const failure = { code: 'board/unexpected', message: 'board · unexpected failure' }

const markup = (
  snapshot: BoardSnapshot | null,
  error: typeof failure | null = null,
  ...folder: [string | undefined] | []
): string =>
  renderToStaticMarkup(<BoardView snapshot={snapshot} failure={error} folder={folder.length === 0 ? '_bmad/' : folder[0]} />)

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
    it('draws the five headings in order, as the file writes them, with no count and no card', () => {
      const html = markup(read)

      expect(headings(html)).toEqual(['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'])
      expect(html).not.toContain('<li')
      expect(html.replace(/<[^>]*>/g, '')).not.toMatch(/\d/)
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

    it('draws a column with no card as its heading and an empty list', () => {
      const html = markup(withStories(story('6.4', 'T', 'review')))

      expect(html).toContain('<ul class="board-cards"></ul>')
      expect(html.match(/<li/g)).toHaveLength(1)
    })

    it('draws an extra column after done for a status outside the five', () => {
      const html = markup(withStories(story('6.4', 'T', 'optional')))

      expect(headings(html)).toEqual(['backlog', 'ready-for-dev', 'in-progress', 'review', 'done', 'optional'])
    })

    it('draws no control, tab stop, handler, live region, input or text of its own', () => {
      const html = markup(withStories(story('6.4', 'T', 'review')))

      expect(html).not.toMatch(/<button|<input|<a |tabindex|onclick|role=|aria-|loading|spinner|skeleton/i)
    })
  })
})
