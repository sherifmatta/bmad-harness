import type { HarnessError, InstallSnapshot } from '../../../shared/install'

/**
 * The two pure pieces of the install hook — kept apart from React so a suite
 * with no DOM can hold them.
 */

/**
 * A push and the initial ask can race, and a stale one must lose. The incoming
 * snapshot wins only when nothing is held yet or its revision is greater.
 */
export function acceptSnapshot(
  current: InstallSnapshot | null,
  incoming: InstallSnapshot
): InstallSnapshot {
  return current === null || incoming.revision > current.revision ? incoming : current
}

/**
 * What the bridge rejects with is the `HarnessError` envelope. Anything else is
 * a fault in the bridge itself, and is named as one rather than stringified:
 * a stringified `Error` is a message and a stack the user should never read.
 */
export function asHarnessError(reason: unknown): HarnessError {
  if (
    typeof reason === 'object' &&
    reason !== null &&
    typeof (reason as { code?: unknown }).code === 'string' &&
    typeof (reason as { message?: unknown }).message === 'string'
  ) {
    const { code, message, detail } = reason as HarnessError
    return typeof detail === 'string' ? { code, message, detail } : { code, message }
  }
  return { code: 'bridge/unexpected', message: 'bridge · unexpected failure' }
}

/** The two bridge methods the connection needs, and nothing else of the bridge. */
export type InstallBridge = {
  getInstall(): Promise<InstallSnapshot>
  onInstallChanged(listener: (snapshot: InstallSnapshot) => void): () => void
}

/**
 * The hook's whole sequence, apart from React so it can be run in node: it
 * subscribes to pushes *before* asking, so a push landing between the two is
 * not lost; routes a rejection through `asHarnessError`; and after the
 * returned disconnect it unsubscribes and drops anything still in flight.
 *
 * It does not decide which snapshot wins — `onSnapshot` is handed every one,
 * and the caller applies `acceptSnapshot`.
 */
export function connectInstall(
  bridge: InstallBridge,
  handlers: {
    onSnapshot: (snapshot: InstallSnapshot) => void
    onFailure: (error: HarnessError) => void
  }
): () => void {
  let live = true
  const unsubscribe = bridge.onInstallChanged((snapshot) => {
    if (live) {
      handlers.onSnapshot(snapshot)
    }
  })
  bridge
    .getInstall()
    .then((snapshot) => {
      if (live) {
        handlers.onSnapshot(snapshot)
      }
    })
    .catch((reason: unknown) => {
      if (live) {
        handlers.onFailure(asHarnessError(reason))
      }
    })

  return () => {
    live = false
    unsubscribe()
  }
}

/**
 * Whether the room may open. `pending` draws nothing at all — no spinner, no
 * sentence. `blocked` shows the project and the named lines and nothing else:
 * a failure with no snapshot, any unmet prerequisite, or a roster with nobody
 * in it (an empty room reads as broken, not unconfigured). Otherwise `open`.
 *
 * A failure held beside a valid snapshot does not block: a snapshot supersedes
 * an earlier failure, and the room shows whichever it has.
 */
export function roomState(
  snapshot: InstallSnapshot | null,
  failure: HarnessError | null
): 'pending' | 'blocked' | 'open' {
  if (snapshot === null) {
    return failure === null ? 'pending' : 'blocked'
  }
  return snapshot.preflight.length > 0 || snapshot.agents.length === 0 ? 'blocked' : 'open'
}
