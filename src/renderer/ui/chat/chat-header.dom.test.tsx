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

function render(onClose?: () => void): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(createElement(ChatHeader, { agent: john, state: 'idle', onClose })))
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
