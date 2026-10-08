import { nativeTheme } from 'electron'
import type { ThemeApplied, ThemeChoice } from '../../shared/theme'

/**
 * The one module that touches Electron's `nativeTheme`. Main keeps the choice;
 * this is where it meets the OS.
 *
 * `themeSource` takes the same three words as the choice, so setting it is how
 * native chrome (menus, the folder chooser, scrollbars, form controls) comes to
 * agree with the window. `shouldUseDarkColors` is then the one resolution of
 * *System*: the OS appearance in force, or the choice itself. Nothing in the
 * renderer asks the browser which scheme is preferred.
 */

/** Make native chrome follow `choice`. */
export function setNativeTheme(choice: ThemeChoice): void {
  nativeTheme.themeSource = choice
}

/** What the windows are to be painted in now. */
export function appliedNativeTheme(): ThemeApplied {
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

/** Hear the OS appearance change (and a choice that changes what is resolved). */
export function onNativeThemeUpdated(listener: () => void): void {
  nativeTheme.on('updated', listener)
}
