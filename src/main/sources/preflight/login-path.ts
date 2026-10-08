import { homedir } from 'node:os'
import { delimiter } from 'node:path'
import { runCommand } from '../install/run-command'
import type { CommandRunner } from '../install/run-command'

/**
 * The path the user's own shell has, for the tools the harness spawns.
 *
 * An app opened from Finder or the Dock is started by launchd, whose path is
 * `/usr/bin:/bin:/usr/sbin:/sbin`: nowhere `claude` or `uv` is installed. Both
 * would answer ENOENT, and the preflight would say they are missing on a machine
 * that has them. A terminal launch (`npm run dev`) hides it, because it inherits
 * the shell's path. So the path is asked of a login shell once, at startup, and
 * every later spawn inherits it through `process.env`.
 */

/** A shell that reads a heavy rc file still answers well inside this; past it the usual directories stand in. */
export const LOGIN_PATH_TIMEOUT_MS = 5_000

/** The markers that bracket the printed `PATH`. */
export const START = '<<HARNESS_PATH>>'
export const END = '<<HARNESS_END>>'

/** Where the tools install when no shell is asked: Homebrew, and the `claude` and `uv` installers. */
function usualDirectories(home: string): string[] {
  return [
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    `${home}/.local/bin`,
    `${home}/.cargo/bin`
  ]
}

export type LoginPathOptions = {
  run?: CommandRunner
  env?: NodeJS.ProcessEnv
  home?: string
  platform?: NodeJS.Platform
}

/** The `PATH` between the markers, so whatever an rc file prints around it is not taken for a directory. */
function between(stdout: string): string[] {
  const from = stdout.indexOf(START)
  const to = stdout.indexOf(END, from + START.length)
  if (from === -1 || to === -1) {
    return []
  }
  return stdout.slice(from + START.length, to).split(delimiter)
}

/**
 * The path to spawn under: the login shell's entries first, then what the app
 * already had, then the usual install directories, each once. A shell that does
 * not answer costs only its own entries.
 */
export async function resolveLoginPath({
  run = runCommand,
  env = process.env,
  home = homedir(),
  platform = process.platform
}: LoginPathOptions = {}): Promise<string> {
  const shell = env.SHELL && env.SHELL.length > 0 ? env.SHELL : '/bin/zsh'
  // `-l` for the profile files, `-i` for the rc file: a path is as often set in one as the other.
  const result =
    platform === 'win32'
      ? { ok: false as const, kind: 'spawn' as const }
      : await run(shell, ['-ilc', `printf '%s' "${START}$PATH${END}"`], {
          timeoutMs: LOGIN_PATH_TIMEOUT_MS,
          cwd: home,
          env
        })

  const fromShell = result.ok ? between(result.stdout) : []
  const own = (env.PATH ?? '').split(delimiter)
  const entries = [...fromShell, ...own, ...usualDirectories(home)]
  return [...new Set(entries.filter((entry) => entry.length > 0))].join(delimiter)
}

/** Make every later spawn find the user's tools. A failure leaves the path as it was, plus the usual directories. */
export async function inheritLoginPath(options: LoginPathOptions = {}): Promise<void> {
  const env = options.env ?? process.env
  env.PATH = await resolveLoginPath({ ...options, env })
}
