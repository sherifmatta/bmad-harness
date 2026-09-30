import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { RailRow } from '../../../shared/rail'
import { OutputRow } from './output-row'

const NOW = 1_000_000_000_000
const DAY = 24 * 60 * 60 * 1000

function render(row: RailRow, ownerName?: string): string {
  return renderToStaticMarkup(
    <ul>
      <OutputRow row={row} ownerName={ownerName} now={NOW} />
    </ul>
  )
}

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length

const SAVED: RailRow = { path: '_bmad/planning-artifacts/prd.md', state: 'saved', savedAt: NOW - 3 * DAY }
const CHANGING: RailRow = { path: '_bmad/planning-artifacts/prd.md', state: 'changing' }
const EMPTY: RailRow = { path: '_bmad/planning-artifacts/prd.md', state: 'not-yet-written' }

describe('OutputRow', () => {
  it('is one list item: icon, name, then the meta cluster', () => {
    const markup = render(SAVED)

    expect(count(markup, /<li/g)).toBe(1)
    expect(markup.indexOf('file-icon')).toBeLessThan(markup.indexOf('output-row-name'))
    expect(markup.indexOf('output-row-name')).toBeLessThan(markup.indexOf('output-row-meta'))
    expect(markup).toContain('<span class="output-row-name">prd.md</span>')
  })

  it('reads saved with its age, and draws no dot', () => {
    const markup = render(SAVED)

    expect(markup).toContain('output-row--saved')
    expect(markup).toContain('saved · 3d')
    expect(markup).not.toContain('status-dot')
  })

  it('reads not yet written, and draws no dot', () => {
    const markup = render(EMPTY)

    expect(markup).toContain('output-row--not-yet-written')
    expect(markup).toContain('not yet written')
    expect(markup).not.toContain('status-dot')
  })

  it('reads changing with the work dot before its text, hidden from assistive technology', () => {
    const markup = render(CHANGING)

    expect(markup).toContain('output-row--changing')
    expect(count(markup, /class="status-dot /g)).toBe(1)
    expect(markup).toContain('status-dot--work')
    expect(markup).toMatch(/<span class="status-dot status-dot--work" aria-hidden="true"><\/span>changing</)
  })

  it('draws the icon as decoration, stroked by the row colour, never by a literal', () => {
    const markup = render(SAVED)

    expect(markup).toMatch(/<svg class="file-icon"[^>]*aria-hidden="true"/)
    expect(markup).toContain('viewBox="0 0 12 14"')
    expect(count(markup, /stroke="currentColor"/g)).toBe(2)
    expect(markup).not.toMatch(/#[0-9a-f]{3,6}|rgb/i)
  })

  it('shows the owner only when resolved, and nothing in its place otherwise', () => {
    expect(render(SAVED, 'John')).toContain('<span class="output-row-owner">John</span>')
    expect(render(SAVED)).not.toContain('output-row-owner')
  })

  it('draws the annotation tag only when there is one, before the owner and the state', () => {
    const annotated = render({ ...SAVED, annotation: { text: 'section 2' } }, 'John')

    expect(annotated).toContain('<span class="output-row-annotation">section 2</span>')
    expect(annotated.indexOf('output-row-annotation')).toBeLessThan(annotated.indexOf('output-row-owner'))
    expect(annotated.indexOf('output-row-owner')).toBeLessThan(annotated.indexOf('output-row-state'))
  })

  it('lays out identically with and without an annotation: the slot renders nothing, not an empty box', () => {
    const bare = render(SAVED, 'John')
    const annotated = render({ ...SAVED, annotation: { text: 'x' } }, 'John')

    expect(bare).not.toContain('output-row-annotation')
    expect(annotated.replace(/<span class="output-row-annotation">x<\/span>/, '')).toBe(bare)
  })

  it('renders hostile text as text', () => {
    const markup = render(
      { path: '_bmad/<img src=x onerror=alert(1)>.md', state: 'saved', savedAt: NOW, annotation: { text: '<script>x</script>' } },
      '<b>Mallory</b>'
    )

    expect(markup).not.toMatch(/<img|<script|<b>/)
    expect(markup).toContain('&lt;img src=x onerror=alert(1)&gt;.md')
    expect(markup).toContain('&lt;script&gt;x&lt;/script&gt;')
    expect(markup).toContain('&lt;b&gt;Mallory&lt;/b&gt;')
  })

  it('is static: no control, role, tab stop or title', () => {
    for (const row of [SAVED, CHANGING, EMPTY]) {
      expect(render(row, 'John')).not.toMatch(/<button|<input|<a |role=|tabindex|title=|onclick/i)
    }
  })

  it('never says anything implying the harness wrote the file', () => {
    for (const row of [SAVED, CHANGING, EMPTY]) {
      expect(render(row, 'John')).not.toMatch(/\b(create|new|edit|generated|written by)\b/i)
    }
  })
})
