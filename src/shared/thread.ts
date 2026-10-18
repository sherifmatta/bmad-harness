/**
 * Whose thread a record is in (Story 8.1). One definition, used by the renderer's filter, the
 * empty-thread test and the send count, so none of them can drift from the others.
 *
 * A record is in a persona's thread when it has an `agentId`, no `room` flag and no `skillSession`.
 * A room's records and a skill-first session's records are their own threads' and never a persona's;
 * a record with no `agentId` (not yet attributed, or never placeable) is in no persona's thread.
 *
 * Structural on purpose: it reads a transcript record, a run card or a live event alike.
 */
export type ThreadTagged = { agentId?: string; room?: true; skillSession?: string }

/** The persona whose thread the record is in, or `undefined` when it is in no persona's thread. */
export function threadAgentOf(record: ThreadTagged): string | undefined {
  if (record.agentId === undefined || record.room === true || record.skillSession !== undefined) {
    return undefined
  }
  return record.agentId
}

/** Whether the record is in the thread of the persona `agentId`. */
export function isInPersonaThread(record: ThreadTagged, agentId: string): boolean {
  return threadAgentOf(record) === agentId
}
