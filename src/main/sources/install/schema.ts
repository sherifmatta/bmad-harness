import type { AgentView } from '../../../shared/install'

/**
 * What a resolver said, and whether to believe it. Pure validators with no I/O,
 * so the whole failure taxonomy can be exercised without a process.
 *
 * Every rejection carries one `detail` built here from a closed vocabulary: a
 * dotted path to the failing field and what was expected there. Agent ids are
 * untrusted project content, so an id only ever reaches a path after it has
 * passed `isSafeAgentId`.
 */

/** One menu entry as main holds it: the decision the renderer never sees. */
export type ResolvedMenuEntry = {
  code: string
  description: string
  action: { kind: 'skill'; skill: string } | { kind: 'prompt'; prompt: string }
}

/** A dropped entry, named. The projection adds the agent id as `detail`. */
export type MenuProblem = { message: string }

export type ParsedRoster = { ok: true; agents: AgentView[] } | { ok: false; detail: string }

export type ParsedMenu =
  | { ok: true; entries: ResolvedMenuEntry[]; problems: MenuProblem[] }
  | { ok: false; detail: string }

const SAFE_AGENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * The agent id is the only thing composed into a filesystem path, and it comes
 * from a file the user's project controls.
 */
export function isSafeAgentId(id: string): boolean {
  return SAFE_AGENT_ID.test(id) && !id.includes('..')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** The six fields the roster carries, in the order they are checked. */
const REQUIRED_NON_EMPTY = ['module', 'name', 'title'] as const
const REQUIRED_STRING = ['icon', 'description'] as const

/**
 * `resolve_config.py --key agents` prints `{}` when the merged config has no
 * agents at all, so an absent `agents` key and `agents: {}` are both the valid
 * empty roster. Anything wrong with any single entry rejects the whole answer:
 * a roster that silently lacks a colleague is the failure this guards against.
 */
export function parseRoster(value: unknown): ParsedRoster {
  if (!isRecord(value)) {
    return { ok: false, detail: 'output · expected an object' }
  }
  const agents = value.agents
  if (agents === undefined) {
    return { ok: true, agents: [] }
  }
  if (!isRecord(agents)) {
    return { ok: false, detail: 'agents · expected an object' }
  }

  // Before any per-field rule: no path is composed from an unsafe id, and the
  // id is never echoed, so a hostile one cannot reach `detail`.
  const ids = Object.keys(agents)
  if (!ids.every(isSafeAgentId)) {
    return { ok: false, detail: 'agents · unsafe agent id' }
  }

  const parsed: AgentView[] = []
  for (const id of ids) {
    const entry = agents[id]
    const at = `agents.${id}`
    if (!isRecord(entry)) {
      return { ok: false, detail: `${at} · expected an object` }
    }
    for (const field of REQUIRED_NON_EMPTY) {
      if (!isNonEmptyString(entry[field])) {
        return { ok: false, detail: `${at}.${field} · expected a non-empty string` }
      }
    }
    for (const field of REQUIRED_STRING) {
      if (typeof entry[field] !== 'string') {
        return { ok: false, detail: `${at}.${field} · expected a string` }
      }
    }
    if (entry.team !== undefined && typeof entry.team !== 'string') {
      return { ok: false, detail: `${at}.team · expected a string` }
    }

    // Unknown fields are dropped, not forwarded.
    parsed.push({
      id,
      module: entry.module as string,
      ...(typeof entry.team === 'string' ? { team: entry.team } : {}),
      name: entry.name as string,
      title: entry.title as string,
      icon: entry.icon as string,
      description: entry.description as string
    })
  }

  return { ok: true, agents: parsed }
}

/**
 * `resolve_customization.py --key agent.menu` prints `{"agent.menu": [...]}`,
 * or `{}` when the key is absent — a valid empty menu. An entry needs a code, a
 * description and exactly one non-empty `skill` or `prompt`; one that has not
 * is dropped and named, and never voids its neighbours.
 */
export function parseMenu(value: unknown, agentName: string): ParsedMenu {
  if (!isRecord(value)) {
    return { ok: false, detail: 'output · expected an object' }
  }
  const menu = value['agent.menu']
  if (menu === undefined) {
    return { ok: true, entries: [], problems: [] }
  }
  if (!Array.isArray(menu)) {
    return { ok: false, detail: 'agent.menu · expected an array' }
  }

  const entries: ResolvedMenuEntry[] = []
  const problems: MenuProblem[] = []
  const drop = (subject: string, reason: string): void => {
    problems.push({ message: `menu · ${agentName} · entry ${subject} ${reason}` })
  }

  const seen = new Set<string>()
  const keep = (entry: ResolvedMenuEntry): void => {
    // The first entry with a code wins; a later one would only shadow it.
    if (seen.has(entry.code)) {
      drop(entry.code, 'has a duplicate code')
      return
    }
    seen.add(entry.code)
    entries.push(entry)
  }

  menu.forEach((raw: unknown, index) => {
    const entry = isRecord(raw) ? raw : {}
    if (!isNonEmptyString(entry.code)) {
      drop(String(index + 1), 'has no code')
      return
    }
    const code = entry.code
    if (!isNonEmptyString(entry.description)) {
      drop(code, 'has no description')
      return
    }
    const hasSkill = isNonEmptyString(entry.skill)
    const hasPrompt = isNonEmptyString(entry.prompt)
    if (hasSkill && hasPrompt) {
      drop(code, 'has both skill and prompt')
    } else if (hasSkill) {
      keep({
        code,
        description: entry.description,
        action: { kind: 'skill', skill: entry.skill as string }
      })
    } else if (hasPrompt) {
      keep({
        code,
        description: entry.description,
        action: { kind: 'prompt', prompt: entry.prompt as string }
      })
    } else {
      drop(code, 'has neither skill nor prompt')
    }
  })

  return { ok: true, entries, problems }
}
