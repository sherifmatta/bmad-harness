import type {
  AgentView,
  HarnessError,
  InstallSnapshot,
  MenuEntryView
} from '../../shared/install'
import type { InstallSource, ResolverFailure } from '../sources/install/resolvers'
import type { ResolvedMenuEntry } from '../sources/install/schema'

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

function resolverError(failure: ResolverFailure, subject: string, detail: string): HarnessError {
  return {
    code: RESOLVER_CODES[failure.kind],
    message: `${subject} · ${RESOLVER_WORDS[failure.kind]}`,
    detail
  }
}

export function createInstallProjection({
  source,
  onChange,
  onDiagnostic
}: {
  source: InstallSource
  onChange: (snapshot: InstallSnapshot) => void
  /** A developer-facing line per failure; never crosses the bridge. */
  onDiagnostic?: (line: string) => void
}): InstallProjection {
  let revision = 0
  let agents: AgentView[] = []
  const menus = new Map<string, ResolvedMenuEntry[]>()
  let errors: HarnessError[] = []
  let disposed = false

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
      errors: errors.map((error) => ({ ...error }))
    }
  }

  let lastEmitted = JSON.stringify(content())

  const snapshot = (): InstallSnapshot => ({ revision, ...content() })

  const diagnose = (code: string, diagnostic: string): void => {
    onDiagnostic?.(`${code} · ${diagnostic}`)
  }

  async function resolveAll(): Promise<void> {
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
