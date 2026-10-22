import type { ChangesSnapshot } from '../../../shared/changes'
import type { HarnessError } from '../../../shared/install'
import { asHarnessError } from '../install/install-state'

/**
 * The pure pieces of the Changes hook (Story 9.3), kept apart from React so a suite
 * with no DOM can hold them. The rail hook's pattern, copied rather than
 * generalised: the payloads differ and will drift on purpose.
 */

/** A push and the initial ask can race, and a stale one must lose. */
export function acceptChanges(current: ChangesSnapshot | null, incoming: ChangesSnapshot): ChangesSnapshot {
  return current === null || incoming.revision > current.revision ? incoming : current
}

/** The two bridge methods the connection needs, and nothing else of the bridge. */
export type ChangesBridge = {
  getChanges(): Promise<ChangesSnapshot>
  onChangesChanged(listener: (snapshot: ChangesSnapshot) => void): () => void
}

/**
 * The hook's whole sequence, apart from React: subscribe to pushes *before*
 * asking, so a push landing between the two is not lost; route a rejection
 * through `asHarnessError`; and after the returned disconnect, unsubscribe and
 * drop anything still in flight. The caller applies `acceptChanges`.
 */
export function connectChanges(
  bridge: ChangesBridge,
  handlers: {
    onSnapshot: (snapshot: ChangesSnapshot) => void
    onFailure: (error: HarnessError) => void
  }
): () => void {
  let live = true
  const unsubscribe = bridge.onChangesChanged((snapshot) => {
    if (live) {
      handlers.onSnapshot(snapshot)
    }
  })
  bridge
    .getChanges()
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
