/**
 * A recent row's age: `now`, then whole minutes, hours and days as `Nm`, `Nh`
 * and `Nd`. It is the largest unit that fits and is rounded down, so a row is
 * never older than it says. A time in the future (a clock set back) is `now`
 * rather than a negative age. Pure; the clock is an argument.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function recentAge(openedAt: number, now: number): string {
  const elapsed = now - openedAt
  if (elapsed < MINUTE) {
    return 'now'
  }
  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m`
  }
  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h`
  }
  return `${Math.floor(elapsed / DAY)}d`
}
