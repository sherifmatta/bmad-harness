// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { foldSprintStatus } from '../src/main/fold/sprint-status'
import { BoardView } from '../src/renderer/ui/board/board-view'
import { createProseStore } from '../src/renderer/ui/chat/prose-store'
import type { ProseStore } from '../src/renderer/ui/chat/prose-store'
import type { RunCardEntry, TranscriptEntry } from '../src/renderer/ui/chat/transcript-entry'
import type { PersonaState } from '../src/renderer/ui/persona/portrait'
import { Shell } from '../src/renderer/ui/shell/shell'
import { VIEWS } from '../src/renderer/ui/shell/view'
import { PERSONA_STATES } from '../src/renderer/ui/status/persona-state'
import { LIVE_REGIONS, SPINNER_MARKUP, STAND_IN, spoken } from '../src/renderer/ui/testing/audit-patterns'
import { installFakeScroll } from '../src/renderer/ui/testing/fake-scroll'
import type { FakeScroll } from '../src/renderer/ui/testing/fake-scroll'
import '../src/renderer/ui/testing/render-hook'
import type { BoardSnapshot } from '../src/shared/board'
import type { AgentView, HarnessError, InstallSnapshot } from '../src/shared/install'

/**
 * Story 6.9, the mounted half (UX-DR21, FR-Board): the audit of what Epic 6 promised not to do. The
 * real `BoardView` (and, for the view switch and the chord, the real `Shell`) is
 * mounted in every state a Board can be in, over a snapshot built by the real `foldSprintStatus` from
 * text holding every status, and each prohibition is read off what it draws. The static half is
 * `tokens.test.ts` (the Board's rules) and `negative-surface.test.ts`; the write audit is
 * `src/main/board-audit.test.ts`.
 *
 * This file is in `tests/` and not beside the view because it reaches both layers (the fold in main and
 * the view in the renderer), which a file under `src/renderer/ui` may not: the layer rule holds for tests.
 *
 * Two rulings stand because a design audit (2026-10-10) reversed the epic's first ones: an empty column
 * says `no stories`, and an epic row may carry one decorative track. Both are asserted as exactly that and
 * nothing wider. A failing assertion is fixed in the product only if it is a prohibition the epic made;
 * none is loosened.
 */

const NOW = new Date(2026, 9, 10, 14, 31).getTime()

/** What would announce, spelt apart so this file is not itself a live region in the product's own sweep. */
const LIVE = `[${'aria'}-live]`
const ANNOUNCING = '[role~=status], [role~=alert], [role~=log]'

const agent = (id: string, name: string, title: string): AgentView => ({ id, module: 'bmm', name, title, icon: 'i', description: 'd' })
const ROSTER = [
  agent('bmad-agent-analyst', 'Mary', 'Analyst'),
  agent('bmad-agent-pm', 'John', 'Product Manager'),
  agent('bmad-agent-architect', 'Winston', 'Architect'),
  agent('bmad-agent-ux-designer', 'Sally', 'UX Designer'),
  agent('bmad-agent-dev', 'Amelia', 'Developer')
]

/** One persona in each state the vocabulary has, in roster order. */
const EACH_STATE = new Map<string, PersonaState>(ROSTER.map((one, at) => [one.id, PERSONA_STATES[at]]))
const ALL_IDLE = new Map<string, PersonaState>()
const WORKING = ROSTER.find((one) => EACH_STATE.get(one.id) === 'work') as AgentView

/** Every status, an unrecognised one, an epic with no stories, a retrospective key and a done epic. */
const FULL_TEXT = `generated: 10-10-2026
development_status:
  epic-1: done
  1-1-the-first-story-is-done: done
  1-2-the-second-story-is-done: done
  epic-1-retrospective: done
  epic-2: in-progress
  2-1-a-story-in-the-backlog: backlog
  2-2-a-story-ready-for-dev: ready-for-dev
  2-3-a-story-in-progress: in-progress
  2-4-a-story-in-review: review
  2-5-a-story-that-is-done: done
  2-6-an-optional-story: optional
  2-7-a-story-nobody-recognises: blocked
  epic-2-retrospective: optional
  epic-3: backlog
`

const fold = (text: string, revision: number): BoardSnapshot => ({
  revision,
  ...foldSprintStatus({ state: 'text', text })
})

const FULL = fold(FULL_TEXT, 3)
const DONE_ONLY = fold('development_status:\n  epic-1: done\n  1-1-only-story: done\n  epic-1-retrospective: optional\n', 2)
const NO_EPICS = fold('development_status:\n  notes: backlog\n', 2)
const NONE: BoardSnapshot = { revision: 1, ...foldSprintStatus({ state: 'absent' }) }
const UNREADABLE: BoardSnapshot = { revision: 1, ...foldSprintStatus({ state: 'unreadable', errno: 'EACCES' }) }
const FAILURE: HarnessError = { code: 'board/unexpected', message: 'board · unexpected failure' }

const run = (id: string, who: AgentView, over: Partial<RunCardEntry> = {}): RunCardEntry => ({
  kind: 'run',
  id,
  at: NOW - 60_000,
  runId: id,
  sessionId: `s-${id}`,
  agentId: who.id,
  code: 'CP',
  status: 'running',
  notes: [],
  steps: [],
  documents: [],
  ...over
})

/** A run in flight for the persona at work, and one run of each end after it. */
const RUNS: TranscriptEntry[] = [
  run('r1', WORKING, { at: NOW - 7_000 }),
  run('r2', ROSTER[0], { at: NOW - 3_600_000, status: 'finished', endedAt: NOW - 3_500_000 }),
  run('r3', ROSTER[2], { at: NOW - 7_200_000, status: 'stopped', endedAt: NOW - 7_100_000 }),
  run('r4', ROSTER[4], { at: NOW - 86_400_000, status: 'failed', endedAt: NOW - 86_300_000 })
]

function proseWithPath(): ProseStore {
  const prose = createProseStore({ raf: () => undefined })
  prose.append('r1', 'c1', '_bmad/planning-artifacts/prd.md', 'text')
  return prose
}

type Case = {
  name: string
  snapshot: BoardSnapshot | null
  failure?: HarnessError
  folder?: string
  states: ReadonlyMap<string, PersonaState>
  entries: readonly TranscriptEntry[]
  /** A snapshot that was read draws the regions; the others draw `no sprint status` or nothing. */
  regions: boolean
}

const CASES: Case[] = [
  { name: 'every status, an unrecognised one, a story-less epic, each persona state and a run in flight', snapshot: FULL, folder: '_bmad/', states: EACH_STATE, entries: RUNS, regions: true },
  { name: 'the same file with every persona idle and no run', snapshot: FULL, folder: '_bmad/', states: ALL_IDLE, entries: [], regions: true },
  { name: 'a read file whose only epic is done', snapshot: DONE_ONLY, folder: '_bmad/', states: EACH_STATE, entries: RUNS, regions: true },
  { name: 'a read file with no epic at all', snapshot: NO_EPICS, folder: '_bmad/', states: EACH_STATE, entries: RUNS, regions: true },
  { name: 'no sprint status, with the watched path', snapshot: NONE, folder: '_bmad/', states: EACH_STATE, entries: RUNS, regions: false },
  { name: 'no sprint status, with no path yet', snapshot: NONE, folder: undefined, states: ALL_IDLE, entries: [], regions: false },
  { name: 'a file that cannot be read', snapshot: UNREADABLE, folder: '_bmad/', states: ALL_IDLE, entries: [], regions: false },
  { name: 'a failed ask', snapshot: null, failure: FAILURE, folder: '_bmad/', states: ALL_IDLE, entries: [], regions: false },
  { name: 'before the first snapshot', snapshot: null, folder: '_bmad/', states: ALL_IDLE, entries: [], regions: false }
]

let container: HTMLElement
let root: Root

function render(props: Case): void {
  act(() =>
    root.render(
      createElement(BoardView, {
        snapshot: props.snapshot,
        failure: props.failure ?? null,
        folder: props.folder,
        states: props.states,
        installed: ROSTER,
        entries: props.entries,
        prose: proseWithPathFor(props)
      })
    )
  )
}

/** The run in flight reads its subject path from the prose store, as the window's store is read. */
function proseWithPathFor(props: Case): ProseStore | undefined {
  return props.entries.length === 0 ? undefined : proseStore
}
let proseStore: ProseStore

function mountWith(props: Case): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  render(props)
}

beforeEach(() => {
  // The clock is the test's: the run's elapsed is read against NOW and moves only when told to.
  vi.useFakeTimers({ now: NOW, toFake: ['setInterval', 'clearInterval', 'Date'] })
  proseStore = proseWithPath()
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

const all = (selector: string, within: ParentNode = container): HTMLElement[] => [...within.querySelectorAll<HTMLElement>(selector)]
const text = (node: Element | null | undefined): string => node?.textContent ?? ''

/** Every class a drawn element carries, split into its hyphen-separated words. */
function classWords(): Set<string> {
  return new Set(all('*').flatMap((node) => [...node.classList].flatMap((name) => name.split('-'))))
}

/** The React props of an element, where its handlers would be. */
function handlersOf(element: Element): string[] {
  const props = Object.keys(element).filter((name) => name.startsWith('__reactProps$'))
  return props.flatMap((name) => Object.keys((element as unknown as Record<string, object>)[name]).filter((key) => /^on[A-Z]/.test(key)))
}

/** The words of the Board that are not a figure's label, which names `stories in progress` as its own fact. */
const withoutLabels = (words: string): string => words.replace(/stories in progress/g, '')

describe.each(CASES)('Epic 6 promised nothing it did not keep: $name', (props) => {
  beforeEach(() => mountWith(props))

  it('draws no number on a column, no meter, progress, percentage, currency or relative time', () => {
    for (const heading of all('.board-column-head')) {
      expect(text(heading), 'a column heading').not.toMatch(/\d/)
    }
    expect(container.querySelector('progress, meter, [role~=progressbar], [role~=meter], [aria-valuenow], [aria-valuemin], [aria-valuemax]')).toBeNull()
    expect(withoutLabels(container.innerHTML)).not.toMatch(SPINNER_MARKUP)
    expect(spoken(container)).not.toMatch(/%|\bpercent|[$€£¥]|\bago\b|\bspend|\bbudget|\bcost|\btoken|tool[- ]call|decisions? open/i)
  })

  it('draws no control, drag, edit, field or tab stop, and nothing with a handler', () => {
    expect(container.querySelector('button, a, input, select, textarea, form, label, dialog, details, summary, canvas, audio, video, iframe')).toBeNull()
    expect(container.querySelector('[draggable], [contenteditable], [tabindex], [onclick], [role~=button], [role~=link], [role~=menuitem], [role~=tab], [role~=switch]')).toBeNull()
    for (const element of all('*')) {
      expect(handlersOf(element), `${element.tagName}.${element.className}`).toEqual([])
    }
    // The control: where the Board draws anything, React's props key is found on it, or the sweep above looked at nothing.
    if (props.regions) {
      expect(all('*').some((element) => Object.keys(element).some((name) => name.startsWith('__reactProps$')))).toBe(true)
    }
  })

  it('says none of the words of a thing the Board does not do or steer', () => {
    expect(spoken(container)).not.toMatch(/\b(?:New story|Approve|Retry|Inbox|next|recommended|needs you|assign\w*|owner)\b/i)
  })

  it('is no live region and no announcement, and nothing in it is busy', () => {
    expect(container.querySelector(`${LIVE}, [aria-busy], [aria-atomic], ${ANNOUNCING}, ${LIVE_REGIONS}`)).toBeNull()
  })

  it('draws no spinner, skeleton or stand-in sentence, whatever the state', () => {
    expect(withoutLabels(spoken(container))).not.toMatch(STAND_IN)
    const words = classWords()
    for (const banned of ['spinner', 'skeleton', 'shimmer', 'loader', 'loading', 'badge', 'unread', 'toast', 'snackbar', 'gauge', 'meter']) {
      expect(words.has(banned), banned).toBe(false)
    }
  })

  it('has as its one bar the epic row’s decorative track, and as its one empty-state words `no stories`', () => {
    const marks = all('*').filter((node) => [...node.classList].some((name) => /(?:^|-)(?:bar|track|fill|meter)(?:$|-)/.test(name)))
    expect(marks.every((node) => ['board-epic-track', 'board-epic-fill'].some((name) => node.classList.contains(name)))).toBe(true)
    for (const track of all('.board-epic-track')) {
      expect(track.tagName).toBe('SPAN')
      expect(track.getAttribute('aria-hidden')).toBe('true')
      expect(text(track)).toBe('')
      expect([...track.children].map((child) => child.className)).toEqual(['board-epic-fill'])
      expect(track.parentElement?.className).toBe('board-epic')
    }
    for (const fill of all('.board-epic-fill')) {
      expect(fill.tagName).toBe('SPAN')
      expect(fill.children).toHaveLength(0)
    }
    // Nothing but the fill carries a style; a portrait is the only drawing.
    expect(all('[style]').every((node) => node.classList.contains('board-epic-fill'))).toBe(true)
    expect(all('svg').every((node) => node.closest('.board-agent') !== null)).toBe(true)
    // Words of absence: the Board says `no stories` and, with no file, `no sprint status`, and nothing else of the kind.
    const absent = all('*')
      .filter((node) => node.children.length === 0 && /^no\b|\bnothing\b|\bempty\b|\bnone\b|\byet\b/i.test(text(node)))
      .map(text)
    expect(absent.every((line) => ['no stories', 'no sprint status'].includes(line))).toBe(true)
  })

  it('draws the regions only for a snapshot that was read, and the one line and path for none', () => {
    const regions = ['.board-overview', '.board-stories', '.board-epics', '.board-agents', '.board-activity']
    for (const region of regions) {
      expect(all(region), region).toHaveLength(props.regions ? 1 : 0)
    }
    if (props.regions) {
      expect(container.querySelector('.board-empty')).toBeNull()
      return
    }
    const none = props.snapshot === null ? props.failure !== undefined : props.snapshot.kind === 'none'
    expect(all('.board-empty-line').map(text)).toEqual(none ? ['no sprint status'] : [])
    expect(all('.board-empty-path').map(text)).toEqual(none && props.folder !== undefined ? ['_bmad/implementation-artifacts/sprint-status.yaml'] : [])
    // An error is never shown: no code, no message, no path of the machine's own.
    expect(text(container)).not.toMatch(/board\/|unexpected|EACCES|\/Users\//)
  })
})

describe('the Board, read from the real fold, holds to its two figures, its columns and its rows', () => {
  beforeEach(() => mountWith(CASES[0]))

  it('draws two cells, label then figure then line, and no third', () => {
    expect(all('.board-figure')).toHaveLength(2)
    expect(all('.board-figure-label').map(text)).toEqual(['agents running', 'stories in progress'])
    expect(all('.board-figure-value').map(text)).toEqual(['1', '1'])
    expect(all('.board-figure-line').map(text)).toEqual(['of 5 installed', 'of 7 stories'])
    expect([...all('.board-overview')[0].children].map((child) => child.className)).toEqual(['board-figure', 'board-figure'])
  })

  it('draws the five columns in the file’s words, then one more for each status it does not know, none with a count', () => {
    expect(all('.board-column-head').map(text)).toEqual(['backlog', 'ready-for-dev', 'in-progress', 'review', 'done', 'optional', 'blocked'])
    expect(all('.board-column')).toHaveLength(7)
    for (const column of all('.board-column')) {
      expect([...column.children].map((child) => child.tagName)).toEqual(['H3', 'UL'])
    }
  })

  it('draws a card for each story outside a done epic, as its number and title, and an empty column as `no stories`', () => {
    const column = (status: string): HTMLElement => all('.board-column').find((one) => text(one.querySelector('.board-column-head')) === status) as HTMLElement
    expect(all('.board-card').map(text)).toEqual([
      '2.1a story in the backlog',
      '2.2a story ready for dev',
      '2.3a story in progress',
      '2.4a story in review',
      '2.5a story that is done',
      '2.6an optional story',
      '2.7a story nobody recognises'
    ])
    expect(all('.board-cards-empty')).toHaveLength(0)
    expect(text(column('done'))).toContain('2.5')
    // The done epic's stories draw no card, and its retrospective is drawn nowhere.
    expect(text(container)).not.toMatch(/the first story|the second story|retrospective/i)
    for (const card of all('.board-card')) {
      expect([...card.children].map((child) => child.className)).toEqual(['board-card-number', 'board-card-title'])
      expect(card.querySelector('.initials, .portrait, svg, [class*=owner], [class*=assign]')).toBeNull()
      expect(card.hasAttribute('tabindex')).toBe(false)
    }
  })

  it('says `no stories` in every column with no card, and no word of any other kind', () => {
    act(() => root.unmount())
    container.remove()
    mountWith({ ...CASES[0], snapshot: DONE_ONLY })

    expect(all('.board-cards-empty').map(text)).toEqual(Array(5).fill('no stories'))
    expect(all('.board-card')).toHaveLength(0)
  })

  it('draws a row for every epic, its words as the one place the figure is stated, and a done epic’s row remains', () => {
    expect(all('.board-epic-id').map(text)).toEqual(['Epic 1', 'Epic 2', 'Epic 3'])
    expect(all('.board-epic-progress').map(text)).toEqual(['2 of 2 stories done', '1 of 7 stories done', 'no stories'])
    // One track for each epic that has stories: none for the story-less epic.
    expect(all('.board-epic-track')).toHaveLength(2)
  })

  it('names who is on what in words: a state for each persona, and the run for the one at work, with an absolute time for each thing done', () => {
    expect(all('.board-agent')).toHaveLength(5)
    expect(all('.board-agent .state-text').map(text)).toEqual(['idle', 'working', 'live', 'file changed', 'error'])
    expect(all('.board-agent-run').map(text)).toEqual(['CP _bmad/planning-artifacts/prd.md 7s'])
    // Newest first, each at its own absolute time and the same read live and after a relaunch.
    expect(all('.board-activity-time').map(text)).toEqual(['10-10 14:30', '10-10 13:32', '10-10 13:31', '10-10 12:32', '10-10 12:31', '10-09 14:32', '10-09 14:31'])
    for (const time of all('.board-activity-time').map(text)) {
      expect(time).toMatch(/^\d\d-\d\d \d\d:\d\d$/)
    }
  })
})

describe('a state change lands in one render, with nothing moved or focused', () => {
  it('replaces the text, leaves focus and scroll where they were, and draws no live region', () => {
    mountWith(CASES[1])
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    container.scrollTop = 40
    const moved = fold(FULL_TEXT.replace('2-1-a-story-in-the-backlog: backlog', '2-1-a-story-in-the-backlog: in-progress'), 4)
    render({ ...CASES[1], snapshot: moved, states: EACH_STATE, entries: RUNS })
    act(() => void vi.advanceTimersByTime(10_000))

    expect(all('.board-figure-value').map(text)).toEqual(['1', '2'])
    expect(all('.board-agent-run').map(text)).toEqual(['CP _bmad/planning-artifacts/prd.md 17s'])
    expect(document.activeElement).toBe(outside)
    expect(container.scrollTop).toBe(40)
    expect(container.querySelector(`${LIVE}, ${ANNOUNCING}`)).toBeNull()
    // That the app's own live region stays silent is proved in the App, where it is connected: src/renderer/ui/app.test.tsx.
    outside.remove()
  })
})

describe('the view switch and the chord, in the real shell', () => {
  const installed: InstallSnapshot = { revision: 1, agents: ROSTER, menus: {}, errors: [], preflight: [] }
  let fake: FakeScroll
  let shellContainer: HTMLElement
  let shellRoot: Root

  beforeEach(() => {
    fake = installFakeScroll({ client: 400, height: 1000, top: 0 })
    shellContainer = document.createElement('div')
    document.body.append(shellContainer)
    shellRoot = createRoot(shellContainer)
    // The composer is a field the user is typing in: the one the chord must leave alone.
    act(() =>
      shellRoot.render(
        createElement(Shell, {
          projectPath: '/work/falcon',
          snapshot: installed,
          board: FULL,
          states: EACH_STATE,
          runs: RUNS,
          prose: proseStore,
          rail: { revision: 1, folder: '_bmad/', rows: [] },
          composer: () => createElement('textarea', { className: 'composer-field' })
        })
      )
    )
    // `mountWith` was not used: the unmount below is the shell's.
    container = shellContainer
    root = shellRoot
  })

  afterEach(() => fake.restore())

  const section = (name: string): HTMLElement => document.querySelector(`.view-${name}`) as HTMLElement
  const buttons = (): HTMLButtonElement[] => all('.view-switch button') as HTMLButtonElement[]
  const press = (key: string, target: Element = document.body): void => void act(() => void target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))

  it('has exactly three views, each a plain button with its label alone: no count, badge or dot', () => {
    expect(VIEWS).toHaveLength(3)
    expect(buttons().map(text)).toEqual(['1:1 Conversation', 'Party Mode', 'Board'])
    expect(buttons().every((button) => button.children.length === 0 && !/\d/.test(text(button).replace('1:1', '')))).toBe(true)
    expect(all('.view-switch *').filter((node) => !buttons().includes(node as HTMLButtonElement))).toEqual([])
    expect(all('.view-switch [class], .view-switch [style], .view-switch [aria-label], .view-switch [title]')).toEqual([])
    expect(all('.view')).toHaveLength(3)
    expect(buttons().filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
  })

  it('draws the Board in the shell as it draws it alone, with the same prohibitions, and announces nothing on the switch', () => {
    act(() => buttons()[2].click())

    expect(section('board').hidden).toBe(false)
    expect(all('.board-card', section('board'))).toHaveLength(7)
    expect(section('board').querySelector(`${LIVE}, ${ANNOUNCING}, button, a, input, select, textarea, [tabindex], [draggable], [contenteditable]`)).toBeNull()
    expect(withoutLabels(text(section('board')))).not.toMatch(/%|\bago\b|[$€£¥]|Inbox|New story|Approve|Retry|\bnext\b|needs you|recommended/i)
    expect(document.querySelectorAll(LIVE_REGIONS)).toHaveLength(0)
  })

  it('does nothing for `g` then `b` while a field has focus, in the composer or any other field', () => {
    const composer = document.querySelector('textarea.composer-field') as HTMLTextAreaElement
    composer.focus()
    press('g', composer)
    press('b', composer)
    expect(section('board').hidden).toBe(true)

    // A chord begun outside a field does not finish inside one.
    press('g')
    press('b', composer)
    expect(section('board').hidden).toBe(true)

    for (const field of ['input', 'select', 'textarea'] as const) {
      const element = document.createElement(field)
      document.body.append(element)
      element.focus()
      press('g', element)
      press('b', element)
      expect(section('board').hidden, field).toBe(true)
      element.remove()
    }

    press('g')
    press('b')
    expect(section('board').hidden).toBe(false)
  })
})
