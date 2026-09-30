import { contextBridge, ipcRenderer } from 'electron'
import type { DocAck } from '../shared/document'
import type { InstallReply, InstallSnapshot } from '../shared/install'
import type { RailReply, RailSnapshot } from '../shared/rail'
import type { HarnessApi } from './harness-api'

// Kept in step with src/main/index.ts, src/main/install-bridge.ts,
// src/main/project-bridge.ts and src/main/rail-bridge.ts by hand.
// Exported so that tests/bridge-contract.test.ts fails the moment a pair of
// literals diverges - renaming one silently would leave lint, typecheck and
// build green while the window rendered an error.
export const PROJECT_PATH_CHANNEL = 'project:path'
export const INSTALL_GET_CHANNEL = 'install:get'
export const INSTALL_CHANGED_CHANNEL = 'install:changed'
export const PROJECT_BRANCH_CHANNEL = 'project:branch'
export const RAIL_GET_CHANNEL = 'rail:get'
export const RAIL_CHANGED_CHANNEL = 'rail:changed'
export const DOC_OPEN_CHANNEL = 'doc:open'
export const DOC_CLOSED_CHANNEL = 'doc:closed'

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
  },

  getBranch: () => ipcRenderer.invoke(PROJECT_BRANCH_CHANNEL) as Promise<string | null>,

  getRail: async () => {
    const reply = (await ipcRenderer.invoke(RAIL_GET_CHANNEL)) as RailReply
    if (reply.ok) {
      return reply.snapshot
    }
    throw reply.error
  },

  onRailChanged: (listener) => {
    const wrapper = (_event: unknown, snapshot: RailSnapshot): void => listener(snapshot)
    ipcRenderer.on(RAIL_CHANGED_CHANNEL, wrapper)
    return () => {
      ipcRenderer.removeListener(RAIL_CHANGED_CHANNEL, wrapper)
    }
  },

  // A command, not a read (FR55, AD-13): the row's project-relative path goes
  // to main, which validates it, resolves it and opens the window. Nothing
  // comes back but whether it did.
  openDoc: async (path) => {
    const reply = (await ipcRenderer.invoke(DOC_OPEN_CHANNEL, path)) as DocAck
    if (!reply.ok) {
      throw reply.error
    }
  },

  onDocClosed: (listener) => {
    // The project-relative path of the row that opened the window, never the event.
    const wrapper = (_event: unknown, path: string): void => listener(path)
    ipcRenderer.on(DOC_CLOSED_CHANNEL, wrapper)
    return () => {
      ipcRenderer.removeListener(DOC_CLOSED_CHANNEL, wrapper)
    }
  }
}

contextBridge.exposeInMainWorld('harness', harness)
