import { contextBridge, ipcRenderer } from 'electron'
import {
  DOC_CHANGED_CHANNEL,
  DOC_CLOSE_CHANNEL,
  DOC_EDIT_CHANNEL,
  DOC_GET_CHANNEL,
  DOC_REVEAL_CHANNEL
} from '../shared/channels'
import type { DocAck, DocReply, DocSnapshot } from '../shared/document'
import { followTheme, pageDocument } from '../shared/theme'
import type { DocWindowApi } from './doc-api'

// The document window's own bundle, sharing no file with the shell's preload.
// The channels are spelled once, in src/shared/channels.ts, and the build inlines
// the five it uses here. Re-exported for tests/bridge-contract.test.ts. No method
// takes a path: main acts on the file this window was opened for, and on nothing else.
export {
  DOC_CHANGED_CHANNEL,
  DOC_CLOSE_CHANNEL,
  DOC_EDIT_CHANNEL,
  DOC_GET_CHANNEL,
  DOC_REVEAL_CHANNEL
}

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

// Painted in the theme in force, as the shell is: nothing is exposed for it.
followTheme(ipcRenderer, pageDocument())

contextBridge.exposeInMainWorld('docWindow', docWindow)
