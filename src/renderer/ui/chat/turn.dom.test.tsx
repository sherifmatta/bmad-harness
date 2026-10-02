// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import '../testing/render-hook'
import { Turns } from './transcript'
import type { TranscriptEntry } from './transcript'

let container: HTMLElement
let root: Root

function render(entries: TranscriptEntry[], onCancel: (id: string) => void = () => {}): void {
  if (container === undefined || !container.isConnected) {
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  }
  act(() => root.render(createElement(Turns, { entries, onCancel })))
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const sent: TranscriptEntry = { kind: 'user', id: 'u1', at: 1, text: 'sent' }
const waiting: TranscriptEntry = {
  kind: 'user',
  id: 'u2',
  at: 2,
  text: 'waiting',
  queuedFor: 'John'
}

describe('Turns, queued', () => {
  it('marks only the queued entries, and cancel calls back with the entry’s id', () => {
    const cancelled: string[] = []
    render([sent, waiting], (id) => void cancelled.push(id))

    expect(container.querySelectorAll('.turn--queued')).toHaveLength(1)
    expect(container.querySelectorAll('button.turn-cancel')).toHaveLength(1)
    act(() => (container.querySelector('button.turn-cancel') as HTMLButtonElement).click())
    expect(cancelled).toEqual(['u2'])
  })

  it('promotion keeps the same DOM node, dropping only the marker and the modifier', () => {
    render([sent, waiting])
    const node = container.querySelectorAll('.turn')[1] as HTMLElement
    expect(node.className).toBe('turn turn--user turn--queued')

    const promoted: TranscriptEntry = {
      kind: 'user',
      id: 'u2',
      at: 2,
      text: 'waiting'
    }
    render([sent, promoted])

    expect(container.querySelectorAll('.turn')[1]).toBe(node)
    expect(node.className).toBe('turn turn--user')
    expect(node.querySelector('.turn-queued')).toBeNull()
    expect(node.textContent).toContain('waiting')
  })
})
