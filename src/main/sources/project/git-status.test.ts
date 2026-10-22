import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'

import type { CommandResult, CommandRunner } from '../install/run-command'
import { locateGit } from './git-locator'
import { GIT_STATUS_ARGS, gitEnvironment, hasGitMarker, readGitStatus } from './git-status'

const GIT = '/Library/Developer/CommandLineTools/usr/bin/git'

function runner(result: CommandResult) {
  return vi.fn<CommandRunner>(async () => result)
}

const base = {
  realpath: async (path: string) => `/real${path}`,
  hasGitMarker: async () => true,
  locate: async () => GIT,
  env: {
    HOME: '/Users/me',
    USER: 'me',
    LANG: 'en_GB.UTF-8',
    LC_ALL: 'en_GB.UTF-8',
    LC_CTYPE: 'UTF-8',
    TMPDIR: '/var/folders/x',
    PATH: '/opt/homebrew/bin:/usr/bin:/bin:/usr/bin/:/usr/sbin',
    SHELL: '/bin/zsh',
    GIT_DIR: '/elsewhere/.git',
    GIT_WORK_TREE: '/elsewhere',
    GIT_CONFIG_PARAMETERS: "'core.pager=evil'",
    ELECTRON_RUN_AS_NODE: '1'
  }
}

describe('readGitStatus', () => {
  it('runs exactly AD-31’s one command, by absolute path, in the real root, with a 10s timeout', async () => {
    const run = runner({ ok: true, stdout: '' })
    expect(await readGitStatus('/p/proj', { ...base, run })).toEqual({ kind: 'output', stdout: '' })
    expect(run).toHaveBeenCalledTimes(1)
    const [command, args, options] = run.mock.calls[0]!
    expect(command).toBe(GIT)
    expect(args).toEqual([
      '--no-optional-locks',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.untrackedCache=false',
      '-c',
      'status.renames=true',
      'status',
      '--porcelain=v2',
      '-z',
      '--untracked-files=all',
      '--ignore-submodules=dirty'
    ])
    expect(args).toEqual([...GIT_STATUS_ARGS])
    expect(options.cwd).toBe('/real/p/proj')
    expect(options.timeoutMs).toBe(10_000)
  })

  it('passes the allowlist and the four GIT_* it sets, and nothing else', async () => {
    const run = runner({ ok: true, stdout: '' })
    await readGitStatus('/p/proj', { ...base, run })
    expect(run.mock.calls[0]![2].env).toEqual({
      HOME: '/Users/me',
      USER: 'me',
      LANG: 'en_GB.UTF-8',
      LC_ALL: 'en_GB.UTF-8',
      LC_CTYPE: 'UTF-8',
      TMPDIR: '/var/folders/x',
      PATH: '/opt/homebrew/bin:/bin:/usr/sbin',
      GIT_CEILING_DIRECTORIES: '/real/p',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_NO_LAZY_FETCH: '1',
      GIT_TERMINAL_PROMPT: '0'
    })
  })

  it('leaves out an allowlisted variable that is not set', () => {
    expect(gitEnvironment({ PATH: '/usr/bin' }, '/a/b')).toEqual({
      PATH: '',
      GIT_CEILING_DIRECTORIES: '/a',
      GIT_OPTIONAL_LOCKS: '0',
      GIT_NO_LAZY_FETCH: '1',
      GIT_TERMINAL_PROMPT: '0'
    })
  })

  it('says not a repository, and runs nothing, when the real root has no .git', async () => {
    const run = runner({ ok: true, stdout: '' })
    const locate = vi.fn(async () => GIT)
    expect(await readGitStatus('/p/nested', { ...base, run, locate, hasGitMarker: async () => false })).toEqual({
      kind: 'not-repo'
    })
    expect(run).not.toHaveBeenCalled()
    expect(locate).not.toHaveBeenCalled()
  })

  it('says not a repository when the root has no real path', async () => {
    const run = runner({ ok: true, stdout: '' })
    expect(await readGitStatus('/gone', { ...base, run, realpath: async () => null })).toEqual({ kind: 'not-repo' })
    expect(run).not.toHaveBeenCalled()
  })

  it('says git not available, and runs nothing, when no candidate is a real git', async () => {
    const run = runner({ ok: true, stdout: '' })
    expect(await readGitStatus('/p/proj', { ...base, run, locate: async () => null })).toEqual({ kind: 'no-git' })
    expect(run).not.toHaveBeenCalled()
  })

  it('never spawns the stub, bare git or a script, with only those on the machine', async () => {
    const run = runner({ ok: true, stdout: '' })
    const files: Record<string, string> = {
      '/usr/bin/git': '\xcf\xfa\xed\xfe....',
      '/opt/homebrew/bin/git': '#!/bin/sh\nexec /usr/bin/git "$@"\n'
    }
    const locate = () =>
      locateGit({
        path: '/usr/bin:bin:.:/opt/homebrew/bin',
        isFile: async (path) => files[path] !== undefined,
        realpath: async (path) => (files[path] === undefined ? null : path),
        readHead: async (path) => (files[path] === undefined ? null : Buffer.from(files[path]!, 'latin1'))
      })
    expect(await readGitStatus('/p/proj', { ...base, run, locate })).toEqual({ kind: 'no-git' })
    expect(run).not.toHaveBeenCalled()
  })

  it.each([
    [{ ok: false, kind: 'timeout' }, { kind: 'failed', reason: 'too slow' }],
    [{ ok: false, kind: 'output-too-large' }, { kind: 'failed', reason: 'too many files' }],
    [{ ok: false, kind: 'exit', code: 128 }, { kind: 'failed', reason: 'git exit 128' }],
    [{ ok: false, kind: 'exit', signal: 'SIGKILL' }, { kind: 'failed', reason: 'git exit SIGKILL' }],
    [{ ok: false, kind: 'spawn', errno: 'ENOENT' }, { kind: 'no-git' }]
  ] as const)('maps %o to %o', async (result, expected) => {
    expect(await readGitStatus('/p/proj', { ...base, run: runner(result as CommandResult) })).toEqual(expected)
  })
})

describe('hasGitMarker on a real file system', () => {
  const root = mkdtempSync(join(tmpdir(), 'git-marker-'))
  afterAll(() => rmSync(root, { recursive: true, force: true }))

  it('takes a .git directory or a gitdir: file, and nothing else', async () => {
    const dir = join(root, 'dir')
    mkdirSync(join(dir, '.git'), { recursive: true })
    const worktree = join(root, 'worktree')
    mkdirSync(worktree)
    writeFileSync(join(worktree, '.git'), 'gitdir: /somewhere/.git/worktrees/x\n')
    const junk = join(root, 'junk')
    mkdirSync(junk)
    writeFileSync(join(junk, '.git'), 'not a pointer')
    const none = join(root, 'none')
    mkdirSync(none)

    expect(await hasGitMarker(dir)).toBe(true)
    expect(await hasGitMarker(worktree)).toBe(true)
    expect(await hasGitMarker(junk)).toBe(false)
    expect(await hasGitMarker(none)).toBe(false)
  })
})
