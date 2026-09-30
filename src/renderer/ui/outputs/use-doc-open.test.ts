import { describe, expect, it, vi } from 'vitest'
import { connectDocClosed, openDocument } from './use-doc-open'

describe('openDocument', () => {
  it('asks the bridge to open the row’s path, and nothing else', () => {
    const openDoc = vi.fn(() => Promise.resolve())

    openDocument({ openDoc }, '_bmad/planning-artifacts/prd.md')

    expect(openDoc).toHaveBeenCalledExactlyOnceWith('_bmad/planning-artifacts/prd.md')
  })

  it('swallows the rejection of a refused open', async () => {
    const swallowed: unknown[] = []
    const promise = Promise.reject({ code: 'doc/invalid-path', message: 'no' })
    const openDoc = vi.fn(() => promise)

    openDocument({ openDoc }, '../x')
    // The rejection has a handler, so awaiting the same promise's handled
    // twin resolves rather than surfacing it as unhandled.
    await promise.catch((reason: unknown) => swallowed.push(reason))

    expect(swallowed).toHaveLength(1)
    expect(openDoc).toHaveBeenCalledTimes(1)
  })

  it('does nothing, and does not throw, when there is no bridge', () => {
    expect(() => openDocument(undefined, '_bmad/a.md')).not.toThrow()
    expect(() => openDocument({}, '_bmad/a.md')).not.toThrow()
  })
})

describe('connectDocClosed', () => {
  it('hands the row’s path to the callback, and stops listening on disconnect', () => {
    let push: (path: string) => void = () => {}
    const unsubscribe = vi.fn()
    const onClosed = vi.fn()

    const disconnect = connectDocClosed(
      {
        onDocClosed: (listener) => {
          push = listener
          return unsubscribe
        }
      },
      onClosed
    )
    push('_bmad/planning-artifacts/prd.md')
    disconnect()

    expect(onClosed).toHaveBeenCalledExactlyOnceWith('_bmad/planning-artifacts/prd.md')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('returns a harmless disconnect when there is no bridge', () => {
    const disconnect = connectDocClosed(undefined, () => {})

    expect(() => disconnect()).not.toThrow()
  })
})
