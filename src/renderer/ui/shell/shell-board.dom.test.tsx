// @vitest-environment jsdom
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { BoardSnapshot } from '../../../shared/board'
import type { InstallSnapshot } from '../../../shared/install'
import { LIVE_REGIONS } from '../testing/audit-patterns'
import { installFakeScroll } from '../testing/fake-scroll'
import type { FakeScroll } from '../testing/fake-scroll'
import { mount } from '../testing/render-hook'
import type { Mounted } from '../testing/render-hook'
import { Shell } from './shell'
import { DEFAULT_VIEW, VIEWS } from './view'

/**
 * The Board as the third view (Story 6.3), driven in a DOM: the switch, the
 * sections staying mounted, the chord, and a paused thread surviving a visit.
 */

const snapshot: InstallSnapshot = { revision: 1, agents: [], menus: {}, errors: [], preflight: [] }
const none: BoardSnapshot = { revision: 1, kind: 'none', code: 'board/absent', message: 'board · no sprint status' }
const rail = { revision: 1, folder: '_bmad/', rows: [] }

let view: Mounted | null = null
let fake: FakeScroll

beforeEach(() => {
  fake = installFakeScroll({ client: 400, height: 1000, top: 0 })
})
afterEach(() => {
  view?.unmount()
  view = null
  fake.restore()
})

const section = (name: string): HTMLElement => document.querySelector(`.view-${name}`) as HTMLElement
const buttons = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('.view-switch button')]
const press = (key: string): void => void act(() => void document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))

function show(board: BoardSnapshot | null = none): void {
  view = mount(createElement(Shell, { projectPath: '/work/falcon', snapshot, board, rail }))
}

describe('Shell, the Board', () => {
  it('opens on 1:1, with the Board mounted and hidden, and the default stored nowhere', () => {
    show()

    expect(DEFAULT_VIEW).toBe('conversation')
    expect(section('conversation').hidden).toBe(false)
    expect(section('party').hidden).toBe(true)
    expect(section('board').hidden).toBe(true)
    expect(section('board').textContent).toContain('no sprint status')
  })

  it('has the three segments as native buttons, one pressed, with no count, badge or dot', () => {
    show()

    expect(buttons().map((button) => button.textContent)).toEqual(VIEWS.map(({ label }) => label))
    expect(buttons().map((button) => button.type)).toEqual(['button', 'button', 'button'])
    expect(buttons().filter((button) => button.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    expect(buttons().every((button) => button.children.length === 0)).toBe(true)
  })

  it('shows the Board when it is pressed, the others hidden and still mounted, and announces nothing', () => {
    show()

    act(() => buttons()[2].click())

    expect(section('board').hidden).toBe(false)
    expect(section('conversation').hidden).toBe(true)
    expect(section('party').hidden).toBe(true)
    expect(section('conversation').querySelector('.chat')).not.toBeNull()
    expect(buttons()[2].getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelectorAll(LIVE_REGIONS)).toHaveLength(0)
  })

  it('draws the path beneath `no sprint status` and no region', () => {
    show()

    const lines = [...section('board').querySelectorAll('p')].map((line) => line.textContent)
    expect(lines).toEqual(['no sprint status', '_bmad/implementation-artifacts/sprint-status.yaml'])
    expect(section('board').querySelectorAll('button, h1, h2, h3, ul, [role]')).toHaveLength(0)
  })

  it('draws an empty body before the first snapshot, and only the five headings for a snapshot that was read', () => {
    show(null)
    expect(section('board').textContent).toBe('')
    view?.unmount()

    show({ revision: 2, kind: 'read', epics: [], others: [] })
    expect([...section('board').querySelectorAll('h3')].map((heading) => heading.textContent)).toEqual([
      'backlog',
      'ready-for-dev',
      'in-progress',
      'review',
      'done'
    ])
    expect(section('board').querySelectorAll('li')).toHaveLength(0)
  })

  it('draws a card that is not a control: no handler on it or inside it, and a click or key changes nothing', () => {
    show({
      revision: 2,
      kind: 'read',
      epics: [
        {
          key: 'epic-6',
          number: 6,
          title: 'Board',
          status: 'in-progress',
          known: true,
          stories: [{ key: '6-4-every-story-in-its-column', number: '6.4', title: 'Every story, in its column', status: 'review', known: true }]
        }
      ],
      others: []
    })
    const card = section('board').querySelector('.board-card') as HTMLElement
    const before = section('board').innerHTML

    for (const element of [card, ...card.querySelectorAll('*')]) {
      const props = Object.keys(element).filter((name) => name.startsWith('__reactProps$'))
      expect(props.length).toBeGreaterThan(0)
      const handlers = props.flatMap((name) => Object.keys((element as unknown as Record<string, object>)[name]).filter((key) => /^on[A-Z]/.test(key)))
      expect(handlers).toEqual([])
    }
    expect(card.hasAttribute('tabindex')).toBe(false)
    act(() => card.click())
    act(() => void card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })))
    expect(section('board').innerHTML).toBe(before)
    expect(section('conversation').hidden).toBe(false)
  })

  it('shows the Board on `g` then `b`, and nothing for `g` and another key', () => {
    show()

    press('g')
    press('x')
    press('b')
    expect(section('board').hidden).toBe(true)

    press('g')
    press('b')
    expect(section('board').hidden).toBe(false)
    expect(section('conversation').hidden).toBe(true)
  })

  it('puts a paused 1:1 thread back where it was left, still paused, and a following one at its bottom', () => {
    show()
    const scroller = document.querySelector('.view-conversation .scroll') as HTMLElement
    const latest = (): Element | null => document.querySelector('button.follow-latest')
    expect(fake.metrics.top).toBe(600)

    fake.metrics.top = 150
    act(() => void scroller.dispatchEvent(new Event('scroll')))
    expect(latest()).not.toBeNull()

    // Away to the Board and back: the browser reports no height while hidden and may reset the position.
    act(() => buttons()[2].click())
    fake.metrics.client = 0
    act(() => fake.resize())
    fake.metrics.top = 0
    act(() => buttons()[0].click())
    fake.metrics.client = 400
    act(() => fake.resize())

    expect(fake.metrics.top).toBe(150)
    expect(latest()).not.toBeNull()
  })
})
