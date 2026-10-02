/**
 * How long a persona has been working, as the counter beside its dot writes it:
 * `5s`, `1m 05s`, `1h 02m`. Whole units, floored, so the text only ever moves
 * forward, and never more than two of them. A negative or non-finite span (a
 * clock corrected under the counter) reads as `0s` rather than as negative time.
 */
export function formatElapsed(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number): string => String(value).padStart(2, '0')

  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${pad(seconds)}s`
  }
  return `${seconds}s`
}
