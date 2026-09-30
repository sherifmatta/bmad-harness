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

const rail = (...rows: RailRow[]): RailSnapshot => ({ revision: 1, rows })
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

  it('groups rows under directory headings in the shell’s own group class', () => {
    const markup = render({
      snapshot: rail(
        saved('_bmad/planning-artifacts/prd.md'),
        saved('_bmad/epics.md'),
        saved('_bmad/planning-artifacts/architecture.md')
      )
    })

    expect(count(markup, /class="rail-group"/g)).toBe(2)
    expect(markup.indexOf('>_bmad/<')).toBeLessThan(markup.indexOf('>_bmad/planning-artifacts/<'))
    expect(count(markup, /<li/g)).toBe(3)
    expect(markup.indexOf('architecture.md')).toBeLessThan(markup.indexOf('prd.md'))
    expect(markup.indexOf('>_bmad/planning-artifacts/<')).toBeLessThan(markup.indexOf('architecture.md'))
    expect(markup.indexOf('epics.md')).toBeLessThan(markup.indexOf('>_bmad/planning-artifacts/<'))
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

  it('draws no recency, relevance, pin, badge or count', () => {
    const markup = render({ snapshot: rail(saved('_bmad/a.md'), saved('_bmad/b.md')) })

    expect(markup).not.toMatch(/badge|pin|recent|count|highlight/i)
    expect(markup).not.toMatch(/\b2\b/)
  })

  it('is one list per group, with no control, role, tab stop or live region', () => {
    const markup = render({ snapshot: rail(saved('_bmad/a.md'), saved('_bmad/x/b.md')) })

    expect(count(markup, /<ul/g)).toBe(2)
    expect(markup).not.toMatch(/<button|<input|role=|tabindex|style=|title=/)
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
