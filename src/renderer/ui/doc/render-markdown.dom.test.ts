// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import DOMPurify from 'dompurify'
import { PURIFY_CONFIG, markdownToHtml, renderMarkdown } from './render-markdown'

/**
 * The document window's whole reading path with the real sanitiser in it.
 *
 * `render-markdown.test.ts` runs in Node, where DOMPurify reports unsupported
 * and the pipeline fails closed to `''`, so it can only pin the allow-list as
 * data. This file opts into a DOM, which is the only place the allow-list is
 * ever applied to what markdown-it actually emits.
 */
describe('renderMarkdown with the real sanitiser', () => {
  it('has a working DOMPurify, so the Node fail-closed path is not being tested here', () => {
    expect(DOMPurify.isSupported).toBe(true)
  })

  it('keeps headings, emphasis, requirement ids and code', () => {
    const html = renderMarkdown('# Title\n\nsee **FR55** and `code`')

    expect(html).toContain('<h1>Title</h1>')
    expect(html).toContain('<strong>')
    expect(html).toContain('<span class="fr">FR55</span>')
    expect(html).toContain('<code>code</code>')
  })

  it('keeps strikethrough, which markdown-it emits as <s>', () => {
    expect(markdownToHtml('~~gone~~')).toContain('<s>gone</s>')
    expect(renderMarkdown('~~gone~~')).toContain('<s>gone</s>')
  })

  it('keeps the start of an ordered list that resumes after a block', () => {
    const source = ['1. one', '', '```', 'code', '```', '', '2. two', '', '3. three'].join('\n')

    expect(markdownToHtml(source)).toContain('<ol start="2">')
    expect(renderMarkdown(source)).toContain('<ol start="2">')
  })

  it('keeps tables', () => {
    const html = renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')

    expect(html).toContain('<table>')
    expect(html).toContain('<th>a</th>')
    expect(html).toContain('<td>2</td>')
  })

  it('turns raw HTML in the source into visible text, never an element', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>')

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
  })

  it('has no link, no image, no URL and no event handler as an element or attribute', () => {
    const html = renderMarkdown(
      '[click](javascript:alert(1)) ![pic](http://example.com/x.png) <a href="http://x" onclick="y()">z</a>'
    )
    const page = document.createElement('div')
    page.innerHTML = html

    expect(page.querySelectorAll('a, img, [href], [src], [onclick], [onerror]')).toHaveLength(0)
    // The raw markup is kept as text for the reader, which is the point of html:false.
    expect(page.textContent).toContain('<a href="http://x"')
  })

  it('strips an attribute outside the allow-list even on an allowed tag, under the real config', () => {
    const html = DOMPurify.sanitize(
      '<p style="color:red" id="x" data-a="1" aria-label="y" onclick="y()">t</p>',
      PURIFY_CONFIG
    )

    expect(html).toBe('<p>t</p>')
  })
})
