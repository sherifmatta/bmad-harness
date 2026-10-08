import { describe, expect, it } from 'vitest'

import { notFolderLine, refusedName } from './drop'

describe('the line a refused drop is said in', () => {
  it('is `not a folder · <name>`: lower case, one separator, no terminal punctuation', () => {
    expect(notFolderLine('notes.txt')).toBe('not a folder · notes.txt')
    expect(notFolderLine('Falcon Plan.pdf')).toBe('not a folder · Falcon Plan.pdf')
  })
})

describe('the name it names', () => {
  it('is the one main answered with, when it answered with one', () => {
    expect(refusedName('b.txt', [{ name: 'a.txt' }, { name: 'b.txt' }])).toBe('b.txt')
  })

  it('is the first dropped item’s own name when main named none', () => {
    expect(refusedName(undefined, [{ name: 'a.txt' }, { name: 'b.txt' }])).toBe('a.txt')
    expect(refusedName('', [{ name: 'a.txt' }])).toBe('a.txt')
  })

  it('is nothing when a drop carried no file at all', () => {
    expect(refusedName(undefined, [])).toBeNull()
    expect(refusedName(undefined, [{ name: '' }])).toBeNull()
  })
})
