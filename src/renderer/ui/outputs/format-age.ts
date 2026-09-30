/**
 * How long ago a file was saved, as the rail's state text reads it (UX-DR30):
 * `just now` under a minute, then whole minutes, hours and days — the largest
 * unit that fits, truncated, never rounded up. A `savedAt` ahead of `now` (a
 * file with a clock-skewed mtime) reads `just now` rather than a negative age.
 *
 * `now` is an argument and is data: the caller's clock hook re-renders the
 * text, and nothing about a changed age is announced or animated.
 */
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function formatAge(savedAt: number, now: number): string {
  const elapsed = now - savedAt
  if (elapsed < MINUTE) {
    return 'just now'
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m`
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h`
  }
  return `${Math.floor(elapsed / DAY)}d`
}
