import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  WELCOME_CHOOSE_CHANNEL,
  WELCOME_OPEN_DROPPED_CHANNEL,
  WELCOME_OPEN_RECENT_CHANNEL,
  WELCOME_RECENT_CHANNEL
} from '../shared/channels'
import type { OpenAck, RecentRow } from '../shared/welcome'
import type { WelcomeApi } from './welcome-api'

// The Welcome's own bundle, sharing no file with the shell's or the document
// window's preload. The channels are spelled once, in src/shared/channels.ts,
// and the build inlines the four it uses here. Re-exported for
// tests/bridge-contract.test.ts. `webUtils.getPathForFile` lives here and
// nowhere else: a sandboxed page cannot read a dropped file's path, and this is
// the one place that may ask for it.
export {
  WELCOME_CHOOSE_CHANNEL,
  WELCOME_OPEN_DROPPED_CHANNEL,
  WELCOME_OPEN_RECENT_CHANNEL,
  WELCOME_RECENT_CHANNEL
}

const welcome: WelcomeApi = {
  getRecent: () => ipcRenderer.invoke(WELCOME_RECENT_CHANNEL) as Promise<RecentRow[]>,

  chooseFolder: () => ipcRenderer.invoke(WELCOME_CHOOSE_CHANNEL) as Promise<OpenAck>,

  openRecent: (path) => ipcRenderer.invoke(WELCOME_OPEN_RECENT_CHANNEL, path) as Promise<OpenAck>,

  openDropped: (files) =>
    ipcRenderer.invoke(
      WELCOME_OPEN_DROPPED_CHANNEL,
      files.map((file) => webUtils.getPathForFile(file))
    ) as Promise<OpenAck>
}

contextBridge.exposeInMainWorld('welcome', welcome)
