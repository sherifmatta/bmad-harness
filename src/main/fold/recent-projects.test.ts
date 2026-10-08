import { describe, expect, it } from 'vitest'

import { RECENT_LIMIT, displayParent, parseRecent, recentName, recordRecent } from './recent-projects'

const file = (...entries: unknown[]): unknown => ({ version: 1, entries })
const at = (path: string, openedAt: number) => ({ path, openedAt })

describe('reading a stored list', () => {
  it('reads the entries of the file as they are, newest first', () => {
    expect(parseRecent(file(at('/a', 30), at('/b', 20), at('/c', 10)))).toEqual([
      at('/a', 30),
      at('/b', 20),
      at('/c', 10)
    ])
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'recent'],
    ['a number', 7],
    ['an array', [at('/a', 1)]],
    ['an object with no entries', { version: 1 }],
    ['entries that are not a list', { entries: 'nope' }],
    ['entries that are an object', { entries: { 0: at('/a', 1) } }]
  ])('is no entries for %s, without throwing', (_name, raw) => {
    expect(parseRecent(raw)).toEqual([])
  })

  it('leaves out an entry that is not a folder path and a time, and keeps the rest', () => {
    expect(
      parseRecent(
        file(
          at('/kept', 5),
          null,
          'a string',
          7,
          { path: '/no-time' },
          { openedAt: 1 },
          at('relative/path', 1),
          at('', 1),
          { path: '/nan', openedAt: Number.NaN },
          { path: '/infinite', openedAt: Number.POSITIVE_INFINITY },
          { path: '/negative', openedAt: -1 },
          { path: 4, openedAt: 1 },
          { path: '/string-time', openedAt: '5' },
          at('/also-kept', 4)
        )
      )
    ).toEqual([at('/kept', 5), at('/also-kept', 4)])
  })

  it('lists a path once, at its newest place', () => {
    expect(parseRecent(file(at('/a', 9), at('/b', 8), at('/a', 1)))).toEqual([
      at('/a', 9),
      at('/b', 8)
    ])
  })

  it('keeps no more than eight, and nothing but a path and a time of each', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      path: `/p${index}`,
      openedAt: 100 - index,
      branch: 'main',
      agents: 5
    }))

    const entries = parseRecent(file(...many))

    expect(RECENT_LIMIT).toBe(8)
    expect(entries.map(({ path }) => path)).toEqual(
      Array.from({ length: 8 }, (_, index) => `/p${index}`)
    )
    expect(Object.keys(entries[0]).sort()).toEqual(['openedAt', 'path'])
  })
})

describe('recording a project', () => {
  it('puts it first, opened at the time given', () => {
    expect(recordRecent([at('/a', 1)], '/b', 2)).toEqual([at('/b', 2), at('/a', 1)])
  })

  it('moves a project already listed to the top and does not list it twice', () => {
    expect(recordRecent([at('/a', 3), at('/b', 2), at('/c', 1)], '/c', 9)).toEqual([
      at('/c', 9),
      at('/a', 3),
      at('/b', 2)
    ])
  })

  it('pushes the oldest off the end at eight', () => {
    const full = Array.from({ length: 8 }, (_, index) => at(`/p${index}`, 100 - index))

    const next = recordRecent(full, '/new', 200)

    expect(next).toHaveLength(8)
    expect(next[0]).toEqual(at('/new', 200))
    expect(next.map(({ path }) => path)).not.toContain('/p7')
  })

  it('does not change the list it was given', () => {
    const before = [at('/a', 1)]

    recordRecent(before, '/b', 2)

    expect(before).toEqual([at('/a', 1)])
  })

  it('starts a list from nothing', () => {
    expect(recordRecent([], '/a', 1)).toEqual([at('/a', 1)])
  })
})

describe('showing a folder', () => {
  it('names it by its own name, or by the whole path when it has none', () => {
    expect(recentName('/Users/me/work/falcon')).toBe('falcon')
    expect(recentName('/')).toBe('/')
  })

  it('writes the home directory as ~ in the parent', () => {
    expect(displayParent('/Users/me/falcon', '/Users/me')).toBe('~')
    expect(displayParent('/Users/me/work/falcon', '/Users/me')).toBe('~/work')
    expect(displayParent('/Users/me/a/b/falcon', '/Users/me')).toBe('~/a/b')
  })

  it('replaces only a whole leading folder, so a sibling that shares the prefix is not home', () => {
    expect(displayParent('/Users/menu/falcon/x', '/Users/me')).toBe('/Users/menu/falcon')
  })

  it('shows a parent outside home as it is', () => {
    expect(displayParent('/srv/projects/falcon', '/Users/me')).toBe('/srv/projects')
  })

  it('does not write ~ for a root or an empty home', () => {
    expect(displayParent('/', '/Users/me')).toBe('/')
    expect(displayParent('/work/falcon', '')).toBe('/work')
    expect(displayParent('/work/falcon', '/')).toBe('/work')
  })
})
