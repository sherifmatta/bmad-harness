import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AgentView } from '../../../shared/install'
import { ChatHeader } from './chat-header'

const AGENT: AgentView = {
  id: 'bmad-agent-pm',
  module: 'bmm',
  team: 'software-development',
  name: 'John',
  title: 'Product Manager',
  icon: '📋',
  description: 'Thinks like Marty Cagan and Teresa Torres.'
}

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length

describe('ChatHeader', () => {
  const markup = renderToStaticMarkup(<ChatHeader agent={AGENT} state="idle" />)

  it('shows a 38px labelled portrait, the name in an h2, the title and the roster description', () => {
    expect(markup).toMatch(/<svg[^>]*width="38"[^>]*height="38"[^>]*aria-label="John, Product Manager"/)
    expect(markup).toContain('<h2 class="chat-head-name">John</h2>')
    expect(markup).toContain('<span class="chat-head-title">Product Manager</span>')
    expect(markup).toContain(`<div class="chat-head-sub">${AGENT.description}</div>`)
  })

  it('shows the state as one dot and one word, on the right', () => {
    expect(count(markup, /class="state-line"/g)).toBe(1)
    expect(count(markup, /class="status-dot /g)).toBe(1)
    expect(markup).toContain('<span class="state-text">idle</span>')
    expect(markup.indexOf('chat-head-state')).toBeGreaterThan(markup.indexOf('chat-head-sub'))
  })

  it('follows the state it is given', () => {
    const working = renderToStaticMarkup(<ChatHeader agent={AGENT} state="work" />)

    expect(working).toContain('status-dot--work')
    expect(working).toContain('>working<')
  })

  it('has no button until it is given a way to close the session, and then one native button, named for the persona', () => {
    const closing = renderToStaticMarkup(<ChatHeader agent={AGENT} state="work" onClose={() => {}} />)

    expect(count(closing, /<button/g)).toBe(1)
    expect(closing).toContain('<button type="button" class="chat-close" aria-label="close session · John">close session</button>')
    expect(closing.indexOf('chat-close')).toBeGreaterThan(closing.indexOf('state-line'))
    expect(closing).not.toContain('title=')
    expect(closing).not.toContain('tabindex')
  })

  it('has no button, no hand-off, no composer and no inline style', () => {
    expect(markup).not.toMatch(/<button|<input|<textarea/)
    expect(markup).not.toMatch(/hand ?off/i)
    expect(markup).not.toContain('style=')
    expect(markup).not.toContain('title=')
  })

  it('draws no description line when the roster gave none', () => {
    const bare = renderToStaticMarkup(<ChatHeader agent={{ ...AGENT, description: ' ' }} state="idle" />)

    expect(bare).not.toContain('chat-head-sub')
  })

  it('renders hostile text as text', () => {
    const hostile = '<img src=x onerror=1>'
    const out = renderToStaticMarkup(
      <ChatHeader agent={{ ...AGENT, name: hostile, title: hostile, description: hostile }} state="idle" />
    )

    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })
})
