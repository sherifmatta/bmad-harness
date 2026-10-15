import { describe, expect, it } from 'vitest'
import { foldSkills } from './skills'

const HEADER = ['canonicalId', 'name', 'description', 'module', 'path']

describe('foldSkills', () => {
  it('maps the header’s name and description columns, in file order', () => {
    expect(
      foldSkills([HEADER, ['b', 'b', 'Second', 'core', 'p'], ['a', 'a', 'First', 'core', 'p']])
    ).toEqual([
      { name: 'b', description: 'Second' },
      { name: 'a', description: 'First' }
    ])
  })

  it('finds the columns by name, wherever they are', () => {
    expect(foldSkills([['description', 'name'], ['D', 'n']])).toEqual([{ name: 'n', description: 'D' }])
  })

  it('skips a row with no name and keeps the rest', () => {
    expect(
      foldSkills([HEADER, ['x', '', 'no name', 'm', 'p'], ['y'], [''], ['z', 'z', 'kept', 'm', 'p']])
    ).toEqual([{ name: 'z', description: 'kept' }])
  })

  it('keeps a skill whose row is too short to have a description', () => {
    expect(foldSkills([HEADER, ['x', 'x']])).toEqual([{ name: 'x', description: '' }])
  })

  it('has no skills for no rows, a header alone, or a header with no name column', () => {
    expect(foldSkills([])).toEqual([])
    expect(foldSkills([HEADER])).toEqual([])
    expect(foldSkills([['id', 'title'], ['a', 'b']])).toEqual([])
  })
})
