import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { RailRow } from '../../../shared/rail'
import { OutputRow } from './output-row'

const NOW = 1_000_000_000_000
const DAY = 24 * 60 * 60 * 1000

function render(row: RailRow, ownerName?: string, tabStop = false): string {
  return renderToStaticMarkup(
    <ul>
      <OutputRow
        row={row}
        ownerName={ownerName}
        now={NOW}
        tabStop={tabStop}
        onOpen={() => {}}
        onKey={() => {}}
        buttonRef={() => {}}
      />
    </ul>
  )
}

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length

const SAVED: RailRow = { path: '_bmad/planning-artifacts/prd.md', state: 'saved', savedAt: NOW - 3 * DAY }
const CHANGING: RailRow = { path: '_bmad/planning-artifacts/prd.md', state: 'changing' }
const EMPTY: RailRow = { path: '_bmad/planning-artifacts/prd.md', state: 'not-yet-written' }

describe('OutputRow', () => {
  it('is one list item holding one button: icon, name, then the meta cluster', () => {
    const markup = render(SAVED)

    expect(count(markup, /<li/g)).toBe(1)
    expect(count(markup, /<button/g)).toBe(1)
    expect(markup).toMatch(/^<ul><li class="output-row output-row--saved"><button type="button" class="output-row-button focus-inset"/)
    expect(markup.indexOf('<li')).toBeLessThan(markup.indexOf('<button'))
    expect(markup.indexOf('<button')).toBeLessThan(markup.indexOf('file-icon'))
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

  it('is a native button with no role, title, link or second control', () => {
    for (const row of [SAVED, CHANGING, EMPTY]) {
      const markup = render(row, 'John')

      expect(markup).toMatch(/<button type="button"/)
      expect(markup).not.toMatch(/<input|<a |role=|title=|aria-label|style=/i)
      expect(count(markup, /<button/g)).toBe(1)
    }
  })

  it('is the list’s one tab stop with tabindex 0, and every other row -1', () => {
    expect(render(SAVED, undefined, true)).toContain('tabindex="0"')
    expect(render(SAVED, undefined, true)).not.toContain('tabindex="-1"')
    expect(render(SAVED, undefined, false)).toContain('tabindex="-1"')
    expect(render(SAVED, undefined, false)).not.toContain('tabindex="0"')
  })

  it('takes the shared inset ring through a class, and draws no ring of its own', () => {
    expect(render(SAVED)).toContain('class="output-row-button focus-inset"')
  })

  it('opens the file on click with the row’s project-relative path, and reports keys to its list', () => {
    const opened: string[] = []
    const keys: string[] = []
    const element = OutputRow({
      row: SAVED,
      now: NOW,
      tabStop: true,
      onOpen: (path) => opened.push(path),
      onKey: (event) => keys.push(event.key),
      buttonRef: () => {}
    })
    const button = (element.props as { children: { props: { onClick: () => void; onKeyDown: (e: { key: string }) => void } } }).children
    button.props.onClick()
    button.props.onKeyDown({ key: 'x' })

    expect(opened).toEqual(['_bmad/planning-artifacts/prd.md'])
    expect(keys).toEqual(['x'])
  })

  it('never says anything implying the harness wrote the file', () => {
    for (const row of [SAVED, CHANGING, EMPTY]) {
      expect(render(row, 'John')).not.toMatch(/\b(create|new|edit|generated|written by)\b/i)
    }
  })
})
