import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { Sysline } from './sysline'
import { Turns } from './transcript'
import type { TranscriptEntry } from './transcript'

const text = 'handed to John'

describe('Sysline', () => {
  it('is the harness’s own line: one container, one span of text, and nothing that names a persona', () => {
    expect(renderToStaticMarkup(<Sysline text={text} />)).toBe(
      `<div class="sysline"><span class="sysline-text">${text}</span></div>`
    )
  })

  it('renders hostile text as text', () => {
    const out = renderToStaticMarkup(<Sysline text="<img src=x onerror=1>" />)

    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })

  it('has no portrait, name, role, time, button, aria role or live region', () => {
    const out = renderToStaticMarkup(<Sysline text={text} />)

    expect(out).not.toMatch(/turn|portrait|initials|<button|<svg|role=|aria-|tabindex|style=/i)
  })
})

describe('Turns, with a sysline among them', () => {
  const entries: TranscriptEntry[] = [
    { kind: 'user', id: 'u1', at: 1, text: 'hello' },
    { kind: 'sysline', id: 'm-1', at: 5, text },
    { kind: 'user', id: 'u2', at: 9, text: 'after' }
  ]

  it('draws it in time order between the turns, as a sysline and never as a turn', () => {
    const out = renderToStaticMarkup(<Turns entries={entries} />)

    expect(out.indexOf('hello')).toBeLessThan(out.indexOf(text))
    expect(out.indexOf(text)).toBeLessThan(out.indexOf('after'))
    expect(out.match(/class="turn /g)).toHaveLength(2)
    expect(out.match(/class="sysline"/g)).toHaveLength(1)
  })
})

describe('Turns, with a room’s sysline among them (Story 4.1)', () => {
  const entries: TranscriptEntry[] = [
    { kind: 'user', id: 'u1', at: 1, text: 'hello' },
    { kind: 'sysline', id: 'm-1', at: 5, text: 'room opened by you · present · Mary', room: true },
    { kind: 'sysline', id: 'm-2', at: 6, text }
  ]

  it('never draws it in a persona’s thread, and still draws the other sysline', () => {
    const out = renderToStaticMarkup(<Turns entries={entries} />)

    expect(out).not.toContain('room opened by you')
    expect(out).toContain(text)
    expect(out.match(/class="sysline"/g)).toHaveLength(1)
  })
})
