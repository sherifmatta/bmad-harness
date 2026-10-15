import { describe, expect, it } from 'vitest'
import { slashMatches, slashQuery, slashText } from './slash-query'

const ENTRIES = [
  { name: 'bmad-advanced-elicitation', description: 'a' },
  { name: 'bmad-build', description: 'b' },
  { name: 'bmad-build-auto', description: 'c' },
  { name: 'bmad-brainstorming', description: 'd' },
  { name: 'Other-Skill', description: 'e' }
]
const names = (text: string): string[] => slashMatches(text, ENTRIES).map((entry) => entry.name)

describe('slashQuery', () => {
  it('is what follows a leading slash', () => {
    expect(slashQuery('/')).toBe('')
    expect(slashQuery('/bmad-b')).toBe('bmad-b')
  })

  it('is nothing when the first character is not a slash', () => {
    expect(slashQuery('')).toBeNull()
    expect(slashQuery('see /bmad-build')).toBeNull()
    expect(slashQuery(' /bmad-build')).toBeNull()
    expect(slashQuery('@Mary /x')).toBeNull()
  })

  it('is nothing once whitespace follows the name', () => {
    expect(slashQuery('/bmad-build ')).toBeNull()
    expect(slashQuery('/bmad-build text')).toBeNull()
    expect(slashQuery('/bmad-build\nmore')).toBeNull()
    expect(slashQuery('/ ')).toBeNull()
  })
})

describe('slashMatches', () => {
  it('has every row, in the order given, for a slash alone', () => {
    expect(names('/')).toEqual(ENTRIES.map((entry) => entry.name))
  })

  it('narrows by case-insensitive prefix of the name and keeps the order', () => {
    expect(names('/BMAD-b')).toEqual(['bmad-build', 'bmad-build-auto', 'bmad-brainstorming'])
    expect(names('/bmad-bu')).toEqual(['bmad-build', 'bmad-build-auto'])
    expect(names('/other')).toEqual(['Other-Skill'])
  })

  it('matches the start of the name only, not the middle and not the description', () => {
    expect(names('/build')).toEqual([])
    expect(names('/bmad-br')).toEqual(['bmad-brainstorming'])
    expect(slashMatches('/c', [{ name: 'x', description: 'c' }])).toEqual([])
  })

  it('has none when nothing matches, and none when closed', () => {
    expect(names('/zzz')).toEqual([])
    expect(names('/bmad-build ')).toEqual([])
    expect(names('hello')).toEqual([])
    expect(names('')).toEqual([])
  })

  it('returns the rows it was given, unchanged', () => {
    expect(slashMatches('/bmad-build', ENTRIES)[0]).toBe(ENTRIES[1])
  })
})

describe('slashText', () => {
  it('is the slash, the name and one space', () => {
    expect(slashText('bmad-build')).toBe('/bmad-build ')
  })
})
