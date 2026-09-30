import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readBranch } from './branch'
import type { ReadFile } from './branch'

const HEX = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'

/** A scripted filesystem: path to contents, everything else unreadable. */
function scripted(files: Record<string, string | Uint8Array>): ReadFile {
  return async (path) => {
    const content = files[path]
    if (content === undefined) {
      return null
    }
    return typeof content === 'string' ? new TextEncoder().encode(content) : content
  }
}

const head = (content: string) => scripted({ '/p/.git/HEAD': content })

describe('readBranch over a scripted filesystem', () => {
  it('reads a branch on a ref', async () => {
    expect(await readBranch('/p', { read: head('ref: refs/heads/feat/payouts-prd\n') })).toBe(
      'feat/payouts-prd'
    )
  })

  it('reads a detached commit as its first seven hex digits', async () => {
    expect(await readBranch('/p', { read: head(HEX) })).toBe('detached · a1b2c3d')
  })

  it('tolerates a trailing newline and CRLF endings, and neither is in the answer', async () => {
    expect(await readBranch('/p', { read: head('ref: refs/heads/main') })).toBe('main')
    expect(await readBranch('/p', { read: head('ref: refs/heads/main\r\n') })).toBe('main')
    expect(await readBranch('/p', { read: head(`${HEX}\r\n`) })).toBe('detached · a1b2c3d')
  })

  it('follows one gitdir hop, absolute or relative, when .git is a file', async () => {
    const absolute = scripted({
      '/p/.git': 'gitdir: /x/.git/worktrees/w\n',
      '/x/.git/worktrees/w/HEAD': 'ref: refs/heads/w\n'
    })
    const relative = scripted({
      '/p/.git': 'gitdir: ../x/.git/worktrees/w\n',
      '/x/.git/worktrees/w/HEAD': 'ref: refs/heads/w\n'
    })

    expect(await readBranch('/p', { read: absolute })).toBe('w')
    expect(await readBranch('/p', { read: relative })).toBe('w')
  })

  it('answers null when there is nothing to read', async () => {
    expect(await readBranch('/p', { read: scripted({}) })).toBeNull()
    expect(await readBranch('/p', { read: head('') })).toBeNull()
  })

  it('does not follow a second hop', async () => {
    const read = scripted({
      '/p/.git': 'gitdir: /x/wt\n',
      '/x/wt/HEAD': 'gitdir: /y/wt\n',
      '/y/wt/HEAD': 'ref: refs/heads/deep\n'
    })

    expect(await readBranch('/p', { read })).toBeNull()
  })

  it('answers null for a gitdir that points at nothing', async () => {
    expect(await readBranch('/p', { read: scripted({ '/p/.git': 'gitdir: /nowhere\n' }) })).toBeNull()
  })

  it.each([
    ['a tag ref', 'ref: refs/tags/x\n'],
    ['a remote ref', 'ref: refs/remotes/origin/main\n'],
    ['a name with a space', 'ref: refs/heads/a b\n'],
    ['a name with a newline in it', 'ref: refs/heads/a\nb\n'],
    ['a name with a tab', 'ref: refs/heads/a\tb\n'],
    ['a name with a control byte', 'ref: refs/heads/a\u0001b\n'],
    ['a name with DEL', 'ref: refs/heads/a\u007fb\n'],
    ['a name with a C1 control', 'ref: refs/heads/a\u0085b\n'],
    ['a name with the last C1 control', 'ref: refs/heads/a\u009fb\n'],
    ['a name with a zero-width space', 'ref: refs/heads/a\u200bb\n'],
    ['a name with a right-to-left mark', 'ref: refs/heads/a\u200fb\n'],
    ['a name with a bidi override', 'ref: refs/heads/a\u202eb\n'],
    ['a name with a bidi embedding', 'ref: refs/heads/a\u202ab\n'],
    ['a name with a bidi isolate', 'ref: refs/heads/a\u2066b\n'],
    ['a name with a pop-isolate', 'ref: refs/heads/a\u2069b\n'],
    ['a name with a byte-order mark', 'ref: refs/heads/a\ufeffb\n'],
    ['an empty name', 'ref: refs/heads/\n'],
    ['a 201-character name', `ref: refs/heads/${'a'.repeat(201)}\n`],
    ['a short object id', 'a1b2c3d\n'],
    ['an uppercase object id', `${HEX.toUpperCase()}\n`],
    ['an unrecognised format', 'reftable: something\n'],
    ['two lines', 'ref: refs/heads/main\nref: refs/heads/other\n']
  ])('answers null for %s', async (_name, content) => {
    expect(await readBranch('/p', { read: head(content) })).toBeNull()
  })

  it('accepts a 200-character name', async () => {
    const name = 'a'.repeat(200)

    expect(await readBranch('/p', { read: head(`ref: refs/heads/${name}\n`) })).toBe(name)
  })

  it('answers null for an oversized file', async () => {
    const big = `ref: refs/heads/main\n${'#'.repeat(5 * 1024)}`

    expect(await readBranch('/p', { read: head(big) })).toBeNull()
  })

  it('answers null for a file that is not UTF-8', async () => {
    const bytes = new Uint8Array([...new TextEncoder().encode('ref: refs/heads/'), 0xff, 0xfe])

    expect(await readBranch('/p', { read: scripted({ '/p/.git/HEAD': bytes }) })).toBeNull()
  })

  it('never rejects, whatever the reader does', async () => {
    const throwing: ReadFile = async () => {
      throw new Error('EACCES: /secret/path')
    }

    await expect(readBranch('/p', { read: throwing })).resolves.toBeNull()
  })
})

describe('readBranch over a real directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'branch-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('reads a plain repository layout', async () => {
    const repo = join(root, 'plain')
    mkdirSync(join(repo, '.git'), { recursive: true })
    writeFileSync(join(repo, '.git', 'HEAD'), 'ref: refs/heads/feat/payouts-prd\n')

    expect(await readBranch(repo)).toBe('feat/payouts-prd')
  })

  it('reads a detached HEAD', async () => {
    const repo = join(root, 'detached')
    mkdirSync(join(repo, '.git'), { recursive: true })
    writeFileSync(join(repo, '.git', 'HEAD'), `${HEX}\n`)

    expect(await readBranch(repo)).toBe('detached · a1b2c3d')
  })

  it('reads a worktree layout, where .git is a file', async () => {
    const main = join(root, 'main')
    const linked = join(root, 'linked')
    const gitDir = join(main, '.git', 'worktrees', 'w')
    mkdirSync(gitDir, { recursive: true })
    mkdirSync(linked)
    writeFileSync(join(gitDir, 'HEAD'), 'ref: refs/heads/w\n')
    writeFileSync(join(linked, '.git'), `gitdir: ${gitDir}\n`)

    expect(await readBranch(linked)).toBe('w')
  })

  it('answers null with no .git at all', async () => {
    const bare = join(root, 'bare')
    mkdirSync(bare)

    expect(await readBranch(bare)).toBeNull()
    expect(await readBranch(join(root, 'does-not-exist'))).toBeNull()
  })

  it('answers null for a .git file whose gitdir holds no HEAD', async () => {
    const repo = join(root, 'dangling')
    const target = join(root, 'empty-gitdir')
    mkdirSync(repo)
    mkdirSync(target)
    writeFileSync(join(repo, '.git'), `gitdir: ${target}\n`)

    expect(await readBranch(repo)).toBeNull()
  })

  it('answers null for an oversized HEAD on disk', async () => {
    const repo = join(root, 'oversized')
    mkdirSync(join(repo, '.git'), { recursive: true })
    writeFileSync(join(repo, '.git', 'HEAD'), `ref: refs/heads/main\n${'x'.repeat(5 * 1024)}`)

    expect(await readBranch(repo)).toBeNull()
  })
})
