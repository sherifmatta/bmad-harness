import type {
  AgentView,
  HarnessError,
  InstallSnapshot,
  MenuEntryView
} from '../../shared/install'
import type { InstallSource, ResolverFailure } from '../sources/install/resolvers'
import type { ResolvedMenuEntry } from '../sources/install/schema'
import type { PrerequisiteChecks, ToolCheck } from '../sources/preflight/tools'

/**
 * The install read model: the team and each persona's menu, as the last good
 * answer the resolvers gave.
 *
 * The degrade rule is one rule. A resolver that fails, times out or answers in
 * a shape it should not leaves the last good roster (or the last good menu of
 * that agent) in place and adds one named error. The error set is recomputed on
 * every refresh, so the next success clears it. The roster is never empty
 * because of a failure without an error saying so.
 *
 * Preflight is folded in here for the same reason the roster is: the verdict
 * is a function of the roster plus two facts about tools, and one snapshot
 * keeps them from disagreeing. The tools are asked once per projection while
 * they pass; an answer with any failure in it is not kept, so the next refresh
 * asks again. If `uv` did not pass the resolvers are not run at all —
 * spawning them could only produce a second, noisier form of the same fact.
 *
 * Whether a menu entry runs a skill or a prompt is held here, keyed by agent
 * then code, and is reachable only through `menuEntry`. No snapshot carries it.
 */

export type InstallProjection = {
  snapshot(): InstallSnapshot
  refresh(): Promise<void>
  /** The main-side lookup a menu dispatch will call. */
  menuEntry(agentId: string, code: string): ResolvedMenuEntry | undefined
  dispose(): void
}

type Content = Omit<InstallSnapshot, 'revision'>

const RESOLVER_CODES = {
  'invocation-failed': 'resolver/invocation-failed',
  timeout: 'resolver/timeout',
  'unexpected-shape': 'resolver/unexpected-shape'
} as const

const RESOLVER_WORDS = {
  'invocation-failed': 'resolver failed',
  timeout: 'resolver timed out',
  'unexpected-shape': 'resolver answered in an unexpected shape'
} as const

/** The fixed lines. Each names the fact and its remedy (EXPERIENCE.md, preflight). */
const PREFLIGHT_MESSAGES = {
  'claude-missing': 'claude · not on path · install the claude cli',
  'claude-unauthenticated': 'claude · not signed in · run claude once to sign in',
  'uv-missing': 'uv · not found · install uv',
  'uv-python-old': 'uv · resolves no python 3.11 or newer · install a 3.11+ toolchain for uv'
} as const

/**
 * What was looked for, where, why a correct install can still resolve none, and
 * what would change it — all four, in the message itself (FR8).
 */
const NO_AGENTS: HarnessError = {
  code: 'preflight/no-agents',
  message:
    'no agents · looked for agents in this project, under --setting-sources project,local · a bmad install scoped to the user rather than the project resolves none there · install bmad into this project, or open one that has it'
}

function toolError(tool: 'claude' | 'uv', check: ToolCheck): HarnessError | null {
  if (check.ok) {
    return null
  }
  const code = `preflight/${check.kind}`
  if (check.kind === 'check-failed') {
    return {
      code,
      message: `${tool} · check did not complete`,
      ...(check.detail !== undefined ? { detail: check.detail } : {})
    }
  }
  return {
    code,
    message: PREFLIGHT_MESSAGES[check.kind],
    ...(check.detail !== undefined ? { detail: check.detail } : {})
  }
}

function resolverError(failure: ResolverFailure, subject: string, detail: string): HarnessError {
  return {
    code: RESOLVER_CODES[failure.kind],
    message: `${subject} · ${RESOLVER_WORDS[failure.kind]}`,
    detail
  }
}

export function createInstallProjection({
  source,
  checks,
  onChange,
  onDiagnostic
}: {
  source: InstallSource
  /** Absent means both tools count as passing. */
  checks?: PrerequisiteChecks
  onChange: (snapshot: InstallSnapshot) => void
  /** A developer-facing line per failure; never crosses the bridge. */
  onDiagnostic?: (line: string) => void
}): InstallProjection {
  let revision = 0
  let agents: AgentView[] = []
  const menus = new Map<string, ResolvedMenuEntry[]>()
  let errors: HarnessError[] = []
  let preflight: HarnessError[] = []
  let disposed = false

  type ToolVerdict = { uvPassed: boolean; errors: HarnessError[] }
  let verdict: Promise<ToolVerdict> | null = null

  /**
   * Ask both tools in parallel and keep the answer for the window's life, but
   * only a clean one. A verdict with any error in it is dropped as soon as it
   * is known, so the next refresh asks again: the remedy it names (install uv,
   * sign in) can only work if the answer can change, and a check that could not
   * conclude is not an answer at all.
   */
  function toolVerdict(checks: PrerequisiteChecks): Promise<ToolVerdict> {
    if (verdict !== null) {
      return verdict
    }
    const asked: Promise<ToolVerdict> = (async () => {
      const settle = async (ask: () => Promise<ToolCheck>): Promise<ToolCheck> => {
        try {
          return await ask()
        } catch (error) {
          // A check that throws could not conclude; the cause stays in main.
          return {
            ok: false,
            kind: 'check-failed',
            detail: 'output was not the expected shape',
            diagnostic: error instanceof Error ? error.message : String(error)
          }
        }
      }
      const [claude, uv] = await Promise.all([
        settle(() => checks.checkClaude()),
        settle(() => checks.checkUv())
      ])
      const found: HarnessError[] = []
      for (const [tool, check] of [
        ['claude', claude],
        ['uv', uv]
      ] as const) {
        const error = toolError(tool, check)
        if (error !== null && !check.ok) {
          found.push(error)
          diagnose(error.code, check.diagnostic)
        }
      }
      return { uvPassed: uv.ok, errors: found }
    })()
    verdict = asked
    const drop = (): void => {
      if (verdict === asked) {
        verdict = null
      }
    }
    // Registered before the caller awaits `asked`, so the drop lands first.
    void asked.then((answer) => {
      if (answer.errors.length > 0) {
        drop()
      }
    }, drop)
    return asked
  }

  const content = (): Content => {
    const menuViews: Record<string, MenuEntryView[]> = {}
    for (const agent of agents) {
      menuViews[agent.id] = (menus.get(agent.id) ?? []).map(({ code, description }) => ({
        code,
        description
      }))
    }
    return {
      agents: agents.map((agent) => ({ ...agent })),
      menus: menuViews,
      errors: errors.map((error) => ({ ...error })),
      preflight: preflight.map((error) => ({ ...error }))
    }
  }

  let lastEmitted = JSON.stringify(content())

  const snapshot = (): InstallSnapshot => ({ revision, ...content() })

  const diagnose = (code: string, diagnostic: string): void => {
    onDiagnostic?.(`${code} · ${diagnostic}`)
  }

  async function resolveAll(): Promise<void> {
    // With no checks supplied both tools count as passing, and nothing is awaited.
    const tools: ToolVerdict =
      checks === undefined ? { uvPassed: true, errors: [] } : await toolVerdict(checks)
    if (disposed) {
      return
    }
    if (!tools.uvPassed) {
      // The cause is known and named; asking the resolvers could only repeat it.
      errors = []
      preflight = tools.errors
      return
    }

    const roster = await source.resolveRoster()
    if (disposed) {
      return
    }
    const next: HarnessError[] = []

    if (!roster.ok) {
      const error = resolverError(roster.failure, 'roster', roster.failure.detail)
      next.push(error)
      diagnose(error.code, roster.failure.diagnostic)
      errors = next
      preflight = tools.errors
      return
    }

    const resolved = await Promise.all(
      roster.agents.map(async (agent) => ({
        agent,
        result: await source.resolveMenu(agent.id, agent.name)
      }))
    )
    if (disposed) {
      return
    }

    agents = roster.agents
    const present = new Set(agents.map((agent) => agent.id))
    for (const id of [...menus.keys()]) {
      if (!present.has(id)) {
        menus.delete(id)
      }
    }

    for (const { agent, result } of resolved) {
      if (!result.ok) {
        const error = resolverError(
          result.failure,
          `menu · ${agent.name}`,
          `${agent.id} · ${result.failure.detail}`
        )
        next.push(error)
        diagnose(error.code, result.failure.diagnostic)
        continue
      }
      menus.set(agent.id, result.entries)
      for (const problem of result.problems) {
        next.push({ code: 'menu/entry-malformed', message: problem.message, detail: agent.id })
      }
    }
    errors = next
    preflight =
      agents.length === 0 && next.length === 0 ? [...tools.errors, { ...NO_AGENTS }] : tools.errors
  }

  async function run(): Promise<void> {
    try {
      await resolveAll()
    } catch (error) {
      if (disposed) {
        return
      }
      const name = error instanceof Error ? error.constructor.name : 'unknown'
      // The cause is for the developer's terminal only; it never reaches the
      // snapshot.
      diagnose('install/unexpected', error instanceof Error ? error.message : String(error))
      errors = [{ code: 'install/unexpected', message: 'install · unexpected failure', detail: name }]
    }
    if (disposed) {
      return
    }
    const view = JSON.stringify(content())
    if (view === lastEmitted) {
      return
    }
    lastEmitted = view
    revision += 1
    onChange(snapshot())
  }

  let inFlight: Promise<void> | null = null
  let trailing: Promise<void> | null = null

  function refresh(): Promise<void> {
    if (disposed) {
      return Promise.resolve()
    }
    if (inFlight === null) {
      inFlight = run().finally(() => {
        inFlight = null
      })
      return inFlight
    }
    // A change arriving mid-refresh earns exactly one more, however many arrive.
    if (trailing === null) {
      trailing = inFlight.then(() => {
        trailing = null
        return refresh()
      })
    }
    return trailing
  }

  return {
    snapshot,
    refresh,
    menuEntry: (agentId, code) => menus.get(agentId)?.find((entry) => entry.code === code),
    dispose() {
      disposed = true
    }
  }
}
