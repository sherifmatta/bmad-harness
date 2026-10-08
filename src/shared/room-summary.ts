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

/** The ask with a mark where its destination goes: what comes before it and what comes after. */
const [ASK_HEAD, ASK_TAIL] = roomSummaryTurn('\u0000').split('\u0000')

/**
 * Whether `text` is the summary ask, whatever destination it names (Story 4.7). The ask is never a
 * room's topic, so a window that reads the stored entries again must tell it from the user's own words.
 */
export function isRoomSummaryTurn(text: string): boolean {
  return (
    text.length >= ASK_HEAD.length + ASK_TAIL.length &&
    text.startsWith(ASK_HEAD) &&
    text.endsWith(ASK_TAIL) &&
    !text.slice(ASK_HEAD.length, text.length - ASK_TAIL.length).includes('\n')
  )
}
