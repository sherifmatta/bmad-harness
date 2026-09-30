import type { InstallSnapshot } from '../shared/install'
import type { RailSnapshot } from '../shared/rail'

/**
 * The whole bridge surface. Explicitly enumerated: six named methods, no
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
}

declare global {
  interface Window {
    harness: HarnessApi
  }
}
