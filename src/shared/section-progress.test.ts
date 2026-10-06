import { describe, expect, it } from 'vitest'
import { STOPPED, commonPrefix, progressLabel, reachedLabel, sectionCount, sectionProgress, terminalLabel } from './section-progress'

describe('commonPrefix', () => {
  it('is how many characters two texts share from their starts', () => {
    expect(commonPrefix('abcd', 'abxy')).toBe(2)
    expect(commonPrefix('abc', 'abcdef')).toBe(3)
    expect(commonPrefix('', 'abc')).toBe(0)
    expect(commonPrefix('same', 'same')).toBe(4)
  })
})

describe('sectionProgress', () => {
  it('has no section and no names before the text shows a heading', () => {
    expect(sectionProgress('', [])).toEqual({ seen: [] })
    expect(sectionProgress('# Title\n\nWords.\n', [])).toEqual({ seen: [] })
  })

  it('is at the last heading of the text, by its place among the names seen, numbering stripped', () => {
    const text = '# PRD\n\n## 1. Vision\nA.\n\n## 2. Goals\nB.\n'

    expect(sectionProgress(text, [])).toEqual({ seen: ['Vision', 'Goals'], section: { name: 'Goals', n: 2 } })
  })

  it('does not see a heading on the last line until its newline has streamed', () => {
    expect(sectionProgress('## Vision\nA.\n## Sc', [])).toEqual({ seen: ['Vision'], section: { name: 'Vision', n: 1 } })
    expect(sectionProgress('## Vision\nA.\n## Scope', [])).toEqual({ seen: ['Vision'], section: { name: 'Vision', n: 1 } })
    expect(sectionProgress('## Vision\nA.\n## Scope\n', [])).toEqual({
      seen: ['Vision', 'Scope'],
      section: { name: 'Scope', n: 2 }
    })
    expect(sectionProgress('## Vision', [])).toEqual({ seen: [] })
  })

  it('appends to the names held and never renumbers one, and returns the held array itself when it adds none', () => {
    const held = ['Goals', 'Vision']
    const text = '## Vision\nA.\n## Goals\nB.\n## Scope\nC.\n'
    const progress = sectionProgress(text, held)

    expect(progress.seen).toEqual(['Goals', 'Vision', 'Scope'])
    // Vision keeps the place it was first seen at, whatever order the text has it in now.
    expect(sectionProgress('## Vision\nA.\n', held).section).toEqual({ name: 'Vision', n: 2 })
    expect(sectionProgress('## Vision\nA.\n', held).seen).toBe(held)
  })

  it('compares names without regard to case, so a heading read again is not a new section', () => {
    expect(sectionProgress('## VISION\nA.\n', ['Vision'])).toEqual({ seen: ['Vision'], section: { name: 'VISION', n: 1 } })
  })

  it('reads the section holding the first changed character when given a revision offset', () => {
    const text = '## Vision\nA.\n## Goals\nB.\n## Scope\nC.\n'
    const inGoals = text.indexOf('B.')

    expect(sectionProgress(text, [], inGoals).section).toEqual({ name: 'Goals', n: 2 })
    expect(sectionProgress(text, [], 0).section).toEqual({ name: 'Vision', n: 1 })
    // The heading's own line is part of its section.
    expect(sectionProgress(text, [], text.indexOf('## Scope')).section).toEqual({ name: 'Scope', n: 3 })
    // Before the first heading there is no section to name.
    expect(sectionProgress(`Intro.\n${text}`, [], 2).section).toBeUndefined()
  })

  it('reads a fenced heading as code, not a section', () => {
    expect(sectionProgress('## Real\nA.\n```\n## Not\n```\n', [])).toEqual({ seen: ['Real'], section: { name: 'Real', n: 1 } })
  })
})

describe('progressLabel', () => {
  it('says writing, or revising, and the section by its place and name, and never a total', () => {
    expect(progressLabel(false)).toBe('writing')
    expect(progressLabel(true)).toBe('revising')
    expect(progressLabel(false, { name: 'Goals', n: 2 })).toBe('writing · §2 Goals')
    expect(progressLabel(true, { name: 'Goals', n: 2 })).toBe('revising · §2 Goals')
  })
})

describe('the words a run that ended early reads (Story 3.8)', () => {
  it('has one terminal word for the head and the rail, and no second vocabulary', () => {
    expect(STOPPED).toBe('stopped')
  })

  it('places the section a confirmed write reached, and says nothing with none', () => {
    expect(reachedLabel()).toBe('')
    expect(reachedLabel({ name: 'Scope', n: 4 })).toBe('§4 Scope')
  })

  it('joins the word to the place, and is the bare word with nothing confirmed', () => {
    expect(terminalLabel(STOPPED)).toBe('stopped')
    expect(terminalLabel('failed')).toBe('failed')
    expect(terminalLabel(STOPPED, { name: 'Scope', n: 4 })).toBe('stopped · §4 Scope')
    expect(terminalLabel('failed', { name: 'Vision', n: 1 })).toBe('failed · §1 Vision')
    // No denominator ever enters it, whatever it is given.
    expect(terminalLabel(STOPPED, { name: 'Out of Scope', n: 2 })).not.toMatch(/\bof \d|\/\s*\d|\btotal\b/i)
  })
})

describe('the one spelling of a section count (Story 3.10)', () => {
  it('reads `N sections`, singular at one, and zero stated plainly', () => {
    expect(sectionCount(0)).toBe('0 sections')
    expect(sectionCount(1)).toBe('1 section')
    expect(sectionCount(15)).toBe('15 sections')
  })

  it('never carries a denominator', () => {
    for (const n of [0, 1, 2, 15]) {
      expect(sectionCount(n)).not.toMatch(/\bof\b|\//)
    }
  })
})
