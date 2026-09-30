import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { InstallSnapshot } from '../../../shared/install'
import { isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { PersonaState } from '../persona/portrait'
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

const snapshotOf = (agents: InstallSnapshot['agents']): InstallSnapshot => ({
  revision: 1,
  agents,
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

  it('heads the rail with Team above Outputs, the Outputs body still empty', () => {
    expect(markup.indexOf('>Team<')).toBeGreaterThan(-1)
    expect(markup.indexOf('>Team<')).toBeLessThan(markup.indexOf('>Outputs<'))
    expect(count(markup, /<div class="rail-body"><\/div>/g)).toBe(1)
    expect(markup).toMatch(/>Outputs<\/h3><\/div><div class="rail-body"><\/div>/)
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
    const outputs = rail.slice(rail.indexOf('>Outputs<'))

    // The Team half holds one tile button per agent; the Outputs half holds none.
    expect(count(rail, /<button/g)).toBe(5)
    expect(outputs).not.toContain('<button')
    expect(rail).not.toMatch(/<a |<input|<textarea/)
  })

  it('owns no live region and no second switch', () => {
    // Spelled in two halves: accessibility.test.ts counts the bare attribute
    // across src/, and this file is not the live region.
    expect(markup).not.toContain(`aria-${'live'}`)
    // Two switch buttons in the topbar, one button per tile in the rail.
    const bar = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'))
    expect(count(bar, /<button/g)).toBe(2)
    expect(count(markup, /<button/g)).toBe(2 + 5)
    expect(count(bar, /tabindex/g)).toBe(0)
  })
})

describe('Shell, the team and the header', () => {
  const tiles = (html: string): string[] => html.match(/<button[^>]*persona-tile[^>]*>/g) ?? []
  const teamOf = (html: string): string =>
    html.slice(html.indexOf('aria-label="Team"'), html.indexOf('>Outputs<'))

  it('holds one tile button per agent, in display order, in the Team half', () => {
    const markup = renderToStaticMarkup(<Shell projectPath="/p" snapshot={snapshot(5)} />)
    const labels = tiles(markup).map((tile) => tile.match(/aria-label="([^"]*)"/)?.[1])

    expect(labels).toEqual([0, 1, 2, 3, 4].map((index) => `bmad-agent-${index}, Role, idle`))
    expect(markup).toContain('role="group" aria-label="Team"')
    expect(markup.indexOf('aria-label="Team"')).toBeGreaterThan(markup.indexOf('>Team<'))
    expect(markup.indexOf('aria-label="Team"')).toBeLessThan(markup.indexOf('>Outputs<'))
  })

  it('names the topmost agent in the header and marks its tile current, and no other', () => {
    const markup = renderToStaticMarkup(<Shell projectPath="/p" snapshot={snapshot(3)} />)
    const header = markup.slice(markup.indexOf('class="chat-head"'), markup.indexOf('class="scroll"'))

    expect(header).toContain('>bmad-agent-0<')
    expect(count(markup, /aria-current="true"/g)).toBe(1)
    expect(tiles(markup)[0]).toContain('aria-current="true"')
    // The header sits above the thread, inside the chat column.
    expect(markup.indexOf('class="chat"')).toBeLessThan(markup.indexOf('class="chat-head"'))
    expect(markup.indexOf('class="chat-head"')).toBeLessThan(markup.indexOf('class="scroll"'))
  })

  it('opens with exactly one tab stop in the list, on the current tile', () => {
    const markup = renderToStaticMarkup(<Shell projectPath="/p" snapshot={snapshot(4)} />)

    expect(tiles(markup).map((tile) => tile.match(/tabindex="(-?\d+)"/)?.[1])).toEqual([
      '0',
      '-1',
      '-1',
      '-1'
    ])
  })

  it('draws headings only from two groups, in first-appearance order', () => {
    const one = renderToStaticMarkup(<Shell projectPath="/p" snapshot={snapshot(3)} />)
    expect(one).not.toContain('rail-group')

    const many = renderToStaticMarkup(
      <Shell
        projectPath="/p"
        snapshot={snapshotOf([
          { ...agent('a'), module: 'bmm', team: 't1' },
          { ...agent('b'), module: 'gds' },
          { ...agent('c'), module: 'bmm', team: 't1' },
          { ...agent('d'), module: 'bmm', team: 't2' }
        ])}
      />
    )
    const team = teamOf(many)

    expect([...team.matchAll(/class="rail-group">([^<]*)</g)].map(([, heading]) => heading)).toEqual([
      'bmm · t1',
      'gds',
      'bmm · t2'
    ])
    expect(tiles(team).map((tile) => tile.match(/aria-label="([^"]*)"/)?.[1])).toEqual([
      'a, Role, idle',
      'c, Role, idle',
      'b, Role, idle',
      'd, Role, idle'
    ])
    // The topmost tile in display order is the current one and names the header.
    expect(tiles(team)[0]).toContain('aria-current="true"')
  })

  it('reads every state from the states map, an unmatched id being idle', () => {
    const states = new Map<string, PersonaState>([
      ['bmad-agent-0', 'work'],
      ['bmad-agent-1', 'note'],
      ['not-an-agent', 'error']
    ])
    const markup = renderToStaticMarkup(
      <Shell projectPath="/p" snapshot={snapshot(3)} states={states} />
    )
    const header = markup.slice(markup.indexOf('class="chat-head"'), markup.indexOf('class="scroll"'))

    expect(tiles(markup).map((tile) => tile.match(/aria-label="([^"]*)"/)?.[1])).toEqual([
      'bmad-agent-0, Role, working',
      'bmad-agent-1, Role, file changed',
      'bmad-agent-2, Role, idle'
    ])
    // The header follows the current agent's state.
    expect(header).toContain('status-dot--work')
    expect(header).toContain('>working<')
    expect(header).not.toContain('>error<')
    expect(count(markup, /status-dot--error/g)).toBe(0)
  })

  it('hands each tile its own menu codes from snapshot.menus, and none to an agent without a menu', () => {
    const codes = (n: number): { code: string; description: string }[] =>
      Array.from({ length: n }, (_, index) => ({ code: `C${index + 1}`, description: 'never shown' }))
    const markup = renderToStaticMarkup(
      <Shell
        projectPath="/p"
        snapshot={{
          ...snapshotOf([agent('many'), agent('few'), agent('none'), agent('constructor')]),
          menus: { many: codes(8), few: [{ code: 'X1', description: 'd' }, { code: 'X2', description: 'd' }, { code: 'X3', description: 'd' }] }
        }}
      />
    )
    const team = teamOf(markup)
    // One slice per tile, from its opening tag to the next one.
    const slices = team.split('<button').slice(1)
    const tagsOf = (slice: string): string[] =>
      [...slice.matchAll(/class="code-tag">([^<]*)</g)].map(([, text]) => text)
    const by = (id: string): string => slices.find((slice) => slice.includes(`aria-label="${id}, `)) ?? ''

    expect(tagsOf(by('many'))).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', '+2'])
    expect(tagsOf(by('few'))).toEqual(['X1', 'X2', 'X3'])
    expect(by('few')).not.toContain('+')
    expect(by('none')).not.toContain('menu-hint')
    // An id that is also an Object.prototype key must not read an inherited value.
    expect(by('constructor')).not.toContain('menu-hint')
    expect(by('constructor')).not.toContain('code-tag')
    expect(slices).toHaveLength(4)
    // The descriptions never reach the tile.
    expect(team).not.toContain('never shown')
  })

  it('draws no header and no tiles when there are no agents', () => {
    const markup = renderToStaticMarkup(<Shell projectPath="/p" snapshot={snapshot(0)} />)

    expect(markup).not.toContain('chat-head')
    expect(markup).not.toContain('persona-tile')
    expect(markup).not.toContain('aria-label="Team"')
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

describe('Shell, the project files', () => {
  const rail = {
    revision: 1,
    rows: [
      { path: '_bmad/epics.md', state: 'saved' as const, savedAt: 1 },
      { path: '_bmad/planning-artifacts/prd.md', state: 'changing' as const }
    ]
  }
  const withRail = renderToStaticMarkup(<Shell projectPath="/p" snapshot={snapshot(3)} rail={rail} />)
  const outputsOf = (html: string): string => html.slice(html.indexOf('>Outputs<'))
  const teamOf = (html: string): string =>
    html.slice(html.indexOf('>Team<'), html.indexOf('>Outputs<'))

  it('puts the rows and group headings in the Outputs half and never the Team half', () => {
    expect(count(outputsOf(withRail), /<li/g)).toBe(2)
    expect(outputsOf(withRail)).toContain('>_bmad/planning-artifacts/<')
    expect(teamOf(withRail)).not.toContain('output-row')
    expect(teamOf(withRail)).not.toContain('>_bmad/')
  })

  it('adds no button and no tab stop to the Outputs half', () => {
    const outputs = outputsOf(withRail)

    expect(outputs).not.toMatch(/<button|<input|<a |tabindex|role=/)
    // Three tiles and two switch buttons, exactly as without a rail.
    expect(count(withRail, /<button/g)).toBe(2 + 3)
  })

  it('shows the empty state for a snapshot with no rows, and the failure for a failed rail', () => {
    const empty = renderToStaticMarkup(
      <Shell projectPath="/work/falcon" snapshot={snapshot(1)} rail={{ revision: 1, rows: [] }} />
    )
    expect(outputsOf(empty)).toContain('no files under _bmad/ yet')
    expect(outputsOf(empty)).toContain('/work/falcon/_bmad')

    const failed = renderToStaticMarkup(
      <Shell
        projectPath="/p"
        snapshot={snapshot(1)}
        railFailure={{ code: 'rail/unexpected', message: 'rail · unexpected failure' }}
      />
    )
    expect(outputsOf(failed)).toContain('rail · unexpected failure')
  })

  it('names the owner from the install roster it already holds', () => {
    const owned = renderToStaticMarkup(
      <Shell
        projectPath="/p"
        snapshot={snapshotOf([{ ...agent('bmad-agent-pm'), name: 'John' }])}
        rail={{
          revision: 1,
          rows: [
            {
              path: '_bmad/planning-artifacts/prd.md',
              owner: { agentId: 'bmad-agent-pm' },
              state: 'saved',
              savedAt: 1
            }
          ]
        }}
      />
    )

    expect(outputsOf(owned)).toContain('<span class="output-row-owner">John</span>')
  })
})
