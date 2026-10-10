import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { BoardSnapshot } from '../../../shared/board'
import type { AgentView, InstallSnapshot } from '../../../shared/install'
import type { DocSnapshot } from '../../../shared/document'
import type { RailRow, RailSnapshot } from '../../../shared/rail'
import { DocWindowView } from '../doc/doc-app'
import { Outputs } from '../outputs/outputs'
import type { PersonaState } from '../persona/portrait'
import { PERSONA_STATES, STATE_TEXT } from '../status/persona-state'
import { Shell } from './shell'

/**
 * The negative surface, rendered (Story 1.14).
 *
 * The text sweeps in `tests/negative-surface.test.ts` read the sources; this
 * reads the markup the assembled shell actually produces, with every persona
 * state on screen at once and the rail both empty and full. It is the half of
 * the proof that a source sweep cannot give: a component that builds a palette
 * out of pieces no pattern names still has to put a dialog or an input in the
 * markup.
 */

const NOW = 1_000_000_000_000
const DAY = 24 * 60 * 60 * 1000

const agent = (id: string, name: string): AgentView => ({
  id,
  module: 'bmm',
  name,
  title: 'Role',
  icon: 'i',
  description: 'Keeps the plan honest'
})

const ROSTER = [
  agent('bmad-agent-a', 'Ada'),
  agent('bmad-agent-b', 'Ben'),
  agent('bmad-agent-c', 'Cy'),
  agent('bmad-agent-d', 'Di'),
  agent('bmad-agent-e', 'Eli')
]

const snapshot = (agents: AgentView[], menus: InstallSnapshot['menus'] = {}): InstallSnapshot => ({
  revision: 1,
  agents,
  menus,
  errors: [],
  preflight: []
})

/** One persona in each of the five states, so every word is on screen together. */
const STATES = new Map<string, PersonaState>(
  ROSTER.map((member, index) => [member.id, PERSONA_STATES[index]])
)

const row = (path: string, extra: Partial<RailRow> = {}): RailRow =>
  ({ path, state: 'saved', savedAt: NOW - 3 * DAY, ...extra }) as RailRow

const RAIL: RailSnapshot = {
  revision: 1,
  folder: '_bmad/',
  rows: [
    row('_bmad/planning-artifacts/prd.md', { owner: { agentId: 'bmad-agent-a' } }),
    row('_bmad/planning-artifacts/epics.md', { state: 'changing' } as Partial<RailRow>),
    row('_bmad/notes.md', { state: 'not-yet-written' } as Partial<RailRow>)
  ]
}

const LOADING =
  /\b(?:loading|resolving|scanning|fetching|connecting|initiali[sz]ing|please wait|spinner|skeleton|shimmer)\b/i

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length

function shell(overrides: Partial<Parameters<typeof Shell>[0]> = {}): string {
  return renderToStaticMarkup(
    <Shell projectPath="/work/falcon" snapshot={snapshot(ROSTER)} states={STATES} rail={RAIL} {...overrides} />
  )
}

describe('the assembled shell, all five persona states', () => {
  it('has one persona for each state', () => {
    expect(PERSONA_STATES).toHaveLength(ROSTER.length)
    expect(STATES.size).toBe(ROSTER.length)
  })

  const markup = shell()

  it('has no input, no dialog, combobox or search, no footer', () => {
    expect(markup).not.toMatch(/<(?:input|textarea|select|dialog|footer)\b/i)
    expect(markup).not.toMatch(/role="(?:dialog|alertdialog|combobox|search|searchbox|listbox|menu)"/)
    expect(markup).not.toMatch(/aria-modal|aria-haspopup|contenteditable/i)
    // `aria-expanded` is a folder heading's own (Story 5.5), on that button and nothing else.
    const folded = markup.replace(/(class="folder-heading focus-inset") aria-expanded="(?:true|false)"/g, '$1')
    expect(folded).not.toMatch(/aria-expanded/i)
  })

  it('has no badge, unread count, quest marker or highlight', () => {
    expect(markup).not.toMatch(/badge|unread|quest|highlight|recommend|next move/i)
  })

  it('has no count chip beyond the install chip', () => {
    expect(count(markup, /class="chip"/g)).toBe(1)
    expect(markup).toContain('>bmad · 5 agents<')
    // A bare number, or a `+N`, as the whole of an element is a count chip. The state strip's four figures
    // are the one place a number stands alone: plain counts, in text, and each is a `team-strip-figure`.
    expect(markup.replace(/(<span class="team-strip-figure">)\d+(<\/span>)/g, '$1$2')).not.toMatch(/>\+?\d+</)
  })

  it('writes every state as a word, so no state rests on its dot', () => {
    for (const state of PERSONA_STATES) {
      expect(markup, state).toContain(`>${STATE_TEXT[state]}<`)
    }
    // The dot is decoration wherever it is drawn: hidden from assistive technology.
    expect(count(markup, /class="status-dot /g)).toBeGreaterThan(5)
    expect(count(markup, /class="status-dot status-dot--\w+" aria-hidden="true"/g)).toBe(
      count(markup, /class="status-dot /g)
    )
  })

  it('has no loading-like copy and no `.toml` in static copy', () => {
    expect(markup).not.toMatch(LOADING)
    expect(markup).not.toMatch(/\.toml|customize|\.claude\/skills/i)
  })

  it('has no refresh, edit or save control', () => {
    const labels = [...markup.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map(([, label]) => label)

    expect(labels.join(' ')).not.toMatch(/\b(?:refresh|reload|edit|save)\b/i)
  })

  it('lists no skill: a persona’s menu is codes in its own tile, never a description line', () => {
    const withMenus = shell({
      snapshot: snapshot(ROSTER, {
        'bmad-agent-a': [{ code: 'WS', description: 'Write the spec for this project' }]
      })
    })

    expect(withMenus).toContain('>WS<')
    expect(withMenus).not.toContain('Write the spec for this project')
    expect(withMenus).not.toMatch(/WS\s*·/)
  })

  it('treats a file named config.toml as data, and nothing else in the markup mentions it', () => {
    const withToml = shell({
      rail: { revision: 2, folder: '_bmad/', rows: [...RAIL.rows, row('_bmad/config.toml')] }
    })
    const rest = withToml.replace(/<li\b[^>]*>(?:(?!<\/li>)[\s\S])*config\.toml[\s\S]*?<\/li>/, '')

    expect(withToml).toContain('config.toml')
    expect(rest).not.toMatch(/toml/i)
  })
})

describe('the Board, read', () => {
  const board: BoardSnapshot = {
    revision: 1,
    kind: 'read',
    epics: [
      {
        key: 'epic-1',
        number: 1,
        title: 'Shell',
        status: 'in-progress',
        known: true,
        stories: [
          { key: '1-1-a', number: '1.1', title: 'A', status: 'done', known: true },
          { key: '1-2-b', number: '1.2', title: 'B', status: 'in-progress', known: true }
        ]
      }
    ],
    others: []
  }
  const markup = shell({ board })

  it('draws the overview and the epics', () => {
    expect(markup).toContain('>agents running<')
    expect(markup).toContain('>stories in progress<')
    expect(markup).toContain('>1 of 2 stories done<')
  })

  it('has no bar, meter, percentage, tick, spend, budget, cost, token, tool-call or decisions-open figure', () => {
    const board = markup.slice(markup.indexOf('view-board'))

    expect(board).not.toMatch(/<progress|<meter|progressbar|%|\bpercent|\bbar\b|\btick\b|spend|budget|\bcost|token|tool[- ]call|decisions? open|\binbox\b/i)
  })

  it('has no live region, tab stop or control in the overview or the epics', () => {
    const board = markup.slice(markup.indexOf('board-overview'))

    expect(board).not.toMatch(/<button|<input|tabindex|aria-|role=|onclick/i)
  })
})

describe('an empty or pending surface', () => {
  it('draws nothing for the rail before the first snapshot', () => {
    const markup = shell({ rail: null })

    expect(markup).not.toContain('outputs')
    expect(markup).not.toMatch(LOADING)
  })

  it('draws the one fact sentence, and the path, for an empty rail', () => {
    const markup = shell({ rail: { revision: 1, folder: '_bmad/', rows: [] } })

    expect(markup).toContain('no files under _bmad/ yet')
    expect(markup).not.toMatch(LOADING)
    expect(markup).not.toMatch(/<(?:button|input)[^>]*outputs-empty/)
  })

  it('draws no tile and no sentence for an empty roster', () => {
    const markup = shell({ snapshot: snapshot([]), states: new Map(), rail: null })

    expect(markup).not.toContain('persona-tile')
    expect(markup).not.toMatch(LOADING)
    expect(markup).not.toMatch(/no (?:agents|team|personas)/i)
  })

  it('renders the rail component to nothing, not a placeholder, before its first snapshot', () => {
    expect(
      renderToStaticMarkup(
        <Outputs snapshot={null} failure={null} agents={ROSTER} projectPath="/work/falcon" now={NOW} />
      )
    ).toBe('')
  })
})

describe('the document window', () => {
  const SNAPSHOT: DocSnapshot = {
    revision: 1,
    path: '_bmad/notes.txt',
    fullPath: '/work/falcon/_bmad/notes.txt',
    kind: 'text',
    folder: '_bmad/',
    state: 'present',
    text: 'a = 1',
    truncated: false
  }

  const render = (doc: DocSnapshot | null): string =>
    renderToStaticMarkup(
      <DocWindowView
        snapshot={doc}
        failure={null}
        onReveal={() => {}}
        onOpenInEditor={() => {}}
        onClose={() => {}}
      />
    )

  it('has no refresh, edit or save control, and no input, dialog or footer element', () => {
    const markup = render(SNAPSHOT)
    const labels = [...markup.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(([, label]) => label)

    expect(labels).toEqual(['Reveal in Finder', 'Open in editor', 'Close'])
    expect(markup).not.toMatch(/<(?:input|textarea|select|dialog|footer)\b|contenteditable|role="dialog"/i)
    expect(markup).not.toMatch(/\b(?:refresh|reload|save)\b/i)
  })

  it('draws a document that has no snapshot as nothing but the frame', () => {
    expect(render(null)).not.toMatch(LOADING)
  })
})
