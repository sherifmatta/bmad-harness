/**
 * How long a tool step took, as its row writes it: `0:03`, `12:40`, and `1:02:05`
 * once past an hour. Whole seconds, floored, so the text only ever moves forward.
 * A negative or non-finite span (a clock corrected under the step) reads `0:00`.
 * The head's own elapsed is the `5s` form (`formatElapsed`) and stays so.
 */
export function formatStepElapsed(ms: number): string {
  const total = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
  }
  return `${minutes}:${seconds}`
}
