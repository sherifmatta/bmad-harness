// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AgentView } from '../../../shared/install'
import type { TranscriptEntry } from '../chat/transcript-entry'
import '../testing/render-hook'
import { PartyView } from './party-view'

const mary: AgentView = { id: 'bmad-agent-analyst', module: 'bmm', name: 'Mary', title: 'Analyst', icon: 'i', description: 'd' }
const LINE: TranscriptEntry = { kind: 'sysline', id: 'm-0', at: 1, text: 'room opened by you · present · Mary', room: true }

let container: HTMLElement
let root: Root

function mount(room: string | undefined, onWriteSummary?: () => void, onStop?: () => void, entries: readonly TranscriptEntry[] = [LINE]): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  update(room, onWriteSummary, onStop, entries)
}

function update(room: string | undefined, onWriteSummary?: () => void, onStop?: () => void, entries: readonly TranscriptEntry[] = [LINE]): void {
  act(() => root.render(createElement(PartyView, { agents: [mary], room, roomCast: [mary.id], speaker: undefined, entries, topic: undefined, openedAt: 1, turns: 0, rows: [], folder: '_bmad/', onOpen: () => {}, onSend: () => {}, onWriteSummary, onStop })))
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const button = (): HTMLButtonElement => container.querySelector('button.cast-chooser-open') as HTMLButtonElement
const thread = (): HTMLElement => container.querySelector('.party-thread') as HTMLElement

describe('PartyView focus', () => {
  it('moves focus to the thread when the room opens under a focused *Open the room* button', () => {
    mount(undefined)
    act(() => button().focus())
    expect(document.activeElement).toBe(button())

    update('s1')

    expect(thread().tabIndex).toBe(-1)
    expect(document.activeElement).toBe(thread())
  })

  it('moves focus when a checkbox of the chooser held it, as well as the button', () => {
    mount(undefined)
    act(() => container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.focus())

    update('s1')

    expect(document.activeElement).toBe(thread())
  })

  it('takes no focus when focus was never inside the view, or has gone to another element', () => {
    mount(undefined)
    update('s1')
    expect(document.activeElement).toBe(document.body)

    act(() => root.unmount())
    container.remove()
    mount(undefined)
    const elsewhere = document.createElement('button')
    document.body.append(elsewhere)
    act(() => button().focus())
    act(() => elsewhere.focus())
    update('s1')

    expect(document.activeElement).toBe(elsewhere)
    elsewhere.remove()
  })

  it('takes no focus for a room that is already live on first render', () => {
    mount('s1')

    expect(document.activeElement).toBe(document.body)
    expect(thread().tabIndex).toBe(-1)
  })
})

describe('PartyView after a reload (Story 4.7)', () => {
  it('is the live room on first render: header, strip, panel, composer and stop, no chooser, and nothing said of the reload', () => {
    mount('s1', () => {}, () => {})

    for (const part of ['.party-head', '.cast-strip', '.party-side', 'textarea']) {
      expect(container.querySelectorAll(part), part).toHaveLength(1)
    }
    expect(container.querySelector('.cast-chooser')).toBeNull()
    expect([...container.querySelectorAll('button')].map((node) => node.textContent)).toContain('stop room')
    expect(container.textContent ?? '').not.toMatch(/restor|reconnect|reload/i)
    expect([...container.querySelectorAll('.sysline')].map((node) => node.textContent)).toEqual([LINE.text])
  })
})

describe('PartyView summary button (Story 4.4)', () => {
  const write = (): HTMLButtonElement => container.querySelector('button.party-write') as HTMLButtonElement

  it('calls the handler when the header button is pressed in a live room', () => {
    const pressed = vi.fn()
    mount('r1', pressed)

    expect(write().disabled).toBe(false)
    act(() => write().click())

    expect(pressed).toHaveBeenCalledTimes(1)
  })

  it('keeps the button disabled with no handler', () => {
    mount('r1')

    expect(write().disabled).toBe(true)
  })
})

describe('PartyView stopped room (Story 4.5)', () => {
  const stop = (): HTMLButtonElement | null => container.querySelector('button.party-stop')
  const SAID: TranscriptEntry = { kind: 'sysline', id: 'm-1', at: 2, text: 'room stopped · session released', room: true }
  const OTHER: TranscriptEntry = { kind: 'sysline', id: 'm-2', at: 3, text: 'not the room’s' }

  it('offers `stop room` in a live room, and calls the handler', () => {
    const stopped = vi.fn()
    mount('r1', undefined, stopped)

    act(() => stop()?.click())

    expect(stopped).toHaveBeenCalledTimes(1)
  })

  it('draws the room’s entries read-only above the chooser, with no header, strip, panel or composer', () => {
    mount(undefined, undefined, undefined, [LINE, SAID, OTHER])

    const column = container.querySelector('.party-column') as HTMLElement
    expect([...column.children].map((child) => child.className)).toEqual(['party-thread', 'cast-chooser'])
    expect(thread().textContent).toContain('room opened by you')
    expect(thread().textContent).toContain('room stopped · session released')
    expect(thread().textContent).not.toContain('not the room’s')
    expect(container.querySelector('.party-head, .cast-strip, .party-side, textarea')).toBeNull()
    expect(stop()).toBeNull()
    expect(container.querySelector('.turn--party-live')).toBeNull()
  })

  it('is the chooser alone with no room entry', () => {
    mount(undefined, undefined, undefined, [OTHER])

    expect(thread()).toBeNull()
    expect(container.querySelector('.cast-chooser')).not.toBeNull()
  })

  it('moves focus to the thread when the room goes under a focused `stop room`', () => {
    mount('r1', undefined, () => {})
    act(() => stop()?.focus())
    expect(document.activeElement).toBe(stop())

    update(undefined, undefined, () => {}, [LINE, SAID])

    expect(document.activeElement).toBe(thread())
  })

  it('takes no focus when a room goes and focus was never inside the view', () => {
    mount('r1', undefined, () => {})

    update(undefined, undefined, () => {}, [LINE, SAID])

    expect(document.activeElement).toBe(document.body)
  })

  it('keeps the earlier entries above a new room opened later', () => {
    mount(undefined, undefined, undefined, [LINE, SAID])
    update('r2', undefined, undefined, [LINE, SAID])

    expect(thread().textContent).toContain('room opened by you')
    expect(thread().textContent).toContain('room stopped · session released')
    expect(container.querySelector('.party-head')).not.toBeNull()
    // The new room's own count and topic start fresh.
    expect(container.querySelector('.party-head-topic')?.textContent).toBe('no topic yet')
    expect([...container.querySelectorAll('.party-chip')].map((chip) => chip.textContent)).toEqual(['1 participant', expect.stringMatching(/^turn 0\b/)])
  })
})

describe('PartyView returned words (Story 4.8)', () => {
  const field = (): HTMLTextAreaElement => container.querySelector('textarea') as HTMLTextAreaElement
  const show = (returned?: { key: number; text: string }): void =>
    act(() => root.render(createElement(PartyView, { agents: [mary], room: 'r1', roomCast: [mary.id], speaker: undefined, entries: [LINE], topic: undefined, openedAt: 1, turns: 0, returned, rows: [], folder: '_bmad/', onOpen: () => {}, onSend: () => {} })))

  it('hands the words a refused send brought back to the room’s composer, once, and only when it is empty', () => {
    mount('r1')
    show()
    show({ key: 1, text: 'x' })
    expect(field().value).toBe('x')

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
      setter?.call(field(), 'draft')
      field().dispatchEvent(new Event('input', { bubbles: true }))
    })
    show({ key: 2, text: 'y' })
    expect(field().value).toBe('draft')
  })

  it('takes none that was already held when the room was drawn', () => {
    mount('r1')
    act(() => root.unmount())
    container.remove()
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    show({ key: 1, text: 'old' })

    expect(field().value).toBe('')
  })
})
