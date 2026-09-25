import { contextBridge, ipcRenderer } from 'electron'
import type { HarnessApi } from './harness-api'

// Kept in step with src/main/index.ts by hand: src/shared/ carries the IPC
// contract from Story 2.2, and stays empty until then. Exported so that
// tests/bridge-contract.test.ts fails the moment the two literals diverge -
// renaming one silently would leave lint, typecheck and build green while the
// window rendered an error.
export const PROJECT_PATH_CHANNEL = 'project:path'

const harness: HarnessApi = {
  getProjectPath: () => ipcRenderer.invoke(PROJECT_PATH_CHANNEL) as Promise<string>
}

contextBridge.exposeInMainWorld('harness', harness)
