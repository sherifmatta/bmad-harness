/**
 * A scroller jsdom can drive (Story 5.3): jsdom does no layout, so it reports
 * every height as zero and keeps no scroll position. This stands in for the
 * layout of the elements whose class is `scroll` or `party-scroll`: their
 * `clientHeight`, `scrollHeight` and `scrollTop` read from one `metrics`
 * object, `scrollTop` clamps as a browser's does, and every position the
 * product sets is recorded in `sets`. A fake `ResizeObserver` hands its
 * callbacks to `resize()`, which is the browser's delivery. Test support only:
 * nothing the product ships imports it.
 */

export type Metrics = { client: number; height: number; top: number }

export type FakeScroll = {
  metrics: Metrics
  /** Every value the product assigned to `scrollTop`, in order. */
  sets: number[]
  /** Deliver the observers' callbacks, as the browser does after a layout. */
  resize(): void
  /** How many elements are being observed. */
  observed(): number
  restore(): void
}

const SCROLLERS = ['scroll', 'party-scroll']

function isScroller(element: Element): boolean {
  return SCROLLERS.some((name) => element.classList.contains(name))
}

/** Install the fake layout. `observer: false` leaves `ResizeObserver` undefined, as in jsdom. */
export function installFakeScroll(initial: Partial<Metrics> = {}, observer = true): FakeScroll {
  const metrics: Metrics = { client: 400, height: 400, top: 0, ...initial }
  const sets: number[] = []
  const callbacks = new Set<() => void>()
  let watching = 0

  const original = {
    client: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight'),
    height: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight'),
    top: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop')
  }
  Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true,
    get(this: Element) {
      return isScroller(this) ? metrics.client : (original.client?.get?.call(this) as number)
    }
  })
  Object.defineProperty(Element.prototype, 'scrollHeight', {
    configurable: true,
    get(this: Element) {
      return isScroller(this) ? metrics.height : (original.height?.get?.call(this) as number)
    }
  })
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get(this: Element) {
      return isScroller(this) ? metrics.top : (original.top?.get?.call(this) as number)
    },
    set(this: Element, value: number) {
      if (!isScroller(this)) {
        original.top?.set?.call(this, value)
        return
      }
      sets.push(value)
      metrics.top = Math.min(Math.max(0, value), Math.max(0, metrics.height - metrics.client))
    }
  })

  const hadObserver = 'ResizeObserver' in globalThis
  const originalObserver = (globalThis as { ResizeObserver?: unknown }).ResizeObserver
  if (observer) {
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      private readonly callback: () => void
      private count = 0
      constructor(callback: () => void) {
        this.callback = callback
        callbacks.add(callback)
      }
      observe(): void {
        this.count += 1
        watching += 1
      }
      disconnect(): void {
        watching -= this.count
        this.count = 0
        callbacks.delete(this.callback)
      }
    }
  }

  return {
    metrics,
    sets,
    resize: () => callbacks.forEach((callback) => callback()),
    observed: () => watching,
    restore() {
      for (const [name, descriptor] of [
        ['clientHeight', original.client],
        ['scrollHeight', original.height],
        ['scrollTop', original.top]
      ] as const) {
        if (descriptor !== undefined) {
          Object.defineProperty(Element.prototype, name, descriptor)
        }
      }
      if (hadObserver) {
        ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = originalObserver
      } else {
        delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver
      }
    }
  }
}
