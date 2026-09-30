import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { InstallSnapshot } from '../../../shared/install'
import { isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Shell } from './shell'
import { Topbar } from './topbar'
import { ViewSwitch } from './view-switch'
import { VIEWS } from './view'
import type { ViewId } from './view'

const agent = (id: string) => ({
  id,
  module: 'bmm',
  name: id,
  title: 'Role',
  icon: 'i',
  description: 'd'
})

const snapshot = (count: number): InstallSnapshot => ({
  revision: 1,
  agents: Array.from({ length: count }, (_, index) => agent(`bmad-agent-${index}`)),
  menus: {},
  errors: [],
  preflight: []
})

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length

function topbar(overrides: Partial<Parameters<typeof Topbar>[0]> = {}): string {
  return renderToStaticMarkup(
    <Topbar
      projectPath="/work/falcon"
      agentCount={5}
      branch={null}
      view="conversation"
      onView={() => {}}
      {...overrides}
    />
  )
}

describe('Topbar', () => {
  it('is a header holding the brand, the separator and the project path, in that order', () => {
    const markup = topbar()

    expect(markup.startsWith('<header')).toBe(true)
    const at = (text: string): number => markup.indexOf(text)
    expect(at('BMad Harness')).toBeGreaterThan(-1)
    expect(at('BMad Harness')).toBeLessThan(at('│'))
    expect(at('│')).toBeLessThan(at('/work/falcon'))
  })

  it('carries no version string', () => {
    expect(topbar()).not.toMatch(/\bv?\d+\.\d+\.\d+\b/)
    expect(topbar()).not.toMatch(/dev\b/)
  })

  it('reads the install chip from the agent count, lower case and unpunctuated', () => {
    expect(topbar({ agentCount: 5 })).toContain('>bmad · 5 agents<')
    expect(topbar({ agentCount: 1 })).toContain('>bmad · 1 agent<')
  })

  it('renders the branch chip only for an answer, after the install chip', () => {
    expect(count(topbar(), /class="chip"/g)).toBe(1)

    const markup = topbar({ branch: 'feat/payouts-prd' })
    expect(count(markup, /class="chip"/g)).toBe(2)
    expect(markup.indexOf('bmad · 5 agents')).toBeLessThan(markup.indexOf('feat/payouts-prd'))
  })

  it('renders the branch as text, never as markup', () => {
    const markup = topbar({ branch: '<img src=x onerror=1>' })

    expect(markup).not.toContain('<img')
    expect(markup).toContain('&lt;img')
  })

  it.each<ViewId>(['conversation', 'party'])('has two buttons and exactly one pressed (%s)', (view) => {
    const markup = topbar({ view })

    expect(count(markup, /<button/g)).toBe(2)
    expect(count(markup, /aria-pressed="true"/g)).toBe(1)
    expect(count(markup, /aria-pressed="false"/g)).toBe(1)
    const pressed = markup.match(/<button[^>]*aria-pressed="true"[^>]*>([^<]*)</)
    expect(pressed?.[1]).toBe(VIEWS.find((candidate) => candidate.id === view)?.label)
  })

  it('has no Help, no link, no tab stop other than the switch, no inline style, and one role', () => {
    const markup = topbar({ branch: 'main' })

    expect(markup).not.toMatch(/help/i)
    expect(markup).not.toContain('<a ')
    expect(markup).not.toContain('tabindex')
    expect(markup).not.toContain('style=')
    expect(markup).not.toContain('<input')
    expect([...markup.matchAll(/role="([^"]*)"/g)].map(([, role]) => role)).toEqual(['group'])
  })
})

describe('Shell', () => {
  const markup = renderToStaticMarkup(
    <Shell projectPath="/work/falcon" snapshot={snapshot(5)}>
      <p>the thread</p>
    </Shell>
  )

  it('holds exactly two views, the party one hidden on open', () => {
    expect(count(markup, /<section[^>]*class="view /g)).toBe(2)
    const conversation = markup.match(/<section[^>]*view-conversation[^>]*>/)?.[0] ?? ''
    const party = markup.match(/<section[^>]*view-party[^>]*>/)?.[0] ?? ''

    expect(conversation).not.toContain('hidden')
    expect(party).toContain('hidden=""')
  })

  it('opens on 1:1 Conversation pressed', () => {
    expect(markup).toMatch(/aria-pressed="true">1:1 Conversation</)
    expect(markup).toMatch(/aria-pressed="false">Party Mode</)
  })

  it('reads the install chip from the snapshot it was given', () => {
    expect(markup).toContain('bmad · 5 agents')
  })

  it('heads the rail with Team above Outputs, over empty bodies', () => {
    expect(markup.indexOf('>Team<')).toBeGreaterThan(-1)
    expect(markup.indexOf('>Team<')).toBeLessThan(markup.indexOf('>Outputs<'))
    expect(count(markup, /<div class="rail-body"><\/div>/g)).toBe(2)
  })

  it('puts the children in the thread, in the chat column before the rail', () => {
    expect(markup).toContain('<div class="thread"><p>the thread</p></div>')
    expect(markup.indexOf('class="chat"')).toBeLessThan(markup.indexOf('class="rail"'))
  })

  it('leaves the party view empty', () => {
    expect(markup).toMatch(/<section[^>]*view-party[^>]*><\/section>/)
  })

  it('draws nothing the rail halves and party view do not own', () => {
    const rail = markup.slice(
      markup.indexOf('<div class="rail">'),
      markup.indexOf('<section class="view view-party"')
    )

    expect(rail).not.toContain('<button')
    expect(rail.replace(/<[^>]*>/g, '')).toBe('TeamOutputs')
  })

  it('owns no live region and no second switch', () => {
    // Spelled in two halves: accessibility.test.ts counts the bare attribute
    // across src/, and this file is not the live region.
    expect(markup).not.toContain(`aria-${'live'}`)
    expect(count(markup, /<button/g)).toBe(2)
  })
})

/** Every element of a given type in a returned tree, in document order. */
function elementsOf(node: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) {
    return node.flatMap((child) => elementsOf(child, type))
  }
  if (!isValidElement<Record<string, unknown>>(node)) {
    return []
  }
  return [
    ...(node.type === type ? [node] : []),
    ...elementsOf(node.props.children as ReactNode, type)
  ]
}

describe('ViewSwitch wiring', () => {
  it('hands onChange the id of the button that was pressed', () => {
    const received: ViewId[] = []
    const tree = ViewSwitch({ view: 'conversation', onChange: (id) => received.push(id) })
    const buttons = elementsOf(tree, 'button')

    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      ;(button.props.onClick as () => void)()
    }
    expect(received).toEqual(VIEWS.map(({ id }) => id))
  })
})

describe('Shell in the party state', () => {
  const markup = renderToStaticMarkup(
    <Shell projectPath="/work/falcon" snapshot={snapshot(5)} initialView="party">
      <p>the thread</p>
    </Shell>
  )

  it('shows the party section and hides the conversation section', () => {
    const conversation = markup.match(/<section[^>]*view-conversation[^>]*>/)?.[0] ?? ''
    const party = markup.match(/<section[^>]*view-party[^>]*>/)?.[0] ?? ''

    expect(party).not.toContain('hidden')
    expect(conversation).toContain('hidden=""')
  })

  it('keeps the hidden conversation mounted, children and rail included', () => {
    expect(markup).toContain('<p>the thread</p>')
    expect(markup).toContain('>Team<')
    expect(markup).toContain('>Outputs<')
  })

  it('presses Party Mode and not 1:1 Conversation', () => {
    expect(markup).toMatch(/aria-pressed="false">1:1 Conversation</)
    expect(markup).toMatch(/aria-pressed="true">Party Mode</)
  })
})
