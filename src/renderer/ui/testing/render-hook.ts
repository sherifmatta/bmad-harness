import { act, createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

/**
 * The smallest mount a DOM test needs: a React root on a detached node, wrapped
 * in `act` so effects and state updates have landed when it returns. A test
 * file opts into a DOM with `// @vitest-environment jsdom`; nothing here does
 * it for them, and nothing here is imported by the product.
 *
 * No test library is used because a hook under test needs only this much, and
 * a component under test needs the container it hands back.
 */

/** React reads this to decide whether `act` is expected; without it every update warns. */
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export type Mounted = {
  container: HTMLElement
  unmount(): void
}

/** Mount an element and let its effects run. */
export function mount(element: ReactElement): Mounted {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => root.render(element))

  let mounted = true
  return {
    container,
    unmount() {
      if (!mounted) {
        return
      }
      mounted = false
      act(() => root.unmount())
      container.remove()
    }
  }
}

export type MountedHook<T> = {
  /** The value the hook returned on its latest render. */
  readonly current: T
  /** How many times the hook has run, which is how many times it rendered. */
  readonly renders: number
  unmount(): void
}

/** Mount a component that does nothing but call `hook`, and expose what it returns. */
export function renderHook<T>(hook: () => T): MountedHook<T> {
  let current: T
  let renders = 0

  function Probe(): null {
    renders += 1
    current = hook()
    return null
  }

  const { unmount } = mount(createElement(Probe))
  return {
    get current() {
      return current
    },
    get renders() {
      return renders
    },
    unmount
  }
}

/** Let every already-settled promise run its continuations, inside `act`. */
export async function settle(): Promise<void> {
  await act(async () => {})
}

/** Run a callback inside `act`, for a push or a timer that updates state. */
export function inAct(callback: () => void): void {
  act(callback)
}
