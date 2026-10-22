import { describe, expect, it } from 'vitest'

import { foldPorcelainV2, isChangePath } from './git-status'

const H = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const ordinary = (xy: string, path: string): string => `1 ${xy} N... 100644 100644 100644 ${H} ${H} ${path}`
const moved = (xy: string, score: string, path: string, from: string): string =>
  `2 ${xy} N... 100644 100644 100644 ${H} ${H} ${score} ${path}\0${from}`
const unmerged = (xy: string, path: string): string =>
  `u ${xy} N... 100644 100644 100644 100644 ${H} ${H} ${H} ${path}`
const z = (...records: string[]): string => records.map((record) => `${record}\0`).join('')

describe('foldPorcelainV2', () => {
  it('maps every record of the matrix to its one row, in git’s order', () => {
    const stdout = z(
      ordinary('.M', 'src/a.ts'),
      ordinary('AD', 'src/b.ts'),
      ordinary('.A', 'src/c.ts'),
      moved('R.', 'R100', 'new.md', 'old.md'),
      unmerged('UU', 'x.ts'),
      '? d/e.txt',
      '? sub/'
    )
    expect(foldPorcelainV2(stdout)).toEqual({
      ok: true,
      rows: [
        { path: 'src/a.ts', state: 'modified' },
        { path: 'src/b.ts', state: 'deleted' },
        { path: 'src/c.ts', state: 'added' },
        { path: 'new.md', state: 'renamed', from: 'old.md' },
        { path: 'x.ts', state: 'conflicted' },
        { path: 'd/e.txt', state: 'untracked' },
        { path: 'sub/', state: 'untracked', directory: true }
      ]
    })
  })

  it('lets D win on either side, then A, then M or T', () => {
    const states = (xy: string): unknown => {
      const fold = foldPorcelainV2(z(ordinary(xy, 'f')))
      return fold.ok ? fold.rows[0]?.state : 'failed'
    }
    expect(states('D.')).toBe('deleted')
    expect(states('.D')).toBe('deleted')
    expect(states('MD')).toBe('deleted')
    expect(states('A.')).toBe('added')
    expect(states('AM')).toBe('added')
    expect(states('M.')).toBe('modified')
    expect(states('MM')).toBe('modified')
    expect(states('.T')).toBe('modified')
    expect(states('T.')).toBe('modified')
    expect(states('..')).toBe('failed')
  })

  it('reads a rename with D on either side as deleted, and a copy as added', () => {
    expect(foldPorcelainV2(z(moved('RD', 'R90', 'n.ts', 'o.ts')))).toEqual({
      ok: true,
      rows: [{ path: 'n.ts', state: 'deleted' }]
    })
    expect(foldPorcelainV2(z(moved('C.', 'C75', 'copy.ts', 'orig.ts')))).toEqual({
      ok: true,
      rows: [{ path: 'copy.ts', state: 'added' }]
    })
    expect(foldPorcelainV2(z(moved('.R', 'R100', 'n.ts', 'o.ts')))).toEqual({
      ok: true,
      rows: [{ path: 'n.ts', state: 'renamed', from: 'o.ts' }]
    })
  })

  it('keeps spaces and printable characters in a path, and the rest of the record as the path', () => {
    expect(foldPorcelainV2(z(ordinary('.M', 'docs/a file name.md'), '? notes/ünïcode — draft.txt'))).toEqual({
      ok: true,
      rows: [
        { path: 'docs/a file name.md', state: 'modified' },
        { path: 'notes/ünïcode — draft.txt', state: 'untracked' }
      ]
    })
  })

  it('ignores header and ignored-file records', () => {
    expect(foldPorcelainV2(z('# branch.oid ' + H, '! build/', ordinary('.M', 'a')))).toEqual({
      ok: true,
      rows: [{ path: 'a', state: 'modified' }]
    })
  })

  it('reads a submodule as one row that opens nothing, its path unchanged', () => {
    expect(foldPorcelainV2(z(`1 .M SC.. 160000 160000 160000 ${H} ${H} vendor/lib`))).toEqual({
      ok: true,
      rows: [{ path: 'vendor/lib', state: 'modified', directory: true }]
    })
  })

  it('reads empty output as a clean repository', () => {
    expect(foldPorcelainV2('')).toEqual({ ok: true, rows: [] })
  })

  it.each([
    ['an unknown record type', z(`3 .M N... 100644 100644 100644 ${H} ${H} a`)],
    ['a record missing a field', z(`1 .M N... 100644 100644 ${H} a`)],
    ['a state letter outside the set', z(ordinary('.X', 'a'))],
    ['an escaping path', z(ordinary('.M', '../outside'))],
    ['a dot segment', z(ordinary('.M', 'a/./b'))],
    ['an absolute path', z('? /etc/passwd')],
    ['an empty segment', z('? a//b')],
    ['the replacement character', z('? bad\ufffdname')],
    ['a control character', z('? bad\u0007name')],
    ['a bidi override', z('? evil\u202etxt.md')],
    ['a zero-width mark', z('? zero\u200bwidth')],
    ['the Arabic letter mark', z('? mark\u061cname')],
    ['a line separator', z('? line\u2028name')],
    ['a paragraph separator', z('? para\u2029name')],
    ['a rename with no old path', `2 R. N... 100644 100644 100644 ${H} ${H} R100 new.md\0`],
    ['a rename whose old path escapes', z(moved('R.', 'R100', 'new.md', '../old.md'))],
    ['a rename with a bad score', z(moved('R.', 'X1', 'new.md', 'old.md'))],
    ['an empty record mid-stream', `\0${z(ordinary('.M', 'a'))}`],
    ['a bare question mark', z('?')]
  ])('fails the whole read on %s, never sending a partial list', (_name, stdout) => {
    expect(foldPorcelainV2(`${z(ordinary('.M', 'good.ts'))}${stdout}`)).toEqual({ ok: false })
  })
})

describe('isChangePath', () => {
  it('lets a directory through only with its one trailing slash, and only when asked', () => {
    expect(isChangePath('sub/', true)).toBe(true)
    expect(isChangePath('a/sub/', true)).toBe(true)
    expect(isChangePath('sub/')).toBe(false)
    expect(isChangePath('sub', true)).toBe(false)
    expect(isChangePath('/', true)).toBe(false)
    expect(isChangePath('', false)).toBe(false)
  })
})
