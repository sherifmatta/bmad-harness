import { open, realpath as fsRealpath, stat } from 'node:fs/promises'
import { delimiter, dirname, join } from 'node:path'
import { runCommand } from '../install/run-command'
import type { CommandRunner } from '../install/run-command'
import { locateGit } from './git-locator'

/**
 * The project's uncommitted files, as git reports them (Story 9.3, AD-31): one
 * read-only `git status`, run by a real git, and nothing else.
 *
 * - **Not a repository** is decided before git runs, from `<real root>/.git`: a
 *   directory, or a file starting `gitdir: `. A project inside a larger
 *   repository has neither, and git is not asked (it would answer for the outer
 *   one).
 * - **Which git** is `locateGit`'s: a compiled binary by absolute path, never the
 *   `/usr/bin/git` or `/usr/bin/xcrun` stub. None is `git not available`, and
 *   nothing is spawned.
 * - **The one command** is `ARGS`, through `runCommand` with a 10s timeout, in the
 *   project's real path. Its environment is an allowlist: `HOME`, `USER`, `LANG`,
 *   `LC_*`, `TMPDIR`, and `PATH` without `/usr/bin`, plus the four `GIT_*` this
 *   module sets. No other variable reaches it.
 *
 * Read-only by construction: `--no-optional-locks` (and `GIT_OPTIONAL_LOCKS=0`)
 * keeps status from refreshing the index, and the fsmonitor and untracked cache
 * are turned off so no hook or cache is written. What comes back is the raw
 * stdout, for the fold; a failure is a reason from a closed set, never git's
 * stderr (which `runCommand` drops).
 */

/** The one git command the harness ever runs. */
export const GIT_STATUS_ARGS: readonly string[] = [
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
]

/** Measured at 43–47ms on this repository; the bound is for a project far larger, or a disk far slower. */
export const GIT_STATUS_TIMEOUT_MS = 10_000

export type GitStatusResult =
  | { kind: 'not-repo' }
  | { kind: 'no-git' }
  | { kind: 'output'; stdout: string }
  | { kind: 'failed'; reason: string }

export type GitStatusDeps = {
  run?: CommandRunner
  /** The git to run, or `null` when there is none. Never runs anything. */
  locate?: () => Promise<string | null>
  realpath?: (path: string) => Promise<string | null>
  /** Whether `<realRoot>/.git` is a directory or a `gitdir:` file. */
  hasGitMarker?: (realRoot: string) => Promise<boolean>
  /** The environment the allowlist is taken from. */
  env?: NodeJS.ProcessEnv
}

async function realpathOrNull(path: string): Promise<string | null> {
  try {
    return await fsRealpath(path)
  } catch {
    return null
  }
}

const GITDIR_PREFIX = 'gitdir: '

/** Whether `<realRoot>/.git` is a directory, or a file whose first bytes are `gitdir: `. Never rejects. */
export async function hasGitMarker(realRoot: string): Promise<boolean> {
  const marker = join(realRoot, '.git')
  let handle
  try {
    const info = await stat(marker)
    if (info.isDirectory()) {
      return true
    }
    if (!info.isFile()) {
      return false
    }
    handle = await open(marker, 'r')
    const buffer = Buffer.alloc(GITDIR_PREFIX.length)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).toString('utf8') === GITDIR_PREFIX
  } catch {
    return false
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

/** The allowlisted environment git runs under, for a project whose real path is `realRoot`. */
export function gitEnvironment(env: NodeJS.ProcessEnv, realRoot: string): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {}
  for (const name of ['HOME', 'USER', 'LANG', 'TMPDIR']) {
    const value = env[name]
    if (value !== undefined) {
      out[name] = value
    }
  }
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith('LC_') && value !== undefined) {
      out[name] = value
    }
  }
  out.PATH = (env.PATH ?? '')
    .split(delimiter)
    .filter((entry) => entry !== '/usr/bin' && entry !== '/usr/bin/')
    .join(delimiter)
  out.GIT_CEILING_DIRECTORIES = dirname(realRoot)
  out.GIT_OPTIONAL_LOCKS = '0'
  out.GIT_NO_LAZY_FETCH = '1'
  out.GIT_TERMINAL_PROMPT = '0'
  return out
}

/** Read the project's status once. Never rejects. */
export async function readGitStatus(root: string, deps: GitStatusDeps = {}): Promise<GitStatusResult> {
  const run = deps.run ?? runCommand
  const realpath = deps.realpath ?? realpathOrNull
  const marker = deps.hasGitMarker ?? hasGitMarker
  const env = deps.env ?? process.env
  const locate = deps.locate ?? (() => locateGit({ path: env.PATH }))

  try {
    const realRoot = await realpath(root)
    if (realRoot === null || !(await marker(realRoot))) {
      return { kind: 'not-repo' }
    }
    const git = await locate()
    if (git === null) {
      return { kind: 'no-git' }
    }
    const result = await run(git, [...GIT_STATUS_ARGS], {
      timeoutMs: GIT_STATUS_TIMEOUT_MS,
      cwd: realRoot,
      env: gitEnvironment(env, realRoot)
    })
    if (result.ok) {
      return { kind: 'output', stdout: result.stdout }
    }
    switch (result.kind) {
      case 'timeout':
        return { kind: 'failed', reason: 'too slow' }
      case 'output-too-large':
        return { kind: 'failed', reason: 'too many files' }
      case 'spawn':
        return { kind: 'no-git' }
      case 'exit':
        return { kind: 'failed', reason: `git exit ${result.code ?? result.signal ?? 'unknown'}` }
    }
  } catch {
    return { kind: 'failed', reason: 'unexpected output' }
  }
}
