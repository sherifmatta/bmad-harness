import type { DocSnapshot } from '../shared/document'

/**
 * The document window's whole bridge surface. Explicitly enumerated: five named
 * methods, no generic `invoke(channel, …)` passthrough, and no method that takes
 * a path — main acts on the file this window was opened for, and on nothing else.
 */
export interface DocWindowApi {
  /** Resolves the current snapshot; rejects with the `HarnessError` envelope. */
  getDocument(): Promise<DocSnapshot>
  /** Calls back with each pushed snapshot; returns the way to stop listening. */
  onDocumentChanged(listener: (snapshot: DocSnapshot) => void): () => void
  /** Show this window's file in Finder. */
  revealInFinder(): Promise<void>
  /** Open this window's file in the default text editor. */
  openInEditor(): Promise<void>
  /** Close this window. */
  close(): Promise<void>
}

declare global {
  interface Window {
    docWindow: DocWindowApi
  }
}
