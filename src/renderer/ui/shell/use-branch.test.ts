import { describe, expect, it } from 'vitest'
import { watchBranch } from './use-branch'
import type { FocusTarget } from './use-branch'

class FakeWindow implements FocusTarget {
  listeners = new Set<() => void>()
  addEventListener(_type: 'focus', listener: () => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: 'focus', listener: () => void) {
    this.listeners.delete(listener)
  }
  focus() {
    for (const listener of [...this.listeners]) {
      listener()
    }
  }
}

/** A bridge whose replies the test settles by hand, in any order. */
function manualBridge() {
  const pending: { resolve(value: string | null): void; reject(reason: unknown): void }[] = []
  return {
    pending,
    bridge: {
      getBranch: () =>
        new Promise<string | null>((resolve, reject) => {
          pending.push({ resolve, reject })
        })
    }
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('watchBranch', () => {
  it('asks on mount and again on every focus', async () => {
    const window = new FakeWindow()
    const answers = ['main', 'x']
    const seen: (string | null)[] = []
    watchBranch({ getBranch: async () => answers.shift() ?? null }, window, (b) => seen.push(b))
    await settle()
    window.focus()
    await settle()

    expect(seen).toEqual(['main', 'x'])
  })

  it('lets the latest ask win when replies arrive out of order', async () => {
    const window = new FakeWindow()
    const { bridge, pending } = manualBridge()
    const seen: (string | null)[] = []
    watchBranch(bridge, window, (b) => seen.push(b))
    window.focus()

    pending[1].resolve('new')
    await settle()
    pending[0].resolve('old')
    await settle()

    expect(seen).toEqual(['new'])
  })

  it('treats a missing method as no answer', () => {
    const seen: (string | null)[] = []
    watchBranch({}, new FakeWindow(), (b) => seen.push(b))
    watchBranch(undefined, new FakeWindow(), (b) => seen.push(b))

    expect(seen).toEqual([null, null])
  })

  it('treats a rejection as no answer', async () => {
    const seen: (string | null)[] = []
    watchBranch(
      {
        getBranch: async () => {
          throw new Error('nope')
        }
      },
      new FakeWindow(),
      (b) => seen.push(b)
    )
    await settle()

    expect(seen).toEqual([null])
  })

  it('drops an answer that lands after stop, and stops listening', async () => {
    const window = new FakeWindow()
    const { bridge, pending } = manualBridge()
    const seen: (string | null)[] = []
    const stop = watchBranch(bridge, window, (b) => seen.push(b))

    stop()
    pending[0].resolve('late')
    await settle()

    expect(seen).toEqual([])
    expect(window.listeners.size).toBe(0)
  })
})
