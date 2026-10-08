import { describe, expect, it } from 'vitest'
import {
  bmadFolderOf,
  checkChoice,
  choiceFor,
  normalizeFolder,
  resolveOutputFolder,
  storedChoices,
  withChoice
} from './output-folder'
import type { DiskState } from './output-folder'

/** A disk where each folder named is as said, and any other is missing. */
const disk =
  (states: Record<string, DiskState>) =>
  (folder: string): DiskState =>
    states[folder] ?? 'missing'

describe('resolveOutputFolder: the folder the rail watches', () => {
  it('derived: no choice, and BMad’s folder exists, is BMad’s folder and says nothing', () => {
    expect(
      resolveOutputFolder({ stored: undefined, bmad: 'docs/out/', onDisk: disk({ 'docs/out/': 'usable' }) })
    ).toEqual({ folder: 'docs/out/', bmadFolder: 'docs/out/' })
  })

  it.each([
    ['the resolver failed or said nothing', undefined],
    ['the value cannot be used (outside the project, the project itself)', null]
  ])('default: %s leaves the install’s folder, silently', (_name, bmad) => {
    expect(resolveOutputFolder({ stored: undefined, bmad, onDisk: disk({}) })).toEqual({ folder: '_bmad/' })
  })

  it('default: BMad names a folder that is not there yet leaves the install’s, and waits for it', () => {
    expect(resolveOutputFolder({ stored: undefined, bmad: 'docs/out/', onDisk: disk({}) })).toEqual({
      folder: '_bmad/',
      bmadFolder: 'docs/out/',
      awaiting: 'docs/out/'
    })
  })

  it('default: BMad names a folder that cannot be used (a link out) leaves the install’s, and waits for nothing', () => {
    expect(
      resolveOutputFolder({ stored: undefined, bmad: 'docs/out/', onDisk: disk({ 'docs/out/': 'unusable' }) })
    ).toEqual({ folder: '_bmad/', bmadFolder: 'docs/out/' })
  })

  it('chosen and the same as BMad’s: the choice, and no state', () => {
    expect(
      resolveOutputFolder({
        stored: 'docs/out/',
        bmad: 'docs/out/',
        onDisk: disk({ 'docs/out/': 'usable' })
      })
    ).toEqual({ folder: 'docs/out/', chosen: 'docs/out/', bmadFolder: 'docs/out/' })
  })

  it('chosen and different from BMad’s: the choice, and the difference stated', () => {
    expect(
      resolveOutputFolder({
        stored: 'mine/',
        bmad: '_bmad/',
        onDisk: disk({ 'mine/': 'usable', '_bmad/': 'usable' })
      })
    ).toEqual({ folder: 'mine/', chosen: 'mine/', bmadFolder: '_bmad/', state: 'different' })
  })

  it('chosen and BMad’s folder not known: the choice, and nothing to say against it', () => {
    expect(
      resolveOutputFolder({ stored: 'mine/', bmad: undefined, onDisk: disk({ 'mine/': 'usable' }) })
    ).toEqual({ folder: 'mine/', chosen: 'mine/' })
  })

  it('chosen and missing: BMad’s folder is watched, the choice is kept and said, and its return is awaited', () => {
    expect(
      resolveOutputFolder({
        stored: 'mine/',
        bmad: 'docs/out/',
        onDisk: disk({ 'docs/out/': 'usable' })
      })
    ).toEqual({
      folder: 'docs/out/',
      chosen: 'mine/',
      bmadFolder: 'docs/out/',
      state: 'missing',
      awaiting: 'mine/'
    })
  })

  it('chosen and missing, with BMad’s folder unknown: the install’s folder is watched', () => {
    expect(resolveOutputFolder({ stored: 'mine/', bmad: undefined, onDisk: disk({}) })).toEqual({
      folder: '_bmad/',
      chosen: 'mine/',
      state: 'missing',
      awaiting: 'mine/'
    })
  })

  it('returns to the choice when its folder returns, and not before', () => {
    const input = { stored: 'mine/', bmad: undefined }
    expect(resolveOutputFolder({ ...input, onDisk: disk({}) }).folder).toBe('_bmad/')
    expect(resolveOutputFolder({ ...input, onDisk: disk({ 'mine/': 'usable' }) }).folder).toBe('mine/')
  })

  it.each([
    ['a number', 7],
    ['an object', { folder: 'mine/' }],
    ['an empty string', ''],
    ['an absolute path', '/etc/'],
    ['a way out', '../mine/'],
    ['the project itself', './'],
    ['.git', '.git/'],
    ['inside node_modules', 'a/node_modules/b/'],
    ['a backslash', 'a\\b']
  ])('reads %s as no choice, silently', (_name, stored) => {
    expect(resolveOutputFolder({ stored, bmad: 'docs/out/', onDisk: disk({ 'docs/out/': 'usable' }) })).toEqual({
      folder: 'docs/out/',
      bmadFolder: 'docs/out/'
    })
  })

  it('reads a stored folder that cannot be used on disk as no choice, and not as a missing one', () => {
    expect(resolveOutputFolder({ stored: 'mine/', bmad: undefined, onDisk: disk({ 'mine/': 'unusable' }) })).toEqual({
      folder: '_bmad/'
    })
  })

  it('is total: whatever it is given, it names a folder', () => {
    const stored = [undefined, null, 1, '', 'a/', 'a', {}, [], '../x', 'a//b/./c']
    const bmad = [undefined, null, 'x/', 'y/z/']
    const states: DiskState[] = ['usable', 'missing', 'unusable']
    for (const s of stored) {
      for (const b of bmad) {
        for (const state of states) {
          const { folder } = resolveOutputFolder({ stored: s, bmad: b, onDisk: () => state })
          expect(folder, JSON.stringify([s, b, state])).toMatch(/^[^/].*\/$/)
        }
      }
    }
  })
})

describe('normalizeFolder', () => {
  it('spells a folder as the harness does: POSIX, no doubled or leading slash, a trailing one', () => {
    expect(normalizeFolder('docs/out')).toBe('docs/out/')
    expect(normalizeFolder('docs/out/')).toBe('docs/out/')
    expect(normalizeFolder('./docs//out/./')).toBe('docs/out/')
    expect(normalizeFolder('_bmad')).toBe('_bmad/')
  })

  it('refuses what is not a folder inside the project', () => {
    for (const bad of [undefined, null, 3, '', '.', './', '/', '/abs', '..', 'a/..', 'a/../b', 'a\\b', 'a\0b', 'a\nb', 'a\tb/', 'a\rb', 'a\u007fb', 'a\u001bb', '.git', 'x/.git/y', 'node_modules/p']) {
      expect(normalizeFolder(bad), String(bad)).toBeNull()
    }
  })
})

describe('bmadFolderOf', () => {
  const root = '/work/falcon'

  it('fills in {project-root} and reads the folder relative to the project', () => {
    expect(bmadFolderOf('{project-root}/_bmad', root)).toBe('_bmad/')
    expect(bmadFolderOf('{project-root}/docs/out/', root)).toBe('docs/out/')
    expect(bmadFolderOf('{project-root}/_bmad-output', root)).toBe('_bmad-output/')
  })

  it('takes an absolute path inside the project and a relative one as relative to it', () => {
    expect(bmadFolderOf('/work/falcon/docs/out', root)).toBe('docs/out/')
    expect(bmadFolderOf('docs/out', root)).toBe('docs/out/')
  })

  it('is unusable for a folder name with a control character in it', () => {
    for (const raw of ['{project-root}/a\nb', '{project-root}/a\tb', '/work/falcon/a\nb', 'a\nb']) {
      expect(bmadFolderOf(raw, root), JSON.stringify(raw)).toBeNull()
    }
  })

  it('is unusable for the project itself, a way out of it, another project and the folders never used', () => {
    for (const raw of [
      '{project-root}',
      '{project-root}/',
      '{project-root}/..',
      '{project-root}/../other',
      '/work/other/out',
      '/work/falcon-2/out',
      '/work',
      '..',
      '{project-root}/.git',
      '{project-root}/node_modules/x',
      ''
    ]) {
      expect(bmadFolderOf(raw, root), raw).toBeNull()
    }
  })
})

describe('checkChoice', () => {
  const project = '/work/falcon'

  it('accepts a folder inside the project, spelled project-relative with a trailing slash', () => {
    expect(checkChoice(project, '/work/falcon/docs/out')).toEqual({ ok: true, folder: 'docs/out/' })
    expect(checkChoice(project, '/work/falcon/out')).toEqual({ ok: true, folder: 'out/' })
  })

  it.each([
    ['the project itself', '/work/falcon', 'the project folder itself'],
    ['a folder outside it', '/work/other', 'outside this project'],
    ['its parent', '/work', 'outside this project'],
    ['a sibling that shares its name as a prefix', '/work/falcon-2/x', 'outside this project'],
    ['.git', '/work/falcon/.git', 'inside .git'],
    ['inside .git', '/work/falcon/.git/refs', 'inside .git'],
    ['node_modules', '/work/falcon/node_modules', 'inside node_modules'],
    ['inside node_modules', '/work/falcon/a/node_modules/b', 'inside node_modules']
  ])('refuses %s', (_name, target, reason) => {
    expect(checkChoice(project, target)).toEqual({ ok: false, reason })
  })

  it('keeps a name that only looks like one: .github and node_modules2 are folders', () => {
    expect(checkChoice(project, '/work/falcon/.github')).toEqual({ ok: true, folder: '.github/' })
    expect(checkChoice(project, '/work/falcon/node_modules2')).toEqual({ ok: true, folder: 'node_modules2/' })
  })
})

describe('the stored choices', () => {
  it('reads each project’s folder from a store of the shape it writes, and ignores everything else', () => {
    const raw = { version: 1, folders: { '/a': 'docs/', '/b': 7, '/c': 'x/' }, extra: true }

    expect(storedChoices(raw)).toEqual({ '/a': 'docs/', '/c': 'x/' })
    expect(choiceFor(raw, '/a')).toBe('docs/')
    expect(choiceFor(raw, '/b')).toBeUndefined()
    expect(choiceFor(raw, '/missing')).toBeUndefined()
  })

  it.each([null, undefined, 3, 'x', [], { folders: null }, { folders: [] }, { folders: 'x' }])(
    'holds none for a store that is %j',
    (raw) => {
      expect(storedChoices(raw)).toEqual({})
      expect(choiceFor(raw, '/a')).toBeUndefined()
    }
  )

  it('does not mistake an inherited key for a project', () => {
    expect(choiceFor({ folders: {} }, 'constructor')).toBeUndefined()
    expect(choiceFor({ folders: {} }, '__proto__')).toBeUndefined()
  })

  it('sets one project’s folder and removes it, leaving the others as they were', () => {
    const raw = { folders: { '/a': 'docs/', '/b': 'x/' } }

    expect(withChoice(raw, '/a', 'new/')).toEqual({ '/a': 'new/', '/b': 'x/' })
    expect(withChoice(raw, '/c', 'y/')).toEqual({ '/a': 'docs/', '/b': 'x/', '/c': 'y/' })
    expect(withChoice(raw, '/a', null)).toEqual({ '/b': 'x/' })
    expect(withChoice(raw, '/zzz', null)).toEqual({ '/a': 'docs/', '/b': 'x/' })
    expect(withChoice(null, '/a', 'x/')).toEqual({ '/a': 'x/' })
    // What was read is not changed.
    expect(raw).toEqual({ folders: { '/a': 'docs/', '/b': 'x/' } })
  })
})
