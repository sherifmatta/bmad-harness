import type { BoardSnapshot } from '../shared/board'
import type { ChangesSnapshot } from '../shared/changes'
import type { SessionTarget } from '../shared/commands'
import type { ConversationSnapshot, OpenedSession } from '../shared/conversation'
import type { ContractEvent } from '../shared/events'
import type { AgentId, RunId, SessionId } from '../shared/ids'
import type { InstallSnapshot } from '../shared/install'
import type { Layout, PanelId } from '../shared/layout'
import type { ChooseOutcome } from '../shared/output-folder'
import type { RailSnapshot } from '../shared/rail'

/**
 * The whole bridge surface. Explicitly enumerated: twenty-eight named methods, no
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
   * The Changes half's snapshot (Story 9.3): what git reports uncommitted in this window's project, or
   * the one line it came to. Rejects with the `HarnessError` envelope.
   */
  getChanges(): Promise<ChangesSnapshot>
  /** Calls back with each pushed Changes snapshot; returns the way to stop listening. */
  onChangesChanged(listener: (snapshot: ChangesSnapshot) => void): () => void
  /**
   * The checked-out branch of this window's project, `detached · <7 hex>`, or
   * `null` when there is no answer. Never rejects and never carries a path.
   */
  getBranch(): Promise<string | null>
  /** Resolves the current rail snapshot; rejects with the `HarnessError` envelope. */
  getRail(): Promise<RailSnapshot>
  /** Calls back with each pushed rail snapshot; returns the way to stop listening. */
  onRailChanged(listener: (snapshot: RailSnapshot) => void): () => void
  /** Resolves the current Board snapshot; rejects with the `HarnessError` envelope. */
  getBoard(): Promise<BoardSnapshot>
  /** Calls back with each pushed Board snapshot; returns the way to stop listening. */
  onBoardChanged(listener: (snapshot: BoardSnapshot) => void): () => void
  /**
   * Ask main to open the read-only document window for a rail row's
   * project-relative path (FR55). A command, not a read: it resolves when main
   * has acted and rejects with the `HarnessError` envelope when it refused.
   */
  openDoc(path: string): Promise<void>
  /**
   * Ask main to open the native folder chooser for this project's output folder
   * (Story 5.4). A command: it takes nothing, and main checks what is chosen on
   * real paths before keeping it. Resolves with what it came to (`chosen`,
   * `cancelled`, or `refused` with the reason); the folder itself, and a refusal,
   * arrive in the rail's next snapshot. Rejects with the `HarnessError` envelope.
   */
  chooseOutputFolder(): Promise<ChooseOutcome>
  /**
   * The layout this window starts from (Story 5.5): the two panel widths the user chose,
   * or `null` for a panel left at its default, the Outputs directories this project
   * has folded, and whether the skill row is open (Story 9.1). Synchronous, so the first paint is at the stored width; never throws.
   */
  getLayout(): Layout
  /**
   * Keep one panel's width (an integer within its range), or `null` to forget it. A request:
   * nothing comes back, and main ignores a width the panel would not read.
   */
  setPanelWidth(panel: PanelId, width: number | null): void
  /**
   * Keep the directories this project has folded, as project-relative paths: the Outputs half's,
   * or with `half` `'changes'` the Changes half's own set (Story 9.3). A request: nothing comes
   * back. Held under `userData`, never in the project.
   */
  setFolded(dirs: readonly string[], half?: 'changes'): void
  /**
   * Keep whether the skill row above the composer is open (Story 9.1): one choice for the
   * whole app, shared by every persona's chat. A request: nothing comes back, and main
   * ignores anything that is not a boolean. Held under `userData`, never in the project.
   */
  setSkillRowOpen(open: boolean): void
  /**
   * Keep the rail split's share (Story 9.3): the part of the rail's height the Changes half takes,
   * strictly between 0 and 1, or `null` for half and half. One choice per user. A request: nothing
   * comes back, and main ignores anything else.
   */
  setRailSplit(share: number | null): void
  /**
   * Calls back with the project-relative path of the row whose document window
   * has just been closed by the user; returns the way to stop listening.
   */
  onDocClosed(listener: (path: string) => void): () => void
  /**
   * Open the session for a persona, or find the one already open for it, and
   * resolve with its id (a reply that carried a handoff line, which main no
   * longer writes, would resolve with it too). Given `{ room }` it opens the room of that
   * cast (Story 4.1), or finds the one already open. Given `{ first }`, the text of a first
   * message typed in the New session chat (Story 7.5), main reads its `/<skill>` and answers
   * with a persona's seat (`seat`, and `rest` when words followed), the room (as a room's
   * open, and `rest`) or a skill-first session (`skill`), or refuses it (`session/no-skill`).
   * Rejects with the `HarnessError` envelope when main refused or could not start it.
   */
  openSession(target: SessionTarget): Promise<OpenedSession>
  /**
   * End one session: main kills its process and closes it, which it reports as
   * `session:closed`. Resolves when it has; rejects with the `HarnessError`
   * envelope (`session/not-found` for an unknown or already closed id). A persona's
   * close (Story 8.5), by its session id or by `{ agentId }`, also deletes that
   * persona's thread and what main holds keyed to it, and writes nothing in its
   * place; the agent form may close no session (a stored thread with none live) and
   * then emits no `session:closed`. Every other persona, the room and a skill-first
   * session are untouched.
   */
  closeSession(target: SessionId | { agentId: AgentId }): Promise<void>
  /**
   * Send one turn into a session. Resolves when it was written and rejects
   * with the `HarnessError` envelope when it was not (`session/busy` while a
   * turn is in flight). `mention` is the literal `@name` the user typed to hand
   * off to this persona; main records it beside `text` for display and the
   * persona never receives it.
   */
  sendTurn(sessionId: SessionId, text: string, mention?: string): Promise<void>
  /**
   * Run a persona's menu entry in its session: main resolves `code` and writes
   * the turn, and the run's events follow. Resolves with the run's id; rejects
   * with the `HarnessError` envelope (`session/busy` while a turn is in flight,
   * `menu/unknown-entry` for a code the persona's menu does not hold). Whether
   * the entry is a skill or a prompt never crosses the bridge.
   */
  dispatchMenu(sessionId: SessionId, code: string): Promise<RunId>
  /**
   * Ask main to stop a run: it finds the run's session by `runId` and writes
   * the one interrupt that ends the turn. Resolves when main has acted, with
   * no word on how the turn ended (its terminal event says that); rejects with
   * the `HarnessError` envelope (`run/not-found` for a run that is not in
   * flight, which the window ignores).
   */
  stopRun(runId: RunId): Promise<void>
  /**
   * Ask main to stop the turn in flight in a session, a run or a plain chat
   * turn: the one interrupt that ends it, never a signal. Resolves when main
   * has acted; rejects with the `HarnessError` envelope (`turn/not-found` for a
   * session with no turn in flight, a room or no such session, which the
   * window ignores).
   */
  stopTurn(sessionId: SessionId): Promise<void>
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
  /**
   * Calls back with the id of the run whose card this window is to show, when
   * main has raised the window for it; returns the way to stop listening.
   */
  onRunRevealed(listener: (runId: RunId) => void): () => void
}

declare global {
  interface Window {
    harness: HarnessApi
  }
}
