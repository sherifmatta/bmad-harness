import type { InstallProjection } from './projections/install'
import type { ResolvedMenuEntry } from './sources/install/schema'

/**
 * The install projection of each window, kept where the bridges that read the
 * roster can reach it without reaching into one another. The install bridge
 * makes a window's projection and remembers it here; the session bridge asks for
 * a persona's display name when it writes a handoff, so the name is main's own
 * and never one the renderer supplied.
 */
const projections = new Map<number, InstallProjection>()

export function rememberInstall(webContentsId: number, projection: InstallProjection): void {
  projections.set(webContentsId, projection)
}

/** Forget a window's projection, unless a newer one has taken its place. */
export function forgetInstall(webContentsId: number, projection: InstallProjection): void {
  if (projections.get(webContentsId) === projection) {
    projections.delete(webContentsId)
  }
}

/** The roster's display name for an agent id in a window, or `undefined` if the roster has none. */
export function agentNameFor(webContentsId: number, agentId: string): string | undefined {
  const agent = projections.get(webContentsId)?.snapshot().agents.find(({ id }) => id === agentId)
  return agent === undefined || agent.name === '' ? undefined : agent.name
}

/**
 * What a persona's menu code runs, in a window: a skill or a prompt, decided
 * here in main and never sent to the renderer. `undefined` when the roster has
 * no such agent, the agent no such code, or the entry was dropped at discovery.
 */
export function menuEntryFor(
  webContentsId: number,
  agentId: string,
  code: string
): ResolvedMenuEntry | undefined {
  return projections.get(webContentsId)?.menuEntry(agentId, code)
}
