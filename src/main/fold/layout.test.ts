import { describe, expect, it } from 'vitest'

import {
  allChangesFolded,
  allFolded,
  changesFoldedOf,
  foldedOf,
  railSplitOf,
  skillRowOpenOf,
  widthsOf,
  withChangesFolded,
  withFolded,
  withRailSplit,
  withSkillRowOpen,
  withWidth
} from './layout'

describe('widthsOf', () => {
  it('reads a width per panel, each judged by its own range', () => {
    expect(widthsOf({ widths: { sidebar: 220, rail: 400, room: 300 } })).toEqual({ sidebar: 220, rail: 400, room: 300 })
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
    // The old rail's widths: 560 is past the new rail's cap, and the sidebar's is lower still.
    expect(widthsOf({ widths: { sidebar: 450, rail: 560 } })).toEqual({})
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
    expect(withWidth(store, 'rail', 450)).toEqual({ widths: { rail: 450, room: 300 }, folded: { '/work/a': ['_bmad/'] }, skillRowOpen: false, railSplit: null, changesFolded: {} })
    expect(withWidth(store, 'sidebar', 220)).toEqual({
      widths: { sidebar: 220, rail: 400, room: 300 },
      folded: { '/work/a': ['_bmad/'] },
      skillRowOpen: false,
      railSplit: null,
      changesFolded: {}
    })
  })

  it('removes a panel’s width for null', () => {
    expect(withWidth(store, 'room', null)).toEqual({ widths: { rail: 400 }, folded: { '/work/a': ['_bmad/'] }, skillRowOpen: false, railSplit: null, changesFolded: {} })
  })

  it('stores no width the panel would not read, and forgets the one it had', () => {
    expect(withWidth(store, 'rail', 12).widths).toEqual({ room: 300 })
    expect(withWidth(store, 'rail', 300.5).widths).toEqual({ room: 300 })
  })

  it('starts a store from nothing, and from a file of the wrong shape', () => {
    expect(withWidth(null, 'rail', 400)).toEqual({ widths: { rail: 400 }, folded: {}, skillRowOpen: false, railSplit: null, changesFolded: {} })
    expect(withWidth('garbage', 'room', 250)).toEqual({ widths: { room: 250 }, folded: {}, skillRowOpen: false, railSplit: null, changesFolded: {} })
  })
})

describe('withFolded', () => {
  const store = { widths: { rail: 400 }, folded: { '/work/a': ['_bmad/'], '/work/b': ['docs/'] } }

  it('replaces one project’s set and leaves the other projects and the widths as they were', () => {
    expect(withFolded(store, '/work/a', ['_bmad/', '_bmad/ux/'])).toEqual({
      widths: { rail: 400 },
      folded: { '/work/a': ['_bmad/', '_bmad/ux/'], '/work/b': ['docs/'] },
      skillRowOpen: false,
      railSplit: null,
      changesFolded: {}
    })
  })

  it('removes a project’s entry when nothing is folded', () => {
    expect(withFolded(store, '/work/a', [])).toEqual({ widths: { rail: 400 }, folded: { '/work/b': ['docs/'] }, skillRowOpen: false, railSplit: null, changesFolded: {} })
  })

  it('keeps each directory once', () => {
    expect(withFolded(null, '/work/a', ['x/', 'x/', 'y/']).folded).toEqual({ '/work/a': ['x/', 'y/'] })
  })

  it('keeps entries for directories that are gone: it judges nothing against the disk', () => {
    expect(withFolded(store, '/work/a', ['vanished/']).folded['/work/a']).toEqual(['vanished/'])
  })

  it('starts from nothing, and from a file of the wrong shape', () => {
    expect(withFolded(undefined, '/p', ['a/'])).toEqual({ widths: {}, folded: { '/p': ['a/'] }, skillRowOpen: false, railSplit: null, changesFolded: {} })
    expect(withFolded([], '/p', ['a/'])).toEqual({ widths: {}, folded: { '/p': ['a/'] }, skillRowOpen: false, railSplit: null, changesFolded: {} })
  })
})

describe('skillRowOpenOf', () => {
  it('reads a stored true as open', () => {
    expect(skillRowOpenOf({ widths: {}, folded: {}, skillRowOpen: true, railSplit: null, changesFolded: {} })).toBe(true)
  })

  it.each([
    ['not JSON', null],
    ['a string', 'x'],
    ['an array', [true]],
    ['a file from before the field', { version: 1, widths: { rail: 400 }, folded: {} }],
    ['false', { skillRowOpen: false }],
    ['the string true', { skillRowOpen: 'true' }],
    ['one', { skillRowOpen: 1 }],
    ['null', { skillRowOpen: null }],
    ['an object', { skillRowOpen: {} }]
  ])('reads %s as collapsed', (_name, raw) => {
    expect(skillRowOpenOf(raw)).toBe(false)
  })
})

describe('the skill row choice across writes', () => {
  const open = { widths: { rail: 400 }, folded: { '/work/a': ['_bmad/'] }, skillRowOpen: true }

  it('is kept by a width write and a fold write', () => {
    expect(withWidth(open, 'room', 300).skillRowOpen).toBe(true)
    expect(withWidth(open, 'rail', null).skillRowOpen).toBe(true)
    expect(withFolded(open, '/work/b', ['docs/']).skillRowOpen).toBe(true)
    expect(withFolded(open, '/work/a', []).skillRowOpen).toBe(true)
  })

  it('is set by its own write, which keeps the widths and every fold', () => {
    expect(withSkillRowOpen(open, false)).toEqual({ widths: { rail: 400 }, folded: { '/work/a': ['_bmad/'] }, skillRowOpen: false, railSplit: null, changesFolded: {} })
    expect(withSkillRowOpen({ ...open, skillRowOpen: false }, true)).toEqual({ ...open, railSplit: null, changesFolded: {} })
  })

  it('starts from nothing, and from a file of the wrong shape', () => {
    expect(withSkillRowOpen(null, true)).toEqual({ widths: {}, folded: {}, skillRowOpen: true, railSplit: null, changesFolded: {} })
    expect(withSkillRowOpen('garbage', true)).toEqual({ widths: {}, folded: {}, skillRowOpen: true, railSplit: null, changesFolded: {} })
  })
})

describe('the rail split’s share (Story 9.3)', () => {
  it('reads a share strictly between 0 and 1, and anything else, or nothing, as none', () => {
    expect(railSplitOf({ railSplit: 0.35 })).toBe(0.35)
    for (const bad of [null, 'x', [], {}, { railSplit: 7 }, { railSplit: 0 }, { railSplit: 1 }, { railSplit: '0.4' }, { railSplit: null }]) {
      expect(railSplitOf(bad)).toBeNull()
    }
  })

  it('is set by its own write, removed by null, and a share the split would not read is not stored', () => {
    const store = { widths: { rail: 400 }, folded: { '/a': ['x/'] }, skillRowOpen: true, changesFolded: { '/a': ['src/'] } }
    expect(withRailSplit(store, 0.3)).toEqual({
      widths: { rail: 400 },
      folded: { '/a': ['x/'] },
      skillRowOpen: true,
      railSplit: 0.3,
      changesFolded: { '/a': ['src/'] }
    })
    expect(withRailSplit({ ...store, railSplit: 0.3 }, null).railSplit).toBeNull()
    expect(withRailSplit(store, 7).railSplit).toBeNull()
  })

  it('is kept by every other writer', () => {
    const store = { widths: {}, folded: {}, railSplit: 0.25 }
    expect(withWidth(store, 'rail', 400).railSplit).toBe(0.25)
    expect(withFolded(store, '/a', ['x/']).railSplit).toBe(0.25)
    expect(withChangesFolded(store, '/a', ['x/']).railSplit).toBe(0.25)
    expect(withSkillRowOpen(store, true).railSplit).toBe(0.25)
  })
})

describe('the Changes half’s folds (Story 9.3)', () => {
  const store = { widths: { rail: 400 }, folded: { '/a': ['_bmad/'] }, changesFolded: { '/a': ['src/', 'src/'], '/b': 'x' } }

  it('reads its own set per project, apart from the Outputs set, as tolerantly', () => {
    expect(changesFoldedOf(store, '/a')).toEqual(['src/'])
    expect(changesFoldedOf(store, '/b')).toEqual([])
    expect(changesFoldedOf(store, '__proto__')).toEqual([])
    expect(allChangesFolded(store)).toEqual({ '/a': ['src/'] })
    expect(foldedOf(store, '/a')).toEqual(['_bmad/'])
  })

  it('is replaced by its own write, which leaves the Outputs folds as they were, and the reverse', () => {
    expect(withChangesFolded(store, '/a', ['docs/']).changesFolded).toEqual({ '/a': ['docs/'] })
    expect(withChangesFolded(store, '/a', ['docs/']).folded).toEqual({ '/a': ['_bmad/'] })
    expect(withChangesFolded(store, '/a', []).changesFolded).toEqual({})
    expect(withFolded(store, '/a', []).changesFolded).toEqual({ '/a': ['src/'] })
  })

  it('is kept by a width, rail split and skill row write', () => {
    expect(withWidth(store, 'room', 300).changesFolded).toEqual({ '/a': ['src/'] })
    expect(withRailSplit(store, 0.4).changesFolded).toEqual({ '/a': ['src/'] })
    expect(withSkillRowOpen(store, true).changesFolded).toEqual({ '/a': ['src/'] })
  })
})
