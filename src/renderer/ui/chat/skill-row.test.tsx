import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AgentView, InstallSnapshot } from '../../../shared/install'
import { Shell } from '../shell/shell'
import { Composer } from './composer'
import { SkillRow } from './skill-row'

const ENTRIES = [
  { code: 'CP', description: 'Create the PRD' },
  { code: 'VP', description: 'Validate a PRD' }
]

const entries = (count: number) => Array.from({ length: count }, (_, at) => ({ code: `C${at}`, description: `Entry ${at}` }))
const ten = entries(10)

const row = (disabled = false, items = ENTRIES): string =>
  renderToStaticMarkup(<SkillRow name="John" items={items} disabled={disabled} onRun={() => {}} />)

describe('the skill row', () => {
  it('is labelled with the persona, and shows each entry’s description behind its code chip', () => {
    const markup = row()
    expect(markup).toContain('<span class="skill-row-label">John can</span>')
    expect(markup).toContain(
      '<button type="button" class="skill-button"><span class="skill-code">CP</span>Create the PRD</button>'
    )
    expect(markup.match(/class="skill-button"/g)).toHaveLength(2)
  })

  it('renders at one entry and at ten, and is nothing at none', () => {
    expect(row(false, ENTRIES.slice(0, 1)).match(/class="skill-button"/g)).toHaveLength(1)
    expect(row(false, ENTRIES.slice(0, 1))).not.toContain('skill-more')
    expect(row(false, ten).match(/class="skill-button"/g)).toHaveLength(5)
    expect(row(false, [])).toBe('')
  })

  it('shows every entry and no toggle up to five, and the first five then `+N more` beyond', () => {
    expect(row(false, entries(5)).match(/class="skill-button"/g)).toHaveLength(5)
    expect(row(false, entries(5))).not.toContain('skill-more')

    const six = row(false, entries(6))
    expect(six.match(/class="skill-button"/g)).toHaveLength(5)
    expect(six).toContain('<button type="button" class="skill-more" aria-expanded="false">+1 more</button>')
    expect(six).not.toContain('Entry 5')

    const many = row(false, ten)
    expect(many).toContain('>+5 more</button>')
    expect(many).toContain('Entry 4')
    expect(many).not.toContain('Entry 5')
    // The toggle follows the entries, in the row's flow.
    expect(many.indexOf('class="skill-more"')).toBeGreaterThan(many.lastIndexOf('class="skill-button"'))
  })

  it('never disables the toggle', () => {
    const markup = row(true, ten)
    expect(markup.match(/disabled=""/g)).toHaveLength(5)
    expect(markup).toContain('<button type="button" class="skill-more" aria-expanded="false">+5 more</button>')
  })

  it('disables every button while the turn is in flight, and says nothing else about it', () => {
    const markup = row(true)
    expect(markup.match(/disabled=""/g)).toHaveLength(2)
    expect(markup.replace(/ disabled=""/g, '')).toBe(row(false))
  })

  it('carries no tooltip, title, skill name or split between skill and prompt', () => {
    for (const markup of [row(), row(false, ten)]) {
      expect(markup).not.toMatch(/title=|tooltip|data-|aria-describedby|skill:|prompt|action|bmad-/i)
    }
  })

  it('sits above the composer’s field, inside the composer, in the chat column', () => {
    const agent: AgentView = { id: 'bmad-agent-pm', module: 'bmm', name: 'John', title: 'PM', icon: 'i', description: 'd' }
    const snapshot: InstallSnapshot = { revision: 1, agents: [agent], menus: { [agent.id]: ENTRIES }, errors: [], preflight: [], skills: [] }
    const markup = renderToStaticMarkup(
      <Shell
        projectPath="/p"
        snapshot={snapshot}
        currentId={agent.id}
        composer={(current, items) => (
          <Composer agentName={current.name} head={<SkillRow name={current.name} items={items} disabled={false} onRun={() => {}} />} />
        )}
      />
    )
    const composer = markup.slice(markup.indexOf('<div class="composer">'))
    expect(composer.indexOf('class="skill-row"')).toBeGreaterThan(-1)
    expect(composer.indexOf('class="skill-row"')).toBeLessThan(composer.indexOf('class="composer-field"'))
    // The composer itself is never disabled.
    expect(composer.slice(composer.indexOf('class="composer-field"'))).not.toMatch(/disabled/)
  })
})
