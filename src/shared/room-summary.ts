/**
 * What the room's own session is asked when the user presses *Write summary to `_bmad/`*
 * (Story 4.4, FR71). Pure, and in `shared/` beside `room-destination.ts`, whose destination it
 * names. The runtime writes the file; the harness writes nothing, and decides neither the name
 * of an empty slug nor what to do about a collision: both are left to the runtime in the text.
 */

/** The ask, as one paragraph, for a summary that is to land at `destination`. */
export function roomSummaryTurn(destination: string): string {
  return `Write a summary of this conversation to ${destination}. Cover what was discussed, what was decided and what is still open. If the file name has <topic> in it, put a short name for the topic there; if the file already exists, add -2 to the name rather than overwrite it.`
}
