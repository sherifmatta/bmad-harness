import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  THEME_CHANGED_CHANNEL,
  THEME_CHOOSE_CHANNEL,
  THEME_STATE_CHANNEL,
  WELCOME_CHOOSE_CHANNEL,
  WELCOME_OPEN_DROPPED_CHANNEL,
  WELCOME_OPEN_RECENT_CHANNEL,
  WELCOME_RECENT_CHANNEL
} from '../shared/channels'
import { followTheme, pageDocument, readThemeState } from '../shared/theme'
import type { ThemeState } from '../shared/theme'
import type { OpenAck, RecentRow } from '../shared/welcome'
import type { WelcomeApi } from './welcome-api'

// The Welcome's own bundle, sharing no file with the shell's or the document
// window's preload. The channels are spelled once, in src/shared/channels.ts,
// and the build inlines the four it uses here, and the theme's three. Re-exported for
// tests/bridge-contract.test.ts. `webUtils.getPathForFile` lives here and
// nowhere else: a sandboxed page cannot read a dropped file's path, and this is
// the one place that may ask for it.
export {
  THEME_CHANGED_CHANNEL,
  THEME_CHOOSE_CHANNEL,
  THEME_STATE_CHANNEL,
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
    ) as Promise<OpenAck>,

  // The theme is the one thing the Welcome shares with every window; it alone
  // may change it. The state is what main holds, read where the line is drawn.
  getTheme: (): ThemeState =>
    // A main that cannot answer leaves the line on the stylesheet's own theme.
    readThemeState(ipcRenderer.sendSync(THEME_STATE_CHANNEL)) ?? { choice: 'system', applied: 'dark' },

  chooseTheme: async (choice) => {
    await ipcRenderer.invoke(THEME_CHOOSE_CHANNEL, choice)
  },

  onThemeChanged: (listener) => {
    // The state itself, never the event: a raw IpcRendererEvent would be a handle.
    const wrapper = (_event: unknown, pushed: unknown): void => {
      const state = readThemeState(pushed)
      if (state !== null) {
        listener(state)
      }
    }
    ipcRenderer.on(THEME_CHANGED_CHANNEL, wrapper)
    return () => {
      ipcRenderer.removeListener(THEME_CHANGED_CHANNEL, wrapper)
    }
  }
}

// Painted in the theme in force, as every window is.
followTheme(ipcRenderer, pageDocument())

contextBridge.exposeInMainWorld('welcome', welcome)
