import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documentSegments, resolveDocument } from './resolve-document'

let root: string
let outside: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'resolve-doc-'))
  outside = mkdtempSync(join(tmpdir(), 'resolve-doc-outside-'))
  mkdirSync(join(root, '_bmad/planning-artifacts'), { recursive: true })
  writeFileSync(join(root, '_bmad/planning-artifacts/prd.md'), '# prd\n')
  writeFileSync(join(outside, 'secret.md'), 'secret\n')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

describe('the lexical tier', () => {
  it.each([
    ['a number', 7],
    ['undefined', undefined],
    ['null', null],
    ['an object', { path: '_bmad/x.md' }],
    ['an empty string', ''],
    ['an absolute path', '/etc/hosts'],
    ['a parent segment', '../x'],
    ['a parent segment after _bmad', '_bmad/../x'],
    ['a parent segment at the end', '_bmad/planning-artifacts/..'],
    ['a dot segment', '_bmad/./x.md'],
    ['an empty segment', '_bmad//x.md'],
    ['a trailing slash', '_bmad/planning-artifacts/'],
    ['a backslash', 'x\\y'],
    ['a backslash after _bmad', '_bmad\\x.md'],
    ['a NUL', '_bmad/x\0.md'],
    ['a first segment other than _bmad', 'docs/x.md'],
    ['a look-alike first segment', '_bmad2/x.md'],
    ['a case variant of the first segment', '_BMAD/x.md'],
    ['_bmad itself', '_bmad']
  ])('refuses %s as doc/invalid-path', async (_name, path) => {
    expect(await resolveDocument(root, path, '_bmad/')).toEqual({ ok: false, code: 'doc/invalid-path' })
  })

  it('reads the segments of a valid path and of nothing else', () => {
    expect(documentSegments('_bmad/a/b.md', '_bmad/')).toEqual(['_bmad', 'a', 'b.md'])
    expect(documentSegments('_bmad/..a/b', '_bmad/')).toEqual(['_bmad', '..a', 'b'])
    expect(documentSegments('a/b', '_bmad/')).toBeNull()
  })
})

describe('the real-path tier', () => {
  it('resolves an existing file to its absolute path, not refused', async () => {
    expect(await resolveDocument(root, '_bmad/planning-artifacts/prd.md', '_bmad/')).toEqual({
      ok: true,
      fullPath: join(root, '_bmad/planning-artifacts/prd.md'),
      refused: false
    })
  })

  it('opens a file that does not exist, not refused: the row may have just gone', async () => {
    expect(await resolveDocument(root, '_bmad/planning-artifacts/gone.md', '_bmad/')).toEqual({
      ok: true,
      fullPath: join(root, '_bmad/planning-artifacts/gone.md'),
      refused: false
    })
    expect(await resolveDocument(root, '_bmad/no-such-dir/gone.md', '_bmad/')).toMatchObject({
      ok: true,
      refused: false
    })
  })

  it('opens a file whose _bmad directory does not exist, as missing rather than refused', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'resolve-doc-empty-'))
    try {
      expect(await resolveDocument(empty, '_bmad/x.md', '_bmad/')).toMatchObject({ ok: true, refused: false })
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  it('refuses, without an error, a file symlinked out of _bmad', async () => {
    symlinkSync(join(outside, 'secret.md'), join(root, '_bmad/link.md'))

    expect(await resolveDocument(root, '_bmad/link.md', '_bmad/')).toEqual({
      ok: true,
      fullPath: join(root, '_bmad/link.md'),
      refused: true
    })
  })

  it('refuses a file reached through a directory symlinked out of _bmad', async () => {
    symlinkSync(outside, join(root, '_bmad/linked-dir'))

    expect(await resolveDocument(root, '_bmad/linked-dir/secret.md', '_bmad/')).toMatchObject({
      ok: true,
      refused: true
    })
  })

  it('refuses a dangling link, which would read whatever it is later mended to', async () => {
    symlinkSync(join(outside, 'not-yet.md'), join(root, '_bmad/dangling.md'))

    expect(await resolveDocument(root, '_bmad/dangling.md', '_bmad/')).toMatchObject({ ok: true, refused: true })
  })

  it('accepts a symlink that stays inside _bmad', async () => {
    symlinkSync(join(root, '_bmad/planning-artifacts/prd.md'), join(root, '_bmad/alias.md'))

    expect(await resolveDocument(root, '_bmad/alias.md', '_bmad/')).toMatchObject({ ok: true, refused: false })
  })

  it('refuses a link loop', async () => {
    symlinkSync(join(root, '_bmad/b.md'), join(root, '_bmad/a.md'))
    symlinkSync(join(root, '_bmad/a.md'), join(root, '_bmad/b.md'))

    expect(await resolveDocument(root, '_bmad/a.md', '_bmad/')).toMatchObject({ ok: true, refused: true })
  })
})

describe('a chosen output folder (Story 5.4)', () => {
  const FOLDER = 'docs/out/'

  it('opens a document under the folder, and nothing outside it', async () => {
    mkdirSync(join(root, 'docs/out/nested'), { recursive: true })
    writeFileSync(join(root, 'docs/out/nested/prd.md'), 'x')

    expect(await resolveDocument(root, 'docs/out/nested/prd.md', FOLDER)).toEqual({
      ok: true,
      fullPath: join(root, 'docs/out/nested/prd.md'),
      refused: false
    })
    expect(await resolveDocument(root, 'docs/out/prd.md', FOLDER)).toMatchObject({ ok: true })
    for (const path of ['_bmad/planning-artifacts/prd.md', 'docs/prd.md', 'docs/out2/x.md', 'docs/out', 'docs/out/', 'DOCS/out/x.md']) {
      expect(await resolveDocument(root, path, FOLDER), path).toEqual({ ok: false, code: 'doc/invalid-path' })
    }
  })

  it('reads the segments of a path under the folder and of nothing else', () => {
    expect(documentSegments('docs/out/a/b.md', FOLDER)).toEqual(['docs', 'out', 'a', 'b.md'])
    expect(documentSegments('docs/out/..a', FOLDER)).toEqual(['docs', 'out', '..a'])
    expect(documentSegments('docs/out', FOLDER)).toBeNull()
    expect(documentSegments('_bmad/a.md', FOLDER)).toBeNull()
    expect(documentSegments('docs/out/../x.md', FOLDER)).toBeNull()
  })

  it('judges the real path against the folder’s own real path: a link out of it is refused, one that stays is not', async () => {
    mkdirSync(join(root, 'docs/out'), { recursive: true })
    writeFileSync(join(root, 'docs/out/real.md'), 'x')
    writeFileSync(join(root, 'docs/elsewhere.md'), 'x')
    symlinkSync(join(root, 'docs/out/real.md'), join(root, 'docs/out/alias.md'))
    symlinkSync(join(root, 'docs/elsewhere.md'), join(root, 'docs/out/leaves.md'))
    symlinkSync(join(outside, 'secret.md'), join(root, 'docs/out/out.md'))

    expect(await resolveDocument(root, 'docs/out/alias.md', FOLDER)).toMatchObject({ ok: true, refused: false })
    expect(await resolveDocument(root, 'docs/out/leaves.md', FOLDER)).toMatchObject({ ok: true, refused: true })
    expect(await resolveDocument(root, 'docs/out/out.md', FOLDER)).toMatchObject({ ok: true, refused: true })
  })
})
