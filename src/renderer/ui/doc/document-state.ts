import type { DocSnapshot, DocState } from '../../../shared/document'
import { stateLine } from './foot-text'

/**
 * The pure pieces of the document hook, kept apart from React so a suite with
 * no DOM can hold them. The rail hook's pattern, copied rather than shared: the
 * document window imports nothing from the shell's modules.
 */

/** A push and the initial ask can race, and a stale one must lose. */
export function acceptDocument(current: DocSnapshot | null, incoming: DocSnapshot): DocSnapshot {
  return current === null || incoming.revision > current.revision ? incoming : current
}

/**
 * What the bridge rejects with is the `HarnessError` envelope, and its
 * `message` is what renders. Anything else is a fault in the bridge itself and
 * is named as one, not stringified.
 */
export function failureMessage(reason: unknown): string {
  if (
    typeof reason === 'object' &&
    reason !== null &&
    typeof (reason as { message?: unknown }).message === 'string' &&
    typeof (reason as { code?: unknown }).code === 'string'
  ) {
    return (reason as { message: string }).message
  }
  return 'bridge · unexpected failure'
}

/** The two bridge methods the connection needs, and nothing else of the bridge. */
export type DocumentBridge = {
  getDocument(): Promise<DocSnapshot>
  onDocumentChanged(listener: (snapshot: DocSnapshot) => void): () => void
}

/**
 * The hook's whole sequence, apart from React: subscribe to pushes *before*
 * asking, so a push landing between the two is not lost; route a rejection
 * through `failureMessage`; and after the returned disconnect, unsubscribe and
 * drop anything still in flight. The caller applies `acceptDocument`.
 */
export function connectDocument(
  bridge: DocumentBridge,
  handlers: {
    onSnapshot: (snapshot: DocSnapshot) => void
    onFailure: (message: string) => void
  }
): () => void {
  let live = true
  const unsubscribe = bridge.onDocumentChanged((snapshot) => {
    if (live) {
      handlers.onSnapshot(snapshot)
    }
  })
  bridge
    .getDocument()
    .then((snapshot) => {
      if (live) {
        handlers.onSnapshot(snapshot)
      }
    })
    .catch((reason: unknown) => {
      if (live) {
        handlers.onFailure(failureMessage(reason))
      }
    })

  return () => {
    live = false
    unsubscribe()
  }
}

/** The states whose arrival is spoken: the ones where the text cannot be trusted to be current. */
const ANNOUNCED: ReadonlySet<DocState> = new Set(['missing', 'unreadable', 'binary'])

/**
 * What to announce when the state goes from `previous` to `next`: the state
 * line, but only on a transition *into* `missing`, `unreadable` or `binary`.
 * Staying in a state, leaving one, and `present` or `refused` say nothing.
 */
export function announcementFor(previous: DocState | null, next: DocState): string | null {
  return ANNOUNCED.has(next) && previous !== next ? stateLine(next) : null
}
