import { describe, expect, it } from 'vitest'

import { decisionOf } from './decision'

/**
 * Story 2.10's I/O matrix, row by row, over the one pure reader.
 */
describe('decisionOf', () => {
  it('reads a lettered list under a title (Lettered)', () => {
    expect(decisionOf('Which one?\n\nA. Postgres\nB. SQLite')).toEqual({
      title: 'Which one?',
      options: ['Postgres', 'SQLite']
    })
  })

  it('reads a numbered list, whose keys are positions (Numbered)', () => {
    expect(decisionOf('Pick one\n1) x\n2) y')).toEqual({ title: 'Pick one', options: ['x', 'y'] })
  })

  it.each([
    ['A.', 'A. one\nB. two'],
    ['A)', 'A) one\nB) two'],
    ['(A)', '(A) one\n(B) two'],
    ['1.', '1. one\n2. two'],
    ['1)', '1) one\n2) two'],
    ['(1)', '(1) one\n(2) two']
  ])('accepts the %s marker', (_marker, list) => {
    expect(decisionOf(`Which?\n${list}`)).toEqual({ title: 'Which?', options: ['one', 'two'] })
  })

  it('joins an indented continuation line with one space (Wrapped)', () => {
    expect(decisionOf('Which?\nA. long\n   more text\nB. short')).toEqual({
      title: 'Which?',
      options: ['long more text', 'short']
    })
  })

  it('keeps a lean inside the option’s text, whole (Lean)', () => {
    expect(decisionOf('Which?\nA. Postgres (I would pick this)\nB. SQLite')?.options).toEqual([
      'Postgres (I would pick this)',
      'SQLite'
    ])
  })

  it('keeps the persona’s order and does not renumber their words', () => {
    expect(decisionOf('Which?\nA. zebra\nB. apple\nC. mango')?.options).toEqual([
      'zebra',
      'apple',
      'mango'
    ])
  })

  it('ignores trailing blank lines', () => {
    expect(decisionOf('Which?\nA. a\nB. b\n\n  \n')?.options).toEqual(['a', 'b'])
  })

  it('reads CRLF text', () => {
    expect(decisionOf('Which?\r\nA. a\r\nB. b\r\n')).toEqual({ title: 'Which?', options: ['a', 'b'] })
  })

  it('takes the last non-blank line above the run as the title, across blank lines', () => {
    expect(decisionOf('Intro paragraph.\n\nWhich?\n\n\nA. a\nB. b')?.title).toBe('Which?')
  })

  it('has no block for a single option (Single option)', () => {
    expect(decisionOf('Which?\nA. only')).toBeNull()
  })

  it('has no block when the list is not at the end (Not at the end)', () => {
    expect(decisionOf('Which?\nA. a\nB. b\n\nLet me know.')).toBeNull()
  })

  it('has no block for a run that does not start at A or 1 (Out of order)', () => {
    expect(decisionOf('Which?\nB. b\nC. c')).toBeNull()
    expect(decisionOf('Which?\n2. b\n3. c')).toBeNull()
  })

  it('has no block when the run skips or repeats a position', () => {
    expect(decisionOf('Which?\nA. a\nB. b\nD. d')).toBeNull()
    expect(decisionOf('Which?\nA. a\nA. b')).toBeNull()
    expect(decisionOf('Which?\nA. a\nC. c')).toBeNull()
  })

  it('has no block when letters and numbers are mixed', () => {
    expect(decisionOf('Which?\n1. a\nB. b')).toBeNull()
    expect(decisionOf('Which?\nA. a\n2. b')).toBeNull()
  })

  it('has no block with no title (No title)', () => {
    expect(decisionOf('A. a\nB. b')).toBeNull()
    expect(decisionOf('\n\nA. a\nB. b')).toBeNull()
  })

  it('has no block when the line above the run is itself an option', () => {
    expect(decisionOf('A. a\nB. b\n\nA. c\nB. d')).toBeNull()
    expect(decisionOf('C. c\nA. a\nB. b')).toBeNull()
  })

  it('uses the last run when a turn has more than one', () => {
    expect(decisionOf('First?\nA. a\nB. b\n\nSecond?\n1. x\n2. y')).toEqual({
      title: 'Second?',
      options: ['x', 'y']
    })
    expect(decisionOf('First?\nA. a\nB. b\nSecond?\nA. c\nB. d')).toEqual({
      title: 'Second?',
      options: ['c', 'd']
    })
  })

  it('does not take a blank-separated list as one run', () => {
    expect(decisionOf('Which?\nA. a\n\nB. b')).toBeNull()
  })

  it('needs a space after the marker, and words after it', () => {
    expect(decisionOf('Which?\nA.a\nB.b')).toBeNull()
    expect(decisionOf('Which?\n1.5 million\n2.5 million')).toBeNull()
    expect(decisionOf('Which?\nA.\nB.')).toBeNull()
  })

  it('does not read an indented option as one', () => {
    expect(decisionOf('Which?\n  A. a\n  B. b')).toBeNull()
  })

  it('has no block for text with no list, or an empty one', () => {
    expect(decisionOf('')).toBeNull()
    expect(decisionOf('Just words.')).toBeNull()
  })

  it('does not touch what it reads', () => {
    const text = '  Which?  \nA.  a  \nB. b'
    const before = text
    decisionOf(text)
    expect(text).toBe(before)
    expect(decisionOf(text)).toEqual({ title: 'Which?', options: ['a', 'b'] })
  })
})
