import { describe, expect, it } from 'vitest'
import { validMention } from './mention'

describe('validMention', () => {
  it('keeps `@` plus one token that is the roster name, ignoring case, as typed', () => {
    expect(validMention('@Amelia', 'Amelia')).toBe('@Amelia')
    expect(validMention('@amelia', 'Amelia')).toBe('@amelia')
    expect(validMention('@AMELIA', ' Amelia ')).toBe('@AMELIA')
  })

  it.each([
    ['another name', '@bob'],
    ['no @', 'amelia'],
    ['a bare @', '@'],
    ['a space after the @', '@ amelia'],
    ['more than one token', '@amelia x'],
    ['trailing whitespace', '@amelia '],
    ['leading whitespace', ' @amelia'],
    ['trailing punctuation', '@amelia,'],
    ['an empty string', ''],
    ['a number', 1],
    ['an object', {}],
    ['undefined', undefined]
  ])('drops %s', (_why, mention) => {
    expect(validMention(mention, 'Amelia')).toBeUndefined()
  })

  it('drops everything when there is no roster name to check against', () => {
    expect(validMention('@Amelia', undefined)).toBeUndefined()
  })

  it('drops a name that holds whitespace, which one token cannot equal', () => {
    expect(validMention('@Mary', 'Mary Jane')).toBeUndefined()
  })
})
