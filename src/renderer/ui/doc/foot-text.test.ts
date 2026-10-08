import { describe, expect, it } from 'vitest'
import type { DocSnapshot } from '../../../shared/document'
import { footLeft, footRight, stateLine } from './foot-text'

const SNAPSHOT: DocSnapshot = {
  revision: 1,
  path: '_bmad/prd.md',
  fullPath: '/work/falcon/_bmad/prd.md',
  kind: 'markdown',
  folder: '_bmad/',
  state: 'present',
  text: '# hi',
  truncated: false
}

describe('the state line', () => {
  it.each([
    ['present', 'separate window · read-only preview · reloads on write'],
    ['missing', 'no longer on disk'],
    ['refused', 'outside _bmad/ · not opened'],
    ['unreadable', 'could not be read'],
    ['binary', 'not text · not shown']
  ] as const)('reads %s as %s', (state, line) => {
    expect(stateLine(state, '_bmad/')).toBe(line)
    expect(footLeft({ ...SNAPSHOT, state })).toBe(line)
  })

  it('names the folder the window was opened under when the file leads outside it', () => {
    expect(stateLine('refused', 'docs/out/')).toBe('outside docs/out/ · not opened')
    expect(footLeft({ ...SNAPSHOT, state: 'refused', folder: 'docs/out/' })).toBe('outside docs/out/ · not opened')
    expect(stateLine('missing', 'docs/out/')).toBe('no longer on disk')
  })

  it('advises nothing: no sentence, no next step', () => {
    for (const state of ['present', 'missing', 'refused', 'unreadable', 'binary'] as const) {
      expect(stateLine(state, '_bmad/')).not.toMatch(/\b(try|please|you|should|retry|check|\.)\b|[.!?]$/i)
    }
  })

  it('is empty before the first snapshot', () => {
    expect(footLeft(null)).toBe('')
    expect(footRight(null)).toBe('')
  })
})

describe('the kind', () => {
  it('reads markdown and text, each with its encoding', () => {
    expect(footRight(SNAPSHOT)).toBe('markdown · utf-8')
    expect(footRight({ ...SNAPSHOT, kind: 'text' })).toBe('text · utf-8')
  })

  it('adds the first 1 MiB only when the file was truncated', () => {
    expect(footRight({ ...SNAPSHOT, truncated: true })).toBe('markdown · utf-8 · first 1 MiB')
    expect(footRight({ ...SNAPSHOT, kind: 'text', truncated: true })).toBe('text · utf-8 · first 1 MiB')
    expect(footRight(SNAPSHOT)).not.toContain('MiB')
  })
})
