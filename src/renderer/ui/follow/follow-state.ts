/**
 * Following the thread (Story 5.3): what it means for a thread to be at its
 * bottom. Pure arithmetic over the three numbers a scroller reports, so the
 * state is a fact about the scroller and nothing is stored.
 */

/** One line of the thread, in pixels: within this of the bottom is the bottom. */
export const FOLLOW_TOLERANCE = 24

/** The `scrollTop` at which the scroller shows its last line; zero when the content fits. */
export function bottomTop(clientHeight: number, scrollHeight: number): number {
  return Math.max(0, scrollHeight - clientHeight)
}

/** Whether a scroller at `scrollTop` is within one line of its bottom. */
export function atBottom(scrollTop: number, clientHeight: number, scrollHeight: number): boolean {
  return bottomTop(clientHeight, scrollHeight) - scrollTop <= FOLLOW_TOLERANCE
}
