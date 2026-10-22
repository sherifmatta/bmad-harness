import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { DocSnapshot } from '../../../shared/document'
import { DocWindowView } from './doc-app'

const FULL_PATH = '/work/falcon/_bmad/planning-artifacts/prd.md'

const SNAPSHOT: DocSnapshot = {
  revision: 1,
  path: '_bmad/planning-artifacts/prd.md',
  fullPath: FULL_PATH,
  kind: 'markdown',
  folder: '_bmad/',
  state: 'present',
  text: '# Title\n\nbody',
  truncated: false
}

function render(snapshot: DocSnapshot | null, failure: string | null = null): string {
  return renderToStaticMarkup(
    <DocWindowView
      snapshot={snapshot}
      failure={failure}
      onReveal={() => {}}
      onOpenInEditor={() => {}}
      onClose={() => {}}
    />
  )
}

const count = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length

describe('the title bar', () => {
  const markup = render(SNAPSHOT)

  it('carries the full path, not the basename', () => {
    expect(markup).toContain(`<span class="doc-path">${FULL_PATH}</span>`)
  })

  it('has exactly three buttons, in order: Reveal in Finder, Open in editor, Close', () => {
    const labels = [...markup.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(([, label]) => label)

    expect(count(markup, /<button/g)).toBe(3)
    expect(labels).toEqual(['Reveal in Finder', 'Open in editor', 'Close'])
    expect(count(markup, /type="button"/g)).toBe(3)
  })

  it('draws the three lights as decoration, hidden from assistive technology', () => {
    expect(markup).toMatch(/<span class="doc-lights" aria-hidden="true">(<span class="doc-light"><\/span>){3}<\/span>/)
  })

  it('has no fourth control: no link, input, select, menu or extra button', () => {
    expect(markup).not.toMatch(/<a[\s>]|<input|<select|<textarea|role="menu|role="button|contenteditable/i)
  })

  it('puts the lights, the path and then the buttons in that order', () => {
    expect(markup.indexOf('doc-lights')).toBeLessThan(markup.indexOf('doc-path'))
    expect(markup.indexOf('doc-path')).toBeLessThan(markup.indexOf('doc-actions'))
  })
})

describe('the document region', () => {
  it('is a focusable article named Document, and not a dialog', () => {
    const markup = render(SNAPSHOT)

    expect(markup).toMatch(/<article class="doc-body focus-inset" tabindex="-1" aria-label="Document">/)
    expect(markup).not.toMatch(/role="dialog"|aria-modal/)
  })

  it('renders a text document as a mono pre, with its text as a text child', () => {
    const markup = render({ ...SNAPSHOT, kind: 'text', text: '<script>alert(1)</script>\na = 1' })

    expect(markup).toContain('<pre class="doc-text">&lt;script&gt;alert(1)&lt;/script&gt;\na = 1</pre>')
    expect(markup).not.toContain('doc-md')
    expect(markup).not.toContain('<script')
  })

  it('renders a markdown document through the markdown body, and never as a raw string', () => {
    const markup = render(SNAPSHOT)

    // Under Node the sanitiser fails closed, so the body is empty: the point is
    // that the source text is not in the page other than through the pipeline.
    expect(markup).toContain('<div class="doc-md"></div>')
    expect(markup).not.toContain('# Title')
  })

  it('is empty before the first snapshot: no spinner, no sentence', () => {
    const markup = render(null)

    expect(markup).toContain('<article class="doc-body focus-inset" tabindex="-1" aria-label="Document"></article>')
    expect(markup).not.toMatch(/load|wait|spinner|skeleton/i)
  })

  it('says why, as one line, when the first snapshot could not be had', () => {
    const markup = render(null, 'doc · no document is open for this window')

    expect(markup).toContain('<p class="doc-failure">doc · no document is open for this window</p>')
  })

  it('keeps the last text for a document that has gone missing', () => {
    const markup = render({ ...SNAPSHOT, kind: 'text', state: 'missing', text: 'kept' })

    expect(markup).toContain('<pre class="doc-text">kept</pre>')
  })
})

describe('the foot', () => {
  it('reads the state on the left and the kind on the right', () => {
    const markup = render(SNAPSHOT)

    expect(markup).toContain(
      '<div class="doc-foot"><span>separate window · read-only preview · reloads on write</span>' +
        '<span class="doc-foot-kind">markdown · utf-8</span></div>'
    )
  })

  it.each([
    ['missing', 'no longer on disk'],
    ['refused', 'outside _bmad/ · not opened'],
    ['unreadable', 'could not be read'],
    ['binary', 'not shown · binary']
  ] as const)('reads %s as %s', (state, line) => {
    expect(render({ ...SNAPSHOT, state })).toContain(`<span>${line}</span>`)
  })

  it('names the first 1 MiB only for a truncated file', () => {
    expect(render({ ...SNAPSHOT, truncated: true })).toContain('markdown · utf-8 · first 1 MiB')
    expect(render(SNAPSHOT)).not.toContain('MiB')
  })
})

describe('a refused document', () => {
  it('disables the two escapes and leaves Close alone', () => {
    const markup = render({ ...SNAPSHOT, state: 'refused', text: '' })
    const buttons = [...markup.matchAll(/<button([^>]*)>([^<]*)<\/button>/g)]

    expect(buttons.map(([, attributes]) => attributes.includes('disabled'))).toEqual([true, true, false])
  })

  it('leaves all three enabled for a document that is present', () => {
    expect(render(SNAPSHOT)).not.toContain('disabled')
  })
})

describe('the scrim', () => {
  it('is decoration with no handler: a click on it does nothing', () => {
    const markup = render(SNAPSHOT)

    expect(markup).toContain('<div class="doc-scrim" aria-hidden="true"></div>')
    expect(markup).not.toMatch(/onclick/i)
  })
})
