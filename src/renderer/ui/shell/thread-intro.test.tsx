import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { AgentView, MenuEntryView } from '../../../shared/install'
import { Shell } from './shell'
import { ThreadIntro } from './thread-intro'

const MARY: AgentView = {
  id: 'bmad-agent-analyst',
  module: 'bmm',
  name: 'Mary',
  title: 'Business Analyst',
  icon: '📊',
  description: 'Channels Porter and Minto.'
}
const ITEMS: MenuEntryView[] = [
  { code: 'BP', description: 'Expert guided brainstorming facilitation' },
  { code: 'MR', description: 'Market analysis' }
]

describe('ThreadIntro', () => {
  const markup = renderToStaticMarkup(<ThreadIntro agent={MARY} items={ITEMS} />)

  it('introduces the persona: disc, name, title and what the roster says they do', () => {
    expect(markup).toContain('<h3 class="thread-intro-name">Mary</h3>')
    expect(markup).toContain('<p class="thread-intro-title">Business Analyst</p>')
    expect(markup).toContain('<p class="thread-intro-about">Channels Porter and Minto.</p>')
    expect(markup).toContain('<span class="initials initials--thread" aria-hidden="true">M</span>')
    expect(markup).not.toMatch(/<svg|<img/)
  })

  it('lists the menu as codes and descriptions, read-only', () => {
    expect(markup).toContain('>Mary can<')
    expect(markup.match(/class="thread-intro-skill"/g)).toHaveLength(2)
    expect(markup).toContain('<span class="thread-intro-code">BP</span>')
    expect(markup).toContain('Expert guided brainstorming facilitation')
    expect(markup).not.toMatch(/<button|<input|<a |tabindex|onclick/i)
  })

  it('says how a session starts, and leaves out the list and the description when there are none', () => {
    const bare = renderToStaticMarkup(<ThreadIntro agent={{ ...MARY, description: '' }} items={[]} />)

    expect(bare).toContain('send Mary a message to open a session')
    expect(bare).not.toContain('thread-intro-about')
    expect(bare).not.toContain('thread-intro-skills')
    expect(bare).not.toContain('Mary can')
  })
})

describe('Shell, the thread before the first message', () => {
  const snapshot = { revision: 1, agents: [MARY], menus: { [MARY.id]: ITEMS }, errors: [], preflight: [], skills: [] }
  const render = (threadEmpty: boolean): string =>
    renderToStaticMarkup(<Shell projectPath="/p" snapshot={snapshot} threadEmpty={threadEmpty} currentId={MARY.id} />)

  it('introduces the current persona in the thread while it is empty', () => {
    expect(render(true)).toContain('class="thread-intro"')
  })

  it('draws no introduction once the thread holds anything, or when nothing says it is empty', () => {
    expect(render(false)).not.toContain('thread-intro')
    expect(renderToStaticMarkup(<Shell projectPath="/p" snapshot={snapshot} />)).not.toContain('thread-intro')
  })
})
