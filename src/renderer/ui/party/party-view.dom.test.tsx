// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import type { TranscriptEntry } from '../chat/transcript-entry'
import '../testing/render-hook'
import { PartyView } from './party-view'

const mary: AgentView = { id: 'bmad-agent-analyst', module: 'bmm', name: 'Mary', title: 'Analyst', icon: 'i', description: 'd' }
const LINE: TranscriptEntry = { kind: 'sysline', id: 'm-0', at: 1, text: 'room opened by you · present · Mary', room: true }

let container: HTMLElement
let root: Root

function mount(room: string | undefined): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  update(room)
}

function update(room: string | undefined): void {
  act(() => root.render(createElement(PartyView, { agents: [mary], room, roomCast: [mary.id], speaker: undefined, entries: [LINE], topic: undefined, openedAt: 1, turns: 0, rows: [], onOpen: () => {}, onSend: () => {} })))
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
