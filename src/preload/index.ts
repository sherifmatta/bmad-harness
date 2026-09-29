import { contextBridge, ipcRenderer } from 'electron'
import type { InstallReply, InstallSnapshot } from '../shared/install'
import type { HarnessApi } from './harness-api'

// Kept in step with src/main/index.ts and src/main/install-bridge.ts by hand.
// Exported so that tests/bridge-contract.test.ts fails the moment a pair of
// literals diverges - renaming one silently would leave lint, typecheck and
// build green while the window rendered an error.
export const PROJECT_PATH_CHANNEL = 'project:path'
export const INSTALL_GET_CHANNEL = 'install:get'
export const INSTALL_CHANGED_CHANNEL = 'install:changed'

const harness: HarnessApi = {
  getProjectPath: () => ipcRenderer.invoke(PROJECT_PATH_CHANNEL) as Promise<string>,

  getInstall: async () => {
    const reply = (await ipcRenderer.invoke(INSTALL_GET_CHANNEL)) as InstallReply
    if (reply.ok) {
      return reply.snapshot
    }
    // The envelope itself, so the renderer can show `message` and tuck `detail`
    // behind a disclosure.
    throw reply.error
  },

  onInstallChanged: (listener) => {
    // The listener is handed the snapshot and never the event: a raw
    // IpcRendererEvent in the renderer's hands would be a channel handle.
    const wrapper = (_event: unknown, snapshot: InstallSnapshot): void => listener(snapshot)
    ipcRenderer.on(INSTALL_CHANGED_CHANNEL, wrapper)
    return () => {
      ipcRenderer.removeListener(INSTALL_CHANGED_CHANNEL, wrapper)
    }
  }
}

contextBridge.exposeInMainWorld('harness', harness)
