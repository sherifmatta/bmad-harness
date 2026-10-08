/**
 * The geometry of a side panel's container, which jsdom has none of (Story 5.5):
 * every element whose class is `view-conversation` or `party-body` reports the width the
 * test sets from `getBoundingClientRect`, and a fake `ResizeObserver` hands its callbacks
 * to `resize()`, which is the browser's delivery after a layout. Test support only:
 * nothing the product ships imports it.
 */

export type FakePanels = {
  /** The width each container reports; set it and call `resize()` to narrow or widen the window. */
  widths: { 'view-conversation': number; 'party-body': number }
  /** Deliver the observers' callbacks, as the browser does after a layout. */
  resize(): void
  restore(): void
}

export function installFakePanels(initial: Partial<FakePanels['widths']> = {}): FakePanels {
  const widths = { 'view-conversation': 1200, 'party-body': 1200, ...initial }
  const callbacks = new Set<() => void>()
  const original = Element.prototype.getBoundingClientRect

  Element.prototype.getBoundingClientRect = function (this: Element): DOMRect {
    for (const name of ['view-conversation', 'party-body'] as const) {
      if (this.classList.contains(name)) {
        return { width: widths[name], height: 600, top: 0, left: 0, right: widths[name], bottom: 600, x: 0, y: 0, toJSON: () => ({}) }
      }
    }
    return original.call(this)
  }

  const hadObserver = 'ResizeObserver' in globalThis
  const originalObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    private readonly callback: () => void
    constructor(callback: () => void) {
      this.callback = callback
      callbacks.add(callback)
    }
    observe(): void {}
    disconnect(): void {
      callbacks.delete(this.callback)
    }
  }

  return {
    widths,
    resize: () => callbacks.forEach((callback) => callback()),
    restore() {
      Element.prototype.getBoundingClientRect = original
      if (hadObserver) {
        ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalObserver
      } else {
        delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
      }
    }
  }
}
