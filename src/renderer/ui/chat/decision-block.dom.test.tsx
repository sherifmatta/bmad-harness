// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import '../testing/render-hook'
import { DecisionBlock } from './decision-block'
import { Turns } from './transcript'
import type { TranscriptEntry } from './transcript'

let container: HTMLElement
let root: Root

function render(element: ReturnType<typeof createElement>): void {
  if (container === undefined || !container.isConnected) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  act(() => root.render(element))
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const john: AgentView = {
  id: 'bmad-agent-pm',
  module: 'bmm',
  name: 'John',
  title: 'Product Manager',
  icon: 'i',
  description: 'd'
}
const mary: AgentView = { ...john, id: 'bmad-agent-analyst', name: 'Mary', title: 'Analyst' }

const QUESTION = 'Stopping at FR-7.\n\nWhich one?\n\nA. Postgres\nB. SQLite (I lean here)\nC. Neither'
const asked = (at = 1, agent = john, text = QUESTION): TranscriptEntry => ({
  kind: 'persona',
  id: `p${at}`,
  at,
  agent,
  text
})

function turns(
  entries: TranscriptEntry[],
  answerable: (agentId: string) => boolean,
  chosen: [string, string][] = []
): void {
  render(
    createElement(Turns, {
      entries,
      canAnswer: answerable,
      onChoose: (agentId: string, text: string) => void chosen.push([agentId, text])
    })
  )
}

const options = (): HTMLButtonElement[] => [
  ...container.querySelectorAll<HTMLButtonElement>('.decision-option')
]

describe('DecisionBlock', () => {
  it('is a group named by its title, with one native button per option and a position key', () => {
    render(
      createElement(DecisionBlock, {
        decision: { title: 'Which one?', options: ['Postgres', 'SQLite'] },
        onChoose: () => {}
      })
    )
    const group = container.querySelector('[role="group"]') as HTMLElement
    const title = container.querySelector('.decision-title') as HTMLElement

    expect(group.getAttribute('aria-labelledby')).toBe(title.id)
    expect(title.textContent).toBe('Which one?')
    expect(options().map((button) => button.type)).toEqual(['button', 'button'])
    expect(options().map((button) => button.querySelector('.decision-key')?.textContent)).toEqual([
      'A',
      'B'
    ])
    expect(options().map((button) => button.querySelector('.decision-text')?.textContent)).toEqual([
      'Postgres',
      'SQLite'
    ])
    // Every option is its own tab stop: no tabindex, nothing roving.
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0)
  })

  it('calls back with the option’s text on click, and carries no state of any kind', () => {
    const chosen: string[] = []
    render(
      createElement(DecisionBlock, {
        decision: { title: 'Which?', options: ['Postgres', 'SQLite'] },
        onChoose: (text: string) => void chosen.push(text)
      })
    )
    act(() => options()[1].click())

    expect(chosen).toEqual(['SQLite'])
    expect(container.querySelector('[aria-pressed],[aria-selected],[aria-disabled],[disabled]')).toBeNull()
    expect(container.innerHTML).not.toMatch(/recommended|chosen|selected|default/i)
  })

  it('renders hostile title and options as text', () => {
    render(
      createElement(DecisionBlock, {
        decision: { title: '<b>t</b>', options: ['<img src=x onerror=1>', 'ok'] },
        onChoose: () => {}
      })
    )
    expect(container.querySelector('b, img')).toBeNull()
    expect(container.querySelector('.decision-title')?.textContent).toBe('<b>t</b>')
  })
})

describe('Turns, decision', () => {
  it('draws the block inside the last persona turn, after its words, which are unchanged', () => {
    turns([asked()], () => true)
    const body = container.querySelector('.turn--persona .turn-body') as HTMLElement

    expect(body.querySelectorAll('.decision')).toHaveLength(1)
    const words = body.querySelector('.turn-words') as HTMLElement
    expect(words.nextElementSibling).toBe(body.querySelector('.decision'))
    // The persona's list is still in its own words.
    expect(words.textContent).toContain('A. Postgres')
    expect(words.textContent).toContain('B. SQLite (I lean here)')
    expect(container.querySelector('.decision-title')?.textContent).toBe('Which one?')
    expect(options().map((button) => button.querySelector('.decision-text')?.textContent)).toEqual([
      'Postgres',
      'SQLite (I lean here)',
      'Neither'
    ])
  })

  it('sends the persona’s id and the option’s text on activation', () => {
    const chosen: [string, string][] = []
    turns([asked()], () => true, chosen)
    act(() => options()[0].click())

    expect(chosen).toEqual([[john.id, 'Postgres']])
  })

  it('is absent while the persona cannot take a reply (a turn in flight, or no live session)', () => {
    turns([asked()], () => false)

    expect(container.querySelector('.decision')).toBeNull()
  })

  it('asks canAnswer about the persona who spoke', () => {
    const asks: string[] = []
    turns([asked()], (agentId) => (asks.push(agentId), true))

    expect(asks).toEqual([john.id])
  })

  it.each([
    ['a user turn', { kind: 'user', id: 'u', at: 2, text: 'hm' } as TranscriptEntry],
    [
      'a queued message',
      { kind: 'user', id: 'q', at: 2, text: 'hm', queuedFor: 'John' } as TranscriptEntry
    ],
    ['a sysline', { kind: 'sysline', id: 's', at: 2, text: 'handed to John' } as TranscriptEntry]
  ])('is absent once %s follows it', (_what, later) => {
    turns([asked(), later], () => true)

    expect(container.querySelector('.decision')).toBeNull()
  })

  it('is absent from an earlier persona turn when a later persona turn exists', () => {
    turns([asked(1), asked(2, mary, 'Plain words.')], () => true)

    expect(container.querySelector('.decision')).toBeNull()
  })

  it('judges the last entry in time order, whatever order the entries arrived in', () => {
    turns([{ kind: 'user', id: 'u', at: 5, text: 'hm' }, asked(1)], () => true)

    expect(container.querySelector('.decision')).toBeNull()
  })

  it('goes with the user’s turn in the same render, leaving no residue', () => {
    turns([asked()], () => true)
    expect(container.querySelector('.decision')).not.toBeNull()

    turns([asked(), { kind: 'user', id: 'u', at: 2, text: 'Postgres' }], () => true)

    expect(container.querySelector('.decision')).toBeNull()
    expect(container.querySelectorAll('.turn')).toHaveLength(2)
    expect(container.querySelector('[aria-pressed],[aria-selected],[disabled]')).toBeNull()
  })

  it('is absent when nothing handles a choice, or the turn has no list', () => {
    render(createElement(Turns, { entries: [asked()], canAnswer: () => true }))
    expect(container.querySelector('.decision')).toBeNull()

    turns([asked(1, john, 'Just words, no list.')], () => true)
    expect(container.querySelector('.decision')).toBeNull()
  })
})
