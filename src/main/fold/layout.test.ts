import { describe, expect, it } from 'vitest'

import { allFolded, foldedOf, widthsOf, withFolded, withWidth } from './layout'

describe('widthsOf', () => {
  it('reads a width per panel, each judged by its own range', () => {
    expect(widthsOf({ widths: { rail: 400, room: 300 } })).toEqual({ rail: 400, room: 300 })
    expect(widthsOf({ widths: { rail: 400 } })).toEqual({ rail: 400 })
  })

  it.each([
    ['not JSON', null],
    ['a string', 'x'],
    ['an array', []],
    ['no widths', { folded: {} }],
    ['widths of the wrong shape', { widths: 'x' }],
    ['widths an array', { widths: [400] }]
  ])('holds none for %s', (_name, raw) => {
    expect(widthsOf(raw)).toEqual({})
  })

  it('drops a width outside its range, non-integer or of another type, and keeps the other panel’s', () => {
    expect(widthsOf({ widths: { rail: 12, room: 300 } })).toEqual({ room: 300 })
    expect(widthsOf({ widths: { rail: 9999, room: 300.5 } })).toEqual({})
    expect(widthsOf({ widths: { rail: 'x', room: null } })).toEqual({})
    // A width good for the rail is not good for the room.
    expect(widthsOf({ widths: { room: 500 } })).toEqual({})
  })
})

describe('foldedOf and allFolded', () => {
  const raw = { folded: { '/work/a': ['_bmad/', '_bmad/ux/', '_bmad/'], '/work/b': ['docs/'], '/work/c': 'x', '/work/d': [1, null, 'y/'] } }

  it('reads one project’s set: strings only, each once, in order', () => {
    expect(foldedOf(raw, '/work/a')).toEqual(['_bmad/', '_bmad/ux/'])
    expect(foldedOf(raw, '/work/d')).toEqual(['y/'])
  })

  it('reads nothing folded for an unknown project, a set of the wrong shape, or a store of the wrong shape', () => {
    expect(foldedOf(raw, '/work/none')).toEqual([])
    expect(foldedOf(raw, '/work/c')).toEqual([])
    for (const bad of [null, 'x', [], { folded: 'x' }, { folded: [] }, {}]) {
      expect(foldedOf(bad, '/work/a')).toEqual([])
    }
  })

  it('does not read a key the object only inherits', () => {
    expect(foldedOf({ folded: {} }, 'constructor')).toEqual([])
    expect(foldedOf({ folded: {} }, '__proto__')).toEqual([])
  })

  it('keeps no empty set', () => {
    expect(allFolded({ folded: { '/a': [], '/b': ['x/'] } })).toEqual({ '/b': ['x/'] })
  })
})

describe('withWidth', () => {
  const store = { widths: { rail: 400, room: 300 }, folded: { '/work/a': ['_bmad/'] } }

  it('sets one panel’s width and leaves the other and every fold as they were', () => {
    expect(withWidth(store, 'rail', 500)).toEqual({ widths: { rail: 500, room: 300 }, folded: { '/work/a': ['_bmad/'] } })
  })

  it('removes a panel’s width for null', () => {
    expect(withWidth(store, 'room', null)).toEqual({ widths: { rail: 400 }, folded: { '/work/a': ['_bmad/'] } })
  })

  it('stores no width the panel would not read, and forgets the one it had', () => {
    expect(withWidth(store, 'rail', 12).widths).toEqual({ room: 300 })
    expect(withWidth(store, 'rail', 300.5).widths).toEqual({ room: 300 })
  })

  it('starts a store from nothing, and from a file of the wrong shape', () => {
    expect(withWidth(null, 'rail', 400)).toEqual({ widths: { rail: 400 }, folded: {} })
    expect(withWidth('garbage', 'room', 250)).toEqual({ widths: { room: 250 }, folded: {} })
  })
})

describe('withFolded', () => {
  const store = { widths: { rail: 400 }, folded: { '/work/a': ['_bmad/'], '/work/b': ['docs/'] } }

  it('replaces one project’s set and leaves the other projects and the widths as they were', () => {
    expect(withFolded(store, '/work/a', ['_bmad/', '_bmad/ux/'])).toEqual({
      widths: { rail: 400 },
      folded: { '/work/a': ['_bmad/', '_bmad/ux/'], '/work/b': ['docs/'] }
    })
  })

  it('removes a project’s entry when nothing is folded', () => {
    expect(withFolded(store, '/work/a', [])).toEqual({ widths: { rail: 400 }, folded: { '/work/b': ['docs/'] } })
  })

  it('keeps each directory once', () => {
    expect(withFolded(null, '/work/a', ['x/', 'x/', 'y/']).folded).toEqual({ '/work/a': ['x/', 'y/'] })
  })

  it('keeps entries for directories that are gone: it judges nothing against the disk', () => {
    expect(withFolded(store, '/work/a', ['vanished/']).folded['/work/a']).toEqual(['vanished/'])
  })

  it('starts from nothing, and from a file of the wrong shape', () => {
    expect(withFolded(undefined, '/p', ['a/'])).toEqual({ widths: {}, folded: { '/p': ['a/'] } })
    expect(withFolded([], '/p', ['a/'])).toEqual({ widths: {}, folded: { '/p': ['a/'] } })
  })
})
