/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import PRD_TEMPLATE from '../../.claude/skills/bmad-prd/assets/prd-template.md?raw'
import { nameKey, pendingSections, pulledSections, sectionAt, sectionName, templatePlan, withPulled } from './section-plan'

describe('sectionName', () => {
  it('strips leading numbering and nothing else', () => {
    expect(sectionName('1. Vision')).toBe('Vision')
    expect(sectionName('0. Document Purpose')).toBe('Document Purpose')
    expect(sectionName('3.1 Sub Part')).toBe('Sub Part')
    expect(sectionName('4) Features')).toBe('Features')
    expect(sectionName('2024 Plans')).toBe('2024 Plans')
    expect(sectionName('Vision 2.')).toBe('Vision 2.')
    expect(sectionName('Non-Goals (Explicit)')).toBe('Non-Goals (Explicit)')
  })

  it('compares names without regard to case or numbering', () => {
    expect(nameKey('5. Non-Goals')).toBe(nameKey('non-goals'))
  })
})

describe('templatePlan', () => {
  it('reads the ten numbered sections of bmad-prd’s own template, and no scaffolding', () => {
    const { spine } = templatePlan(PRD_TEMPLATE)
    expect(spine).toEqual([
      'Document Purpose',
      'Vision',
      'Target User',
      'Glossary',
      'Features',
      'Non-Goals (Explicit)',
      'MVP Scope',
      'Success Metrics',
      'Open Questions',
      'Assumptions Index'
    ])
    for (const scaffolding of ['PRD Template', 'Essential Spine', 'Adapt-In Menu', 'PRD: {Product Name}']) {
      expect(spine.some((name) => name.includes(scaffolding))).toBe(false)
    }
    for (const name of spine) expect(name).not.toMatch(/[*`]/)
  })

  it('reads the bold names of the bullets under the Adapt-In Menu, in order, whatever their subheading', () => {
    const { menu } = templatePlan(PRD_TEMPLATE)
    expect(menu.slice(0, 5)).toEqual([
      'Cross-Cutting NFRs',
      'Constraints and Guardrails',
      'Why Now',
      'Aesthetic and Tone',
      'Information Architecture'
    ])
    expect(menu).toContain('ROI / Business Case')
    expect(menu).toContain('Compliance and Regulatory')
    expect(menu).toContain('Versioning and Deprecation Policy')
    expect(menu.some((name) => name.includes('**'))).toBe(false)
  })

  it('takes every level-2 heading of a template with no fence, minus emphasis and placeholders', () => {
    const text = ['# Brief Template', '', '## **Problem**', 'x', '## 2. Users', '## {Section Name}', '### Detail', '## `Scope`'].join('\n')
    expect(templatePlan(text)).toEqual({ spine: ['Problem', 'Users', 'Scope'], menu: [] })
  })

  it('ignores a heading inside a fence when there is none outside, and every one outside when there is one inside', () => {
    const fenced = ['## Scaffolding', '```md', '## 1. Real One', '## {Placeholder}', '## Real Two', '```', '## More Scaffolding'].join('\n')
    expect(templatePlan(fenced).spine).toEqual(['Real One', 'Real Two'])
  })

  it('keeps a name once however often a template repeats it', () => {
    expect(templatePlan('## A\n## 1. a\n## B').spine).toEqual(['A', 'B'])
  })

  it('answers nothing for a template with no headings or no menu', () => {
    expect(templatePlan('just words')).toEqual({ spine: [], menu: [] })
    expect(templatePlan('')).toEqual({ spine: [], menu: [] })
  })

  it('ends the menu at the next heading of its own level or above, and ignores bullets before it', () => {
    const text = [
      '## Spine',
      '- **Not Menu** — before',
      '## Adapt-In Menu *(add)*',
      '### Cluster',
      '- **One** — a',
      '* **Two** — b',
      '- plain bullet',
      '## After',
      '- **Three** — c'
    ].join('\n')
    expect(templatePlan(text).menu).toEqual(['One', 'Two'])
  })
})

describe('pulledSections', () => {
  const menu = ['Labour Relations Posture', 'Business Case/Pricing Posture', 'Why Now']

  it('pulls every menu name a concern-scan entry contains, in menu order, whatever the case', () => {
    expect(pulledSections(menu, '- (event by john) concern scan surfaced: Why Now and labour relations posture')).toEqual([
      'Labour Relations Posture',
      'Why Now'
    ])
  })

  it('pulls both names of the concern-scan note the recorded fast-path-opus run wrote (fixtures/runs/fast-path-opus.jsonl)', () => {
    const note =
      '- (event by john) concern scan surfaced: Labour Relations Posture and Business Case/Pricing Posture. Addendum written with sync mechanism, rejected alternatives'
    expect(pulledSections(menu, note)).toEqual(['Labour Relations Posture', 'Business Case/Pricing Posture'])
  })

  it('matches the scan however it is spelled: any case, a space or a hyphen', () => {
    for (const spelling of ['Concern scan', 'concern-scan', 'CONCERN SCAN', 'a concern-scan found']) {
      expect(pulledSections(menu, `${spelling}: Why Now`)).toEqual(['Why Now'])
    }
    expect(pulledSections(menu, 'concernscan: Why Now')).toEqual([])
  })

  it('pulls nothing for an entry that is not a concern scan, nothing not in the menu, and nothing the plan holds', () => {
    expect(pulledSections(menu, '- (decision) Why Now is load-bearing')).toEqual([])
    expect(pulledSections(menu, 'concern scan surfaced: Something Else')).toEqual([])
    expect(pulledSections(menu, 'concern scan surfaced: Why Now, Labour Relations Posture', ['why now'])).toEqual([
      'Labour Relations Posture'
    ])
    expect(pulledSections([], 'concern scan surfaced: Why Now')).toEqual([])
  })
})

describe('withPulled', () => {
  it('adds each name once, without regard to case, after the plan', () => {
    expect(withPulled(['A', 'B'], ['b', 'C', 'c'])).toEqual(['A', 'B', 'C'])
    expect(withPulled(undefined, ['C'])).toEqual(['C'])
    expect(withPulled(['A'], [])).toEqual(['A'])
  })
})

describe('sectionAt', () => {
  const text = ['# Title', 'intro', '## 1. Vision', 'words', '### Sub', '## 2. Scope', 'more'].join('\n')

  it('names the section holding an offset: the last heading at or before it', () => {
    expect(sectionAt(text, text.indexOf('words'))).toBe('Vision')
    expect(sectionAt(text, text.indexOf('### Sub'))).toBe('Vision')
    expect(sectionAt(text, text.indexOf('more'))).toBe('Scope')
    expect(sectionAt(text, text.indexOf('## 2.'))).toBe('Scope')
    expect(sectionAt(text, text.indexOf('## 2.') - 1)).toBe('Vision')
  })

  it('names none before the first heading, or in a text without any', () => {
    expect(sectionAt(text, 0)).toBeUndefined()
    expect(sectionAt('plain', 3)).toBeUndefined()
  })

  it('does not take a fenced heading for a section', () => {
    expect(sectionAt('## A\n```\n## B\n```\nx', 17)).toBe('A')
  })
})

describe('pendingSections', () => {
  const plan = ['Document Purpose', 'Vision', 'Target User']

  it('lists every plan name not yet written, in plan order, then seen names the plan lacks', () => {
    expect(pendingSections(plan, [], [])).toEqual(plan)
    expect(pendingSections(plan, ['vision'], ['Document Purpose', 'Risks', 'Vision'])).toEqual(['Document Purpose', 'Target User', 'Risks'])
  })

  it('drops a name a commit wrote, whether the plan held it or not', () => {
    expect(pendingSections(plan, ['1. Vision', 'Risks'], ['Risks', 'Pricing'])).toEqual(['Document Purpose', 'Target User', 'Pricing'])
  })

  it('lists a name once, and answers [] when everything is written', () => {
    expect(pendingSections(['A', 'a'], [], ['A'])).toEqual(['A'])
    expect(pendingSections(plan, plan, plan)).toEqual([])
  })
})
