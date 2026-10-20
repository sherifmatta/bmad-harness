import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AgentView } from '../../../shared/install'
import type { RailRow, RailSnapshot } from '../../../shared/rail'
import { Outputs } from './outputs'

const NOW = 1_000_000_000_000
const DAY = 24 * 60 * 60 * 1000

const JOHN: AgentView = {
  id: 'bmad-agent-pm',
  module: 'bmm',
  name: 'John',
  title: 'PM',
  icon: 'i',
  description: 'd'
}

type Props = Parameters<typeof Outputs>[0]

function render(overrides: Partial<Props> = {}): string {
  return renderToStaticMarkup(
    <Outputs
      snapshot={null}
      failure={null}
      agents={[JOHN]}
      projectPath="/work/falcon"
      now={NOW}
      {...overrides}
    />
  )
}

const rail = (...rows: RailRow[]): RailSnapshot => ({ revision: 1, folder: '_bmad/', rows })
const saved = (path: string, extra: Partial<RailRow> = {}): RailRow =>
  ({ path, state: 'saved', savedAt: NOW - 3 * DAY, ...extra }) as RailRow

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length

describe('Outputs', () => {
  it('draws nothing at all before the first snapshot: no spinner, no sentence', () => {
    expect(render()).toBe('')
  })

  it('renders a rail failure through the error line when there is no snapshot', () => {
    const markup = render({
      failure: { code: 'rail/no-project', message: 'rail · no project is open for this window' }
    })

    expect(markup).toContain('error-line')
    expect(markup).toContain('rail · no project is open for this window')
  })

  it('is exactly two lines for a snapshot with no rows, the path beneath', () => {
    const markup = render({ snapshot: rail() })

    expect(markup).toBe(
      '<div class="outputs-empty"><p class="outputs-empty-line">no files under _bmad/ yet</p>' +
        '<p class="outputs-empty-path">/work/falcon/_bmad</p></div>'
    )
    expect(count(markup, /<p /g)).toBe(2)
    expect(markup).not.toMatch(/<button|<input|<a |<ul|skill|persona|next|run /i)
  })

  it('nests rows under directory headings as a tree, each a button of the folder heading class showing its own name (Stories 5.5, 9.2)', () => {
    const markup = render({
      snapshot: rail(
        saved('_bmad/planning-artifacts/prd.md'),
        saved('_bmad/epics.md'),
        saved('_bmad/planning-artifacts/architecture.md')
      )
    })

    expect(count(markup, /class="folder-heading focus-inset"/g)).toBe(2)
    expect(markup).not.toContain('rail-group')
    // The root as written, then the subdirectory by its own name, its full path its title.
    expect(markup).toContain('>_bmad/<')
    expect(markup).toContain('>planning-artifacts/<')
    expect(markup).not.toContain('>_bmad/planning-artifacts/<')
    expect(markup).toContain('title="_bmad/planning-artifacts/"')
    expect(count(markup, /<li/g)).toBe(3)
    // Visual order: the root's heading, its subdirectory and that one's files, then the root's own files.
    expect(markup.indexOf('>_bmad/<')).toBeLessThan(markup.indexOf('>planning-artifacts/<'))
    expect(markup.indexOf('>planning-artifacts/<')).toBeLessThan(markup.indexOf('architecture.md'))
    expect(markup.indexOf('architecture.md')).toBeLessThan(markup.indexOf('prd.md'))
    expect(markup.indexOf('prd.md')).toBeLessThan(markup.indexOf('epics.md'))
    // The subdirectory's group sits inside the root's branch.
    expect(markup).toMatch(/<div class="outputs-group" style="--tree-depth:0">.*<div class="outputs-group" style="--tree-depth:1">/)
  })

  it('heads each level with its depth: the root at level 4 under the rail head’s h3, one more per level', () => {
    const markup = render({ snapshot: rail(saved('_bmad/a/b/c.md')) })

    expect([...markup.matchAll(/role="heading" aria-level="(\d)"/g)].map(([, level]) => level)).toEqual(['4', '5', '6'])
    expect([...markup.matchAll(/--tree-depth:(\d)/g)].map(([, depth]) => depth)).toEqual(['0', '1', '2'])
  })

  it('names the owner from the roster, and nothing where the roster lacks the agent', () => {
    const snapshot = rail(
      saved('_bmad/planning-artifacts/prd.md', { owner: { agentId: 'bmad-agent-pm' } }),
      saved('_bmad/planning-artifacts/architecture.md', { owner: { agentId: 'bmad-agent-architect' } }),
      saved('_bmad/epics.md')
    )
    const markup = render({ snapshot })

    expect(count(markup, /output-row-owner/g)).toBe(1)
    expect(markup).toContain('<span class="output-row-owner">John</span>')
    expect(render({ snapshot, agents: [] })).not.toContain('output-row-owner')
  })

  it('names the annotation’s owner first, then the class’s, and an agent the roster lacks as nobody', () => {
    const ANALYST: AgentView = { ...JOHN, id: 'bmad-agent-analyst', name: 'Mary', title: 'Analyst' }
    const annotation = (agentId: string, text = 'writing · §2 Goals'): RailRow['annotation'] => ({ text, owner: { agentId } })
    const prd = (extra: Partial<RailRow>): RailSnapshot =>
      rail({ path: '_bmad/planning-artifacts/prd.md', state: 'changing', owner: { agentId: 'bmad-agent-pm' }, ...extra } as RailRow)
    const owners = (markup: string): string[] => [...markup.matchAll(/output-row-owner">([^<]*)</g)].map(([, name]) => name)

    // The session's owner wins over the class's.
    expect(owners(render({ agents: [JOHN, ANALYST], snapshot: prd({ annotation: annotation('bmad-agent-analyst') }) }))).toEqual(['Mary'])
    // An annotation with no owner leaves the class's.
    expect(owners(render({ agents: [JOHN, ANALYST], snapshot: prd({ annotation: { text: 'writing' } }) }))).toEqual(['John'])
    // A row with no class owner takes the annotation's.
    expect(
      owners(render({ agents: [JOHN], snapshot: rail({ path: '_bmad/notes.md', state: 'changing', annotation: annotation('bmad-agent-pm') }) }))
    ).toEqual(['John'])
    // An annotation's owner the roster lacks reads as nobody: the class's owner does not stand in for it.
    const absent = render({ agents: [JOHN], snapshot: prd({ annotation: annotation('bmad-agent-gone') }) })
    expect(owners(absent)).toEqual([])
    expect(absent).toContain('output-row-annotation')
    expect(absent).not.toContain('John')
  })

  it('names every owner of a contended row from the roster, and never the class’s owner beside them', () => {
    const ANALYST: AgentView = { ...JOHN, id: 'bmad-agent-analyst', name: 'Mary', title: 'Analyst' }
    const ARCHITECT: AgentView = { ...JOHN, id: 'bmad-agent-architect', name: 'Winston', title: 'Architect' }
    const contended = (...agentIds: string[]): RailSnapshot =>
      rail({
        path: '_bmad/planning-artifacts/architecture.md',
        state: 'changing',
        // The class's owner is Winston, who is not writing it here.
        owner: { agentId: 'bmad-agent-architect' },
        annotation: { text: 'contention', owners: agentIds.map((agentId) => ({ agentId })) }
      } as RailRow)
    const owners = (markup: string): string[] => [...markup.matchAll(/output-row-owner">([^<]*)</g)].map(([, name]) => name)
    const agents = [JOHN, ANALYST, ARCHITECT]

    const two = render({ agents, snapshot: contended('bmad-agent-pm', 'bmad-agent-analyst') })
    expect(owners(two)).toEqual(['John and Mary'])
    expect(two).toContain('<span class="output-row-annotation">contention</span>')
    expect(owners(render({ agents, snapshot: contended('bmad-agent-pm', 'bmad-agent-analyst', 'bmad-agent-architect') }))).toEqual([
      'John, Mary and Winston'
    ])
    // A name the roster lacks is not replaced.
    expect(owners(render({ agents: [JOHN, ARCHITECT], snapshot: contended('bmad-agent-pm', 'bmad-agent-analyst') }))).toEqual(['John'])
    // With none to name the slot is not drawn, and the class's owner does not stand in.
    const none = render({ agents, snapshot: contended() })
    expect(none).not.toContain('output-row-owner')
    expect(none).not.toContain('Winston')
    expect(none).toContain('output-row-annotation')
  })

  it('draws a contended row’s disk state as the watcher said it, beside the contention tag', () => {
    const row = saved('_bmad/planning-artifacts/prd.md', { annotation: { text: 'contention', owners: [{ agentId: 'bmad-agent-pm' }] } })
    const markup = render({ snapshot: rail(row) })

    expect(markup).toContain('<span class="output-row-annotation">contention</span>')
    expect(markup).toContain('saved · 3d')
    expect(markup).not.toContain('changing')
  })

  it('draws the annotation tag and the watcher’s state in two registers, neither moving the other', () => {
    const row: RailRow = { path: '_bmad/prd.md', state: 'saved', savedAt: NOW - 2 * DAY, annotation: { text: 'writing · §1 Context' } }
    const markup = render({ snapshot: rail(row) })

    expect(markup).toContain('<span class="output-row-annotation">writing · §1 Context</span>')
    expect(markup).toContain('saved · 2d')
    // An annotation raises no `changing` and draws no dot: that is the watcher's word, and it said `saved`.
    expect(markup).not.toContain('changing')
    expect(markup).not.toContain('status-dot')
  })

  it('draws no recency, relevance, pin, badge or count', () => {
    const markup = render({ snapshot: rail(saved('_bmad/a.md'), saved('_bmad/b.md')) })

    expect(markup).not.toMatch(/badge|pin|recent|count|highlight/i)
    expect(markup).not.toMatch(/\b2\b/)
  })

  it('is one list per directory with files, each heading and each row one button, and no role, style, title or live region but the tree’s', () => {
    const markup = render({ snapshot: rail(saved('_bmad/a.md'), saved('_bmad/x/b.md')) })

    expect(count(markup, /<ul/g)).toBe(2)
    expect(count(markup, /<button/g)).toBe(4)
    // The tree's own (Story 9.2): a heading wrapper per directory, its full path as the title, and its depth.
    expect(count(markup, /role="heading"/g)).toBe(2)
    expect(count(markup, /title=/g)).toBe(2)
    expect(count(markup, /style="--tree-depth:\d"/g)).toBe(2)
    const bare = markup
      .replace(/role="heading" aria-level="\d"/g, '')
      .replace(/title="[^"]*"/g, '')
      .replace(/style="--tree-depth:\d"/g, '')
    expect(bare).not.toMatch(/<input|role=|style=|title=/)
    // Spelled in two halves: accessibility.test.ts counts the bare attribute across src/.
    expect(markup).not.toContain(`aria-${'live'}`)
  })

  it('does not show a stale failure beside a snapshot', () => {
    const markup = render({
      snapshot: rail(saved('_bmad/a.md')),
      failure: { code: 'rail/unexpected', message: 'rail · unexpected failure' }
    })

    expect(markup).not.toContain('error-line')
  })
})

describe('the rows as one roving list', () => {
  const snapshot = rail(
    saved('_bmad/planning-artifacts/prd.md'),
    saved('_bmad/epics.md'),
    saved('_bmad/planning-artifacts/architecture.md')
  )

  it('has exactly one tab stop, and it is the first entry in visual order: the first directory’s heading', () => {
    const markup = render({ snapshot })

    // Two headings and three rows are the list; one of the five holds the stop.
    expect(count(markup, /tabindex="0"/g)).toBe(1)
    expect(count(markup, /tabindex="-1"/g)).toBe(4)
    // Visual order: _bmad/, then its planning-artifacts/ heading and that one's rows by name, then epics.md.
    expect(markup.indexOf('tabindex="0"')).toBeLessThan(markup.indexOf('>_bmad/<'))
    expect(markup.indexOf('tabindex="0"')).toBeLessThan(markup.indexOf('epics.md'))
    expect(markup.indexOf('tabindex="0"')).toBeLessThan(markup.indexOf('tabindex="-1"'))
  })

  it('draws the list with no role but the headings’ own: it is a plain list of buttons', () => {
    expect(render({ snapshot }).replace(/role="heading"/g, '')).not.toMatch(/role=/)
  })
})
