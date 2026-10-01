/**
 * Whether a raw frame is the CLI saying a turn is over.
 *
 * The wire word for it is `result`, and a `result` arrives once per turn, not
 * once per process: its `subtype` and `is_error` say how the turn ended and
 * are not this function's concern, because both outcomes free the session. The
 * process exit code is never the signal. A `result` attributed to a subagent
 * is that subagent's own and does not end the main thread's turn.
 *
 * It lives in Fold, beside `routeFrame`, so the renderer and the bridge never
 * spell the wire word themselves.
 */
export function endsTurn(frame: unknown): boolean {
  if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) return false
  const record = frame as Record<string, unknown>
  if (record.type !== 'result') return false
  return record.parent_tool_use_id === null || record.parent_tool_use_id === undefined
}
