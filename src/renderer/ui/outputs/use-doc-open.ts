import { useCallback, useEffect } from 'react'

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
 * back but whether main acted, and a refusal is swallowed here because nothing
 * legitimate produces one — a row's path is always a path under the output folder. With
 * no bridge (a preload that failed to load) it does nothing.
 */
export function openDocument(bridge: Partial<DocOpenBridge> | undefined, path: string): void {
  if (typeof bridge?.openDoc !== 'function') {
    return
  }
  bridge.openDoc(path).catch(() => {})
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
 * The rail's whole use of the document window: a function that opens a row's
 * document, and a subscription that calls `onClosed` with the row's path when
 * the window goes away. The bridge is read when it is used, never while
 * rendering, so the rows render wherever there is no window object at all.
 */
export function useDocOpen(onClosed: (path: string) => void): (path: string) => void {
  useEffect(() => connectDocClosed(window.harness, onClosed), [onClosed])
  return useCallback((path: string) => openDocument(window.harness, path), [])
}
