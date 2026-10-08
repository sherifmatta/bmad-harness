import type { ThemeChoice, ThemeState } from '../shared/theme'
import type { OpenAck, RecentRow } from '../shared/welcome'

/**
 * The Welcome's whole bridge surface. Explicitly enumerated: four named
 * methods, no generic `invoke(channel, …)` passthrough. None reads or names a
 * project: the Welcome has none. The only paths it can send are the one a
 * recent row carries and the ones the sandboxed preload looked up for a drop,
 * and main checks each before anything opens.
 */
export interface WelcomeApi {
  /** The recent projects, newest first. Resolves empty when there are none or main refuses. */
  getRecent(): Promise<RecentRow[]>
  /** Open the native folder chooser; `{ ok: true }` when a folder was chosen and opened. */
  chooseFolder(): Promise<OpenAck>
  /** Open a recent row's project, by the path the row carried. */
  openRecent(path: string): Promise<OpenAck>
  /** Open what was dropped: only exactly one folder opens, anything else says its name. */
  openDropped(files: readonly File[]): Promise<OpenAck>
  /** The theme main holds: the choice, and what it resolves to now. */
  getTheme(): ThemeState
  /** Choose a theme: exactly the choice *View ▸ Theme* makes. Resolves once main has heard it. */
  chooseTheme(choice: ThemeChoice): Promise<void>
  /** Calls back with each pushed state; returns the way to stop listening. */
  onThemeChanged(listener: (state: ThemeState) => void): () => void
}

declare global {
  interface Window {
    welcome: WelcomeApi
  }
}
