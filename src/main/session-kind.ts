import type { AgentId } from '../shared/ids'

/** What a session is (Story 7.5): a persona's seat, the window's room, or a skill-first session. */
export type EntryKind = 'persona' | 'room' | 'skill'

/**
 * The one place that says what an entry is: a `skill` makes it a skill-first session, no `agentId` and
 * no `skill` the room, and an `agentId` a persona's. Every site that once read no agent as the room asks
 * this. Its own module, so the sites that are not the registry (`session-stop`) can ask it without
 * importing the registry back; `session-registry` re-exports it.
 */
export function kindOf(entry: { agentId?: AgentId; skill?: string }): EntryKind {
  if (entry.skill !== undefined) {
    return 'skill'
  }
  return entry.agentId === undefined ? 'room' : 'persona'
}
