import { access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentView } from '../../../shared/install'
import { runCommand } from './run-command'
import type { CommandResult, CommandRunner } from './run-command'
import { isSafeAgentId, parseMenu, parseRoster } from './schema'
import type { MenuProblem, ResolvedMenuEntry } from './schema'

/**
 * The install source: BMad's own resolvers, run as subprocesses, with every
 * answer bounded and validated before anything above uses it (FR3, FR4, AD-8).
 *
 * Configuration comes only from the resolvers. Nothing here opens a
 * configuration file or layers one over another.
 */

/** How long one resolver may run. They answer in well under a second. */
export const RESOLVER_TIMEOUT_MS = 15_000

/**
 * Why a resolver's answer was not used. `detail` is safe to show, built from a
 * closed vocabulary; `diagnostic` is for the developer's terminal and stays in
 * main.
 */
export type ResolverFailure = {
  kind: 'invocation-failed' | 'timeout' | 'unexpected-shape'
  detail: string
  diagnostic: string
}

export type RosterResult = { ok: true; agents: AgentView[] } | { ok: false; failure: ResolverFailure }

export type MenuResult =
  | { ok: true; entries: ResolvedMenuEntry[]; problems: MenuProblem[] }
  | { ok: false; failure: ResolverFailure }

export type InstallSource = {
  resolveRoster(): Promise<RosterResult>
  resolveMenu(agentId: string, agentName?: string): Promise<MenuResult>
}

export type InstallSourceOptions = {
  projectRoot: string
  run?: CommandRunner
  timeoutMs?: number
  cwd?: string
  /** Whether a path exists. Injectable so tests need no filesystem. */
  exists?: (path: string) => Promise<boolean>
}

const pathExists = (path: string): Promise<boolean> =>
  access(path).then(
    () => true,
    () => false
  )

function failureOf(result: Extract<CommandResult, { ok: false }>, timeoutMs: number): {
  kind: ResolverFailure['kind']
  detail: string
} {
  switch (result.kind) {
    case 'timeout':
      return { kind: 'timeout', detail: `exceeded ${timeoutMs}ms` }
    case 'spawn':
      return { kind: 'invocation-failed', detail: `spawn ${result.errno ?? 'failed'}` }
    case 'output-too-large':
      return { kind: 'invocation-failed', detail: 'output too large' }
    case 'exit':
      return {
        kind: 'invocation-failed',
        detail:
          result.code !== undefined
            ? `exit ${result.code}`
            : result.signal !== undefined
              ? `signal ${result.signal}`
              : 'exit unknown'
      }
  }
}

export function createInstallSource({
  projectRoot,
  run = runCommand,
  timeoutMs = RESOLVER_TIMEOUT_MS,
  cwd = tmpdir(),
  exists = pathExists
}: InstallSourceOptions): InstallSource {
  const scripts = join(projectRoot, '_bmad', 'scripts')

  /**
   * Run one resolver and return its parsed JSON, or the reason it is not to be
   * believed. The one place where "what a resolver said" is decided.
   */
  async function resolve(
    script: string,
    args: string[]
  ): Promise<{ ok: true; json: unknown } | { ok: false; failure: ResolverFailure }> {
    const result = await run(
      'uv',
      ['run', '--no-project', '--quiet', join(scripts, script), ...args],
      { timeoutMs, cwd, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } }
    )
    if (!result.ok) {
      const { kind, detail } = failureOf(result, timeoutMs)
      return { ok: false, failure: { kind, detail, diagnostic: `${script} · ${detail}` } }
    }
    try {
      return { ok: true, json: JSON.parse(result.stdout) as unknown }
    } catch {
      const detail = 'output was not json'
      return {
        ok: false,
        failure: { kind: 'unexpected-shape', detail, diagnostic: `${script} · ${detail}` }
      }
    }
  }

  function unexpectedShape(script: string, detail: string): { ok: false; failure: ResolverFailure } {
    return {
      ok: false,
      failure: { kind: 'unexpected-shape', detail, diagnostic: `${script} · ${detail}` }
    }
  }

  return {
    async resolveRoster() {
      const script = 'resolve_config.py'
      // A project with no resolver script has nothing to ask, and the answer to
      // "which agents does it resolve" is none. Only the script's path is
      // checked; it is never read.
      if (!(await exists(join(scripts, script)))) {
        return { ok: true, agents: [] }
      }
      const answer = await resolve(script, ['--project-root', projectRoot, '--key', 'agents'])
      if (!answer.ok) {
        return answer
      }
      const roster = parseRoster(answer.json)
      return roster.ok ? roster : unexpectedShape(script, roster.detail)
    },

    async resolveMenu(agentId, agentName = agentId) {
      const script = 'resolve_customization.py'
      // The id becomes part of a path, so it is refused before any process runs.
      if (!isSafeAgentId(agentId)) {
        return unexpectedShape(script, 'agents · unsafe agent id')
      }
      const answer = await resolve(script, [
        '--skill',
        join(projectRoot, '.claude', 'skills', agentId),
        '--project-root',
        projectRoot,
        '--key',
        'agent.menu'
      ])
      if (!answer.ok) {
        return answer
      }
      const menu = parseMenu(answer.json, agentName)
      return menu.ok ? menu : unexpectedShape(script, menu.detail)
    }
  }
}
