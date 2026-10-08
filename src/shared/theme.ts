import { THEME_CHANGED_CHANNEL, THEME_STATE_CHANNEL } from './channels'

/**
 * The theme, as it crosses between main and a window. Main owns the one value
 * and resolves it; a window holds no source of truth and reads no media query:
 * it is told what to paint, and says so on `<html>` as soon as the document has
 * one.
 *
 * `ThemeChoice` is what the user chose and what is stored; `ThemeApplied` is
 * what *System* resolves to in the OS appearance in force. A state carries both
 * because the menu's check and the Welcome's line follow the choice, and the
 * page follows the applied theme.
 */
export const THEME_CHOICES = ['system', 'light', 'dark'] as const
export type ThemeChoice = (typeof THEME_CHOICES)[number]
export type ThemeApplied = 'light' | 'dark'
export type ThemeState = { choice: ThemeChoice; applied: ThemeApplied }

/** Whether a value is one of the three words, whoever it came from. */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value)
}

/** A state main sent, or `null` for anything that is not one. */
export function readThemeState(value: unknown): ThemeState | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const { choice, applied } = value as Record<string, unknown>
  return isThemeChoice(choice) && (applied === 'light' || applied === 'dark')
    ? { choice, applied }
    : null
}

/** The part of a page's root element the theme is written on. */
type ThemeRoot = { setAttribute(name: string, value: string): void }

/** The part of `document` the theme needs: its root element, once it has one. */
export type ThemeDocument = { documentElement: ThemeRoot | null }

/** The part of `ipcRenderer` the theme speaks through. */
export type ThemeIpc = {
  sendSync(channel: string): unknown
  on(channel: string, listener: (event: unknown, state: unknown) => void): unknown
}

/** Calls `callback` when the document gains a child, until the callback says it is done. */
export type ObserveDocument = (document: ThemeDocument, callback: () => boolean) => void

/**
 * The page's `document`, for a preload whose program has no DOM types: the one
 * place that reaches for it, so nothing else here names a global.
 */
export function pageDocument(): ThemeDocument {
  return (globalThis as unknown as { document: ThemeDocument }).document
}

/** The real observer: a `MutationObserver` on the document, disconnected once the root is there. */
export const observeDocument: ObserveDocument = (document, callback) => {
  const Observer = (
    globalThis as unknown as {
      MutationObserver?: new (listener: () => void) => {
        observe(target: unknown, options: { childList: boolean }): void
        disconnect(): void
      }
    }
  ).MutationObserver
  if (Observer === undefined) {
    return
  }
  const observer = new Observer(() => {
    if (callback()) {
      observer.disconnect()
    }
  })
  observer.observe(document, { childList: true })
}

/** The attribute the light twin block is keyed on. Written here and read by `tokens.css` alone. */
const THEME_ATTRIBUTE = 'data-theme'

/**
 * Keep a window painted in the theme in force. Called from each of the three
 * preloads (the build gives each its own copy of this module), which is why it
 * is here and why it takes what it needs as arguments.
 *
 * It asks main for the state synchronously and writes `data-theme` on `<html>`
 * as soon as there is one: at once when the preload runs after the root exists,
 * otherwise the moment the parser inserts it, before the page's scripts or its
 * first frame. Every later `theme:changed` push writes it again, which is a
 * repaint and nothing more: nothing reloads, and nothing is announced.
 */
export function followTheme(
  ipc: ThemeIpc,
  document: ThemeDocument,
  observe: ObserveDocument = observeDocument
): void {
  let applied: ThemeApplied | null = null

  /** Write what is known onto the root; false while there is no root to write on. */
  const paint = (): boolean => {
    const root = document.documentElement
    if (root === null) {
      return false
    }
    if (applied !== null) {
      root.setAttribute(THEME_ATTRIBUTE, applied)
    }
    return true
  }

  const accept = (value: unknown): void => {
    const state = readThemeState(value)
    if (state !== null) {
      applied = state.applied
      paint()
    }
  }

  try {
    accept(ipc.sendSync(THEME_STATE_CHANNEL))
  } catch {
    // A main that cannot answer leaves the window as its stylesheet has it: dark.
  }
  ipc.on(THEME_CHANGED_CHANNEL, (_event, state) => accept(state))

  // No root yet: the moment the parser inserts one, paint it, before a frame.
  if (document.documentElement === null) {
    observe(document, paint)
  }
}
