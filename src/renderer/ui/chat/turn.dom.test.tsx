// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AgentView } from '../../../shared/install'
import { LIVE_REGIONS, SPINNER_MARKUP, STAND_IN } from '../testing/audit-patterns'
import '../testing/render-hook'
import { foldEvent, initialConversation, personaTurnsInFlight } from './conversation-state'
import type { ConversationState } from './conversation-state'
import { Turns } from './transcript'
import type { PersonaInFlight, TranscriptEntry } from './transcript'
import type { ContractEvent } from '../../../shared/events'

let container: HTMLElement
let root: Root

function render(
  entries: readonly TranscriptEntry[],
  onCancel: (id: string) => void = () => {},
  inFlight: readonly PersonaInFlight[] = []
): void {
  if (container === undefined || !container.isConnected) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  act(() => root.render(createElement(Turns, { entries, onCancel, inFlight })))
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const sent: TranscriptEntry = { kind: 'user', id: 'u1', at: 1, text: 'sent' }
const waiting: TranscriptEntry = {
  kind: 'user',
  id: 'u2',
  at: 2,
  text: 'waiting',
  queuedFor: 'John'
}

describe('Turns, queued', () => {
  it('marks only the queued entries, and cancel calls back with the entry’s id', () => {
    const cancelled: string[] = []
    render([sent, waiting], (id) => void cancelled.push(id))

    expect(container.querySelectorAll('.turn--queued')).toHaveLength(1)
    expect(container.querySelectorAll('button.turn-cancel')).toHaveLength(1)
    act(() => (container.querySelector('button.turn-cancel') as HTMLButtonElement).click())
    expect(cancelled).toEqual(['u2'])
  })

  it('promotion keeps the same DOM node, dropping only the marker and the modifier', () => {
    render([sent, waiting])
    const node = container.querySelectorAll('.turn')[1] as HTMLElement
    expect(node.className).toBe('turn turn--user turn--queued')

    const promoted: TranscriptEntry = {
      kind: 'user',
      id: 'u2',
      at: 2,
      text: 'waiting'
    }
    render([sent, promoted])

    expect(container.querySelectorAll('.turn')[1]).toBe(node)
    expect(node.className).toBe('turn turn--user')
    expect(node.querySelector('.turn-queued')).toBeNull()
    expect(node.textContent).toContain('waiting')
  })
})

describe('Turns, a typed mention (Story 2.15)', () => {
  const handed: TranscriptEntry = { kind: 'user', id: 'u9', at: 1, text: 'go', mention: '@Amelia' }

  it('draws the chip then the words, and the chip takes no focus and does nothing', () => {
    render([handed])
    const chip = container.querySelector<HTMLElement>('.turn--user .turn-mention')!

    expect(chip.textContent).toBe('@Amelia')
    expect(chip.nextElementSibling?.className).toBe('turn-words')
    expect(chip.nextElementSibling?.textContent).toBe('go')
    expect(container.querySelector('.turn-said')?.textContent).toBe('@Amelia go')
    expect(chip.tabIndex).toBe(-1)
    expect(chip.hasAttribute('tabindex')).toBe(false)
    expect(chip.hasAttribute('role')).toBe(false)
    expect(chip.querySelector('a, button, input')).toBeNull()
    expect(chip.closest('a, button')).toBeNull()
    // Nothing to tab to in a sent turn.
    expect(container.querySelector('[tabindex], button, a')).toBeNull()
  })

  it('draws the chip while queued and keeps the same node once sent, losing only the marker', () => {
    const queued: TranscriptEntry = { ...handed, queuedFor: 'Amelia' }
    render([queued])
    const chip = container.querySelector('.turn-mention')!
    expect(container.querySelector('.turn-queued-mark')).not.toBeNull()

    render([handed])
    expect(container.querySelector('.turn-mention')).toBe(chip)
    expect(container.querySelector('.turn-queued-mark')).toBeNull()
  })
})

describe('Turns, a persona’s turn in flight', () => {
  const START = new Date(2026, 9, 8, 14, 0).getTime()
  const MARY: AgentView = { id: 'bmad-agent-analyst', module: 'bmm', name: 'Mary', title: 'Analyst', icon: 'i', description: 'd' }
  const roster = (id: string): AgentView | undefined => (id === MARY.id ? MARY : undefined)
  const fold = (state: ConversationState, ...events: ContractEvent[]): ConversationState =>
    events.reduce((held, event) => foldEvent(held, event, roster).state, state)
  const working = (at: number): ContractEvent => ({ name: 'persona:state', payload: { agentId: MARY.id, state: 'work', at } })
  const ended = (state: 'idle' | 'live' | 'error'): ContractEvent => ({ name: 'persona:state', payload: { agentId: MARY.id, state, at: START + 30_000 } })
  const said = (messageId: string, text: string, at: number): ContractEvent => ({
    name: 'persona:said',
    payload: { sessionId: 's1', agentId: MARY.id, messageId, text, at }
  })
  /** The thread as the window draws it: the entries, and the turns in flight read by the selector, the persona resolved. */
  function draw(state: ConversationState): void {
    const inFlight = [...personaTurnsInFlight(state)].map(([agentId, turn]) => ({ agent: roster(agentId) ?? MARY, ...turn }))
    render(state.entries, () => {}, inFlight)
  }
  const pending = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('.turn--pending')]
  const SENT: TranscriptEntry = { kind: 'user', id: 'u1', at: START, text: 'Same scope as Tuesday' }
  const asked = (): ConversationState => ({ ...initialConversation, entries: [SENT], nextId: 1 })

  beforeEach(() => {
    vi.useFakeTimers({ now: START, toFake: ['setInterval', 'clearInterval', 'Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('draws the pending turn at the foot the moment main says work: initials disc, head, the caret alone, and working · 0s ticking', () => {
    draw(fold(asked(), working(START)))

    expect(pending()).toHaveLength(1)
    const turn = pending()[0]
    expect(container.lastElementChild).toBe(turn)
    expect(turn.querySelector('.turn-av svg')).toBeNull()
    expect(turn.querySelector('.turn-av .initials--thread')?.textContent).toBe('M')
    expect(turn.querySelector('.turn-name')?.textContent).toBe('Mary')
    expect(turn.querySelector('.turn-role')?.textContent).toBe('Analyst')
    // The body is the caret and nothing else: no word, no stand-in.
    const words = turn.querySelector('.turn-words') as HTMLElement
    expect(words.innerHTML).toBe('<p><span class="caret" aria-hidden="true"></span></p>')
    expect(turn.querySelector('.turn-state')?.textContent).toBe('working · 0s')
    expect(turn.querySelector('.status-dot--work')).not.toBeNull()

    for (const second of [1, 2, 3]) {
      act(() => void vi.advanceTimersByTime(1_000))
      expect(turn.querySelector('.turn-state')?.textContent).toBe(`working · ${second}s`)
    }
  })

  it('draws nothing in flight before main says work, whatever the window marked busy', () => {
    draw(asked())

    expect(container.querySelector('.turn--pending, .caret, .turn-state')).toBeNull()
  })

  it('keeps the queued messages below the pending turn, unchanged', () => {
    const queued: TranscriptEntry = { kind: 'user', id: 'u2', at: START + 1, text: 'and one more', queuedFor: 'Mary' }
    const state = fold({ ...asked(), entries: [SENT, queued], nextId: 2 }, working(START))
    draw(state)

    expect([...container.children].map((child) => child.className)).toEqual([
      'turn turn--user',
      'turn turn--persona turn--pending',
      'turn turn--user turn--queued'
    ])
    expect(container.querySelector('.turn--queued .turn-queued-mark')?.textContent).toBe('queued · sends when Mary finishes')
  })

  it('lands the words where the pending turn stood, above a message queued during the silence, with no jump across it', () => {
    const queued: TranscriptEntry = { kind: 'user', id: 'u2', at: START + 1_000, text: 'and one more', queuedFor: 'Mary' }
    const waiting = fold({ ...asked(), entries: [SENT, queued], nextId: 2 }, working(START))
    draw(waiting)
    const queuedNode = container.querySelector('.turn--queued')
    expect([...container.children].map((child) => child.className)).toEqual([
      'turn turn--user',
      'turn turn--persona turn--pending',
      'turn turn--user turn--queued'
    ])

    // The first word comes after the message was queued, so by time alone it would sort below it.
    draw(fold(waiting, said('m1', 'Two silences already.', START + 4_000)))

    expect([...container.children].map((child) => child.className)).toEqual([
      'turn turn--user',
      'turn turn--persona',
      'turn turn--user turn--queued'
    ])
    expect(container.querySelector('.turn--queued')).toBe(queuedNode)
  })

  it('puts the words in place of the lone caret, the caret at their tail and the line under them, until the turn ends', () => {
    let state = fold(asked(), working(START), said('m1', 'Two silences already.', START + 4_000))
    act(() => void vi.advanceTimersByTime(4_000))
    draw(state)

    expect(pending()).toHaveLength(0)
    const turn = container.querySelector('.turn--persona') as HTMLElement
    expect([...(turn.querySelector('.turn-body') as HTMLElement).children].map((child) => child.className)).toEqual(['turn-head', 'turn-words', 'turn-state'])
    expect(turn.querySelector('.turn-words')?.innerHTML).toBe('<p>Two silences already.<span class="caret" aria-hidden="true"></span></p>')
    expect(turn.querySelector('.turn-state')?.textContent).toBe('working · 4s')

    // More of the same message, then a new paragraph: the caret follows the tail, one caret only.
    state = fold(state, said('m1', '\n\nWriting now', START + 5_000))
    draw(state)
    expect(container.querySelectorAll('.caret')).toHaveLength(1)
    expect([...turn.querySelectorAll('.turn-words p')].map((p) => p.innerHTML)).toEqual([
      'Two silences already.',
      'Writing now<span class="caret" aria-hidden="true"></span>'
    ])
  })

  it('holds the caret at the tail of the last words through a quiet stretch, with the line under them', () => {
    const state = fold(asked(), working(START), said('m1', 'Let me look at the brief.', START + 1_000))
    draw(state)
    act(() => void vi.advanceTimersByTime(20_000))

    const turn = container.querySelector('.turn--persona') as HTMLElement
    expect(turn.querySelector('.turn-words p:last-child .caret')).not.toBeNull()
    expect(turn.querySelector('.turn-state')?.textContent).toBe('working · 20s')
    expect(pending()).toHaveLength(0)
  })

  it.each(['idle', 'live', 'error'] as const)('takes the caret and the line away when the turn ends %s, and her words are byte-identical', (end) => {
    const text = 'Same scope.\n\nWriting now — I’ll flag the second one.\n'
    const working_ = fold(asked(), working(START), said('m1', text, START + 1_000))
    draw(working_)
    const node = container.querySelector('.turn--persona') as HTMLElement

    draw(fold(working_, ended(end)))

    expect(container.querySelector('.turn--pending, .caret, .turn-state')).toBeNull()
    expect(container.querySelector('.turn--persona')).toBe(node)
    // Drawn exactly as a turn never in flight draws the same words: as markdown, under the chat's own class (Story 7.2).
    const settled = node.querySelector('.turn-md')?.innerHTML
    expect(settled).toContain('<p>Same scope.</p>')
    act(() => root.unmount())
    container.remove()
    render([SENT, { kind: 'persona', id: 'entry-1', at: START + 1_000, agent: MARY, text, messageId: 'm1' }])
    expect(container.querySelector('.turn--persona .turn-md')?.innerHTML).toBe(settled)
  })

  it('draws the pending turn again from a hydrated working persona, with no delta witnessed', () => {
    const reloaded: ConversationState = {
      ...asked(),
      personas: new Map([[MARY.id, { state: 'work', at: START - 8_000 }]])
    }
    draw(reloaded)

    expect(pending()).toHaveLength(1)
    expect(pending()[0].querySelector('.turn-state')?.textContent).toBe('working · 8s')
  })

  it('reads no motion setting: under reduced motion the caret stays drawn, on, and the counter still ticks', () => {
    const media = vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }))
    const before = window.matchMedia
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: media })
    try {
      draw(fold(asked(), working(START)))
      const caret = container.querySelector('.caret') as HTMLElement
      expect(caret.hidden).toBe(false)
      expect(caret.getAttribute('style')).toBeNull()
      act(() => void vi.advanceTimersByTime(2_000))
      expect(pending()[0].querySelector('.turn-state')?.textContent).toBe('working · 2s')
      expect(media).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, value: before })
    }
  })

  it('announces nothing and offers nothing: no live region, busy flag, role, control, spinner or stand-in word', () => {
    draw(fold(asked(), working(START)))
    draw(fold(asked(), working(START), said('m1', 'Reading.', START + 1)))
    draw(fold({ ...asked(), entries: [] }, working(START)))

    const markup = container.innerHTML
    expect(container.querySelector(`${LIVE_REGIONS}, [aria-busy], [aria-atomic]`)).toBeNull()
    expect(markup).not.toMatch(SPINNER_MARKUP)
    expect(container.textContent ?? '').not.toMatch(STAND_IN)
    const turn = pending()[0]
    expect(turn.getAttribute('aria-hidden')).toBe('true')
    expect(turn.querySelector('button, a, input, [tabindex], [role="button"]')).toBeNull()
  })
})
