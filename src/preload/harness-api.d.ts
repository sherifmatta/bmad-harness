import type { ConversationSnapshot, OpenedSession } from '../shared/conversation'
import type { ContractEvent } from '../shared/events'
import type { RunId, SessionId } from '../shared/ids'
import type { InstallSnapshot } from '../shared/install'
import type { RailSnapshot } from '../shared/rail'

/**
 * The whole bridge surface. Explicitly enumerated: fifteen named methods, no
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
   * resolve with its id, and with the sysline main wrote when this open was a
   * handoff from another persona. Rejects with the `HarnessError` envelope when
   * main refused or could not start it.
   */
  openSession(agentId: string): Promise<OpenedSession>
  /**
   * End one session: main kills its process and closes it, which it reports as
   * `session:closed`. Resolves when it has; rejects with the `HarnessError`
   * envelope (`session/not-found` for an unknown or already closed id). The
   * transcript and every other session are untouched.
   */
  closeSession(sessionId: SessionId): Promise<void>
  /**
   * Send one turn into a session. Resolves when it was written and rejects
   * with the `HarnessError` envelope when it was not (`session/busy` while a
   * turn is in flight).
   */
  sendTurn(sessionId: SessionId, text: string): Promise<void>
  /**
   * Run a persona's menu entry in its session: main resolves `code` and writes
   * the turn, and the run's events follow. Resolves with the run's id; rejects
   * with the `HarnessError` envelope (`session/busy` while a turn is in flight,
   * `menu/unknown-entry` for a code the persona's menu does not hold). Whether
   * the entry is a skill or a prompt never crosses the bridge.
   */
  dispatchMenu(sessionId: SessionId, code: string): Promise<RunId>
  /**
   * The conversation as main holds it for this window's project: the
   * transcript, the live and busy sessions and the personas that are not idle.
   * Rejects with the `HarnessError` envelope. Made once on connecting; events
   * that reach the window before it resolves are already in what it returns.
   */
  getConversation(): Promise<ConversationSnapshot>
  /**
   * End this window's conversation: main checks `projectId` is the project the
   * window was opened for, clears its stored transcript and closes its
   * sessions. Resolves when it has; rejects with the `HarnessError` envelope
   * (`conversation/wrong-project`, `conversation/end-failed`, …) and then
   * changes nothing.
   */
  endConversation(projectId: string): Promise<void>
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
