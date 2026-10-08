// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import type { RailRow } from '../../../shared/rail'
import '../testing/render-hook'
import { RoomPanel } from './room-panel'

const OPENED = new Date(2026, 9, 8, 14, 31).getTime()
const row = (path: string, extra: Partial<RailRow> = {}): RailRow => ({ path, state: 'saved', savedAt: 1, ...extra }) as RailRow

let container: HTMLElement
let root: Root

function mount(props: Partial<Parameters<typeof RoomPanel>[0]> = {}): void {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root.render(createElement(RoomPanel, { topic: undefined, openedAt: OPENED, rows: [], folder: '_bmad/', ...props })))
}

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const rows = (): [string, string][] =>
  [...container.querySelectorAll('.room-panel-row')].map((entry) => [
    entry.querySelector('.room-panel-key')?.textContent ?? '',
    entry.querySelector('.room-panel-value')?.textContent ?? ''
  ])

describe('RoomPanel', () => {
  it('is an aside labelled room with one heading, Room, and four rows', () => {
    mount()

    const aside = container.querySelector('aside') as HTMLElement
    expect(aside.getAttribute('aria-label')).toBe('room')
    expect(aside.className).toBe('party-side')
    expect([...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((heading) => heading.textContent)).toEqual(['Room'])
    expect(rows().map(([key]) => key)).toEqual(['topic', 'opened', 'context', 'writes to'])
  })

  it('reads a room just opened', () => {
    mount()

    expect(rows()).toEqual([
      ['topic', 'none yet'],
      ['opened', '14:31 by you'],
      ['context', 'none'],
      ['writes to', '_bmad/party/2026-10-08-<topic>.md']
    ])
  })

  it('writes under a chosen folder (Story 5.4)', () => {
    mount({ topic: 'Payouts', folder: 'docs/out/' })

    expect(rows()[3]).toEqual(['writes to', 'docs/out/party/2026-10-08-payouts.md'])
  })

  it('follows the topic into the destination', () => {
    mount({ topic: 'Payouts —' })

    expect(rows()[0]).toEqual(['topic', 'Payouts —'])
    expect(rows()[3]).toEqual(['writes to', '_bmad/party/2026-10-08-payouts.md'])
  })

  it('lists the rail rows the room did not write, in rail order, one per line', () => {
    mount({ rows: [row('_bmad/PRD.md'), row('_bmad/party/x.md', { room: true }), row('_bmad/architecture.md')] })

    const paths = [...container.querySelectorAll('.room-panel-row:nth-child(4) .room-panel-path')].map((path) => path.textContent)
    expect(paths).toEqual(['_bmad/PRD.md', '_bmad/architecture.md'])
  })

  it('draws a path as text', () => {
    mount({ rows: [row('_bmad/<i>x</i>.md')] })

    expect(container.querySelector('i')).toBeNull()
    expect(rows()[2]?.[1]).toBe('_bmad/<i>x</i>.md')
  })

  it('has no live region, no role and nothing for any other section', () => {
    mount()

    expect(container.innerHTML).not.toMatch(/aria-liv[e]|role=|disagree|decision|open question/i)
  })
})
