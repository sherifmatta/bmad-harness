// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectRunRevealed, useReveal } from './use-reveal'

describe('connectRunRevealed', () => {
  it('hands the run id to the callback, and stops listening on disconnect', () => {
    let push: (runId: string) => void = () => {}
    const unsubscribe = vi.fn()
    const onRevealed = vi.fn()

    const disconnect = connectRunRevealed(
      {
        onRunRevealed: (listener) => {
          push = listener
          return unsubscribe
        }
      },
      onRevealed
    )
    push('run-1')
    disconnect()

    expect(onRevealed).toHaveBeenCalledExactlyOnceWith('run-1')
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('returns a harmless disconnect when there is no bridge, or a bridge without the method', () => {
    expect(() => connectRunRevealed(undefined, () => {})()).not.toThrow()
    expect(() => connectRunRevealed({}, () => {})()).not.toThrow()
  })
})

describe('useReveal', () => {
  // jsdom has no scrollIntoView: the stub records the element it was called on and with what.
  let scrolled: [Element, unknown[]][]
  beforeEach(() => {
    scrolled = []
    Element.prototype.scrollIntoView = function (this: Element, ...args: unknown[]) {
      scrolled.push([this, args])
    }
  })
  afterEach(() => {
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })

  type Props = { reveal: boolean; onRevealed?: () => void }

  function Probe({ reveal, onRevealed }: Props) {
    const ref = useRef<HTMLDivElement>(null)
    useReveal(ref, reveal, onRevealed)
    return createElement('div', { ref, className: 'target' })
  }

  let view: { container: HTMLElement; root: Root } | null = null
  afterEach(() => {
    if (view !== null) {
      const { container, root } = view
      act(() => root.unmount())
      container.remove()
      view = null
    }
  })

  /** The probe mounted once and re-rendered in place with new props, as React does when the holder's state changes. */
  function draw(first: Props) {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    const render = (next: Props): void => act(() => root.render(createElement(Probe, next)))
    render(first)
    view = { container, root }
    return { target: container.querySelector('.target') as Element, render }
  }

  it('scrolls the element into view once, instantly to its start, when reveal is true, and then says so', () => {
    const onRevealed = vi.fn()
    const { target } = draw({ reveal: true, onRevealed })

    expect(scrolled).toEqual([[target, [{ block: 'start' }]]])
    expect(onRevealed).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(document.body)
  })

  it('scrolls nothing while reveal is false, and scrolls when it turns true', () => {
    const onRevealed = vi.fn()
    const { target, render } = draw({ reveal: false, onRevealed })
    expect(scrolled).toEqual([])
    expect(onRevealed).not.toHaveBeenCalled()

    render({ reveal: true, onRevealed })

    expect(scrolled).toEqual([[target, [{ block: 'start' }]]])
    expect(onRevealed).toHaveBeenCalledTimes(1)
  })

  it('scrolls once per request: not again while reveal stays true, whatever else re-renders, and again for a new request', () => {
    const { render } = draw({ reveal: true, onRevealed: () => {} })
    expect(scrolled).toHaveLength(1)

    render({ reveal: true, onRevealed: () => {} })
    render({ reveal: true })
    expect(scrolled).toHaveLength(1)

    // Spent, then asked again: a second request, a second scroll.
    render({ reveal: false })
    render({ reveal: true })
    expect(scrolled).toHaveLength(2)
  })

  it('never says smooth, and never moves focus', () => {
    draw({ reveal: true })

    expect(JSON.stringify(scrolled[0][1])).not.toMatch(/smooth|behavior/)
    expect(document.activeElement).toBe(document.body)
  })
})
