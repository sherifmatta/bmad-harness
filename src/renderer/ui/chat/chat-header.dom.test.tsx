// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import '../testing/render-hook'
import { ChatHeader } from './chat-header'

let container: HTMLElement
let root: Root

function render(onClose?: () => void, extra: { turnInFlight?: boolean; onStop?: () => void } = {}): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(createElement(ChatHeader, { agent: john, state: 'idle', onClose, ...extra })))
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
  description: 'Thinks in outcomes.'
}

describe('ChatHeader, the close control', () => {
  it('is a native button that asks to close the session once per activation, with the state still shown beside it', () => {
    let closes = 0
    render(() => void (closes += 1))
    const buttons = container.querySelectorAll('button')

    expect(buttons).toHaveLength(1)
    expect(buttons[0].type).toBe('button')
    expect(buttons[0].textContent).toBe('close session')
    expect(buttons[0].getAttribute('aria-label')).toBe('close session · John')
    expect(buttons[0].hasAttribute('disabled')).toBe(false)
    expect(container.querySelector('.state-text')?.textContent).toBe('idle')

    act(() => buttons[0].click())
    act(() => buttons[0].click())
    expect(closes).toBe(2)
  })

  it('is not there when the persona has no session to close', () => {
    render(undefined)

    expect(container.querySelector('button')).toBeNull()
  })
})

describe('ChatHeader, the Stop control (Story 3.19)', () => {
  const draw = (turnInFlight: boolean, onClose: () => void, onStop: (() => void) | undefined): void =>
    act(() => root.render(createElement(ChatHeader, { agent: john, state: 'work', onClose, turnInFlight, onStop })))

  it('reads Stop while a turn is in flight and asks to stop it, once per activation and never to close', () => {
    let stops = 0
    let closes = 0
    render(() => void (closes += 1), { turnInFlight: true, onStop: () => void (stops += 1) })
    const buttons = container.querySelectorAll('button')

    expect(buttons).toHaveLength(1)
    expect(buttons[0].type).toBe('button')
    expect(buttons[0].textContent).toBe('Stop')
    expect(buttons[0].getAttribute('aria-label')).toBe('Stop · John')
    for (const attribute of ['disabled', 'title', 'aria-disabled', 'aria-busy', 'tabindex']) {
      expect(buttons[0].hasAttribute(attribute), attribute).toBe(false)
    }
    expect(buttons[0].className).toBe('chat-close')

    act(() => buttons[0].click())
    expect([stops, closes]).toEqual([1, 0])
  })

  it('is the same element, still focused, when the turn starts and ends: only its label and press change', () => {
    let stops = 0
    let closes = 0
    const onClose = (): void => void (closes += 1)
    const onStop = (): void => void (stops += 1)
    render(onClose, { turnInFlight: false, onStop })
    const button = container.querySelector('button') as HTMLButtonElement
    button.focus()
    expect(button.textContent).toBe('close session')

    draw(true, onClose, onStop)
    expect(container.querySelector('button')).toBe(button)
    expect(button.textContent).toBe('Stop')
    expect(document.activeElement).toBe(button)
    act(() => button.click())

    draw(false, onClose, onStop)
    expect(container.querySelector('button')).toBe(button)
    expect(button.textContent).toBe('close session')
    expect(button.getAttribute('aria-label')).toBe('close session · John')
    expect(document.activeElement).toBe(button)
    act(() => button.click())
    expect([stops, closes]).toEqual([1, 1])
  })

  it('stays close session for a header handed no way to stop', () => {
    render(() => {}, { turnInFlight: true })

    expect(container.querySelector('button')?.textContent).toBe('close session')
  })

  it('draws nothing without a session, a turn in flight or not', () => {
    render(undefined, { turnInFlight: true, onStop: () => {} })

    expect(container.querySelector('button')).toBeNull()
  })
})
