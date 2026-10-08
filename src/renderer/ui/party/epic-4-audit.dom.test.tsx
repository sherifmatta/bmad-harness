// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConversationSnapshot, TranscriptRecord } from '../../../shared/conversation'
import type { AgentView } from '../../../shared/install'
import type { RailRow } from '../../../shared/rail'
import type { ContractEvent } from '../../../shared/events'
import {
  foldEvent,
  hydrate,
  initialConversation,
  ROOM_REFUSED_LINE,
  roomReady,
  roomRefused,
  roomSent,
  roomSummaryAsked,
  roomTurnsOf,
  speakerOf
} from '../chat/conversation-state'
import type { ConversationState } from '../chat/conversation-state'
import type { TranscriptEntry } from '../chat/transcript-entry'
import { DENOMINATOR, SPINNER_MARKUP, STAND_IN, spoken, withoutSplitters } from '../testing/audit-patterns'
import '../testing/render-hook'
import { PartyView } from './party-view'

/**
 * Story 4.6, the rendered half (UX-DR21, UX-DR36, UX-DR38): the audit of what Epic 4 promised not
 * to do. The real `PartyView` (and so the real header, strip, thread, panel, composer and chooser) is
 * mounted in every state a room can be in, with the clock held here, and each prohibition is read off
 * what it draws. The static half (stylesheets, tokens, words in source, main's room lines) is
 * `tests/negative-surface.test.ts`.
 *
 * A failing assertion here is fixed in the product. None may be loosened.
 */

const NOW = new Date(2026, 9, 8, 14, 31).getTime()

/** What would announce: a live region, or a role that is one. Spelt apart so this file is not itself a live region in the product's own sweep. */
const LIVE = `[${'aria'}-live]`
const ANNOUNCING = '[role~=status], [role~=alert], [role~=log]'

const agent = (id: string, name: string, title: string): AgentView => ({ id, module: 'bmm', name, title, icon: 'i', description: 'd' })
const MARY = agent('bmad-agent-analyst', 'Mary', 'Analyst')
const JOHN = agent('bmad-agent-pm', 'John', 'Product Manager')
const WINSTON = agent('bmad-agent-architect', 'Winston', 'Architect')
const GONE = agent('bmad-agent-gone', 'bmad-agent-gone', '')
const ROSTER = [MARY, JOHN, WINSTON]
const CAST = [MARY.id, JOHN.id, WINSTON.id]

const OPENED: TranscriptEntry = { kind: 'sysline', id: 'm-0', at: NOW, text: 'room opened by you · present · Mary · John · Winston', room: true }
const STOPPED: TranscriptEntry = { kind: 'sysline', id: 'm-9', at: NOW + 9, text: 'room stopped · session released', room: true }
const said = (id: string, who: AgentView, text: string, at: number): TranscriptEntry => ({ kind: 'persona', id, at, agent: who, text, room: true })
const user = (id: string, text: string, at: number): TranscriptEntry => ({ kind: 'user', id, at, text, room: true })

const TURNS: TranscriptEntry[] = [
  OPENED,
  user('u1', 'Should the payouts ship first', NOW + 1),
  said('p1', MARY, 'The data we hold says yes.\n\nThe second paragraph.', NOW + 2),
  said('p2', JOHN, 'I would hold it back a sprint.', NOW + 3),
  user('u2', '@John why a sprint', NOW + 4),
  said('p3', WINSTON, 'Because the ledger is not ready.', NOW + 5),
  user('u3', 'Write a summary of this conversation to _bmad/party/2026-10-08-payouts.md.', NOW + 6)
]

const row = (path: string, extra: Partial<RailRow> = {}): RailRow => ({ path, state: 'saved', savedAt: 1, ...extra }) as RailRow

type Props = {
  room: string | undefined
  roomCast: readonly string[]
  speaker: string | undefined
  entries: readonly TranscriptEntry[]
  topic: string | undefined
  openedAt: number | undefined
  turns: number
  rows: readonly RailRow[]
  folder: string
  agents: readonly AgentView[]
}

const BASE: Props = { room: 's1', roomCast: CAST, speaker: undefined, entries: [OPENED], topic: undefined, openedAt: NOW, turns: 0, rows: [], folder: '_bmad/', agents: ROSTER }

/** What the audit mounts: a name, the props, and whether the room is live. */
type Case = { name: string; props: Props; live: boolean }

/**
 * A room the window got back after a reload (Story 4.7), built as the window builds it: `hydrate` over what
 * main's snapshot says, with the stored transcript as records and nothing set by hand.
 */
function reloaded(busy: boolean, records: readonly TranscriptRecord[]): Props {
  const snapshot: ConversationSnapshot = {
    entries: [...records],
    sessions: [],
    busy: busy ? ['s1'] : [],
    personas: [],
    runs: [],
    room: { sessionId: 's1', cast: CAST, openedAt: NOW }
  }
  return propsOf(hydrate(initialConversation, snapshot, (id) => ROSTER.find((one) => one.id === id)).state)
}

/** The props the view is given for a conversation state, as the window gives them. */
function propsOf(state: ConversationState): Props {
  return {
    room: state.room,
    roomCast: state.roomCast,
    speaker: speakerOf(state),
    entries: state.entries,
    topic: state.roomTopic,
    openedAt: state.roomOpenedAt,
    turns: roomTurnsOf(state),
    rows: [],
    folder: '_bmad/',
    agents: ROSTER
  }
}

const RECORDS: TranscriptRecord[] = [
  { kind: 'sysline', id: 'm-0', at: NOW, text: 'room opened by you · present · Mary · John · Winston', room: true },
  { kind: 'user', id: 'm-1', at: NOW + 1, text: 'Should the payouts ship first', room: true },
  { kind: 'persona', id: 'm-2', at: NOW + 2, agentId: MARY.id, messageId: 'a', text: 'The data we hold says yes.', room: true },
  { kind: 'persona', id: 'm-3', at: NOW + 3, agentId: JOHN.id, messageId: 'b', text: 'I would hold it back a sprint.', room: true }
]

/**
 * A live room that refused a send as busy (Story 4.8), built as the window builds it: the room's recorded
 * events folded, then the send and main's refusal applied by the state's own functions. Nothing is set by hand.
 */
function refused(asked: 'typed' | 'summary'): Props {
  const events: ContractEvent[] = [
    { name: 'session:opened', payload: { sessionId: 's1', at: NOW } },
    { name: 'harness:said', payload: { id: 'm-0', at: NOW, text: OPENED.kind === 'sysline' ? OPENED.text : '', room: true } },
    { name: 'persona:said', payload: { sessionId: 's1', agentId: MARY.id, messageId: 'a', text: 'The data we hold says yes.', at: NOW + 2, room: true } }
  ]
  let state = events.reduce(
    (held, event) => foldEvent(held, event, (id) => ROSTER.find((one) => one.id === id)).state,
    initialConversation
  )
  state = roomReady(state, 's1', CAST, NOW)
  const sent = asked === 'typed' ? roomSent(state, NOW + 3, 'Should the payouts ship first') : roomSummaryAsked(state, NOW + 3, '_bmad/')
  return propsOf(roomRefused(sent.state, sent.entryId ?? '', NOW + 4, asked === 'typed').state)
}

const CASES: Case[] = [
  { name: 'the chooser alone', props: { ...BASE, room: undefined, roomCast: [], openedAt: undefined, entries: [] }, live: false },
  { name: 'a live room just opened', props: BASE, live: true },
  {
    name: 'a live room mid-turn, a speaker and the latest turn live',
    props: { ...BASE, speaker: JOHN.id, entries: TURNS.slice(0, 4), topic: 'Should the payouts ship first', turns: 2 },
    live: true
  },
  {
    name: 'a live room idle after turns, a user turn, an @name user turn and the summary ask',
    props: { ...BASE, entries: TURNS, topic: 'Should the payouts ship first', turns: 3 },
    live: true
  },
  {
    name: 'a live room with context rows on the rail',
    props: { ...BASE, entries: TURNS.slice(0, 4), topic: 'Should the payouts ship first', turns: 2, rows: [row('_bmad/prd.md'), row('_bmad/architecture.md'), row('_bmad/party/2026-10-08-payouts.md', { room: true })] },
    live: true
  },
  {
    name: 'a persona in the cast the roster no longer names',
    props: { ...BASE, roomCast: [MARY.id, GONE.id, JOHN.id], speaker: GONE.id, entries: [OPENED, user('u1', 'Hello', NOW + 1), said('p1', GONE, 'I am still here.', NOW + 2)], turns: 1 },
    live: true
  },
  { name: 'a stopped room, the thread above the chooser', props: { ...BASE, room: undefined, entries: [...TURNS, STOPPED] }, live: false },
  {
    name: 'a stopped room opened again',
    props: { ...BASE, room: 's2', entries: [...TURNS, STOPPED, { ...OPENED, id: 'm-10', at: NOW + 10 }], turns: 0 },
    live: true
  },
  { name: 'a live room after a reload, idle, built by hydrate from the snapshot', props: reloaded(false, RECORDS), live: true },
  { name: 'a live room after a reload, mid-turn, its speaker lit from the stored entries', props: reloaded(true, RECORDS), live: true },
  { name: 'a live room after a refused message: the entry gone, one line said, built by roomRefused', props: refused('typed'), live: true },
  { name: 'a live room after a refused summary ask: the ask gone, one line said, built by roomRefused', props: refused('summary'), live: true }
]

let container: HTMLElement
let root: Root

function mountWith(props: Props): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  render(props)
}

function render(props: Props): void {
  act(() =>
    root.render(
      createElement(PartyView, {
        agents: props.agents,
        room: props.room,
        roomCast: props.roomCast,
        speaker: props.speaker,
        entries: props.entries,
        topic: props.topic,
        openedAt: props.openedAt,
        turns: props.turns,
        rows: props.rows,
        folder: props.folder,
        onOpen: () => {},
        onSend: () => {},
        onWriteSummary: () => {},
        onStop: () => {}
      })
    )
  )
}

beforeEach(() => {
  // The clock is the test's: the room's elapsed time is read against NOW and moves only when told to.
  vi.useFakeTimers({ now: NOW, toFake: ['setInterval', 'clearInterval', 'Date'] })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

const all = (selector: string): HTMLElement[] => [...container.querySelectorAll<HTMLElement>(selector)]
const text = (node: Element | null | undefined): string => node?.textContent ?? ''

/** The words that are the harness's: everything the room draws that no persona and no user wrote. */
function harnessWords(): string {
  const mine = [
    ...all('.sysline'),
    ...all('.party-head'),
    ...all('.party-side'),
    ...all('.cast-strip'),
    ...all('.cast-chooser'),
    ...all('.composer-hint')
  ]
  return mine.map((node) => spoken(node)).join(' | ')
}

/** Every class a drawn element carries, split into its hyphen-separated words. */
function classWords(): Set<string> {
  return new Set(all('*').flatMap((node) => [...node.classList].flatMap((name) => name.split('-'))))
}

describe.each(CASES)('Epic 4 promised nothing it did not keep: $name', ({ props, live }) => {
  beforeEach(() => mountWith(props))

  it('draws no spinner, skeleton, bar, progress, meter or stand-in sentence, and no denominator', () => {
    expect(withoutSplitters(container.innerHTML)).not.toMatch(SPINNER_MARKUP)
    expect(container.querySelector(`progress, meter, audio, video, canvas, dialog, [role~=progressbar], ${ANNOUNCING}`)).toBeNull()
    expect(harnessWords()).not.toMatch(STAND_IN)
    // A path is not a fraction: the destination's `/` and its date are the panel's own fact, read as one.
    expect(harnessWords().replace(/_bmad\/\S*/g, '')).not.toMatch(DENOMINATOR)
  })

  it('draws no badge, unread count, toast, sound or live region, and nothing hidden or busy', () => {
    expect(container.querySelector(`${LIVE}, [aria-busy], [aria-atomic], [hidden], audio, source, track`)).toBeNull()
    const words = classWords()
    for (const banned of ['badge', 'unread', 'count', 'toast', 'snackbar', 'spinner', 'skeleton', 'shimmer', 'loader', 'progress']) {
      expect(words.has(banned), banned).toBe(false)
    }
    // The only roles are the faces' own: a portrait is an image with a name, and nothing is a role of a control or a region;
    // bar the Room panel's splitter (Story 5.5), a separator with its value, which is neither.
    expect(all('[role]').filter((node) => !['img', 'separator'].includes(node.getAttribute('role') ?? ''))).toEqual([])
  })

  it('draws no guidance and no next step: no start another, try, next, or you can', () => {
    expect(harnessWords()).not.toMatch(/\b(?:start another|another room|try|next|you can|you could|you should|please|why not|want to)\b/i)
    expect(harnessWords()).not.toMatch(/[!?]/)
  })

  it('draws no deferred section, tag, quote-back, queue, pause or gate, in any class or word', () => {
    expect(container.querySelector('blockquote, q, cite, details, summary, ol, [role="list"], [role="listbox"], [role="tab"], [role="tablist"], [popover]')).toBeNull()
    const words = classWords()
    for (const banned of ['disagree', 'disagrees', 'disagreement', 'disagreements', 'evidence', 'unresolved', 'tag', 'tags', 'chip-tag', 'quote', 'quoted', 'reply', 'queue', 'queued', 'gate', 'pause', 'paused', 'decision', 'decisions', 'resolved', 'rank']) {
      expect(words.has(banned), banned).toBe(false)
    }
    expect(container.textContent ?? '').not.toMatch(/Open disagreements|Decisions so far|Pause room|\bunresolved\b|\bevidence\b|\bdisagrees\b/i)
    // Nothing in the room waits for anyone: no queued turn and no cancel of one.
    expect(container.querySelector('.turn--queued, .turn-queued, .turn-cancel')).toBeNull()
  })

  it('draws no more than the chooser or the room: never both, and a room has no chooser', () => {
    for (const part of ['.party-head', '.cast-strip', '.party-side']) {
      expect(all(part), part).toHaveLength(live ? 1 : 0)
    }
    expect(all('textarea').length).toBe(live ? 1 : 0)
    if (live) {
      expect(container.querySelector('.cast-chooser')).toBeNull()
    } else {
      expect(all('.cast-chooser')).toHaveLength(1)
    }
  })
})

describe('the side panel (UX-DR21)', () => {
  const live = CASES.filter((one) => one.live)

  it.each(live)('is one aside, headed Room, with the four rows and no other section, when $name', ({ props }) => {
    mountWith(props)

    expect(all('aside')).toHaveLength(1)
    expect(all('aside.party-side')).toHaveLength(1)
    const side = all('.party-side')[0]
    expect([...side.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(text)).toEqual(['Room'])
    expect([...side.querySelectorAll('.room-panel-key')].map(text)).toEqual(['topic', 'opened', 'context', 'writes to'])
    expect(side.querySelectorAll('.room-panel-row')).toHaveLength(4)
    // Its children are the heading and the four rows: no reserved, empty or hidden container beside them.
    expect([...side.children].map((child) => child.className)).toEqual(['room-panel-heading', 'room-panel-row', 'room-panel-row', 'room-panel-row', 'room-panel-row'])
    expect(text(side)).not.toMatch(/disagreement|decision|so far|open\b/i)
    expect(side.querySelector('ul, ol, li, button, a, input, textarea, [hidden], [aria-hidden], [style]')).toBeNull()
    expect(container.querySelectorAll('h1, h2, h3, h4, h5, h6')).toHaveLength(1)
  })

  it.each(live)('holds only facts the harness knows, and writes to the one destination, when $name', ({ props }) => {
    mountWith(props)

    const values = all('.room-panel-row').map((entry) => [text(entry.querySelector('.room-panel-key')), text(entry.querySelector('.room-panel-value'))])
    expect(values[0]).toEqual(['topic', props.topic ?? 'none yet'])
    expect(values[1][1]).toBe('14:31 by you')
    expect(values[3][1]).toMatch(/^_bmad\/party\/2026-10-08-.+\.md$/)
  })

  it('names the context as the rail rows no room wrote, and a room’s own summary row is not one', () => {
    mountWith(CASES[4].props)

    expect(all('.room-panel-path').map(text)).toEqual(['_bmad/prd.md', '_bmad/architecture.md', '_bmad/party/2026-10-08-<topic>.md'.replace('<topic>', 'should-the-payouts-ship-first')])
    expect(text(all('.room-panel-row')[2])).toContain('_bmad/prd.md')
    expect(text(all('.room-panel-row')[2])).not.toContain('payouts.md')
  })
})

describe('the transcript (UX-DR36)', () => {
  const withTurns = CASES.filter((one) => one.props.entries.some((entry) => entry.kind === 'persona'))

  it.each(withTurns)('draws a persona’s turn as portrait, name, role, time and words and nothing else, when $name', ({ props }) => {
    mountWith(props)

    const turns = all('.turn--persona')
    expect(turns.length).toBeGreaterThan(0)
    for (const turn of turns) {
      expect([...turn.children].map((child) => child.className)).toEqual(['turn-av', 'turn-body'])
      expect(turn.querySelectorAll('.turn-av > *')).toHaveLength(1)
      expect(turn.querySelectorAll('.turn-av .portrait')).toHaveLength(1)
      const body = turn.querySelector('.turn-body') as HTMLElement
      expect([...body.children].map((child) => child.className)).toEqual(['turn-head', 'turn-words'])
      expect([...(body.querySelector('.turn-head') as HTMLElement).children].map((child) => child.className)).toEqual(['turn-name', 'turn-role', 'turn-time'])
      expect(text(body.querySelector('.turn-time'))).toMatch(/^\d\d:\d\d$/)
      expect([...(body.querySelector('.turn-words') as HTMLElement).children].every((child) => child.tagName === 'P' && child.children.length === 0)).toBe(true)
      expect(turn.querySelector('button, a, input, blockquote, [role="button"], [tabindex]')).toBeNull()
    }
  })

  it.each(withTurns)('draws a persona’s words whole, exactly as given, with nothing of the harness’s before or after them, when $name', ({ props }) => {
    mountWith(props)

    const spoken = props.entries.filter((entry) => entry.kind === 'persona')
    expect(all('.turn--persona .turn-words').map((words) => [...words.children].map(text).join('\n\n'))).toEqual(spoken.map((entry) => ('text' in entry ? entry.text : '')))
  })

  it('draws a user turn and an @name turn as the user’s own, in place, with no direction chrome', () => {
    mountWith(CASES[3].props)

    expect(all('.turn--user')).toHaveLength(3)
    const mention = all('.turn--user').find((turn) => text(turn).includes('@John'))
    expect(mention).toBeDefined()
    expect(mention?.querySelector('a, button, mark, strong, em, span.mention, [class*="mention"], [class*="direct"]')).toBeNull()
    expect(text(mention?.querySelector('.turn-words'))).toBe('@John why a sprint')
    // The order of the thread is the order things were said: an @name reorders no one.
    expect(all('.turn').map((turn) => text(turn.querySelector('.turn-name')))).toEqual(['You', 'Mary', 'John', 'You', 'Winston', 'You'])
    // The summary ask is the user's own entry, never a persona's and never a sysline.
    const ask = all('.turn--user').at(-1)
    expect(text(ask?.querySelector('.turn-name'))).toBe('You')
    expect(all('.turn--persona').some((turn) => text(turn).includes('Write a summary'))).toBe(false)
  })

  it('draws the harness’s lines as syslines: no portrait, name, role or time, and none inside a turn', () => {
    mountWith(CASES[6].props)

    const lines = all('.sysline')
    expect(lines.map(text)).toEqual(['room opened by you · present · Mary · John · Winston', 'room stopped · session released'])
    for (const line of lines) {
      expect(line.closest('.turn')).toBeNull()
      expect(line.querySelector('.portrait, svg, .turn-name, .turn-role, .turn-time')).toBeNull()
      // Lower case but for the roster's own display names; `·`-separated; no terminal punctuation.
      expect(text(line).replace(/\b(?:Mary|John|Winston)\b/g, '')).toBe(text(line).replace(/\b(?:Mary|John|Winston)\b/g, '').toLowerCase())
      expect(text(line)).not.toMatch(/[.!?;:,]$/)
    }
    // No persona's name heads a harness line, and no turn carries one.
    expect(all('.turn--persona .turn-words').some((words) => /room (?:opened|stopped)/.test(text(words)))).toBe(false)
  })

  it('has no word of disagreement, evidence or unresolved drawn by the room’s own code, whatever the transcript held', () => {
    for (const { props } of CASES) {
      mountWith(props)
      const own = [...all('.party-head'), ...all('.party-side'), ...all('.cast-strip'), ...all('.cast-chooser'), ...all('.sysline'), ...all('.composer')].map((node) => spoken(node)).join(' ')
      expect(own).not.toMatch(/disagree|evidence|unresolved/i)
      act(() => root.unmount())
      container.remove()
    }
    mountWith(BASE)
  })

  it('marks the latest turn live only for the one speaking now, and none when no one is or the room has stopped', () => {
    mountWith(CASES[2].props)
    expect(all('.turn--party-live')).toHaveLength(1)
    expect(text(all('.turn--party-live .turn-name')[0])).toBe('John')

    render({ ...CASES[2].props, speaker: undefined })
    expect(all('.turn--party-live')).toHaveLength(0)

    render({ ...CASES[2].props, room: undefined })
    expect(all('.turn--party-live')).toHaveLength(0)

    // A stopped room handed a speaker still lights no one: no strip, no card, no equaliser, no live turn.
    render({ ...CASES[2].props, room: undefined, speaker: JOHN.id })
    expect(all('.cast-card--speaking, .cast-eq, .cast-strip, .turn--party-live')).toHaveLength(0)
  })
})

describe('the room’s controls (UX-DR21)', () => {
  const live = CASES.filter((one) => one.live)

  it.each(live)('has as buttons only the summary, stop room and the composer’s send, none a pause, when $name', ({ props }) => {
    mountWith(props)

    expect(all('button').map((button) => [button.className, text(button)])).toEqual([
      ['party-write', 'Write summary to _bmad/'],
      ['party-stop', 'stop room'],
      ['composer-send', 'Send']
    ])
    expect(container.textContent ?? '').not.toMatch(/pause|resume|continue|mute|kick|remove from|skip/i)
    expect(container.querySelector('a, select, [role="menu"], [role="menuitem"], [role="switch"], input[type="checkbox"], input[type="radio"]')).toBeNull()
  })

  it.each(live)('gates nothing: the composer and its send are never disabled, and nothing queues or lists speakers, when $name', ({ props }) => {
    mountWith(props)

    const field = all('textarea')[0] as HTMLTextAreaElement
    expect(field.disabled).toBe(false)
    expect(field.readOnly).toBe(false)
    expect(field.getAttribute('aria-disabled')).toBeNull()
    const send = all('.composer-send')[0] as HTMLButtonElement
    expect(send.disabled).toBe(false)
    expect(send.getAttribute('aria-disabled')).toBeNull()
    expect(container.querySelector('fieldset, [aria-disabled="true"], [aria-busy]')).toBeNull()
    // No speaker queue or list of who is next: the strip is the cast and nothing orders it.
    expect(container.querySelector('ul, ol, li, table, [class*="queue"], [class*="next"], [class*="order"]')).toBeNull()
  })

  it('keeps the composer open mid-turn: the same field, never disabled, the speaker changing under it', () => {
    mountWith(CASES[2].props)
    const field = all('textarea')[0]

    for (const speaker of [JOHN.id, WINSTON.id, undefined, MARY.id]) {
      render({ ...CASES[2].props, speaker })
      expect(all('textarea')[0]).toBe(field)
      expect((field as HTMLTextAreaElement).disabled).toBe(false)
    }
  })

  it('draws the header’s facts and nothing else: topic, participants, turn and elapsed, the summary and stop', () => {
    mountWith(CASES[3].props)

    const head = all('.party-head')[0]
    expect([...head.children].map((child) => child.className)).toEqual(['party-head-topic', 'party-chip', 'party-chip', 'party-write', 'party-stop'])
    expect(all('.party-chip').map(text)).toEqual(['3 participants', 'turn 3 · 0s'])
    expect(text(head.querySelector('.party-head-topic'))).toBe('Should the payouts ship first')
  })
})

describe('the room’s words are the harness’s facts (UX-DR36)', () => {
  const live = CASES.filter((one) => one.live)

  it.each(live)('says only its two lines, its header and panel facts and the strip’s two statuses, none ranking or classifying, when $name', ({ props }) => {
    mountWith(props)

    for (const line of all('.sysline').map(text)) {
      expect(line).toMatch(/^(?:room (?:opened by you · present · .+|stopped · session released)|not sent · the room is still speaking)$/)
    }
    expect(all('.cast-status').map(text).every((status) => status === 'speaking' || status === 'in the room')).toBe(true)
    expect(harnessWords()).not.toMatch(/\b(?:rank\w*|strongest|weakest|best|worst|winner|leading|most|least|top|agree\w*|disagree\w*|conflict\w*|tension|heated|consensus|majority|split|divided|concede\w*|challenge\w*|rebut\w*|object\w*|decid\w*|decision\w*|resolv\w*)\b/i)
  })

  it.each(live)('attributes no harness word to a persona: no turn of a persona holds a sysline, the strip, the header or the panel, when $name', ({ props }) => {
    mountWith(props)

    for (const turn of all('.turn--persona')) {
      expect(turn.querySelector('.sysline, .cast-strip, .party-head, .party-side, .composer')).toBeNull()
      expect([...turn.querySelectorAll('.turn-name')].map(text)).toHaveLength(1)
    }
    // A persona's name is drawn only where a persona is: a card, or a turn of theirs, and in the opened line's cast.
    const named = [...all('.party-head'), ...all('.party-side')].map(text).join(' ')
    for (const name of [MARY.name, JOHN.name, WINSTON.name]) {
      expect(named).not.toContain(name)
    }
  })

  it('draws nothing of the harness’s after ten minutes in a live room but the elapsed time, and still no spinner or sentence', () => {
    for (const { props, name } of CASES.filter((one) => one.live)) {
      vi.setSystemTime(NOW)
      mountWith(props)
      const before = [...all('.sysline'), ...all('.party-side'), ...all('.cast-strip'), ...all('.composer')].map(text)
      const chips = all('.party-chip').map(text)
      expect(chips[1], name).toMatch(/^turn \d+ · 0s$/)

      act(() => void vi.advanceTimersByTime(10 * 60_000))

      expect(all('.party-chip').map(text)[1], name).toMatch(/^turn \d+ · 10m 00s$/)
      expect([...all('.sysline'), ...all('.party-side'), ...all('.cast-strip'), ...all('.composer')].map(text), name).toEqual(before)
      expect(withoutSplitters(container.innerHTML), name).not.toMatch(SPINNER_MARKUP)
      expect(harnessWords(), name).not.toMatch(STAND_IN)
      // The refusal line (Story 4.8) is a fact said at the refusal, not a word about time passing: it is read as itself.
      expect(harnessWords().replace(ROOM_REFUSED_LINE, ''), name).not.toMatch(/\b(?:still|yet|idle|quiet|silent|stuck|inactive|away|timed out|expired|waiting)\b/i)
      expect(container.querySelector(`${LIVE}, [aria-busy], ${ANNOUNCING}`), name).toBeNull()
      act(() => root.unmount())
      container.remove()
    }
    mountWith(BASE)
  })

  it('draws no thing in the stopped room that a live one has, and no offer of another: the thread, then the chooser', () => {
    mountWith(CASES[6].props)

    const column = all('.party-column')[0]
    expect([...column.children].map((child) => child.className)).toEqual(['party-thread', 'cast-chooser'])
    expect(container.querySelector('.party-head, .cast-strip, .party-side, .composer, textarea, .party-stop, .party-write')).toBeNull()
    expect(all('button').map(text)).toEqual(['Open the room'])
    expect(text(all('.cast-chooser')[0])).not.toMatch(/another|again|new room|start|restart|reopen|resume/i)
  })
})

describe('dimming, never removal (UX-DR38)', () => {
  const names = (): string[] => all('.cast-card .cast-name').map(text)
  const lit = (): string[] => all('.cast-card--speaking .cast-name').map(text)

  it('keeps a card for every persona in cast order, lit only for the speaker, and the equaliser only in that card', () => {
    mountWith(CASES[2].props)

    expect(names()).toEqual(['Mary', 'John', 'Winston'])
    expect(lit()).toEqual(['John'])
    expect(all('.cast-card')).toHaveLength(CAST.length)
    expect(all('.cast-eq')).toHaveLength(1)
    expect(all('.cast-card--speaking .cast-eq')).toHaveLength(1)
    expect(all('.cast-card').map((card) => text(card.querySelector('.cast-status')))).toEqual(['in the room', 'speaking', 'in the room'])
    expect(all('.cast-card').every((card) => card.hidden === false && !card.hasAttribute('style') && !card.hasAttribute('aria-hidden'))).toBe(true)
  })

  it('keeps every card with no speaker, and with a speaker who is not in the cast', () => {
    mountWith(CASES[1].props)
    expect(names()).toEqual(['Mary', 'John', 'Winston'])
    expect(lit()).toEqual([])
    expect(all('.cast-eq')).toHaveLength(0)

    render({ ...CASES[1].props, speaker: 'bmad-agent-nobody' })
    expect(names()).toEqual(['Mary', 'John', 'Winston'])
    expect(lit()).toEqual([])
  })

  it('keeps every card as the speaker changes, and in the same order, and moves the light with the speaker', () => {
    mountWith(CASES[1].props)
    const cards = all('.cast-card')

    for (const [speaker, expected] of [
      [MARY.id, ['Mary']],
      [WINSTON.id, ['Winston']],
      [undefined, []],
      [JOHN.id, ['John']]
    ] as const) {
      render({ ...CASES[1].props, speaker })
      expect(names()).toEqual(['Mary', 'John', 'Winston'])
      expect(lit()).toEqual(expected)
      expect(all('.cast-eq')).toHaveLength(expected.length)
      // The cards are the same nodes throughout: dimmed and lit in place, never unmounted and drawn again.
      expect(all('.cast-card')).toEqual(cards)
    }
  })

  it('keeps a card, under its id, for a persona the roster no longer names', () => {
    mountWith(CASES[5].props)

    expect(names()).toEqual(['Mary', GONE.id, 'John'])
    expect(lit()).toEqual([GONE.id])
    expect(all('.cast-card')).toHaveLength(3)
  })

  it('keeps the whole cast when the room stops and when it opens again', () => {
    mountWith(CASES[2].props)
    expect(names()).toEqual(['Mary', 'John', 'Winston'])

    render({ ...CASES[2].props, room: undefined, speaker: undefined, entries: [...TURNS.slice(0, 4), STOPPED] })
    // The room is gone and its strip with it: a stopped room draws a thread above the chooser, and its faces are the thread's own.
    expect(all('.cast-card')).toHaveLength(0)
    expect(all('.turn--persona .portrait')).toHaveLength(2)
    expect(all('.cast-chooser-item')).toHaveLength(ROSTER.length)

    render({ ...CASES[2].props, room: 's2', speaker: undefined, entries: [...TURNS.slice(0, 4), STOPPED, { ...OPENED, id: 'm-10', at: NOW + 10 }], turns: 0, topic: undefined })
    expect(names()).toEqual(['Mary', 'John', 'Winston'])
    expect(lit()).toEqual([])
    expect(all('.cast-card')).toHaveLength(CAST.length)
    expect(all('.sysline').map(text)).toEqual([OPENED.kind === 'sysline' ? OPENED.text : '', STOPPED.kind === 'sysline' ? STOPPED.text : '', OPENED.kind === 'sysline' ? OPENED.text : ''])
  })
})

describe('a message the room refused (Story 4.8)', () => {
  it('draws the thread without the refused entry and with the one line, in the room’s thread, and the room still speaking', () => {
    mountWith(refused('typed'))

    expect(all('.turn--user')).toEqual([])
    expect(all('.sysline').map(text)).toEqual([OPENED.kind === 'sysline' ? OPENED.text : '', ROOM_REFUSED_LINE])
    expect(all('.party-thread .sysline')).toHaveLength(2)
    expect(text(all('.party-chip')[1])).toMatch(/^turn 1 · /)
    expect(text(all('.party-head-topic')[0])).not.toMatch(/payouts/)
    expect((all('textarea')[0] as HTMLTextAreaElement).disabled).toBe(false)
  })

  it('draws the ask refused the same way, and the destination as before', () => {
    mountWith(refused('summary'))

    expect(all('.turn--user')).toEqual([])
    expect(all('.sysline').map(text).at(-1)).toBe(ROOM_REFUSED_LINE)
    expect(text(all('.party-side')[0])).toMatch(/_bmad\/party\/2026-10-08-<topic>\.md/)
  })
})
