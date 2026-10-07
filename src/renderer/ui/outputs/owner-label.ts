import type { RailRow } from '../../../shared/rail'

/** What a row the room wrote says in its owner slot, in place of any persona's name (Story 4.1). */
export const ROOM_LABEL = 'the room'

/**
 * The words in a row's owner slot, or `undefined` when nothing is to be drawn.
 *
 * A row whose annotation carries `owners` is contended: it names each of them
 * the roster knows, in the order given, `A and B` or `A, B and C`, and an owner
 * the roster lacks is left out, never replaced. Such a row never falls back to
 * the class's owner, which is not one of the writers; with no name to give it
 * draws nothing.
 *
 * A row a room session wrote (`room`) is the room's: `the room`, whatever the roster or the
 * class says, and never a persona's name.
 *
 * Any other row is the session's owner, else the class's, else nobody: an agent
 * the roster lacks reads as nobody, and no other agent stands in for it.
 */
export function ownerLabel(row: RailRow, nameOf: ReadonlyMap<string, string>): string | undefined {
  if (row.room === true) {
    return ROOM_LABEL
  }
  const owners = row.annotation?.owners
  if (owners !== undefined) {
    const names = owners.flatMap(({ agentId }) => nameOf.get(agentId) ?? [])
    return names.length === 0 ? undefined : joined(names)
  }
  const agentId = row.annotation?.owner?.agentId ?? row.owner?.agentId
  return agentId === undefined ? undefined : nameOf.get(agentId)
}

/** `A`, `A and B`, `A, B and C`. */
function joined(names: readonly string[]): string {
  const end = names.length - 1
  return end === 0 ? (names[0] as string) : `${names.slice(0, end).join(', ')} and ${names[end]}`
}
