// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { followTheme } from './theme'
import type { ThemeDocument, ThemeIpc } from './theme'

/**
 * The production path of `followTheme`: no observer is handed in, so the real
 * `observeDocument` runs over a real `MutationObserver`, on a document that has
 * no root element yet, as a preload meets one.
 */

// This program has no DOM types (the build's node half), so the globals are named by hand.
const dom = globalThis as unknown as {
  MutationObserver: { prototype: object }
  Document: new () => ThemeDocument & {
    createElement(name: string): { getAttribute(name: string): string | null; setAttribute(name: string, value: string): void }
    createComment(text: string): unknown
    appendChild(node: unknown): unknown
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('following the theme with the real observer', () => {
  it('writes data-theme the moment the parser inserts <html>, and stops observing once it has', async () => {
    const disconnect = vi.spyOn(dom.MutationObserver.prototype as { disconnect(): void }, 'disconnect')
    const ipc: ThemeIpc = {
      sendSync: () => ({ choice: 'light', applied: 'light' }),
      on: () => {}
    }
    const doc = new dom.Document()
    expect(doc.documentElement).toBeNull()

    followTheme(ipc, doc)
    // Nothing to write on yet, and still watching.
    expect(disconnect).not.toHaveBeenCalled()

    const root = doc.createElement('html')
    doc.appendChild(root)
    await Promise.resolve()

    expect(root.getAttribute('data-theme')).toBe('light')
    expect(disconnect).toHaveBeenCalledTimes(1)

    // Disconnected: a later mutation of the document repaints nothing.
    root.setAttribute('data-theme', 'unchanged')
    doc.appendChild(doc.createComment('later'))
    await Promise.resolve()
    expect(root.getAttribute('data-theme')).toBe('unchanged')
    expect(disconnect).toHaveBeenCalledTimes(1)
  })
})
