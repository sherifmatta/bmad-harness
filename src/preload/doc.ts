import { contextBridge, ipcRenderer } from 'electron'
import type { DocAck, DocReply, DocSnapshot } from '../shared/document'
import type { DocWindowApi } from './doc-api'

// The document window's own bridge: its own bundle, sharing nothing with the
// shell's preload. Kept in step with src/main/doc-bridge.ts by hand, and held
// equal by tests/bridge-contract.test.ts. No method takes a path: main acts on
// the file this window was opened for, and on nothing else.
export const DOC_GET_CHANNEL = 'doc:get'
export const DOC_CHANGED_CHANNEL = 'doc:changed'
export const DOC_REVEAL_CHANNEL = 'doc:reveal'
export const DOC_EDIT_CHANNEL = 'doc:open-in-editor'
export const DOC_CLOSE_CHANNEL = 'doc:close'

/** Invoke a no-argument command and throw the envelope if main refused it. */
async function command(channel: string): Promise<void> {
  const reply = (await ipcRenderer.invoke(channel)) as DocAck
  if (!reply.ok) {
    throw reply.error
  }
}

const docWindow: DocWindowApi = {
  getDocument: async () => {
    const reply = (await ipcRenderer.invoke(DOC_GET_CHANNEL)) as DocReply
    if (reply.ok) {
      return reply.snapshot
    }
    throw reply.error
  },

  onDocumentChanged: (listener) => {
    // The snapshot, never the event: a raw IpcRendererEvent would be a handle.
    const wrapper = (_event: unknown, snapshot: DocSnapshot): void => listener(snapshot)
    ipcRenderer.on(DOC_CHANGED_CHANNEL, wrapper)
    return () => {
      ipcRenderer.removeListener(DOC_CHANGED_CHANNEL, wrapper)
    }
  },

  revealInFinder: () => command(DOC_REVEAL_CHANNEL),
  openInEditor: () => command(DOC_EDIT_CHANNEL),
  close: () => command(DOC_CLOSE_CHANNEL)
}

contextBridge.exposeInMainWorld('docWindow', docWindow)
