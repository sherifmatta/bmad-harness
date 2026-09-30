import type { AgentView } from '../../../shared/install'

/**
 * One run of tiles that share a `module` and a `team`.
 *
 * `key` identifies the group and is never shown; `heading` is what a heading
 * would read — `module`, or `module · team` — lower case as the roster gave it.
 */
export type TileGroup = { key: string; heading: string; agents: AgentView[] }

/**
 * The tiles grouped by `(module, team)` (FR22, UX-DR16), and ordered by nothing
 * else. Groups appear in the order of the first agent in each and agents keep
 * the order of `snapshot.agents` inside their group: no relevance sort, no
 * recency sort, no pinning and no alphabetical order, at any level.
 *
 * A `team` that is empty once trimmed is an absent one, so a roster that writes
 * `team: ''` or `team: '  '` does not draw a heading that ends in a dangling
 * separator; a real team is keyed and headed by its trimmed text. Pure and non-mutating.
 */
export function groupAgents(agents: readonly AgentView[]): TileGroup[] {
  const groups = new Map<string, TileGroup>()

  for (const agent of agents) {
    const team = agent.team?.trim() ? agent.team.trim() : null
    const key = JSON.stringify([agent.module, team])
    const group = groups.get(key)
    if (group === undefined) {
      groups.set(key, {
        key,
        heading: team === null ? agent.module : `${agent.module} · ${team}`,
        agents: [agent]
      })
    } else {
      group.agents.push(agent)
    }
  }

  return [...groups.values()]
}

/** The display order: the groups flattened. It is the order arrows travel in. */
export function displayOrder(groups: readonly TileGroup[]): AgentView[] {
  return groups.flatMap((group) => group.agents)
}

/**
 * A heading renders only when there are two or more groups. A lone group has
 * nothing to disambiguate, and a heading over it would be a row above the first
 * tile that says nothing.
 */
export function showsHeadings(groups: readonly TileGroup[]): boolean {
  return groups.length >= 2
}

/**
 * The current persona: the chosen id if the roster still holds it, else the
 * topmost tile, else nobody. Derived at render and never stored, so a roster
 * change that drops the current agent lands in one frame with no stale header.
 */
export function currentAgent(order: readonly AgentView[], currentId: string | null): AgentView | null {
  return order.find((agent) => agent.id === currentId) ?? order[0] ?? null
}
