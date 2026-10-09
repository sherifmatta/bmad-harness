// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import type { AgentView } from '../../../shared/install'
import '../testing/render-hook'
import { OrphanHeader } from './orphan-header'

let container: HTMLElement
let root: Root

function render(agent: AgentView, onClose: (agentId: string) => void): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(createElement(OrphanHeader, { agent, onClose })))
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const mary: AgentView = {
  id: 'bmad-agent-analyst',
  module: 'bmm',
  name: 'Mary',
  title: 'Analyst',
  icon: 'i',
  description: 'must not be shown'
}

describe('OrphanHeader', () => {
  it('is a chat header: a decorative 22px initials disc, the name and title, and the mono note', () => {
    render(mary, () => {})

    expect(container.querySelector('.chat-head.orphan-head')).not.toBeNull()
    expect(container.querySelector('svg')).toBeNull()
    const disc = container.querySelector('.initials.initials--header')
    expect(disc?.textContent).toBe('M')
    expect(disc?.getAttribute('aria-hidden')).toBe('true')
    expect(disc?.hasAttribute('tabindex')).toBe(false)
    expect(container.querySelector('.chat-head-name')?.textContent).toBe('Mary')
    expect(container.querySelector('.chat-head-title')?.textContent).toBe('Analyst')
    expect(container.querySelector('.chat-head-sub')?.textContent).toBe(
      'no longer in the install · session still open'
    )
    expect(container.textContent).not.toContain('must not be shown')
  })

  it('has one native button, `close session`, named for the persona, and no tab index or title', () => {
    render(mary, () => {})
    const buttons = container.querySelectorAll('button')

    expect(buttons).toHaveLength(1)
    expect(buttons[0].type).toBe('button')
    expect(buttons[0].textContent).toBe('close session')
    expect(buttons[0].getAttribute('aria-label')).toBe('close session · Mary')
    expect(buttons[0].hasAttribute('tabindex')).toBe(false)
    expect(buttons[0].hasAttribute('disabled')).toBe(false)
    expect(container.querySelector('[title]')).toBeNull()
  })

  it('asks to close that persona’s session when the button is activated, once per activation', () => {
    const closed: string[] = []
    render(mary, (agentId) => void closed.push(agentId))

    act(() => container.querySelector('button')?.click())
    expect(closed).toEqual([mary.id])
    act(() => container.querySelector('button')?.click())
    expect(closed).toEqual([mary.id, mary.id])
  })

  it('renders hostile text as text', () => {
    const hostile = '<img src=x onerror=1>'
    render({ ...mary, name: hostile, title: hostile }, () => {})

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.chat-head-name')?.textContent).toBe(hostile)
    expect(container.querySelector('button')?.getAttribute('aria-label')).toBe(`close session · ${hostile}`)
  })
})
