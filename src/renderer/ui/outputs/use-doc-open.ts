import { useCallback, useEffect, useState } from 'react'

/**
 * The two bridge methods the rail's rows use to open a document (FR55) and to
 * hear that it closed. Nothing else of the bridge.
 */
export type DocOpenBridge = {
  openDoc(path: string): Promise<void>
  onDocClosed(listener: (path: string) => void): () => void
}

/**
 * Ask main to open the row's document. A command, not a read: nothing comes
 * back but whether main acted. A refusal is expected and says nothing to the
 * user: main admits a rail row's path under the output folder, and a Changes row's
 * path only when it and its real path are both listed (Story 9.3, AD-13), so an
 * untracked link to an unlisted file is refused by design. `onRefused` hears it.
 * With no bridge (a preload that failed to load) it does nothing.
 */
export function openDocument(bridge: Partial<DocOpenBridge> | undefined, path: string, onRefused: () => void = () => {}): void {
  if (typeof bridge?.openDoc !== 'function') {
    return
  }
  bridge.openDoc(path).catch(onRefused)
}

/**
 * Hear that a document window was closed by the user, and which row opened it.
 * Returns the way to stop listening; with no bridge there is nothing to hear.
 */
export function connectDocClosed(
  bridge: Partial<DocOpenBridge> | undefined,
  onClosed: (path: string) => void
): () => void {
  if (typeof bridge?.onDocClosed !== 'function') {
    return () => {}
  }
  return bridge.onDocClosed(onClosed)
}

/**
 * Which instance of `useDocOpen` opened each path last. Several surfaces open documents (the rail's rows,
 * the Board's cards), and the window's close is one event for all of them: the one that opened the
 * document takes the focus back, and no other. A path nobody here opened has no owner, and then every
 * instance hears the close, as before.
 */
const openers = new Map<string, object>()

/**
 * A surface's whole use of the document window: a function that opens a document, and a subscription
 * that calls `onClosed` with the path when the window goes away, if this surface opened it. The bridge is
 * read when it is used, never while rendering, so the rows render wherever there is no window object at all.
 */
export function useDocOpen(onClosed: (path: string) => void): (path: string) => void {
  // This instance's own token: what the map holds to say who opened a path.
  const [self] = useState(() => ({}))
  useEffect(
    () =>
      connectDocClosed(window.harness, (path) => {
        const opener = openers.get(path)
        if (opener === undefined || opener === self) {
          onClosed(path)
          // The close is answered: the path is nobody's until opened again. After the turn, so the surfaces told after this one still find the opener.
          queueMicrotask(() => {
            if (openers.get(path) === self) {
              openers.delete(path)
            }
          })
        }
      }),
    [onClosed, self]
  )
  // An instance that goes away owns nothing: a close it can no longer answer is heard by whoever is left.
  useEffect(
    () => () => {
      for (const [path, opener] of openers) {
        if (opener === self) {
          openers.delete(path)
        }
      }
    },
    [self]
  )
  return useCallback(
    (path: string) => {
      openers.set(path, self)
      // A refused open leaves no window to close, so nobody owns the path.
      openDocument(window.harness, path, () => openers.get(path) === self && openers.delete(path))
    },
    [self]
  )
}
