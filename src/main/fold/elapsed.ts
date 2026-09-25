/**
 * Elapsed run time in milliseconds, derived from the start instant rather than
 * from a per-tick field.
 *
 * `fold/` is pure: no I/O, no filesystem, and no wall clock except as an
 * injected value — hence `now` is a parameter and never `Date.now()`.
 *
 * A `now` that precedes `startedAt` (a clock correction, a replayed event
 * sequence) clamps to zero rather than reporting negative time. So does a
 * non-finite input: the promise is a non-negative number of milliseconds, and
 * `NaN` keeps neither half of it.
 */
export function elapsedMs(startedAt: number, now: number): number {
  const elapsed = now - startedAt
  return Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0
}
