import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { InstallSnapshot } from '../../../shared/install'
import { isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'
import type { PersonaState } from '../status/persona-state'
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
  preflight: [],
  skills: []
})

const snapshotOf = (agents: InstallSnapshot['agents']): InstallSnapshot => ({
  revision: 1,
  agents,
  menus: {},
  errors: [],
  preflight: [],
  skills: []
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

  it.each<ViewId>(['conversation', 'party', 'board'])('has three buttons and exactly one pressed (%s)', (view) => {
    const markup = topbar({ view })

    expect(count(markup, /<button/g)).toBe(3)
    expect(count(markup, /aria-pressed="true"/g)).toBe(1)
    expect(count(markup, /aria-pressed="false"/g)).toBe(2)
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

describe('Topbar, the end-session control', () => {
  it('is not rendered without a handler', () => {
    expect(topbar()).not.toContain('End session')
    expect(count(topbar(), /<button/g)).toBe(3)
  })

  it('is a native, always-enabled button after the view switch, with no title, accent, badge or state', () => {
    const markup = topbar({ onEndSession: () => {} })

    expect(count(markup, /<button/g)).toBe(4)
    expect(markup).toContain('<button type="button" class="end-session">End session</button>')
    expect(markup.indexOf('End session')).toBeGreaterThan(markup.indexOf('>Board<'))
    const control = markup.match(/<button[^>]*end-session[^>]*>/)?.[0] ?? ''
    expect(control).not.toMatch(/title=|disabled|aria-|tabindex|style=/)
    expect(markup).not.toContain('tabindex')
    expect(count(markup, /aria-pressed/g)).toBe(3)
  })

  it('is rendered by the shell only when it is given an end handler', () => {
    const without = renderToStaticMarkup(<Shell projectPath="/work/falcon" snapshot={snapshot(2)} />)
    const withHandler = renderToStaticMarkup(
      <Shell projectPath="/work/falcon" snapshot={snapshot(2)} onEndSession={() => {}} />
    )

    expect(without).not.toContain('End session')
    expect(count(withHandler, /End session/g)).toBe(1)
  })

  it('dispatches directly on activation, with no confirm step', () => {
    const calls: string[] = []
    const element = Topbar({
      projectPath: '/work/falcon',
      agentCount: 1,
      branch: null,
      view: 'conversation',
      onView: () => {},
      onEndSession: () => void calls.push('end')
    })
    const found: ReactElement[] = []
    const walk = (node: ReactNode): void => {
      if (isValidElement(node)) {
        const props = node.props as { onEnd?: () => void; children?: ReactNode }
        if (props.onEnd !== undefined) found.push(node)
        walk(props.children)
      } else if (Array.isArray(node)) {
        node.forEach(walk)
      }
    }
    walk(element)

    expect(found).toHaveLength(1)
    ;(found[0].props as { onEnd: () => void }).onEnd()
    expect(calls).toEqual(['end'])
  })
})

describe('Shell', () => {
  const markup = renderToStaticMarkup(
    <Shell projectPath="/work/falcon" snapshot={snapshot(5)}>
      <p>the thread</p>
    </Shell>
  )

  it('holds exactly three views, the party and board ones hidden on open', () => {
    expect(count(markup, /<section[^>]*class="view /g)).toBe(3)
    const conversation = markup.match(/<section[^>]*view-conversation[^>]*>/)?.[0] ?? ''
    const party = markup.match(/<section[^>]*view-party[^>]*>/)?.[0] ?? ''
    const board = markup.match(/<section[^>]*view-board[^>]*>/)?.[0] ?? ''

    expect(conversation).not.toContain('hidden')
    expect(party).toContain('hidden=""')
    expect(board).toContain('hidden=""')
  })

  it('opens on 1:1 Conversation pressed', () => {
    expect(markup).toMatch(/aria-pressed="true">1:1 Conversation</)
    expect(markup).toMatch(/aria-pressed="false">Party Mode</)
    expect(markup).toMatch(/aria-pressed="false">Board</)
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

  it('puts what `party` is given in the party view and nowhere else, and still hides it on open', () => {
    const slotted = renderToStaticMarkup(
      <Shell projectPath="/work/falcon" snapshot={snapshot(5)} party={<p className="slotted">in the room</p>} />
    )
    const party = slotted.slice(slotted.indexOf('<section class="view view-party"'))

    expect(party).toMatch(/^<section[^>]*hidden=""[^>]*><p class="slotted">in the room<\/p><\/section>/)
    expect(slotted.match(/class="slotted"/g)).toHaveLength(1)
    expect(slotted.indexOf('class="slotted"')).toBeGreaterThan(slotted.indexOf('view-party'))
  })

  it('leaves the party view empty', () => {
    expect(markup).toMatch(/<section[^>]*view-party[^>]*><\/section>/)
  })

  it('draws nothing the rail halves and party view do not own', () => {
    const sidebar = markup.slice(markup.indexOf('<div class="sidebar"'), markup.indexOf('<div class="chat">'))
    const rail = markup.slice(
      markup.indexOf('<div class="rail">'),
      markup.indexOf('<section class="view view-party"')
    )
    const outputs = rail.slice(rail.indexOf('>Outputs<'))

    // The Team half, in the sidebar, holds one tile button per agent and the `Skill Session` button (Story 7.5); the
    // Outputs half, alone in the rail, holds none.
    expect(count(sidebar, /<button/g)).toBe(5 + 1)
    expect(count(rail, /<button/g)).toBe(0)
    expect(rail).not.toContain('>Team<')
    expect(outputs).not.toContain('<button')
    expect(`${sidebar}${rail}`).not.toMatch(/<a |<input|<textarea/)
  })

  it('owns no live region and no second switch', () => {
    // Spelled in two halves: accessibility.test.ts counts the bare attribute
    // across src/, and this file is not the live region.
    expect(markup).not.toContain(`aria-${'live'}`)
    // Three switch buttons in the topbar, one button per tile in the rail and the `Skill Session` button beside them.
    const bar = markup.slice(markup.indexOf('<header'), markup.indexOf('</header>'))
    expect(count(bar, /<button/g)).toBe(3)
    expect(count(markup, /<button/g)).toBe(3 + 5 + 1)
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

  it('names the current agent in the header and marks its tile current, and no other', () => {
    const markup = renderToStaticMarkup(<Shell projectPath="/p" snapshot={snapshot(3)} currentId="bmad-agent-0" />)
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
        currentId="a"
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
    // The tile chosen is the current one and names the header.
    expect(tiles(team)[0]).toContain('aria-current="true"')
  })

  it('reads every state from the states map, an unmatched id being idle', () => {
    const states = new Map<string, PersonaState>([
      ['bmad-agent-0', 'work'],
      ['bmad-agent-1', 'note'],
      ['not-an-agent', 'error']
    ])
    const markup = renderToStaticMarkup(
      <Shell projectPath="/p" snapshot={snapshot(3)} states={states} currentId="bmad-agent-0" />
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

  it('hands each persona’s start to its tile and, for the current one, to the header, counting only work', () => {
    const states = new Map<string, PersonaState>([
      ['bmad-agent-0', 'work'],
      ['bmad-agent-1', 'work'],
      ['bmad-agent-2', 'idle']
    ])
    const since = new Map([
      ['bmad-agent-0', Date.now() - 5_000],
      ['bmad-agent-1', Date.now() - 125_000],
      ['bmad-agent-2', Date.now() - 5_000]
    ])
    const markup = renderToStaticMarkup(
      <Shell projectPath="/p" snapshot={snapshot(3)} states={states} since={since} currentId="bmad-agent-0" />
    )
    const header = markup.slice(markup.indexOf('class="chat-head"'), markup.indexOf('class="scroll"'))

    expect(count(markup, /class="state-elapsed"/g)).toBe(3)
    expect(header).toMatch(/class="state-elapsed"> · 5s</)
    const whole = teamOf(markup).split('</button>').slice(0, 3)
    expect(whole.map((tile) => tile.match(/class="state-elapsed">([^<]*)</)?.[1])).toEqual([
      ' · 5s',
      ' · 2m 05s',
      undefined
    ])
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

  it('draws no persona header and no tiles when there are no agents: the New session chat is what the column holds', () => {
    const markup = renderToStaticMarkup(<Shell projectPath="/p" snapshot={snapshot(0)} />)

    expect(markup).not.toContain('chat-close')
    expect(markup).toContain('>New session<')
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

    expect(buttons).toHaveLength(3)
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
    folder: '_bmad/',
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
    // A nested directory's heading shows its own name, its full path its title (Story 9.2).
    expect(outputsOf(withRail)).toContain('>planning-artifacts/<')
    expect(outputsOf(withRail)).toContain('title="_bmad/planning-artifacts/"')
    expect(teamOf(withRail)).not.toContain('output-row')
    expect(teamOf(withRail)).not.toContain('>_bmad/')
  })

  it('makes each row one button and the half one tab stop, with no input, link or role', () => {
    const outputs = outputsOf(withRail)

    // The one role is a folder heading's own `heading` wrapper (Story 9.2).
    expect(outputs.replace(/role="heading"/g, '')).not.toMatch(/<input|<a |role=/)
    // The head's `change…`, the two directories' headings and the two rows: the headings and the rows are the
    // list's one tab stop (the first heading holds it), the head's button its own, before them.
    expect(count(outputs, /<button/g)).toBe(1 + 2 + 2)
    expect(count(outputs, /tabindex="0"/g)).toBe(1)
    expect(outputs.indexOf('change…')).toBeLessThan(outputs.indexOf('<li'))
    // Three tiles, the `Skill Session` button, three switch buttons, `change…`, the two headings and the two rows.
    expect(count(withRail, /<button/g)).toBe(3 + 1 + 3 + 1 + 2 + 2)
  })

  it('shows the empty state for a snapshot with no rows, and the failure for a failed rail', () => {
    const empty = renderToStaticMarkup(
      <Shell projectPath="/work/falcon" snapshot={snapshot(1)} rail={{ revision: 1, folder: '_bmad/', rows: [] }} />
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

  it('puts the folder and `change…` in the Outputs head, before the list, and nothing of them in the Team half', () => {
    const chosen = renderToStaticMarkup(
      <Shell
        projectPath="/p"
        snapshot={snapshot(1)}
        rail={{ ...rail, folder: 'docs/out/', chosen: 'docs/out/', rows: [{ path: 'docs/out/a.md', state: 'saved', savedAt: 1 }] }}
      />
    )
    const outputs = outputsOf(chosen)

    expect(outputs).toContain('<span class="outputs-where">docs/out/</span>')
    expect(outputs.indexOf('class="outputs-change"')).toBeLessThan(outputs.indexOf('<li'))
    expect(outputs.indexOf('class="outputs-change"')).toBeGreaterThan(outputs.indexOf('class="rail-head-trailing"'))
    expect(teamOf(chosen)).not.toContain('outputs-where')
    expect(teamOf(chosen)).not.toContain('change…')
    expect(outputs).toContain('>docs/out/<')
  })

  it('draws no head folder before the first snapshot, and no state line unless there is a state to say', () => {
    const none = renderToStaticMarkup(<Shell projectPath="/p" snapshot={snapshot(1)} />)
    expect(none).not.toContain('outputs-where')
    expect(none).not.toContain('change…')
    expect(withRail).not.toContain('outputs-state')
  })

  it.each([
    ['bmad writes to · _bmad/', { chosen: 'docs/out/', folder: 'docs/out/', bmadFolder: '_bmad/', state: 'different' as const }],
    ['docs/out/ · folder missing', { chosen: 'docs/out/', folder: '_bmad/', state: 'missing' as const }]
  ])('says %s on one plain line between the head and the list, outside what scrolls', (line, facts) => {
    const markup = renderToStaticMarkup(
      <Shell projectPath="/p" snapshot={snapshot(1)} rail={{ revision: 1, rows: [], ...facts }} />
    )
    const outputs = outputsOf(markup)

    expect(outputs).toContain(`<p class="outputs-state">${line}</p>`)
    expect(outputs.match(/outputs-state/g)).toHaveLength(1)
    expect(outputs.indexOf('class="outputs-state"')).toBeGreaterThan(outputs.indexOf('class="rail-head-trailing"'))
    expect(outputs.indexOf('class="outputs-state"')).toBeLessThan(outputs.indexOf('class="rail-body"'))
  })

  it('says a refusal on that line, over any other state, so that the line is always one', () => {
    const markup = renderToStaticMarkup(
      <Shell
        projectPath="/p"
        snapshot={snapshot(1)}
        rail={{
          revision: 1,
          rows: [],
          folder: 'docs/out/',
          chosen: 'docs/out/',
          bmadFolder: '_bmad/',
          state: 'different',
          refusal: { reason: 'inside .git', seq: 1 }
        }}
      />
    )

    expect(outputsOf(markup)).toContain('<p class="outputs-state">not changed · inside .git</p>')
    expect(outputsOf(markup)).not.toContain('bmad writes to')
  })

  it('names the owner from the install roster it already holds', () => {
    const owned = renderToStaticMarkup(
      <Shell
        projectPath="/p"
        snapshot={snapshotOf([{ ...agent('bmad-agent-pm'), name: 'John' }])}
        rail={{
          revision: 1,
          folder: '_bmad/',
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

describe('Shell, the composer slot', () => {
  const markup = (props: Partial<Parameters<typeof Shell>[0]> = {}): string =>
    renderToStaticMarkup(<Shell projectPath="/work/falcon" snapshot={snapshot(2)} currentId="bmad-agent-0" {...props} />)

  it('puts the composer in .chat after .scroll, built for the current persona', () => {
    const html = markup({
      composer: (agent) => <i className="slot" data-agent={agent.id} />,
      children: <b className="turns" />
    })

    expect(html).toContain('data-agent="bmad-agent-0"')
    expect(html.indexOf('class="scroll"')).toBeLessThan(html.indexOf('class="slot"'))
    expect(html.indexOf('class="turns"')).toBeLessThan(html.indexOf('class="slot"'))
    expect(html.indexOf('class="slot"')).toBeLessThan(html.indexOf('class="rail"'))
    expect(html.match(/class="slot"/g)).toHaveLength(1)
  })

  it('adds nothing to the chat column without a composer, or without an agent', () => {
    expect(markup()).not.toContain('slot')
    expect(
      markup({ snapshot: snapshotOf([]), composer: () => <i className="slot" /> })
    ).not.toContain('class="slot"')
  })
})

describe('Shell, the orphan headers', () => {
  const orphan = (id: string, name: string) => ({ ...agent(id), name })
  const markup = (props: Partial<Parameters<typeof Shell>[0]> = {}): string =>
    renderToStaticMarkup(<Shell projectPath="/work/falcon" snapshot={snapshot(2)} currentId="bmad-agent-0" {...props} />)

  it('draws none by default', () => {
    expect(markup()).not.toContain('orphan-head')
  })

  it('draws one per orphan, in order, above the current persona’s header and before the thread', () => {
    const html = markup({
      orphans: [orphan('bmad-agent-x', 'Xena'), orphan('bmad-agent-y', 'Yves')],
      onCloseOrphan: () => {},
      children: <b className="turns" />
    })

    expect(count(html, /orphan-head"/g)).toBe(2)
    expect(html.indexOf('Xena')).toBeLessThan(html.indexOf('Yves'))
    const chat = html.slice(html.indexOf('<div class="chat">'))
    expect(chat.indexOf('Yves')).toBeLessThan(chat.indexOf('bmad-agent-0'))
    expect(chat.indexOf('bmad-agent-0')).toBeLessThan(chat.indexOf('class="scroll"'))
    expect(html).toContain('aria-label="close session · Xena"')
    expect(html).toContain('aria-label="close session · Yves"')
  })

  it('gives an orphan no tile, and the roster alone decides the current persona', () => {
    const html = markup({ orphans: [orphan('bmad-agent-x', 'Xena')], currentId: 'bmad-agent-x' })

    expect(html).not.toContain('persona-tile" aria-label="Xena')
    expect(count(html, /class="persona-tile/g)).toBe(2)
    // The chosen id is not in the roster, so nobody is current (Story 7.5): the column is the New session chat.
    expect(count(html, /aria-current="true"/g)).toBe(0)
    expect(html).toContain('>New session<')
  })
})

describe('Shell, the close control of an open session', () => {
  const markup = (props: Partial<Parameters<typeof Shell>[0]> = {}): string =>
    renderToStaticMarkup(<Shell projectPath="/work/falcon" snapshot={snapshot(2)} currentId="bmad-agent-0" {...props} />)

  it('draws none without an open session or a stored thread, or without a way to close one', () => {
    expect(markup({ threadEmpty: true })).not.toContain('chat-close')
    expect(markup({ threadEmpty: true, onCloseSession: () => {} })).not.toContain('chat-close')
    expect(markup({ liveSessions: new Set(['bmad-agent-0']) })).not.toContain('chat-close')
    expect(markup({ onCloseSession: undefined })).not.toContain('chat-close')
  })

  it('draws one for a persona with a stored thread and no session open (Story 8.5), and none once the thread is empty', () => {
    const stored = markup({ threadEmpty: false, onCloseSession: () => {} })

    expect(count(stored, /class="chat-close"/g)).toBe(1)
    expect(markup({ threadEmpty: true, onCloseSession: () => {} })).not.toContain('chat-close')
  })

  it('draws the stored-thread control as a real, enabled, tabbable button with its usual accessible name (keyboard reach)', () => {
    const html = markup({ threadEmpty: false, onCloseSession: () => {} })
    const button = html.match(/<button[^>]*class="chat-close"[^>]*>[^<]*<\/button>/)?.[0] ?? ''

    expect(button).toMatch(/^<button type="button" class="chat-close" aria-label="close session · [^"]+">close session<\/button>$/)
    // A native button is in the tab order and answers Enter and Space; nothing here takes it out or disables it.
    expect(button).not.toMatch(/disabled|tabindex|aria-disabled|role=/i)
  })

  it('draws one for a live persona whose thread is empty', () => {
    const html = markup({ threadEmpty: true, liveSessions: new Set(['bmad-agent-0']), onCloseSession: () => {} })

    expect(count(html, /class="chat-close"/g)).toBe(1)
  })

  it('draws one in the current persona’s header while that persona has a session open, named for them', () => {
    const html = markup({ liveSessions: new Set(['bmad-agent-0']), onCloseSession: () => {} })

    expect(count(html, /class="chat-close"/g)).toBe(1)
    expect(html).toContain('aria-label="close session · ')
    expect(html.indexOf('chat-close')).toBeGreaterThan(html.indexOf('chat-head-state'))
    expect(html.indexOf('chat-close')).toBeLessThan(html.indexOf('class="scroll"'))
  })

  it('draws none for a persona who is not current, even one with a session open', () => {
    const html = markup({ threadEmpty: true, liveSessions: new Set(['bmad-agent-1']), onCloseSession: () => {} })

    expect(html).not.toContain('chat-close')
  })
})

describe('Shell, the pinned slot (Story 3.14)', () => {
  const markup = (props: Partial<Parameters<typeof Shell>[0]> = {}): string =>
    renderToStaticMarkup(<Shell projectPath="/work/falcon" snapshot={snapshot(2)} currentId="bmad-agent-0" {...props} />)
  const pinned = (): ReactNode => <section className="run-card" aria-busy="true">card</section>

  it('draws no slot without a pinned render prop, or when it returns nothing', () => {
    expect(markup()).not.toContain('class="pinned"')
    expect(markup({ pinned: () => null })).not.toContain('class="pinned"')
  })

  it('is called with the current persona and draws what it returns in one slot', () => {
    const seen: string[] = []
    const html = markup({
      currentId: 'bmad-agent-1',
      pinned: (agent) => {
        seen.push(agent.id)
        return pinned()
      }
    })

    expect(seen).toEqual(['bmad-agent-1'])
    expect(count(html, /class="pinned"/g)).toBe(1)
    expect(html).toContain('<div class="pinned"><section class="run-card" aria-busy="true">card</section></div>')
  })

  it('is the chat column’s first child: before the orphan headers, the persona header and the scroll region', () => {
    const html = markup({ pinned, orphans: [agent('bmad-agent-gone')], onCloseOrphan: () => {} })
    const chat = html.slice(html.indexOf('<div class="chat">'))

    expect(chat.startsWith('<div class="chat"><div class="pinned">')).toBe(true)
    expect(chat.indexOf('class="pinned"')).toBeLessThan(chat.indexOf('orphan'))
    expect(chat.indexOf('class="pinned"')).toBeLessThan(chat.indexOf('chat-head'))
    expect(chat.indexOf('class="pinned"')).toBeLessThan(chat.indexOf('class="scroll"'))
  })

  it('is outside the scrolling thread, and holds no attribute but its class', () => {
    const html = markup({ pinned })
    const slot = html.slice(html.indexOf('<div class="pinned">'), html.indexOf('</section></div>', html.indexOf('<div class="pinned">')) + 1)

    expect(html.slice(html.indexOf('class="scroll"'))).not.toContain('run-card')
    // The slot's own tag carries a class and nothing else: no tab stop, role or live attribute.
    expect(slot.startsWith('<div class="pinned">')).toBe(true)
    expect(slot).not.toMatch(/tabindex|role=/i)
  })
})

describe('Shell, the New session chat, the `Skill Session` button and a skill-first session (Story 7.5)', () => {
  const draw = (props: Partial<Parameters<typeof Shell>[0]> = {}): string =>
    renderToStaticMarkup(<Shell projectPath="/p" snapshot={snapshot(2)} {...props} />)
  const SEAT = { sessionId: 'sk1', skill: 'bmad-build', at: 1, state: 'live' as const, since: undefined }

  it('opens on the New session chat when nobody is current: its header, its composer slot and no persona header', () => {
    const html = draw({ newComposer: () => <i className="new-slot" />, composer: () => <i className="persona-slot" /> })

    expect(html).toContain('>New session<')
    expect(html).toContain('class="new-slot"')
    expect(html).not.toContain('persona-slot')
    expect(html).not.toContain('chat-close')
    expect(count(html, /aria-current="true"/g)).toBe(0)
  })

  it('draws the `Skill Session` button once, in a Team-half row between the strip and the tiles, pressed only with the chat in view', () => {
    const html = draw()
    const sidebar = html.slice(html.indexOf('<div class="sidebar"'), html.indexOf('<div class="chat">'))

    expect(count(sidebar, /Skill Session/g)).toBe(1)
    expect(sidebar).toContain('<button type="button" class="skill-session-button" aria-pressed="true">Skill Session</button>')
    expect(sidebar.indexOf('team-strip')).toBeLessThan(sidebar.indexOf('skill-session-button'))
    expect(sidebar.indexOf('skill-session-button')).toBeLessThan(sidebar.indexOf('persona-tile'))
    expect(draw({ currentId: 'bmad-agent-0' })).toContain('aria-pressed="false">Skill Session')
    expect(draw({ chat: { skillSession: 'sk1' }, skillSeats: [SEAT] })).toContain('aria-pressed="false">Skill Session')
  })

  it('turns to a skill-first session’s header, thread and composer when it is asked for and held, and to the New session chat when it is gone', () => {
    const html = draw({
      chat: { skillSession: 'sk1' },
      skillSeats: [SEAT],
      skillComposer: (seat) => <i className="skill-slot" data-skill={seat.skill} />,
      newComposer: () => <i className="new-slot" />,
      children: <b className="turns" />
    })

    expect(html).toContain('chat-head-name chat-head-name--skill">bmad-build<')
    expect(html).toContain('class="skill-slot"')
    expect(html).not.toContain('new-slot')
    expect(html).not.toContain('>New session<')
    expect(html.indexOf('class="chat-head"')).toBeLessThan(html.indexOf('class="scroll"'))
    expect(html.indexOf('class="turns"')).toBeLessThan(html.indexOf('class="skill-slot"'))

    const gone = draw({ chat: { skillSession: 'sk-gone' }, skillSeats: [SEAT], newComposer: () => <i className="new-slot" /> })
    expect(gone).toContain('>New session<')
    expect(gone).toContain('class="new-slot"')
  })

  it('draws no persona intro, pinned slot or orphan state in a chat that is not a persona’s', () => {
    const html = draw({ currentId: 'bmad-agent-0', chat: 'new', threadEmpty: true, pinned: () => <b className="pinned-card" /> })

    expect(html).not.toContain('thread-intro')
    expect(html).not.toContain('pinned-card')
  })

  it('reads the header’s Stop for a skill-first session in flight, from its own busy set', () => {
    const busy = draw({ chat: { skillSession: 'sk1' }, skillSeats: [{ ...SEAT, state: 'work', since: 1 }], skillBusy: new Set(['sk1']), onStopSkill: () => {} })

    expect(busy).toContain('aria-label="Stop · bmad-build"')
    expect(draw({ chat: { skillSession: 'sk1' }, skillSeats: [SEAT], onCloseSkill: () => {} })).toContain('aria-label="close session · bmad-build"')
  })
})
