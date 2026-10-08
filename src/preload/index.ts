import { contextBridge, ipcRenderer } from 'electron'
import {
  CONVERSATION_END_CHANNEL,
  CONVERSATION_GET_CHANNEL,
  DOC_CLOSED_CHANNEL,
  DOC_OPEN_CHANNEL,
  INSTALL_CHANGED_CHANNEL,
  INSTALL_GET_CHANNEL,
  MENU_DISPATCH_CHANNEL,
  PROJECT_BRANCH_CHANNEL,
  PROJECT_PATH_CHANNEL,
  RAIL_CHANGED_CHANNEL,
  RAIL_GET_CHANNEL,
  RUN_REVEALED_CHANNEL,
  RUN_STOP_CHANNEL,
  SESSION_CLOSE_CHANNEL,
  SESSION_EVENT_CHANNEL,
  SESSION_OPEN_CHANNEL,
  TURN_SEND_CHANNEL
} from '../shared/channels'
import type { ContractCommands } from '../shared/commands'
import type {
  ConversationReply,
  MenuDispatchReply,
  OpenedSession,
  SessionOpenReply
} from '../shared/conversation'
import type { DocAck } from '../shared/document'
import type { ContractEvent } from '../shared/events'
import type { RunId } from '../shared/ids'
import type { InstallReply, InstallSnapshot } from '../shared/install'
import type { RailReply, RailSnapshot } from '../shared/rail'
import type { HarnessApi } from './harness-api'

// The channels are spelled once, in src/shared/channels.ts, and the build
// inlines them here: a sandboxed preload cannot load a second file. Re-exported
// so that tests/bridge-contract.test.ts can tie each to the bridge that answers
// it - a name changed on one side alone would leave lint, typecheck and build
// green while the window rendered an error.
export {
  CONVERSATION_END_CHANNEL,
  CONVERSATION_GET_CHANNEL,
  DOC_CLOSED_CHANNEL,
  DOC_OPEN_CHANNEL,
  INSTALL_CHANGED_CHANNEL,
  INSTALL_GET_CHANNEL,
  MENU_DISPATCH_CHANNEL,
  PROJECT_BRANCH_CHANNEL,
  PROJECT_PATH_CHANNEL,
  RAIL_CHANGED_CHANNEL,
  RAIL_GET_CHANNEL,
  RUN_REVEALED_CHANNEL,
  RUN_STOP_CHANNEL,
  SESSION_CLOSE_CHANNEL,
  SESSION_EVENT_CHANNEL,
  SESSION_OPEN_CHANNEL,
  TURN_SEND_CHANNEL
}

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
  },

  // Commands (AD-13): the agent id goes to main, which validates it and starts
  // or finds the session. What comes back is the session id, and the sysline
  // when the open was a handoff, or the envelope.
  openSession: async (target) => {
    const reply = (await ipcRenderer.invoke(SESSION_OPEN_CHANNEL, target)) as SessionOpenReply
    if (!reply.ok) {
      throw reply.error
    }
    const opened: OpenedSession = { sessionId: reply.sessionId }
    if (reply.handoff !== undefined) {
      opened.handoff = reply.handoff
    }
    if (reply.room !== undefined) {
      opened.room = reply.room
    }
    return opened
  },

  // A command (AD-13): the session's id goes to main, which ends that one
  // session of this window. Nothing comes back but whether it did.
  closeSession: async (sessionId) => {
    const reply = (await ipcRenderer.invoke(
      SESSION_CLOSE_CHANNEL,
      sessionId
    )) as ContractCommands['session.close']['reply']
    if (!reply.ok) {
      throw reply.error
    }
  },

  sendTurn: async (sessionId, text) => {
    const reply = (await ipcRenderer.invoke(
      TURN_SEND_CHANNEL,
      sessionId,
      text
    )) as ContractCommands['turn.send']['reply']
    if (!reply.ok) {
      throw reply.error
    }
  },

  // A command (AD-13): the session and the menu code go to main, which alone
  // decides what the code runs and writes it as the turn. What comes back is
  // the run's id, or the envelope.
  dispatchMenu: async (sessionId, code) => {
    const reply = (await ipcRenderer.invoke(MENU_DISPATCH_CHANNEL, sessionId, code)) as MenuDispatchReply
    if (!reply.ok) {
      throw reply.error
    }
    return reply.runId
  },

  // A command (AD-13): the run's id goes to main, which finds the run's session
  // by it and asks the turn to stop. Nothing comes back but whether it did.
  stopRun: async (runId) => {
    const reply = (await ipcRenderer.invoke(RUN_STOP_CHANNEL, runId)) as ContractCommands['run.stop']['reply']
    if (!reply.ok) {
      throw reply.error
    }
  },

  // A read beside `getRail`: the transcript, which sessions are live and busy and
  // which personas are not idle. The window makes it on connecting, so a reload
  // finds the conversation where it was.
  getConversation: async () => {
    const reply = (await ipcRenderer.invoke(CONVERSATION_GET_CHANNEL)) as ConversationReply
    if (reply.ok) {
      return reply.snapshot
    }
    throw reply.error
  },

  // A command (AD-13): the project's id, which is its path, goes to main, which
  // checks it is this window's own, clears the stored transcript and ends the
  // window's sessions. Nothing comes back but whether it did.
  endConversation: async (projectId) => {
    const reply = (await ipcRenderer.invoke(
      CONVERSATION_END_CHANNEL,
      projectId
    )) as ContractCommands['conversation.end']['reply']
    if (!reply.ok) {
      throw reply.error
    }
  },

  onSessionEvent: (listener) => {
    // The contract event itself, never the IPC event: a raw IpcRendererEvent in
    // the renderer's hands would be a channel handle.
    const wrapper = (_event: unknown, event: ContractEvent): void => listener(event)
    ipcRenderer.on(SESSION_EVENT_CHANNEL, wrapper)
    return () => {
      ipcRenderer.removeListener(SESSION_EVENT_CHANNEL, wrapper)
    }
  },

  onRunRevealed: (listener) => {
    // The run's id and never the event: main has raised this window for the
    // run, and the window scrolls to its card.
    const wrapper = (_event: unknown, runId: RunId): void => listener(runId)
    ipcRenderer.on(RUN_REVEALED_CHANNEL, wrapper)
    return () => {
      ipcRenderer.removeListener(RUN_REVEALED_CHANNEL, wrapper)
    }
  }
}

contextBridge.exposeInMainWorld('harness', harness)
