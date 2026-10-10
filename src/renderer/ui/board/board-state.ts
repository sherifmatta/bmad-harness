import type { HarnessError } from '../../../shared/install'
import type { BoardSnapshot } from '../../../shared/board'
import { asHarnessError } from '../install/install-state'

/**
 * The pure pieces of the Board hook, kept apart from React so a suite with no
 * DOM can hold them. The same pattern as the install hook's, copied rather than
 * generalised: the two have different payloads and will drift on purpose.
 */

/** A push and the initial ask can race, and a stale one must lose. */
export function acceptBoard(current: BoardSnapshot | null, incoming: BoardSnapshot): BoardSnapshot {
  return current === null || incoming.revision > current.revision ? incoming : current
}

/** The two bridge methods the connection needs, and nothing else of the bridge. */
export type BoardBridge = {
  getBoard(): Promise<BoardSnapshot>
  onBoardChanged(listener: (snapshot: BoardSnapshot) => void): () => void
}

/**
 * The hook's whole sequence, apart from React: subscribe to pushes *before*
 * asking, so a push landing between the two is not lost; route a rejection
 * through `asHarnessError`; and after the returned disconnect, unsubscribe and
 * drop anything still in flight. The caller applies `acceptBoard`.
 */
export function connectBoard(
  bridge: BoardBridge,
  handlers: {
    onSnapshot: (snapshot: BoardSnapshot) => void
    onFailure: (error: HarnessError) => void
  }
): () => void {
  let live = true
  const unsubscribe = bridge.onBoardChanged((snapshot) => {
    if (live) {
      handlers.onSnapshot(snapshot)
    }
  })
  bridge
    .getBoard()
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
