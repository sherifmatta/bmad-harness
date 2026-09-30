import { tmpdir } from 'node:os'
import { runCommand } from '../install/run-command'
import type { CommandResult, CommandRunner } from '../install/run-command'

/**
 * The two tool prerequisites: is `claude` on the path and signed in, and does
 * `uv` resolve a Python the resolvers can run under (FR7, AD-17).
 *
 * This module owns "is this tool usable" and the closed vocabulary of `detail`
 * strings that goes with it. Each check answers with data — a kind, an optional
 * safe detail, and a `diagnostic` that is for the developer's terminal and
 * never crosses the bridge. Stderr is dropped by the runner, so nothing here
 * can leak it.
 *
 * Neither tool is asked for anything that starts a session, reads a credential
 * or downloads a runtime: `claude auth status` reports a state, and
 * `uv python find` only looks at what is already installed.
 */

/** How long one tool process may run. Both answer in well under a second. */
export const PREFLIGHT_TIMEOUT_MS = 15_000

/** The oldest Python the resolvers declare (`requires-python`). */
const MIN_PYTHON = '>=3.11'

/** What `uv python find --show-version` prints, and nothing wider. */
const VERSION = /^\d+\.\d+(\.\d+)?$/

/** A spawn error code is an errno name; anything else is not shown. */
const ERRNO = /^[A-Za-z0-9_]{1,32}$/

export type ToolFailureKind =
  | 'claude-missing'
  | 'claude-unauthenticated'
  | 'uv-missing'
  | 'uv-python-old'
  | 'check-failed'

export type ToolCheck =
  | { ok: true }
  | { ok: false; kind: ToolFailureKind; detail?: string; diagnostic: string }

export type PrerequisiteChecks = {
  checkClaude(): Promise<ToolCheck>
  checkUv(): Promise<ToolCheck>
}

export type PrerequisiteOptions = {
  run?: CommandRunner
  timeoutMs?: number
  cwd?: string
  env?: NodeJS.ProcessEnv
}

type Failed = Extract<CommandResult, { ok: false }>

/** The closed `detail` vocabulary for a process that did not answer. */
function detailOf(result: Failed, timeoutMs: number): string {
  switch (result.kind) {
    case 'timeout':
      return `exceeded ${timeoutMs}ms`
    case 'spawn':
      return `spawn ${result.errno !== undefined && ERRNO.test(result.errno) ? result.errno : 'failed'}`
    case 'output-too-large':
      return 'output was not the expected shape'
    case 'exit':
      return result.code !== undefined
        ? `exit ${result.code}`
        : result.signal !== undefined
          ? `signal ${result.signal}`
          : 'exit unknown'
  }
}

function inconclusive(subject: string, detail: string): ToolCheck {
  return { ok: false, kind: 'check-failed', detail, diagnostic: `${subject} · ${detail}` }
}

export function createPrerequisiteChecks({
  run = runCommand,
  timeoutMs = PREFLIGHT_TIMEOUT_MS,
  cwd = tmpdir(),
  env = process.env
}: PrerequisiteOptions = {}): PrerequisiteChecks {
  const options = { timeoutMs, cwd, env }

  return {
    async checkClaude() {
      const subject = 'claude auth status'
      const result = await run('claude', ['auth', 'status'], options)

      if (!result.ok) {
        if (result.kind === 'spawn' && result.errno === 'ENOENT') {
          return { ok: false, kind: 'claude-missing', diagnostic: `${subject} · spawn ENOENT` }
        }
        // Observed: a signed-out config exits 1. `runCommand` drops stdout on a
        // non-zero exit, so the exit code alone has to mean "signed out".
        if (result.kind === 'exit' && result.code === 1) {
          return {
            ok: false,
            kind: 'claude-unauthenticated',
            diagnostic: `${subject} · exit 1`
          }
        }
        return inconclusive(subject, detailOf(result, timeoutMs))
      }

      let answer: unknown
      try {
        answer = JSON.parse(result.stdout)
      } catch {
        return inconclusive(subject, 'output was not json')
      }
      const loggedIn =
        typeof answer === 'object' && answer !== null
          ? (answer as { loggedIn?: unknown }).loggedIn
          : undefined
      if (typeof loggedIn !== 'boolean') {
        return inconclusive(subject, 'output was not the expected shape')
      }
      return loggedIn
        ? { ok: true }
        : {
            ok: false,
            kind: 'claude-unauthenticated',
            diagnostic: `${subject} · loggedIn false`
          }
    },

    async checkUv() {
      const subject = 'uv python find'
      const constrained = await run(
        'uv',
        ['python', 'find', '--no-project', '--show-version', MIN_PYTHON],
        options
      )
      if (constrained.ok) {
        return { ok: true }
      }
      if (constrained.kind === 'spawn' && constrained.errno === 'ENOENT') {
        return { ok: false, kind: 'uv-missing', diagnostic: `${subject} · spawn ENOENT` }
      }
      // Only a real non-zero exit code means "nothing at 3.11"; a process killed
      // by a signal never answered.
      if (constrained.kind !== 'exit' || constrained.code === undefined) {
        return inconclusive(subject, detailOf(constrained, timeoutMs))
      }

      // Nothing at 3.11 or newer. Name what it did find, so the line says more
      // than "too old".
      const any = await run('uv', ['python', 'find', '--no-project', '--show-version'], options)
      if (!any.ok) {
        if (any.kind === 'exit' && any.code !== undefined) {
          return {
            ok: false,
            kind: 'uv-python-old',
            detail: 'no python found',
            diagnostic: `${subject} · no python found`
          }
        }
        return inconclusive(subject, detailOf(any, timeoutMs))
      }
      const version = any.stdout.trim()
      if (!VERSION.test(version)) {
        return inconclusive(subject, 'output was not the expected shape')
      }
      // A version at 3.11 or newer contradicts the failed constrained find, so
      // neither answer is to be believed.
      const [major, minor] = version.split('.').map(Number)
      if (major > 3 || (major === 3 && minor >= 11)) {
        return inconclusive(subject, 'output was not the expected shape')
      }
      return {
        ok: false,
        kind: 'uv-python-old',
        detail: `python ${version}`,
        diagnostic: `${subject} · python ${version}`
      }
    }
  }
}
