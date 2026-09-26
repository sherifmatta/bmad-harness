/**
 * The announcement queue behind the product's single polite live region
 * (NFR22, EXPERIENCE.md → *Live-region policy*).
 *
 * A single card streams 69,031 characters across 5,795 deltas. Announcing that
 * stream and announcing nothing are both wrong, so the policy throttles: at
 * most one announcement every two seconds, with anything arriving inside an
 * interval **queued and read in event order, never merged into a count**. Two
 * identical messages are two announcements; the queue never collapses them,
 * because "saved · saved" and "saved" are different facts about the run.
 *
 * (The one nuance that reads like a contradiction and is not: a 15-section
 * batch commit is *one* event whose *single* announcement names the count.
 * That count is composed by whoever calls `announce`, from one event. It is
 * not this queue merging two events into one.)
 *
 * Time is an argument, never a clock. `take(at)` asks "is anything due at this
 * instant?" instead of a timer answering it, which is what makes the two-second
 * boundary, the FIFO order and the never-merged rule ordinary assertions under
 * `environment: 'node'` — no fake timers, no DOM, and no dependency on how long
 * the test took to run.
 */

/**
 * **[ASSUMPTION]** — EXPERIENCE.md marks the interval as one. Two seconds is
 * longer than a screen reader takes to finish any string announced here and far
 * shorter than the run-note feed's minutes-apart cadence, so nothing in the
 * policy is actually delayed by it.
 */
export const ANNOUNCE_INTERVAL_MS = 2000

/** One queued announcement, with the instant of the event that raised it. */
type Announcement = { message: string; at: number }

export class Announcer {
  #queue: Announcement[] = []

  /**
   * When the last message was handed to the live region, or `null` when none
   * has been. `null` rather than `0`: nothing precedes the first announcement,
   * so the throttle must not delay it — and an epoch-millisecond `0` is a real
   * instant, not an absence.
   */
  #spokenAt: number | null = null

  /** How many announcements are waiting. Queued, never dropped. */
  get pending(): number {
    return this.#queue.length
  }

  /**
   * Enqueue an announcement raised at `at`. An empty (or blank) message
   * announces nothing, so it is ignored rather than queued: a live region
   * handed an empty string has already cost the user the interval it occupies.
   */
  announce(message: string, at: number): void {
    if (message.trim() === '') {
      return
    }
    this.#queue.push({ message, at })
  }

  /**
   * The next message to speak at instant `at`, or `null` when the throttle has
   * not elapsed or nothing is waiting. Taking a message is what starts the next
   * interval, so a quiet queue never accumulates a debt of skipped turns.
   */
  take(at: number): string | null {
    const next = this.#queue[0]
    if (next === undefined) {
      return null
    }
    if (this.#spokenAt !== null && at - this.#spokenAt < ANNOUNCE_INTERVAL_MS) {
      return null
    }

    this.#queue.shift()
    this.#spokenAt = at
    return next.message
  }
}
