import type { ContractEvent } from '../shared/events'
import type { SessionId } from '../shared/ids'
import type { InstallSnapshot } from '../shared/install'
import type { RailSnapshot } from '../shared/rail'

/**
 * The whole bridge surface. Explicitly enumerated: eleven named methods, no
 * generic `invoke(channel, …)` passthrough, and no `ipcRenderer` in the
 * renderer's reach.
 */
export interface HarnessApi {
  getProjectPath(): Promise<string>
  /** Resolves the current snapshot; rejects with the `HarnessError` envelope. */
  getInstall(): Promise<InstallSnapshot>
  /** Calls back with each pushed snapshot; returns the way to stop listening. */
  onInstallChanged(listener: (snapshot: InstallSnapshot) => void): () => void
  /**
   * The checked-out branch of this window's project, `detached · <7 hex>`, or
   * `null` when there is no answer. Never rejects and never carries a path.
   */
  getBranch(): Promise<string | null>
  /** Resolves the current rail snapshot; rejects with the `HarnessError` envelope. */
  getRail(): Promise<RailSnapshot>
  /** Calls back with each pushed rail snapshot; returns the way to stop listening. */
  onRailChanged(listener: (snapshot: RailSnapshot) => void): () => void
  /**
   * Ask main to open the read-only document window for a rail row's
   * project-relative path (FR55). A command, not a read: it resolves when main
   * has acted and rejects with the `HarnessError` envelope when it refused.
   */
  openDoc(path: string): Promise<void>
  /**
   * Calls back with the project-relative path of the row whose document window
   * has just been closed by the user; returns the way to stop listening.
   */
  onDocClosed(listener: (path: string) => void): () => void
  /**
   * Open the session for a persona, or find the one already open for it, and
   * resolve with its id. Rejects with the `HarnessError` envelope when main
   * refused or could not start it.
   */
  openSession(agentId: string): Promise<SessionId>
  /**
   * Send one turn into a session. Resolves when it was written and rejects
   * with the `HarnessError` envelope when it was not (`session/busy` while a
   * turn is in flight).
   */
  sendTurn(sessionId: SessionId, text: string): Promise<void>
  /**
   * Calls back with each contract event main pushes for this window's
   * sessions, as `{name, payload}`; returns the way to stop listening.
   */
  onSessionEvent(listener: (event: ContractEvent) => void): () => void
}

declare global {
  interface Window {
    harness: HarnessApi
  }
}
