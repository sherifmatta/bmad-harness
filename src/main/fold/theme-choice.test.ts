import { describe, expect, it } from 'vitest'

import { DEFAULT_THEME_CHOICE, parseThemeChoice } from './theme-choice'

describe('a stored theme', () => {
  it.each(['system', 'light', 'dark'] as const)('reads %s as itself', (choice) => {
    expect(parseThemeChoice({ theme: choice })).toBe(choice)
  })

  it('defaults to System, which follows the OS', () => {
    expect(DEFAULT_THEME_CHOICE).toBe('system')
  })

  it.each([
    ['nothing stored', null],
    ['no value', undefined],
    ['a missing key', {}],
    ['an unknown word', { theme: 'sepia' }],
    ['a word in another case', { theme: 'Light' }],
    ['a value that is not a word', { theme: 3 }],
    ['an empty word', { theme: '' }],
    ['a bare word, not the file’s shape', 'light'],
    ['an array', ['light']],
    ['a number', 7],
    ['another key', { choice: 'light' }]
  ])('reads %s as System, silently', (_name, raw) => {
    expect(parseThemeChoice(raw)).toBe('system')
  })

  it('does not throw for an object with no prototype', () => {
    expect(parseThemeChoice(Object.create(null))).toBe('system')
  })
})
