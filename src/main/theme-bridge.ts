import { BrowserWindow, ipcMain } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { THEME_CHANGED_CHANNEL, THEME_CHOOSE_CHANNEL, THEME_STATE_CHANNEL } from '../shared/channels'
import { isThemeChoice } from '../shared/theme'
import type { ThemeApplied, ThemeChoice, ThemeState } from '../shared/theme'
import { defaultWriteDiagnostic, sendTo } from './bridge-kit'
import type { Sender } from './bridge-kit'
import { DEFAULT_THEME_CHOICE, parseThemeChoice } from './fold/theme-choice'
import { readThemeFile, themeFilePath, writeThemeFile } from './sources/persistence/theme-file'
import { appliedNativeTheme, onNativeThemeUpdated, setNativeTheme } from './windows/native-theme'
import { isWelcomeWindow } from './windows/welcome-window'

/**
 * The theme's three channels. Exported so tests/bridge-contract.test.ts can tie
 * each to the literal in the preload that speaks it.
 */
export { THEME_CHANGED_CHANNEL, THEME_CHOOSE_CHANNEL, THEME_STATE_CHANNEL }

/**
 * The stored choice: `read` goes to the file on each call (the controller asks
 * once, in `start()`, and holds the answer) and `write` on every change.
 * `userData` is read on first use, never at construction, because the app is not
 * ready until later.
 */
export type ThemeStore = {
  read(): ThemeChoice
  write(choice: ThemeChoice): void
}

export function createThemeStore({
  userDataPath,
  writeDiagnostic = defaultWriteDiagnostic
}: {
  userDataPath: () => string
  writeDiagnostic?: (line: string) => void
}): ThemeStore {
  return {
    read: () => parseThemeChoice(readThemeFile(themeFilePath(userDataPath()))),
    write(choice) {
      const outcome = writeThemeFile(themeFilePath(userDataPath()), choice)
      if (!outcome.ok) {
        // The choice still applies this session: failing to keep it never fails it.
        writeDiagnostic(`theme/unwritten · ${outcome.errno}`)
      }
    }
  }
}

/**
 * Main's one source of truth for the theme. The menu reads and sets it through
 * this, so the menu's choice and the Welcome's line are the same choice.
 */
export type ThemeController = {
  choice(): ThemeChoice
  state(): ThemeState
  /** Make `choice` the theme: stored, applied to native chrome and pushed to every window. */
  choose(choice: ThemeChoice): void
  /** Hear each choice made (not each change of the OS appearance). */
  onChosen(listener: (choice: ThemeChoice) => void): void
  /** Read the stored choice and apply it, before the first window. */
  start(): void
}

export type ThemeBridgeDeps = {
  store: ThemeStore
  /** Make native chrome follow the choice. */
  applyNative?: (choice: ThemeChoice) => void
  /** What *System* is in the OS appearance in force, or the choice itself. */
  applied?: () => ThemeApplied
  /** Hear the OS appearance change. */
  onNativeUpdated?: (listener: () => void) => void
  /** Every window that is open, as a sender. */
  windows?: () => Pick<Sender, 'send' | 'isDestroyed'>[]
  isWelcomeSender?: (webContentsId: number) => boolean
}

/**
 * Answer the window's request for the state and the Welcome's choice. The
 * state request is synchronous (`ipcMain.on` with a return value) because a
 * window must know what to paint before its first frame; it is answered to any
 * window, and changes nothing. The choice is heard from the Welcome alone, and
 * only when it is one of the three words: anything else is ignored. Registering
 * reads and starts nothing; `start()` does.
 */
export function registerThemeBridge(deps: ThemeBridgeDeps): ThemeController {
  const { store } = deps
  const applyNative = deps.applyNative ?? setNativeTheme
  const applied = deps.applied ?? appliedNativeTheme
  const onNativeUpdated = deps.onNativeUpdated ?? onNativeThemeUpdated
  const windows =
    deps.windows ?? ((): Pick<Sender, 'send' | 'isDestroyed'>[] => BrowserWindow.getAllWindows().map((window) => window.webContents))
  const isWelcomeSender = deps.isWelcomeSender ?? ((id: number) => isWelcomeWindow({ id }))

  let current: ThemeChoice = DEFAULT_THEME_CHOICE
  let started = false
  const listeners: ((choice: ThemeChoice) => void)[] = []

  const state = (): ThemeState => ({ choice: current, applied: applied() })

  /** Tell every window what to paint, whether or not what is painted changes. */
  const broadcast = (): void => {
    const pushed = state()
    for (const window of windows()) {
      sendTo(window, THEME_CHANGED_CHANNEL, pushed)
    }
  }

  const controller: ThemeController = {
    choice: () => current,
    state,
    choose(choice) {
      current = choice
      applyNative(choice)
      store.write(choice)
      broadcast()
      for (const listener of listeners) {
        listener(choice)
      }
    },
    onChosen(listener) {
      listeners.push(listener)
    },
    start() {
      // Once: a second call would hear the OS appearance twice.
      if (started) {
        return
      }
      started = true
      current = store.read()
      applyNative(current)
      onNativeUpdated(broadcast)
    }
  }

  ipcMain.on(THEME_STATE_CHANNEL, (event: IpcMainEvent) => {
    event.returnValue = state()
  })

  ipcMain.handle(THEME_CHOOSE_CHANNEL, (event: IpcMainInvokeEvent, choice: unknown): void => {
    if (!isWelcomeSender(event.sender.id) || !isThemeChoice(choice)) {
      return
    }
    controller.choose(choice)
  })

  return controller
}
