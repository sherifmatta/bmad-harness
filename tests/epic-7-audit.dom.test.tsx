// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { foldSkills } from '../src/main/fold/skills'
import { foldSprintStatus } from '../src/main/fold/sprint-status'
import { createPersonaProjection } from '../src/main/projections/personas'
import { createRailProjection } from '../src/main/projections/rail'
import { createRailAnnotator } from '../src/main/projections/rail-annotator'
import { parseCsv } from '../src/main/sources/install/skill-manifest'
import { App } from '../src/renderer/ui/app'
import { BoardView } from '../src/renderer/ui/board/board-view'
import { createProseStore } from '../src/renderer/ui/chat/prose-store'
import type { PersonaState } from '../src/renderer/ui/status/persona-state'
import { LIVE_REGIONS, spoken } from '../src/renderer/ui/testing/audit-patterns'
import { createFakeBridge } from '../src/renderer/ui/testing/fake-bridge'
import type { FakeBridge } from '../src/renderer/ui/testing/fake-bridge'
import { installFakeScroll } from '../src/renderer/ui/testing/fake-scroll'
import type { FakeScroll } from '../src/renderer/ui/testing/fake-scroll'
import { HOSTILE_MARKDOWN } from '../src/renderer/ui/testing/hostile-markdown'
import { mount, settle } from '../src/renderer/ui/testing/render-hook'
import type { Mounted } from '../src/renderer/ui/testing/render-hook'
import type { BoardSnapshot } from '../src/shared/board'
import type { RailSnapshot } from '../src/shared/rail'
import type { ConversationSnapshot, RunCardSnapshot, TranscriptRecord } from '../src/shared/conversation'
import type { ContractEvent } from '../src/shared/events'
import type { AgentView, InstallSnapshot } from '../src/shared/install'

/**
 * Story 7.6, the mounted half (Epic 7's closing audit): what the epic promised not to do, read off the real
 * `BoardView` and the real `App` over snapshots built by the real folds. Epic 7 retired four prohibitions on
 * purpose, and this file says what is now allowed as exactly as the audits of Epics 1 to 6 said what was forbidden:
 *
 * - a card or an epic row is a control if and only if it has a `file`;
 * - `/` lists the install's skills only as the leading-`/` list, never elsewhere;
 * - a persona's live dot means "holds context" and exists only on a live seat;
 * - a chat may have no persona only as the New session chat, or as a skill-first session spoken in the skill's name.
 *
 * Every other prohibition of Epics 1 to 6 stands and is held by its own epic's audit. The snapshots come from
 * `foldSprintStatus` (with its `files` argument), from `foldSkills` over a real, fully quoted manifest, and from the
 * App's own `hydrate` and `foldEvent`; no entry is built by hand where a fold makes it. A failing assertion is
 * fixed in the product only if it is a prohibition the epic kept; none is loosened.
 *
 * It is in `tests/` because it reaches both layers (the folds in main, the views in the renderer), which a file
 * under `src/renderer/ui` may not. The static halves are `negative-surface.test.ts` and `contract.test.ts`; the
 * write audit is `src/main/board-audit.test.ts`; the isolation audit of main is `src/main/session-bridge.test.ts`.
 */

const ROOT = resolve(import.meta.dirname, '..')
const NOW = new Date(2026, 9, 16, 11, 30).getTime()

/** What would announce, spelt apart so this file is not itself a live region in the product's own sweep. */
const LIVE = `[${'aria'}-live]`
const ANNOUNCING = '[role~=status], [role~=alert], [role~=log]'

const agent = (id: string, name: string, title: string): AgentView => ({ id, module: 'bmm', name, title, icon: 'i', description: 'd' })
const MARY = agent('bmad-agent-analyst', 'Mary', 'Analyst')
const JOHN = agent('bmad-agent-pm', 'John', 'Product Manager')
const SALLY = agent('bmad-agent-ux-designer', 'Sally', 'UX Designer')
const ROSTER = [MARY, JOHN, SALLY]
/** Menu entries whose words are none of the manifest's: the persona menu's code buttons are not a skill list. */
const MENUS = {
  [MARY.id]: [
    { code: 'BP', description: 'Brainstorm the project' },
    { code: 'MR', description: 'Research the market' }
  ],
  [JOHN.id]: [{ code: 'CP', description: 'Create the plan' }],
  [SALLY.id]: []
}

/**
 * The install's manifest as the file holds it: RFC 4180, every field quoted, one description with a comma and one
 * with a doubled quote, so a reader that splits on commas would fail here. Read by the real parser and fold.
 */
const MANIFEST = [
  '"canonicalId","name","description","module","path"',
  '"bmad-agent-analyst","bmad-agent-analyst","Mary, the business analyst","bmm","_bmad/bmm/bmad-agent-analyst/SKILL.md"',
  '"bmad-build","bmad-build","Turns implementation work into working code","bmm","_bmad/bmm/bmad-build/SKILL.md"',
  '"bmad-build-auto","bmad-build-auto","One iteration of an ""unattended"" loop","bmm","_bmad/bmm/bmad-build-auto/SKILL.md"',
  '"bmad-code-review","bmad-code-review","Reviews the changes with independent readers","bmm","_bmad/bmm/bmad-code-review/SKILL.md"',
  '"bmad-party-mode","bmad-party-mode","Group discussions between the personas","core","_bmad/core/bmad-party-mode/SKILL.md"'
].join('\r\n')
const SKILLS = foldSkills(parseCsv(MANIFEST))
const SKILL_NAMES = SKILLS.map(({ name }) => name)

const INSTALL: InstallSnapshot = { revision: 1, agents: ROSTER, menus: MENUS, errors: [], preflight: [], skills: SKILLS }

let mounted: Mounted | null
let bridge: FakeBridge
let fake: FakeScroll

const all = (selector: string, within: ParentNode = document.body): HTMLElement[] => [...within.querySelectorAll<HTMLElement>(selector)]
const text = (node: Element | null | undefined): string => node?.textContent ?? ''
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** The React props of an element, where its handlers would be. */
function handlersOf(element: Element): string[] {
  const props = Object.keys(element).filter((name) => name.startsWith('__reactProps$'))
  return props.flatMap((name) => Object.keys((element as unknown as Record<string, object>)[name]).filter((key) => /^on[A-Z]/.test(key)))
}

beforeEach(() => {
  mounted = null
  // The clock is the test's: a counter reads the date, which moves only when told to.
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  fake = installFakeScroll({ client: 400, height: 1000, top: 0 })
})

afterEach(() => {
  mounted?.unmount()
  bridge?.uninstall()
  fake.restore()
  vi.useRealTimers()
})

/** React's controlled input listens for the native setter, not for `.value =`. */
function type(element: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  act(() => {
    setter?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/**
 * The `persona:state` main raises when a seat that held context (opened, idle, process attached) is closed on purpose,
 * as the real persona projection folds it: the payload is the fold's, not written here.
 */
function personaStateOnClose(agentId: string, sessionId: string, at: number): ContractEvent {
  const raised: ContractEvent[] = []
  const projection = createPersonaProjection({ now: () => at, onChange: (event) => void raised.push(event) })
  projection.apply({ name: 'session:opened', payload: { sessionId, agentId, at: at - 1000 } })
  projection.apply({ name: 'session:awaiting-turn', payload: { sessionId, at: at - 900 } })
  projection.attach(sessionId)
  expect(raised.at(-1)).toMatchObject({ name: 'persona:state', payload: { agentId, state: 'live' } })
  const before = raised.length
  projection.apply({ name: 'session:closed', payload: { sessionId, agentId, reason: 'closed', at } })
  expect(raised.slice(before)).toHaveLength(1)
  return raised[before]
}

const key = (element: Element, name: string): void =>
  act(() => void element.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })))

// ---------------------------------------------------------------------------------------------------------
// The Board: a card or an epic row is a control if and only if it has a file.
// ---------------------------------------------------------------------------------------------------------

describe('the Board, mixed: a card or row is a button if and only if it has a path (Story 7.1)', () => {
  const DIR = '_bmad/implementation-artifacts/'
  /** One spec for story 2.2, two for story 2.3, none for the rest; a context for epics 1 and 2, none for epic 3. */
  const NAMES = ['spec-2-2-one.md', 'spec-2-3-first.md', 'spec-2-3-second.md', 'epic-1-context.md', 'epic-2-context.md', 'epic-2-retro-2026-10-01.md']
  const TEXT = `generated: 10-16-2026
development_status:
  epic-1: done
  1-1-a-done-story: done
  epic-2: in-progress
  2-1-a-story-with-no-spec: backlog
  2-2-a-story-with-one-spec: in-progress
  2-3-a-story-with-two-specs: review
  2-4-another-story-with-no-spec: ready-for-dev
  epic-2-retrospective: optional
  epic-3: backlog
  3-1-a-story-of-an-epic-with-no-context: backlog
`
  const SNAPSHOT: BoardSnapshot = { revision: 4, ...foldSprintStatus({ state: 'text', text: TEXT }, undefined, { dir: DIR, names: NAMES }) }
  const epics = SNAPSHOT.kind === 'read' ? SNAPSHOT.epics : []
  const stories = epics.flatMap((epic) => epic.stories)
  /** What the fold resolved, read off the snapshot: the audit does not name the paths it expects. */
  const FILES = [...epics.map((epic) => epic.file), ...stories.map((story) => story.file)].filter((file): file is string => file !== undefined)

  let container: HTMLElement
  let root: Root

  beforeEach(() => {
    bridge = createFakeBridge(INSTALL)
    bridge.install()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    act(() =>
      root.render(
        createElement(BoardView, {
          snapshot: SNAPSHOT,
          failure: null,
          folder: '_bmad/',
          states: new Map<string, PersonaState>(),
          installed: ROSTER,
          entries: [],
          prose: createProseStore({ raf: () => undefined })
        })
      )
    )
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const storyOf = (card: HTMLElement) => stories.find((story) => story.number === text(card.querySelector('.board-card-number')))
  const epicOf = (row: HTMLElement) => epics.find((epic) => `Epic ${epic.number}` === text(row.querySelector('.board-epic-id')))
  const controls = (): HTMLButtonElement[] => all('button', container) as HTMLButtonElement[]

  it('is read from the real fold: some stories and epics have a file, one story’s two specs are none, and some have none', () => {
    expect(FILES).toEqual([`${DIR}epic-1-context.md`, `${DIR}epic-2-context.md`, `${DIR}spec-2-2-one.md`])
    expect(stories.find((story) => story.number === '2.3')?.file).toBeUndefined()
    expect(epics.find((epic) => epic.number === 3)?.file).toBeUndefined()
  })

  it('has a native button on exactly the cards and epic rows that carry a path, and none elsewhere', () => {
    const cards = all('.board-card', container)
    const rows = all('.board-epic', container)
    expect(cards).toHaveLength(5)
    expect(rows).toHaveLength(3)
    for (const card of cards) {
      expect(card.querySelector('button') !== null, text(card)).toBe(storyOf(card)?.file !== undefined)
    }
    for (const row of rows) {
      expect(row.querySelector('button') !== null, text(row)).toBe(epicOf(row)?.file !== undefined)
    }
    expect(controls()).toHaveLength(FILES.length)
    for (const button of controls()) {
      expect(button.tagName).toBe('BUTTON')
      expect(button.getAttribute('type')).toBe('button')
      expect(button.closest('li')?.matches('.board-card, .board-epic')).toBe(true)
    }
    // Nothing else of the Board is a control of any kind.
    expect(container.querySelector('a, input, select, textarea, form, label, summary, [role~=button], [role~=link], [role~=menuitem], [role~=tab], [onclick]')).toBeNull()
  })

  it('gives every card and row none of draggable, contenteditable, href, tabindex, an icon, count, badge or owner class, a digit that is not its own, or a colour of its own', () => {
    const rows: [HTMLElement, string][] = [
      ...all('.board-card', container).map((card): [HTMLElement, string] => [card, '.board-card-number, .board-card-title']),
      ...all('.board-epic', container).map((row): [HTMLElement, string] => [row, '.board-epic-id, .board-epic-title, .board-epic-progress'])
    ]
    expect(rows).toHaveLength(8)
    for (const [row, own] of rows) {
      const name = text(row)
      expect(row.querySelector('[draggable], [contenteditable], [href], [tabindex], [class*=icon], [class*=count], [class*=badge], [class*=owner], svg, img'), name).toBeNull()
      for (const attribute of ['draggable', 'contenteditable', 'href', 'tabindex', 'style']) {
        expect(row.hasAttribute(attribute), `${name} ${attribute}`).toBe(false)
      }
      // A digit stands only in its own number, title and figure.
      for (const leaf of [row, ...all('*', row)].filter((node) => node.children.length === 0)) {
        if (leaf.closest(own) === null) {
          expect(text(leaf), `${name} / ${leaf.className}`).not.toMatch(/\d/)
        }
      }
      // The colour of a card or row is the Board's own: nothing of it carries a style, and only the epic’s track fill carries a width.
      for (const styled of all('[style]', row)) {
        expect(styled.className).toBe('board-epic-fill')
        expect(styled.getAttribute('style')).toMatch(/^width: \d+%;?$/)
      }
    }
    for (const button of controls()) {
      expect(button.className).toMatch(/^board-(?:card|epic)-open$/)
      expect(button.getAttributeNames().sort()).toEqual(['class', 'type'])
      expect(button.querySelector('svg, img, [class*=icon]')).toBeNull()
    }
  })

  it('keeps the old prohibitions for every row without a file: no control, no tab stop, no handler, the words it always had', () => {
    const plain = [...all('.board-card', container), ...all('.board-epic', container)].filter((row) => row.querySelector('button') === null)
    expect(plain).toHaveLength(5)
    for (const row of plain) {
      expect(row.querySelector('button, a, input, [tabindex], [role]'), text(row)).toBeNull()
      expect(row.tabIndex).toBe(-1)
      act(() => row.focus())
      expect(document.activeElement).not.toBe(row)
      for (const node of [row, ...all('*', row)]) {
        expect(handlersOf(node), `${node.tagName}.${node.className}`).toEqual([])
      }
    }
    for (const card of plain.filter((row) => row.matches('.board-card'))) {
      expect([...card.children].map((child) => child.className)).toEqual(['board-card-number', 'board-card-title'])
    }
    // Said of nothing: no word about why a row opens nothing.
    expect(spoken(container)).not.toMatch(/\bno spec\b|\bmissing\b|\bnot available\b|\bunavailable\b|\bno file\b/i)
    expect(all('[title], [aria-label], [aria-describedby], [aria-disabled]', container).filter((node) => node.closest('.board-stories, .board-epics') !== null)).toEqual([])
  })

  it('draws a row with a file as the same words as one without: the button wraps what was there and adds no element of its own', () => {
    const [first, second, third] = ['Epic 1', 'Epic 2', 'Epic 3'].map((id) => all('.board-epic', container).find((row) => text(row.querySelector('.board-epic-id')) === id) as HTMLElement)
    const shape = (row: HTMLElement): string[] => {
      const holder = row.querySelector('button') ?? row
      return [...holder.children].map((child) => child.className)
    }
    expect(shape(first)).toEqual(shape(third))
    expect(shape(second)).toEqual(shape(third))
  })

  it('asks main to open the exact path of each control, once for each press, and calls nothing else of the bridge', () => {
    for (const button of controls()) {
      // Keyboard activation is the native button's: Enter and Space are its click, which jsdom does not synthesise, so it is
      // backed by the element being a `button` in the tab order whose one handler is `onClick` (nothing handles a key itself).
      expect(button.tagName).toBe('BUTTON')
      expect(handlersOf(button)).toEqual(['onClick'])
      act(() => button.focus())
      expect(document.activeElement).toBe(button)
      // One press is one `doc.open` of that control's path.
      act(() => button.click())
      expect(bridge.docs.filter((path) => path === (storyOf(button.closest('li') as HTMLElement)?.file ?? epicOf(button.closest('li') as HTMLElement)?.file))).toHaveLength(1)
    }
    // Every press opened its own path once, and every path is one the fold resolved.
    expect([...bridge.docs].sort()).toEqual([...FILES].sort())
    // A press says nothing aloud: the Board is no live region, before or after.
    expect(container.querySelector(`${LIVE}, ${ANNOUNCING}, ${LIVE_REGIONS}`)).toBeNull()
    // Nothing but the document bridge was asked: the Board has no other way to reach main.
    expect([...new Set(bridge.calls.filter((call) => call !== 'getInstall'))].sort()).toEqual(['onDocClosed', 'openDoc'])
  })
})

// ---------------------------------------------------------------------------------------------------------
// The whole App, over a conversation main might hold: persona seats, the room and skill-first sessions.
// ---------------------------------------------------------------------------------------------------------

const T0 = NOW - 3_600_000
const record = <T extends TranscriptRecord>(one: T): T => one

/** What each thread says, each with a word no other thread has: a thread drawing another's shows the word. */
const SHARED = ['sharedmark-user', 'sharedmark-mary', 'sharedmark-john', 'sharedmark-sysline']
const ROOMED = ['roommark-user', 'roommark-john', 'roommark-sysline']
const SKILL_A = ['skillamark-user', 'skillamark-said', 'skillamark-sysline']
const SKILL_B = ['skillbmark-user', 'skillbmark-said', 'skillbmark-sysline']
const THREADS = { shared: SHARED, room: ROOMED, a: SKILL_A, b: SKILL_B }

const card = (over: Partial<RunCardSnapshot>): RunCardSnapshot => ({
  runId: 'run',
  sessionId: 's',
  code: 'BP',
  startedAt: T0 + 5000,
  status: 'finished',
  endedAt: T0 + 6000,
  notes: [],
  steps: [],
  documents: [],
  ...over
})

/** The conversation main holds: two persona seats and a room live, three skill-first sessions (working, live, ended). */
function world(over: Partial<ConversationSnapshot> = {}): ConversationSnapshot {
  return {
    entries: [
      record({ kind: 'user', id: 'm-0', at: T0 + 1, text: SHARED[0] }),
      record({ kind: 'persona', id: 'm-1', at: T0 + 2, agentId: MARY.id, messageId: 'x1', text: SHARED[1] }),
      record({ kind: 'persona', id: 'm-2', at: T0 + 3, agentId: JOHN.id, messageId: 'x2', text: SHARED[2] }),
      record({ kind: 'sysline', id: 'm-3', at: T0 + 4, text: SHARED[3] }),
      record({ kind: 'user', id: 'm-4', at: T0 + 10, text: ROOMED[0], room: true }),
      record({ kind: 'persona', id: 'm-5', at: T0 + 11, agentId: JOHN.id, messageId: 'x3', text: ROOMED[1], room: true }),
      record({ kind: 'sysline', id: 'm-6', at: T0 + 12, text: ROOMED[2], room: true }),
      record({ kind: 'user', id: 'm-7', at: T0 + 20, text: SKILL_A[0], skillSession: 'sk-a' }),
      record({ kind: 'skill', id: 'm-8', at: T0 + 21, messageId: 'x4', text: SKILL_A[1], skillSession: 'sk-a' }),
      record({ kind: 'sysline', id: 'm-9', at: T0 + 22, text: SKILL_A[2], skillSession: 'sk-a' }),
      record({ kind: 'user', id: 'm-10', at: T0 + 30, text: SKILL_B[0], skillSession: 'sk-b' }),
      record({ kind: 'skill', id: 'm-11', at: T0 + 31, messageId: 'x5', text: SKILL_B[1], skillSession: 'sk-b' }),
      record({ kind: 'sysline', id: 'm-12', at: T0 + 32, text: SKILL_B[2], skillSession: 'sk-b' }),
      record({ kind: 'user', id: 'm-13', at: T0 + 40, text: 'skillcmark-user', skillSession: 'sk-c' })
    ],
    sessions: [
      { agentId: MARY.id, sessionId: 's-mary' },
      { agentId: JOHN.id, sessionId: 's-john' }
    ],
    room: { sessionId: 's-room', cast: [MARY.id, JOHN.id], openedAt: T0 + 9 },
    busy: ['s-john', 'sk-a'],
    personas: [
      { agentId: MARY.id, state: 'live', at: T0 },
      { agentId: JOHN.id, state: 'work', at: NOW - 5_000 }
    ],
    runs: [
      card({ runId: 'run-mary', sessionId: 's-mary', agentId: MARY.id, code: 'BP' }),
      card({ runId: 'run-a', sessionId: 'sk-a', skill: 'bmad-build', code: 'bmad-build', startedAt: T0 + 23, status: 'running', endedAt: undefined }),
      card({ runId: 'run-b', sessionId: 'sk-b', skill: 'bmad-build-auto', code: 'bmad-build-auto', startedAt: T0 + 33 })
    ],
    skillSessions: [
      { sessionId: 'sk-a', skill: 'bmad-build', live: true },
      { sessionId: 'sk-b', skill: 'bmad-build', live: true },
      { sessionId: 'sk-c', skill: 'bmad-code-review', live: false }
    ],
    ...over
  }
}

/** The same conversation with no skill-first session at all: a seat is a session, and names its skill. */
function plain(): ConversationSnapshot {
  const held = world()
  return {
    ...held,
    entries: held.entries.filter((entry) => entry.kind !== 'skill' && entry.skillSession === undefined),
    runs: held.runs.filter((one) => one.agentId !== undefined),
    skillSessions: [],
    busy: ['s-john']
  }
}

async function start(snapshot: ConversationSnapshot = world(), board?: BoardSnapshot, rows: RailSnapshot['rows'] = []): Promise<void> {
  bridge = createFakeBridge(INSTALL)
  bridge.conversation = () => snapshot
  bridge.rail = { ...bridge.rail, folder: '_bmad/', rows }
  if (board !== undefined) {
    bridge.board = async () => board
  }
  bridge.install()
  mounted = mount(createElement(App))
  await settle()
  await settle()
}

const root = (): HTMLElement => mounted!.container
const chatField = (): HTMLTextAreaElement => root().querySelector('.chat textarea') as HTMLTextAreaElement
const roomField = (): HTMLTextAreaElement => root().querySelector('.view-party textarea') as HTMLTextAreaElement
/** The window's one live region's words. It throws when the region is absent, so silence is never read off nothing. */
const live = (): string => {
  const region = root().querySelector(LIVE_REGIONS)
  if (region === null) throw new Error('the window has no live region')
  return region.textContent ?? ''
}
const header = (): HTMLElement => root().querySelector('.chat-head') as HTMLElement
const thread = (): HTMLElement => root().querySelector('.thread') as HTMLElement
const options = (): string[] => all('[role="option"] .skill-list-name', root()).map(text)
const view = (label: string): void => act(() => void all('.view-switch button', root()).find((button) => text(button) === label)?.click())

function tile(name: string): HTMLButtonElement {
  const found = all('button.persona-tile', root()).find((button) => button.getAttribute('aria-label')?.startsWith(`${name},`))
  if (found === undefined) throw new Error(`no tile for ${name}`)
  return found as HTMLButtonElement
}

/** The skill-first seats of the rail, by session order: the group of seats below every persona's. */
const seats = (): HTMLButtonElement[] => all('button.persona-tile', root()).filter((button) => button.querySelector('.initials--skill') !== null) as HTMLButtonElement[]

async function chooseTile(name: string): Promise<void> {
  act(() => tile(name).click())
  await settle()
}
async function chooseSeat(at: number): Promise<void> {
  act(() => seats()[at].click())
  await settle()
}

// ---------------------------------------------------------------------------------------------------------
// `/`: a skill list exists only as the leading-`/` list.
// ---------------------------------------------------------------------------------------------------------

describe('the `/` list, in the whole App (Story 7.3)', () => {
  it('reads the skills from the real manifest fold: every row, in the file’s order, with the commas and quotes of its words', () => {
    expect(SKILL_NAMES).toEqual(['bmad-agent-analyst', 'bmad-build', 'bmad-build-auto', 'bmad-code-review', 'bmad-party-mode'])
    expect(SKILLS[0].description).toBe('Mary, the business analyst')
    expect(SKILLS[2].description).toBe('One iteration of an "unattended" loop')
  })

  it.each([
    ['empty', ''],
    ['typed text', 'hello'],
    ['an @name with a slash after it', '@Mary /x'],
    ['a slash that is not the first character', ' /']
  ])('shows no manifest name or description anywhere in the window, and says nothing, while the list is closed: %s', async (_how, typed) => {
    await start(plain())
    // The window opens on the New session chat; the persona's composer is the other that holds the list.
    for (const turn of ['new', 'mary']) {
      if (turn === 'mary') {
        await chooseTile('Mary')
      }
      type(chatField(), typed)

      expect(root().querySelector('[role="listbox"], [role="option"], .skill-list')).toBeNull()
      const everything = `${root().innerHTML} ${spoken(root())}`
      for (const { name, description } of SKILLS) {
        expect(everything, `${turn}: ${name}`).not.toContain(name)
        expect(everything, `${turn}: ${description}`).not.toContain(description)
      }
    }
    await act(async () => void (await sleep(300)))
    // The control: the window's one live region is there, so its silence is a finding and not an absence.
    expect(root().querySelectorAll(LIVE_REGIONS)).toHaveLength(1)
    expect(live()).toBe('')
  })

  it('opens only for a slash as the first character, on the New session chat and a persona’s composer: every skill in manifest order, then the prefix', async () => {
    await start()
    for (const turn of ['new', 'mary']) {
      if (turn === 'mary') {
        await chooseTile('Mary')
      }
      type(chatField(), '/')
      expect(options(), turn).toEqual(SKILL_NAMES)
      type(chatField(), '/bmad-b')
      expect(options(), turn).toEqual(['bmad-build', 'bmad-build-auto'])
      type(chatField(), '/BMAD-CO')
      expect(options(), turn).toEqual(['bmad-code-review'])
      type(chatField(), '')
    }
    expect(root().querySelector('[role="listbox"]')).toBeNull()
  })

  it('lists with no count, heading, group, rank, recommendation or icon: a name and a description in each row, and nothing else', async () => {
    await start()
    type(chatField(), '/')

    const list = root().querySelector('[role="listbox"]') as HTMLElement
    expect([...list.children].map((row) => row.getAttribute('role'))).toEqual(SKILLS.map(() => 'option'))
    for (const [at, row] of [...list.children].entries()) {
      expect([...row.children].map((child) => child.className)).toEqual(['skill-list-name', 'skill-list-description'])
      expect(text(row)).toBe(`${SKILLS[at].name}${SKILLS[at].description}`)
    }
    expect(list.querySelector('svg, img, button, input, h1, h2, h3, h4, h5, h6, [role=group], [role=heading], [role=presentation], [aria-describedby], [title]')).toBeNull()
    expect(text(list)).toBe(SKILLS.map(({ name, description }) => `${name}${description}`).join(''))
    expect(spoken(list)).not.toMatch(/\b(?:recommended|suggested|popular|top|best|next|new|recent|results?|matches|skills?\b.*\d|\d+\s*(?:of|skills?))\b/i)
    // Exactly one row is current, drawn with the focus ring and no fill of its own.
    expect(all('[aria-selected=true]', list)).toHaveLength(1)
    expect(all('[style]', list)).toEqual([])
  })

  it('opens, narrows, closes with Esc and chooses without writing one word to the window’s live region, or sending anything', async () => {
    await start()
    type(chatField(), '/')
    type(chatField(), '/bmad-b')
    key(chatField(), 'Escape')
    expect(root().querySelector('[role="listbox"]')).toBeNull()
    expect(chatField().value).toBe('/bmad-b')

    type(chatField(), '/bmad-bu')
    expect(options()).toEqual(['bmad-build', 'bmad-build-auto'])
    key(chatField(), 'ArrowDown')
    key(chatField(), 'Enter')

    expect(chatField().value).toBe('/bmad-build-auto ')
    expect(root().querySelector('[role="listbox"]')).toBeNull()
    expect(bridge.firsts).toEqual([])
    expect(bridge.sent).toEqual([])
    expect(bridge.opened).toEqual([])
    await act(async () => void (await sleep(300)))
    expect(live()).toBe('')
    expect(root().querySelectorAll(LIVE_REGIONS)).toHaveLength(1)
  })

  it('opens in no composer but those two: not the room’s, and not a skill-first session’s', async () => {
    await start()
    view('Party Mode')
    expect(roomField()).not.toBeNull()
    type(roomField(), '/')
    expect(root().querySelector('[role="listbox"]')).toBeNull()
    expect(roomField().value).toBe('/')

    view('1:1 Conversation')
    await chooseSeat(0)
    expect(header().querySelector('h2')?.textContent).toBe('bmad-build')
    type(chatField(), '/')
    expect(root().querySelector('[role="listbox"]')).toBeNull()
    type(chatField(), '/bmad-b')
    expect(root().querySelector('[role="listbox"]')).toBeNull()
  })

  it('has no other control, menu entry, tile, panel or shortcut that lists or launches a manifest skill: the menu’s code buttons and `Skill Session` are the two allowed', async () => {
    await start(plain())
    await chooseTile('Mary')

    // The persona menu's buttons dispatch a menu code and show the menu's own words, none of the manifest's.
    const codeButtons = all('.skill-button', root())
    expect(codeButtons.map((button) => text(button.querySelector('.skill-code')))).toEqual(MENUS[MARY.id].map(({ code }) => code))
    expect(codeButtons.every((button) => button.closest('.skill-row') !== null)).toBe(true)
    // The one `Skill Session` button lists and launches nothing: it turns to the empty chat.
    const sessionButtons = all('.skill-session-button', root())
    expect(sessionButtons.map(text)).toEqual(['Skill Session'])
    expect(all('.skill-session-row', root())).toHaveLength(1)

    const others = all('button, [role=button], [role=menuitem], [role=option], [role=tab], select, option, datalist, a', root()).filter(
      (control) => !codeButtons.includes(control) && !sessionButtons.includes(control as HTMLButtonElement)
    )
    expect(others.length).toBeGreaterThan(5)
    for (const control of others) {
      for (const { name, description } of SKILLS) {
        expect(`${text(control)} ${control.getAttribute('aria-label') ?? ''} ${control.getAttribute('title') ?? ''}`, control.className).not.toContain(name)
        expect(text(control)).not.toContain(description)
      }
    }
    // A manifest skill is named nowhere in the window but in the list, which is closed.
    const everything = `${root().innerHTML} ${spoken(root())}`
    for (const { name, description } of SKILLS) {
      expect(everything).not.toContain(name)
      expect(everything).not.toContain(description)
    }
    expect(all('.skill-list, [role=listbox]', root())).toEqual([])
  })

  it('opens none from the New session chat’s own controls: it lists nothing until a slash is typed, and a refused name lists nothing either', async () => {
    await start()
    // The one control of the empty chat is the composer's own send.
    expect(all('.chat button', root()).map((button) => button.className)).toEqual(['composer-send'])
    await act(async () => void (await sleep(10)))
    type(chatField(), 'bmad-build')
    expect(root().querySelector('[role="listbox"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------
// The seat rail: the live dot means "holds context", and exists only on a live seat.
// ---------------------------------------------------------------------------------------------------------

describe('the seat rail, in the whole App (Stories 7.4 and 7.5)', () => {
  const rail = (): HTMLElement => root().querySelector('.team-list') as HTMLElement
  const tiles = (): HTMLButtonElement[] => all('button.persona-tile', rail()) as HTMLButtonElement[]
  const stateOf = (button: HTMLElement): string => text(button.querySelector('.state-text')).replace(/ · .*$/, '')

  it('puts the live dot only on a live seat, a persona’s or a skill’s, and the work pulse only on a working one', async () => {
    await start()

    // Mary live, John working, Sally idle with no seat; skill seats working, live, ended.
    expect(tiles().map((button) => stateOf(button))).toEqual(['live', 'working', 'idle', 'working', 'live', 'ended'])
    for (const button of tiles()) {
      const dots = all('.status-dot', button)
      const state = stateOf(button)
      expect(all('.status-dot--live', button).length > 0, text(button)).toBe(state === 'live')
      expect(all('.status-dot--work', button).length > 0, text(button)).toBe(state === 'working')
      expect(dots, text(button)).toHaveLength(state === 'ended' ? 0 : 1)
      // The dot is one of five: its class is `status-dot` and its one state, never an animation or accent of its own.
      for (const dot of dots) {
        expect([...dot.classList].filter((name) => name !== 'status-dot' && !/^status-dot--(?:idle|work|live|note|error)$/.test(name))).toEqual([])
        expect(dot.getAttribute('aria-hidden')).toBe('true')
        expect(dot.hasAttribute('style')).toBe(false)
      }
    }
    // The header says the same of the seat in view, and the rail holds no other dot.
    expect(all('.status-dot--live', root()).length).toBe(all('.status-dot--live', rail()).length + all('.chat-head .status-dot--live', root()).length)
    expect(all('.team-strip .status-dot', root())).toHaveLength(0)
  })

  it('says no count, `+N`, recommendation, next or needs-you marker, badge or unread word, in the rail or on its classes', async () => {
    await start()

    // Read element by element: the rail's words run together in its text, and a count would be a word of its own.
    const leaves = [rail(), ...all('*', rail())].filter((node) => node.children.length === 0).map(text)
    expect(leaves.length).toBeGreaterThan(15)
    for (const words of [...leaves, ...all('[aria-label]', rail()).map((node) => node.getAttribute('aria-label') ?? '')]) {
      expect(words).not.toMatch(/^\d+$|\+\d|\b\d+\s+(?:live|seats?|sessions?|open|active|running)\b|recommend|\bnext\b|needs you|badge|unread|suggest/i)
    }
    expect(all('*', rail()).filter((node) => /recommend|next|needs|badge|unread|count|star|pin|highlight/.test(node.className.toString()))).toEqual([])
    // A seat's line is the dot's word, and the elapsed counter beside `working` alone.
    for (const button of tiles()) {
      expect(text(button.querySelector('.state-text'))).toMatch(/^(?:idle|live|ended|working(?: · (?:\d+m )?\d+s)?)$/)
    }
    expect(all('.rail-group', rail()).map(text)).toEqual(['Skill sessions'])
  })

  it('has an end control that is the header’s alone and carries nothing more than its name: never in the rail, and no title, hint, disabled state or highlight', async () => {
    await start()
    expect(all('button', rail()).every((button) => button.matches('.persona-tile'))).toBe(true)
    expect(all('.chat-close, .orphan-close', rail())).toEqual([])
    expect(all('.sidebar button', root()).filter((button) => /close session|stop/i.test(text(button)))).toEqual([])

    const seatsToEnd: [string, () => Promise<void>, string][] = [
      ['Mary', () => chooseTile('Mary'), 'close session · Mary'],
      ['Sally, whose seat the click opens', () => chooseTile('Sally'), 'close session · Sally'],
      ['a live skill seat', () => chooseSeat(1), 'close session · bmad-build'],
      ['an ended skill seat', () => chooseSeat(2), 'close session · bmad-code-review']
    ]
    for (const [which, turn, label] of seatsToEnd) {
      await turn()
      const controls = all('.chat-head button', root())
      expect(controls.map((button) => button.className), which).toEqual(['chat-close'])
      for (const control of controls) {
        expect(text(control), which).toBe('close session')
        // The accessible name is the one attribute it carries; the rest are exactly the native button's.
        expect(control.getAttributeNames().sort(), which).toEqual(['aria-label', 'class', 'type'])
        expect(control.getAttribute('aria-label'), which).toBe(label)
        expect(control.hasAttribute('title') || control.hasAttribute('disabled') || control.hasAttribute('style'), which).toBe(false)
        expect(control.querySelector('svg, img, [class*=icon], [class*=badge]'), which).toBeNull()
      }
    }
  })

  it('ends a persona seat without touching a skill seat’s session, thread or records, the other persona or the room', async () => {
    await start()
    await chooseTile('Mary')
    act(() => (header().querySelector('button.chat-close') as HTMLButtonElement).click())
    await settle()
    // Main answers by closing that session alone and writing its one line.
    act(() => bridge.push({ name: 'session:closed', payload: { sessionId: 's-mary', agentId: MARY.id, reason: 'closed', at: NOW } }))
    act(() => bridge.push(personaStateOnClose(MARY.id, 's-mary', NOW)))
    act(() => bridge.push({ name: 'harness:said', payload: { id: 'm-20', text: 'session closed · Mary starts fresh on the next message', at: NOW } }))
    await settle()

    expect(bridge.closed).toEqual(['s-mary'])
    // Her seat no longer holds context: no live word and no live dot. Nothing else of the rail moved.
    expect(stateOf(tile('Mary'))).not.toBe('live')
    expect(all('.status-dot--live', tile('Mary'))).toEqual([])
    expect(seats().map((seat) => stateOf(seat))).toEqual(['working', 'live', 'ended'])
    expect(stateOf(tile('John'))).toBe('working')
    // Her turns stay in the thread, and the seats' threads are as they were.
    expect(text(thread())).toContain(SHARED[1])
    await chooseSeat(0)
    expect(text(thread())).toContain(SKILL_A[1])
    expect(text(thread())).toContain('bmad-build run')
    expect(all('.view-party .party-thread', root())).toHaveLength(1)
    expect(text(root().querySelector('.view-party .party-thread'))).toContain(ROOMED[1])
    expect(bridge.stopped).toEqual([])
  })

  it('ends a skill seat without touching a persona’s seat or the room, and lands on the New session chat', async () => {
    await start()
    await chooseSeat(1)
    act(() => (header().querySelector('button.chat-close') as HTMLButtonElement).click())
    await settle()
    act(() => bridge.push({ name: 'session:closed', payload: { sessionId: 'sk-b', skill: 'bmad-build', reason: 'closed', at: NOW } }))
    await settle()

    expect(bridge.closed).toEqual(['sk-b'])
    expect(seats().map((seat) => text(seat.querySelector('.tile-name')))).toEqual(['bmad-build', 'bmad-code-review'])
    expect(header().querySelector('h2')?.textContent).toBe('New session')
    expect(stateOf(tile('Mary'))).toBe('live')
    expect(stateOf(tile('John'))).toBe('working')
    // The other seat's thread stays, and the room is live with its own thread.
    await chooseSeat(0)
    expect(text(thread())).toContain(SKILL_A[1])
    expect(text(thread())).not.toContain(SKILL_B[1])
    expect(text(root().querySelector('.view-party .party-thread'))).toContain(ROOMED[0])
    expect(roomField()).not.toBeNull()
  })

  it('shows no live dot for any persona after a hydrate with no live session: a seat that held context is not claimed to', async () => {
    await start(
      world({
        sessions: [],
        room: undefined,
        busy: [],
        personas: [],
        skillSessions: [
          { sessionId: 'sk-a', skill: 'bmad-build', live: false },
          { sessionId: 'sk-b', skill: 'bmad-build', live: false },
          { sessionId: 'sk-c', skill: 'bmad-code-review', live: false }
        ]
      })
    )

    expect(tiles().map((button) => stateOf(button))).toEqual(['idle', 'idle', 'idle', 'ended', 'ended', 'ended'])
    expect(all('.status-dot--live, .status-dot--work', root())).toEqual([])
    expect(all('.status-dot', rail()).every((dot) => dot.classList.contains('status-dot--idle'))).toBe(true)
    expect(all('.team-strip .status-dot', root())).toHaveLength(0)
    expect(all('.chat-head .status-dot', root())).toEqual([])
    await chooseSeat(0)
    expect(all('.chat-head .status-dot', root())).toEqual([])
    expect(all('.chat-head button', root()).map(text)).toEqual(['close session'])
  })
})

// ---------------------------------------------------------------------------------------------------------
// The threads: each draws only its own records.
// ---------------------------------------------------------------------------------------------------------

describe('the three kinds of thread, in the whole App (Stories 7.4 and 7.5)', () => {
  const NAMES = ['Mary', 'John', 'Sally', 'Analyst', 'Product Manager', 'UX Designer']
  const own = (words: string[]): string[] => words
  const drawn = (words: readonly string[], within: string): void => {
    for (const word of words) expect(within, word).toContain(word)
  }
  const absent = (words: readonly string[], within: string, where: string): void => {
    for (const word of words) expect(within, `${where} draws ${word}`).not.toContain(word)
  }
  const others = (name: keyof typeof THREADS): string[] =>
    (Object.entries(THREADS) as [keyof typeof THREADS, string[]][]).filter(([one]) => one !== name).flatMap(([, words]) => words)

  it('draws in each only its own records, in every direction, including two skill-first sessions against each other', async () => {
    await start()

    await chooseTile('Mary')
    const shared = text(thread())
    drawn(own(SHARED), shared)
    absent(others('shared'), shared, 'the shared thread')

    const party = text(root().querySelector('.view-party .party-thread'))
    drawn(ROOMED, party)
    absent(others('room'), party, 'the room’s thread')

    await chooseSeat(0)
    const a = text(thread())
    drawn(SKILL_A, a)
    absent(others('a'), a, 'the first skill-first thread')

    await chooseSeat(1)
    const b = text(thread())
    drawn(SKILL_B, b)
    absent(others('b'), b, 'the second skill-first thread')

    // The seat that ended carries its own record and no other's, and the New session chat draws none of them.
    await chooseSeat(2)
    expect(text(thread())).toContain('skillcmark-user')
    absent([...SHARED, ...ROOMED, ...SKILL_A, ...SKILL_B], text(thread()), 'the ended seat')
    act(() => void all('.skill-session-button', root())[0].click())
    await settle()
    expect(text(thread())).toBe('')
  })

  it('adds no record to the shared thread for a persona switch, by tile or by `@name`', async () => {
    await start()
    await chooseTile('Mary')
    const records = (): number => all('.turn, .sysline, .run-card, .run-card-line', thread()).length
    const before = records()
    const html = thread().innerHTML

    await chooseTile('John')
    await chooseTile('Sally')
    await chooseTile('Mary')
    type(chatField(), '@John')
    key(chatField(), 'Enter')
    await settle()
    type(chatField(), '@Sally')
    key(chatField(), 'Enter')
    await settle()

    expect(header().querySelector('h2')?.textContent).toBe('Sally')
    expect(records()).toBe(before)
    // The thread is the project's one thread: switching writes nothing, and nothing says a hand-off happened.
    expect(thread().innerHTML).toBe(html)
    expect(text(thread())).not.toMatch(/handed to/i)
    expect(bridge.sent).toEqual([])
    // An `@name` with words sends those words and adds the user's own turn alone, never a line.
    await chooseTile('Mary')
    type(chatField(), '@Sally what next')
    key(chatField(), 'Enter')
    await settle()
    await settle()
    expect(bridge.sent.map(([, words, mention]) => [words, mention])).toEqual([['what next', '@Sally']])
    expect(all('.sysline', thread()).map(text)).toEqual([SHARED[3]])
    expect(all('.turn--user', thread())).toHaveLength(2)
  })

  it('has no record, line or run card of a skill-first session that carries a persona’s initials, name or role', async () => {
    await start()
    for (const at of [0, 1, 2]) {
      await chooseSeat(at)
      const draw = thread()
      for (const name of NAMES) {
        expect(`${text(draw)} ${spoken(draw)}`, `seat ${at}: ${name}`).not.toContain(name)
      }
      // The disc beside every turn is the skill's `/`, never initials.
      expect(all('.turn:not(.turn--user) .initials, .run-card .initials', draw).every((disc) => disc.classList.contains('initials--skill'))).toBe(true)
      expect(all('.turn:not(.turn--user) .turn-role, .tile-title', draw)).toEqual([])
      for (const turn of all('.turn:not(.turn--user) .turn-name', draw)) {
        expect(turn.classList.contains('turn-name--mono')).toBe(true)
        expect(SKILL_NAMES).toContain(text(turn))
      }
    }
    await chooseSeat(0)
    expect(all('.run-card', thread()).map((one) => text(one.querySelector('.run-card-head')))).toEqual([expect.stringMatching(/^bmad-build run/)])
  })

  it('draws a persona’s run card in the shared thread as the persona’s, and no run of a persona in a skill’s thread or of a skill in the shared one', async () => {
    await start()
    // Seen from another persona's chat, Mary's run is a line that names her.
    await chooseTile('John')

    const cards = all('.run-card, .run-card-line', thread())
    expect(cards).toHaveLength(1)
    // A persona's run is no skill's: nothing in it names a skill of the manifest, and it carries no skill session.
    expect(cards[0].querySelector('.run-card-skill')).toBeNull()
    for (const name of SKILL_NAMES) {
      expect(text(cards[0])).not.toContain(name)
    }
    await chooseSeat(0)
    expect(all('.run-card', thread())).toHaveLength(1)
    expect(text(thread())).not.toContain('Mary')
    await chooseSeat(1)
    expect(text(all('.run-card', thread())[0])).toContain('bmad-build-auto')
    expect(text(all('.run-card', thread())[0])).not.toContain('bmad-build run')
  })
})

// ---------------------------------------------------------------------------------------------------------
// Markdown: the one hostile fixture through each kind of turn, under the real DOMPurify.
// ---------------------------------------------------------------------------------------------------------

describe('hostile markdown, through a persona, a room and a skill turn (Story 7.2)', () => {
  const hostile = (): ConversationSnapshot =>
    world({
      entries: [
        record({ kind: 'persona', id: 'm-1', at: T0 + 2, agentId: MARY.id, messageId: 'h1', text: HOSTILE_MARKDOWN }),
        record({ kind: 'persona', id: 'm-2', at: T0 + 11, agentId: JOHN.id, messageId: 'h2', text: HOSTILE_MARKDOWN, room: true }),
        record({ kind: 'skill', id: 'm-3', at: T0 + 21, messageId: 'h3', text: HOSTILE_MARKDOWN, skillSession: 'sk-a' })
      ],
      busy: [],
      runs: []
    })

  /** Every element that runs, loads or goes anywhere, and every attribute that would make one. */
  function live_(turn: HTMLElement): string[] {
    const found = all('script, style, img, iframe, a, [href], [src], [style]', turn).map((node) => node.tagName)
    for (const node of [turn, ...all('*', turn)]) {
      for (const name of node.getAttributeNames()) {
        if (/^on/i.test(name)) found.push(`${node.tagName}[${name}]`)
      }
    }
    return found
  }

  /** Visit the three turns, each while its own thread is the one drawn: the persona's, the room's and the skill's. */
  async function eachTurn(visit: (which: string, turn: HTMLElement) => void): Promise<void> {
    await chooseTile('Mary')
    visit('persona', all('.turn--persona .turn-md', thread())[0])
    visit('room', all('.view-party .turn--persona .turn-md', root())[0])
    await chooseSeat(0)
    visit('skill', all('.turn--persona .turn-md', thread())[0])
  }

  it('draws all of it as words and none of it as an element or an attribute that does anything, in the three turns', async () => {
    await start(hostile())
    const visited: string[] = []

    await eachTurn((which, turn) => {
      visited.push(which)
      expect(turn, which).toBeDefined()
      expect(live_(turn), which).toEqual([])
      // The words are kept: what could not run is shown as the text it was.
      expect(turn.textContent, which).toContain('click')
      expect(turn.textContent, which).toContain('<script>')
      expect(turn.textContent, which).toContain('<img src=x onerror=alert(1)>')
      expect(turn.textContent, which).toContain('<a href="http://x" onclick="y()">')
      // Nothing outside the turn took anything from it, either.
      expect(all('script, style, img, iframe, a, [href], [src]', turn.closest('.thread, .party-thread') as HTMLElement), which).toEqual([])
    })

    expect(visited).toEqual(['persona', 'room', 'skill'])
    // And the whole window, every thread in it, holds no link, image, script, frame or style element.
    expect(all('script, style, img, iframe, a, [href], [src]', root())).toEqual([])
  })

  it('navigates nowhere when anything inside the turn is clicked', async () => {
    await start(hostile())
    const href = window.location.href
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    let clicked = 0

    await eachTurn((which, turn) => {
      for (const node of [turn, ...all('*', turn)]) {
        const click = new MouseEvent('click', { bubbles: true, cancelable: true })
        act(() => void node.dispatchEvent(click))
        clicked += 1
        expect(node.closest('a'), which).toBeNull()
      }
    })

    expect(clicked).toBeGreaterThan(9)
    expect(window.location.href).toBe(href)
    expect(open).not.toHaveBeenCalled()
    expect(errors.mock.calls.filter(([message]) => /navigation/i.test(String(message)))).toEqual([])
    expect(bridge.calls.filter((call) => call === 'openDoc')).toEqual([])
    open.mockRestore()
    errors.mockRestore()
  })

  it('sets inner HTML in exactly one place in the renderer: the one markdown body', () => {
    const files = (dir: string): string[] =>
      readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name)
        return entry.isDirectory() ? files(path) : [path]
      })
    const sources = files('src/renderer').filter((path) => /\.tsx?$/.test(path) && !/\.test\./.test(path) && !path.includes('/testing/'))
    const setters = sources.filter((path) => /dangerouslySetInnerHTML|[iI]nnerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(readFileSync(join(ROOT, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')))

    expect(sources.length).toBeGreaterThan(50)
    expect(setters).toEqual(['src/renderer/ui/doc/markdown-body.tsx'])
    const body = readFileSync(join(ROOT, setters[0]), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(body.match(/dangerouslySetInnerHTML/g)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------------------------------------
// A skill-first run beside a populated Board.
// ---------------------------------------------------------------------------------------------------------

describe('a skill-first run beside a populated Board (Story 7.5)', () => {
  const BOARD_TEXT = `generated: 10-16-2026
development_status:
  epic-1: in-progress
  1-1-the-first-story: in-progress
  1-2-the-second-story: review
  1-3-the-third-story: backlog
  epic-2: backlog
  2-1-a-story-of-the-next-epic: backlog
`
  const BOARD: BoardSnapshot = { revision: 2, ...foldSprintStatus({ state: 'text', text: BOARD_TEXT }, undefined, { dir: '_bmad/implementation-artifacts/', names: ['spec-1-1-the-first.md'] }) }
  const WROTE = '_bmad/planning-artifacts/prd.md'
  /** The personas' runs, and the skill-first run that wrote a document: the only difference between the two Boards. */
  const personaOnly = (): ConversationSnapshot =>
    world({
      entries: [],
      busy: ['s-john'],
      skillSessions: [],
      runs: [card({ runId: 'run-john', sessionId: 's-john', agentId: JOHN.id, code: 'CP', status: 'running', endedAt: undefined, startedAt: NOW - 7_000 })]
    })
  const withSkillRun = (): ConversationSnapshot => {
    const base = personaOnly()
    return {
      ...base,
      skillSessions: [{ sessionId: 'sk-a', skill: 'bmad-build', live: true }],
      busy: [...base.busy, 'sk-a'],
      runs: [
        ...base.runs,
        card({
          runId: 'run-a',
          sessionId: 'sk-a',
          skill: 'bmad-build',
          code: 'bmad-build',
          startedAt: NOW - 20_000,
          status: 'finished',
          endedAt: NOW - 10_000,
          documents: [{ path: WROTE, callId: 'c1', text: '# prd\n', written: 6, sections: ['Goals'] }]
        })
      ]
    }
  }
  const board = (): HTMLElement => root().querySelector('.view-board') as HTMLElement
  const panel = (name: string): string => board().querySelector(`.board-${name}`)?.innerHTML ?? ''

  async function boardOf(snapshot: ConversationSnapshot): Promise<void> {
    await start(snapshot, BOARD, [{ path: WROTE, state: 'saved', savedAt: NOW - 9_000 }])
    view('Board')
  }
  const activity = (): string[] =>
    all('.board-activity-row', board()).map((row) => `${text(row.querySelector('.board-activity-who'))} ${text(row.querySelector('.board-activity-did'))}`)

  it('is a Recent activity row with the skill’s name and the bare verb, and nothing else of the Board changes', async () => {
    await boardOf(personaOnly())
    const without = { overview: panel('overview'), stories: panel('stories'), epics: panel('epics'), agents: panel('agents'), feed: activity() }
    mounted!.unmount()
    bridge.uninstall()
    await boardOf(withSkillRun())

    // The two Boards agree on every column, card, row, figure and Agents row.
    expect(panel('overview')).toBe(without.overview)
    expect(panel('stories')).toBe(without.stories)
    expect(panel('epics')).toBe(without.epics)
    expect(panel('agents')).toBe(without.agents)
    // The one difference is the feed: the skill's two rows, named for it, with no menu code.
    expect(without.feed).toEqual(['John started CP'])
    expect(activity()).toEqual([...without.feed, 'bmad-build finished', 'bmad-build started'])
  })

  it('is in no column and on no card, and owns no story or file: no owner, no path, no annotation on a document it wrote', async () => {
    await boardOf(withSkillRun())

    const columns = board().querySelector('.board-stories') as HTMLElement
    const epics = board().querySelector('.board-epics') as HTMLElement
    const agents = board().querySelector('.board-agents') as HTMLElement
    for (const region of [columns, epics, agents, board().querySelector('.board-overview') as HTMLElement]) {
      expect(text(region)).not.toContain('bmad-build')
      expect(text(region)).not.toContain(WROTE)
      expect(text(region)).not.toContain('prd.md')
    }
    expect(all('.board-card', columns).map((one) => text(one.querySelector('.board-card-number'))).sort()).toEqual(['1.1', '1.2', '1.3', '2.1'])
    // The feed rows name no owner, story, document or code, and the document the run wrote is on none of them.
    for (const row of all('.board-activity-row', board())) {
      expect(row.querySelector('[class*=owner], [class*=story], [class*=file], [class*=path], svg, img, button, a')).toBeNull()
    }
    expect(text(board().querySelector('.board-activity'))).not.toContain(WROTE)
    expect(all('.board-agent-name', board()).map(text)).toEqual(ROSTER.map(({ name }) => name))
    expect(all('.board-agent-run', board()).map(text)).toEqual([expect.stringMatching(/^CP /)])
  })

  it('draws the rail row a skill-first write made as the real rail projection holds it: the stream’s note with no owner, the path’s class owner only, and the skill’s name nowhere', async () => {
    // The row is the real projection's, written to by the real annotator folding a skill-first run's own events.
    const rail = createRailProjection({ onChange: () => undefined, now: () => NOW })
    rail.observe({ type: 'artifact:found', path: WROTE, size: 6, mtimeMs: NOW - 9_000 })
    rail.ready()
    const annotator = createRailAnnotator()
    annotator.bind(rail)
    const running = card({ runId: 'run-a', sessionId: 'sk-a', skill: 'bmad-build', code: 'bmad-build', startedAt: NOW - 20_000, status: 'running', endedAt: undefined })
    annotator.apply({ name: 'run:started', payload: { runId: 'run-a', sessionId: 'sk-a', code: 'bmad-build', skill: 'bmad-build', at: NOW - 20_000 } }, running)
    const written = { ...running, documents: [{ path: WROTE, callId: 'c1', text: 'body', written: 4, sections: [] }] }
    annotator.apply({ name: 'doc:prose', payload: { runId: 'run-a', sessionId: 'sk-a', callId: 'c1', path: WROTE, text: 'body', at: NOW - 15_000 } }, written)
    const rows = rail.snapshot().rows
    rail.dispose()
    expect(rows).toEqual([{ path: WROTE, state: 'saved', savedAt: expect.any(Number), owner: { agentId: JOHN.id }, annotation: { text: 'writing' } }])

    await start(world(), BOARD, rows)

    const row = all('.output-row', root())[0]
    expect(all('.output-row').length).toBe(1)
    expect(text(row.querySelector('.output-row-name'))).toBe('prd.md')
    expect(text(row.querySelector('.output-row-annotation'))).toBe('writing')
    // The one owner drawn is the file class's, John, never the run's skill; and it is no room's.
    expect(text(row.querySelector('.output-row-owner'))).toContain('John')
    expect(row.querySelector('.output-row-owner--room')).toBeNull()
    expect(`${text(root().querySelector('.rail'))} ${spoken(root().querySelector('.rail') as HTMLElement)}`).not.toContain('bmad-build')
  })
})
