/**
 * The whole bridge surface. Explicitly enumerated: one named method, no
 * generic `invoke(channel, …)` passthrough, and no `ipcRenderer` in the
 * renderer's reach.
 */
export interface HarnessApi {
  getProjectPath(): Promise<string>
}

declare global {
  interface Window {
    harness: HarnessApi
  }
}
