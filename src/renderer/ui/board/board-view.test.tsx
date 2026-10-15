import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { BoardEpic, BoardSnapshot, BoardStory } from '../../../shared/board'
import type { AgentView } from '../../../shared/install'
import type { PersonaState } from '../persona/portrait'
import { createProseStore } from '../chat/prose-store'
import type { ProseStore } from '../chat/prose-store'
import type { RunCardEntry } from '../chat/transcript-entry'
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
      entries={[]}
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

    it('draws a card with a file as a native button holding the same two words, and a card without one as it was (Story 7.1)', () => {
      const path = '_bmad/implementation-artifacts/spec-6-4-every-story-in-its-column.md'
      const html = markup(withStories({ ...story('6.4', 'Every story, in its column', 'review'), file: path }, story('6.5', 'No spec yet', 'review')))

      expect(html).toContain(
        '<li class="board-card"><button type="button" class="board-card-open"><span class="board-card-number">6.4</span><span class="board-card-title">Every story, in its column</span></button></li>'
      )
      expect(html).toContain('<li class="board-card"><span class="board-card-number">6.5</span><span class="board-card-title">No spec yet</span></li>')
      // A path is never shown, and the markup carries none: the renderer holds it, main made it.
      expect(html).not.toContain('spec-6-4')
      expect(html.match(/<button/g)).toHaveLength(1)
    })

    it('draws an epic row with a file as a native button around the same words, and a row without one as it was (Story 7.1)', () => {
      const html = markup({
        revision: 5,
        kind: 'read',
        epics: [{ ...epicOf(6, 'done', 'Board', []), file: '_bmad/implementation-artifacts/epic-6-context.md' }, epicOf(7, 'backlog', 'Work', [])],
        others: []
      })

      expect(html).toContain(
        '<li class="board-epic"><button type="button" class="board-epic-open"><span class="board-epic-id">Epic 6</span><span class="board-epic-title">Board</span><span class="board-epic-progress">no stories</span></button></li>'
      )
      expect(html).toContain('<li class="board-epic"><span class="board-epic-id">Epic 7</span>')
      expect(html).not.toContain('epic-6-context')
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
      const whole = markup(withStories(story('6.4', 'T', 'review')))
      const html = whole.slice(0, whole.indexOf('board-agents')).replace(/<span class="board-epic-track"[^>]*><span [^>]*><\/span><\/span>/g, '')

      expect(html).not.toMatch(/<button|<input|<a |tabindex|onclick|role=|aria-|loading|spinner|skeleton/i)
    })
  })

  describe('the overview and the epics', () => {
    const text = (html: string, className: string): string[] =>
      [...html.matchAll(new RegExp(`<[a-z]+ class="${className}">([^<]*)<`, 'g'))].map((match) => match[1])
    const render = (snapshot: BoardSnapshot, states: Map<string, PersonaState> = NO_STATES): string =>
      renderToStaticMarkup(<BoardView snapshot={snapshot} failure={null} folder="_bmad/" states={states} installed={ROSTER} entries={[]} />)
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
      expect(html.indexOf('board-epics')).toBeLessThan(html.indexOf('board-agents'))
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
        expect(html).not.toMatch(/board-overview|board-epics|board-figure|board-agents/)
      }
    })

    it('is not a control, a meter, a native progress or a live region; its one drawn mark is an aria-hidden track', () => {
      const html = render(snapshot)
      const regions = (html.slice(0, html.indexOf('board-stories')) + html.slice(html.indexOf('board-epics'), html.indexOf('board-agents'))).replace(
        /<span class="board-epic-track"[^>]*><span [^>]*><\/span><\/span>/g,
        ''
      )

      expect(regions).not.toMatch(/<button|<input|<a |tabindex|onclick|role=|aria-|<progress|<meter|style=|%|title=/i)
      // One track for each epic that has stories, filled to the share done: 2 of 2, 1 of 3, none for an empty epic, 0 of 1.
      expect([...html.matchAll(/board-epic-fill" style="width:(\d+)%"/g)].map((match) => match[1])).toEqual(['100', '33', '0'])
    })
  })

  describe('the Agents panel (Story 6.6)', () => {
    const NOW = 1_700_000_000_000
    const entry = (id: string, agentId: string, over: Partial<RunCardEntry> = {}): RunCardEntry => ({
      kind: 'run',
      id,
      at: NOW,
      runId: id,
      sessionId: `s-${id}`,
      agentId,
      code: 'CP',
      status: 'running',
      notes: [],
      steps: [],
      documents: [],
      ...over
    })
    const render = (
      states: Map<string, PersonaState>,
      entries: readonly RunCardEntry[] = [],
      prose?: ProseStore
    ): string =>
      renderToStaticMarkup(
        <BoardView snapshot={read} failure={null} folder="_bmad/" states={states} installed={ROSTER} entries={entries} prose={prose} />
      )
    const rows = (html: string): string[] => html.split('<li class="board-agent ').slice(1)

    it('draws the head `agents` and one row per persona in roster order, each with name, title, dot and word', () => {
      const html = render(new Map<string, PersonaState>([['c', 'live']]))

      expect([...html.matchAll(/<h3 class="board-agents-head">([^<]*)</g)].map((match) => match[1])).toEqual(['agents'])
      expect([...html.matchAll(/class="board-agent-name">([^<]*)</g)].map((match) => match[1])).toEqual(['a', 'b', 'c', 'd', 'e'])
      expect(rows(html)).toHaveLength(5)
      expect(rows(html)[2]).toContain('board-agent--live')
      expect(rows(html)[2]).toContain('status-dot--live')
      expect(rows(html)[2]).toContain('>live<')
      expect(rows(html)[0]).toContain('board-agent--idle')
      expect(rows(html)[0]).toContain('>idle<')
      expect(rows(html)[0]).toContain('board-agent-title">Role<')
    })

    it('adds the run’s code, its subject path and its elapsed for a working persona with a run in flight', () => {
      const prose = createProseStore({ raf: () => undefined })
      prose.append('r1', 'c1', 'a/b.md', 'text')
      const html = render(new Map<string, PersonaState>([['b', 'work']]), [entry('r1', 'b', { at: Date.now() - 7_000 })], prose)

      expect(rows(html)[1]).toMatch(/board-agent-run">CP a\/b\.md \d+s</)
      expect(rows(html)[1]).toContain('>working<')
    })

    it('omits the path while it is empty, and the code when the entry has none', () => {
      const html = render(new Map<string, PersonaState>([['b', 'work']]), [entry('r1', 'b', { at: Date.now() })])
      const bare = render(new Map<string, PersonaState>([['b', 'work']]), [entry('r1', 'b', { at: Date.now(), code: undefined })])

      expect(rows(html)[1]).toMatch(/board-agent-run">CP \d+s</)
      expect(rows(bare)[1]).toMatch(/board-agent-run">\d+s</)
    })

    it('says `in a turn` and nothing of what for a working persona with no run in flight', () => {
      const html = render(new Map<string, PersonaState>([['b', 'work']]), [entry('r0', 'b', { status: 'finished', endedAt: NOW })])

      expect(rows(html)[1]).toContain('board-agent-run">in a turn<')
      expect(rows(html)[1]).not.toMatch(/CP|\d+s</)
    })

    it('draws the word alone for any other state, and no run line, even under a stale running entry', () => {
      for (const state of ['live', 'note', 'error', 'idle'] as const) {
        const html = render(new Map<string, PersonaState>([['b', state]]), [entry('r1', 'b')])

        expect(rows(html)[1]).not.toContain('board-agent-run')
        expect(rows(html)[1]).not.toMatch(/\d+s</)
      }
    })

    it('shows the elapsed for `work` only', () => {
      const html = render(new Map<string, PersonaState>([['a', 'work'], ['b', 'live']]), [entry('r1', 'a'), entry('r2', 'b')])

      expect(html.match(/board-agent-run/g)).toHaveLength(1)
    })

    it('draws no panel for none, a failure or no snapshot', () => {
      expect(markup(none)).not.toContain('board-agents')
      expect(markup(null, failure)).not.toContain('board-agents')
    })
  })
  describe('the Recent activity panel (Story 6.7)', () => {
    const NOW = 1_700_000_000_000
    const entry = (id: string, agentId: string | undefined, over: Partial<RunCardEntry> = {}): RunCardEntry => ({
      kind: 'run',
      id,
      at: NOW,
      runId: id,
      sessionId: `s-${id}`,
      ...(agentId === undefined ? {} : { agentId }),
      code: 'CP',
      status: 'running',
      notes: [],
      steps: [],
      documents: [],
      ...over
    })
    const render = (entries: readonly RunCardEntry[]): string =>
      renderToStaticMarkup(
        <BoardView snapshot={read} failure={null} folder="_bmad/" states={NO_STATES} installed={ROSTER} entries={entries} />
      )
    const rows = (html: string): string[] => html.split('<li class="board-activity-row').slice(1)

    it('draws the panel after the Agents panel, newest first, with each row’s words', () => {
      const html = render([
        entry('r1', 'a', { at: NOW - 60_000, status: 'finished', endedAt: NOW - 30_000 }),
        entry('r2', 'b', { at: NOW })
      ])

      expect(html.indexOf('board-agents')).toBeLessThan(html.indexOf('board-activity'))
      expect([...html.matchAll(/<h3 class="board-activity-head">([^<]*)</g)].map((match) => match[1])).toEqual(['recent activity'])
      expect([...html.matchAll(/board-activity-did">([^<]*)</g)].map((match) => match[1])).toEqual([
        'started CP',
        'finished CP',
        'started CP'
      ])
      expect(rows(html)[0]).toContain('status-dot--work')
      expect(rows(html)[0]).not.toContain('board-activity-still')
      expect(rows(html)[1]).toContain('status-dot--idle')
      expect(rows(html)[2]).toContain('board-activity-still')
    })

    it('raises no row for a party run, and draws the head over an empty list for no runs', () => {
      expect(rows(render([entry('p1', undefined)]))).toHaveLength(0)
      expect(render([])).toContain('board-activity-head')
      expect(rows(render([]))).toHaveLength(0)
    })

    it('draws no panel for none, a failure or no snapshot', () => {
      expect(markup(none)).not.toContain('board-activity')
      expect(markup(null, failure)).not.toContain('board-activity')
    })
  })
})
