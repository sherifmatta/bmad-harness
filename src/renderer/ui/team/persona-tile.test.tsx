import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AgentView } from '../../../shared/install'
import type { PersonaState } from '../persona/portrait'
import { PersonaTile } from './persona-tile'

const AGENT: AgentView = {
  id: 'bmad-agent-analyst',
  module: 'bmm',
  team: 'software-development',
  name: 'Mary',
  title: 'Business Analyst',
  icon: '📊',
  description: 'Strategic analyst.'
}

type Props = Parameters<typeof PersonaTile>[0]

function props(overrides: Partial<Props> = {}): Props {
  return {
    agent: AGENT,
    codes: ['BP', 'MR', 'DR'],
    state: 'idle',
    current: false,
    tabStop: false,
    onSelect: () => {},
    onKeyDown: () => {},
    tileRef: () => {},
    ...overrides
  }
}

const render = (overrides: Partial<Props> = {}): string =>
  renderToStaticMarkup(<PersonaTile {...props(overrides)} />)

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length

describe('PersonaTile', () => {
  it('is one native button holding a 36px labelled portrait, name, title, dot and state text', () => {
    const markup = render()

    expect(markup.startsWith('<button type="button" class="persona-tile focus-inset"')).toBe(true)
    expect(count(markup, /<button/g)).toBe(1)
    expect(markup).toMatch(/<svg[^>]*width="36"[^>]*height="36"[^>]*aria-label="Mary, Business Analyst"/)
    expect(markup).toContain('<span class="tile-name">Mary</span>')
    expect(markup).toContain('<span class="tile-title">Business Analyst</span>')
    expect(markup).toContain('status-dot--idle')
    expect(markup).toContain('<span class="state-text">idle</span>')
  })

  it('reads name, title and state as one label', () => {
    expect(render()).toContain('aria-label="Mary, Business Analyst, idle"')
    expect(render({ state: 'note' })).toContain('aria-label="Mary, Business Analyst, file changed"')
  })

  it.each<PersonaState>(['idle', 'work', 'live', 'note', 'error'])('draws the %s state', (state) => {
    expect(render({ state })).toContain(`status-dot--${state}`)
  })

  it('carries aria-current only on the current tile', () => {
    expect(render({ current: true })).toContain('aria-current="true"')
    expect(render({ current: false })).not.toContain('aria-current')
  })

  it('is a tab stop only when told, and otherwise reachable by arrows alone', () => {
    expect(render({ tabStop: true })).toContain('tabindex="0"')
    expect(render({ tabStop: false })).toContain('tabindex="-1"')
  })

  it('shows the first six codes and a +N tag for the rest', () => {
    const codes = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7', 'H8']
    const markup = render({ codes })

    expect(count(markup, /class="code-tag"/g)).toBe(7)
    for (const code of codes.slice(0, 6)) {
      expect(markup).toContain(`>${code}<`)
    }
    expect(markup).not.toContain('>G7<')
    expect(markup).not.toContain('>H8<')
    expect(markup).toContain('>+2<')
  })

  it('shows every code and no +N at or under six, and no hint at zero', () => {
    const three = render({ codes: ['A', 'B', 'C'] })
    expect(count(three, /class="code-tag"/g)).toBe(3)
    expect(three).not.toContain('+')

    const six = render({ codes: ['A', 'B', 'C', 'D', 'E', 'F'] })
    expect(count(six, /class="code-tag"/g)).toBe(6)
    expect(six).not.toContain('>+')

    expect(render({ codes: [] })).not.toContain('menu-hint')
    expect(render({ codes: [] })).not.toContain('code-tag')
  })

  it('renders hostile text as text, never markup', () => {
    const hostile = '<img src=x onerror=1>'
    const markup = render({
      agent: { ...AGENT, name: hostile, title: hostile, description: hostile },
      codes: [hostile]
    })

    expect(markup).not.toContain('<img')
    expect(markup).toContain('&lt;img')
  })

  it('carries no inline style and no title tooltip', () => {
    const markup = render({ current: true, tabStop: true })

    expect(markup).not.toContain('style=')
    expect(markup).not.toContain('title=')
    expect(markup).not.toContain(`aria-${'live'}`)
  })

  it('never shows a skill name or description in the hint', () => {
    expect(render()).not.toContain(AGENT.description)
  })

  it('hands onSelect the agent id when it is clicked, through the element tree', () => {
    const received: string[] = []
    const tree = PersonaTile(props({ onSelect: (id) => received.push(id) }))

    ;(tree.props.onClick as () => void)()
    expect(received).toEqual(['bmad-agent-analyst'])
  })

  it('hands every key press to the caller untouched, and never prevents a default itself', () => {
    const seen: string[] = []
    const tree = PersonaTile(props({ onKeyDown: (event) => seen.push(event.key) }))

    ;(tree.props.onKeyDown as (event: { key: string }) => void)({ key: 'Enter' })
    expect(seen).toEqual(['Enter'])
  })
})
