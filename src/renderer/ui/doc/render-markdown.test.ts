import { describe, expect, it, vi } from 'vitest'
import {
  ALLOWED_ATTR,
  ALLOWED_TAGS,
  FORBID_ATTR,
  FORBID_TAGS,
  PURIFY_CONFIG,
  createMarkdown,
  markdownToHtml,
  renderMarkdown,
  sanitizeHtml
} from './render-markdown'

const HOSTILE = [
  '<div onclick="steal()">raw html</div>',
  '',
  '<style>body{display:none}</style>',
  '',
  '<script>alert(1)</script>',
  '',
  '<img src=x onerror=alert(1)>',
  '',
  '![a picture](http://example.com/a.png)',
  '',
  '[a link](https://example.com/page) and [bad](javascript:alert(1)) and <https://auto.example.com>',
  '',
  '[ref]: http://example.com/ref',
  '',
  '[by reference][ref]'
].join('\n')

describe('markdownToHtml: the hostile fixture', () => {
  const html = markdownToHtml(HOSTILE)

  it('makes no element of raw HTML, a style, a script or an image', () => {
    expect(html).not.toMatch(/<script|<style|<img|<div|<iframe|<form/i)
    // An attribute is something inside a tag; the escaped text above may say
    // `onclick=` as words, and that is the point of escaping it.
    expect(html).not.toMatch(/<[^>]*\son\w+\s*=/i)
  })

  it('shows the raw HTML, the style and the script as escaped text instead', () => {
    expect(html).toContain('&lt;div onclick=&quot;steal()&quot;&gt;raw html&lt;/div&gt;')
    expect(html).toContain('&lt;style&gt;body{display:none}&lt;/style&gt;')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('carries no href, src or srcset at all', () => {
    expect(html).not.toMatch(/<[^>]*\s(?:href|src|srcset|style)\s*=/i)
    expect(html).not.toContain('<a')
  })

  it('turns an image into its alt text', () => {
    expect(html).toContain('a picture')
    expect(html).not.toContain('example.com/a.png')
  })

  it('turns a link into its text: inline, by reference, and an autolink', () => {
    expect(html).toContain('a link')
    expect(html).toContain('by reference')
    expect(html).not.toContain('example.com/page')
    expect(html).not.toContain('example.com/ref')
    // An autolink has no other text than its address, which stays as plain text.
    expect(html).toContain('https://auto.example.com')
    expect(html).not.toMatch(/<a[\s>]/)
  })

  it('does not link a bare URL', () => {
    expect(markdownToHtml('see https://example.com/x now')).toBe('<p>see https://example.com/x now</p>\n')
  })

  it('leaves no style attribute, even on an aligned table', () => {
    const table = markdownToHtml('| a | b |\n|:--|--:|\n| 1 | 2 |\n')

    expect(table).not.toMatch(/style=/)
    expect(table).toContain('<th>a</th>')
    expect(table).toContain('<td>2</td>')
  })
})

describe('markdownToHtml: what markdown is allowed to be', () => {
  it('keeps headings, paragraphs, lists, emphasis, quotes, rules, code and tables', () => {
    const html = markdownToHtml(
      [
        '# One',
        '## Two',
        '### Three',
        '',
        'A *soft* and **hard** and ~~struck~~ word with `code`.',
        '',
        '- a',
        '- b',
        '',
        '1. x',
        '2. y',
        '',
        '> quoted',
        '',
        '---',
        '',
        '```js',
        'const x = 1',
        '```',
        '',
        '| h1 | h2 |',
        '|----|----|',
        '| c1 | c2 |'
      ].join('\n')
    )

    for (const tag of [
      '<h1>',
      '<h2>',
      '<h3>',
      '<p>',
      '<em>',
      '<strong>',
      '<s>',
      '<code>',
      '<ul>',
      '<ol>',
      '<li>',
      '<blockquote>',
      '<hr>',
      '<pre>',
      '<table>',
      '<thead>',
      '<tbody>',
      '<th>',
      '<td>'
    ]) {
      expect(html, tag).toContain(tag)
    }
  })

  it('does not turn straight quotes or dashes into typography', () => {
    expect(markdownToHtml('"quoted" -- (c)')).toBe('<p>&quot;quoted&quot; -- (c)</p>\n')
  })
})

describe('markdownToHtml: requirement ids', () => {
  it.each(['FR55', 'NFR8', 'UX-DR27', 'AD-14', 'CAP-7', 'AD14'])('wraps %s in a .fr span', (id) => {
    expect(markdownToHtml(`see ${id} here`)).toBe(`<p>see <span class="fr">${id}</span> here</p>\n`)
  })

  it('wraps several in one line, and leaves the text around them alone', () => {
    expect(markdownToHtml('FR55, NFR8 and UX-DR27.')).toBe(
      '<p><span class="fr">FR55</span>, <span class="fr">NFR8</span> and <span class="fr">UX-DR27</span>.</p>\n'
    )
  })

  it('wraps them in headings, emphasis and link text', () => {
    expect(markdownToHtml('# About FR55')).toBe('<h1>About <span class="fr">FR55</span></h1>\n')
    expect(markdownToHtml('*FR55*')).toContain('<em><span class="fr">FR55</span></em>')
    expect(markdownToHtml('[FR55](http://x.example)')).toBe('<p><span class="fr">FR55</span></p>\n')
  })

  it('never wraps them inside code: an inline span or a fence', () => {
    expect(markdownToHtml('use `FR55` here')).toBe('<p>use <code>FR55</code> here</p>\n')
    expect(markdownToHtml('```\nFR55 and NFR8\n```')).toBe('<pre><code>FR55 and NFR8\n</code></pre>\n')
  })

  it('does not wrap a look-alike inside a longer word', () => {
    for (const text of ['NFRX8', 'SAFR55', 'FR', 'FR-', 'AD-', 'CAPS-7']) {
      expect(markdownToHtml(text), text).not.toContain('class="fr"')
    }
    expect(markdownToHtml('SAFR55')).toBe('<p>SAFR55</p>\n')
  })

  it('cannot be made to produce a class by the author', () => {
    expect(markdownToHtml('<span class="fr">x</span>')).toBe('<p>&lt;span class=&quot;fr&quot;&gt;x&lt;/span&gt;</p>\n')
  })
})

describe('createMarkdown', () => {
  it('turns HTML, linkify and the typographer off', () => {
    const { options } = createMarkdown()

    expect(options.html).toBe(false)
    expect(options.linkify).toBe(false)
    expect(options.typographer).toBe(false)
  })
})

describe('sanitizeHtml: fails closed', () => {
  it('returns the empty string where DOMPurify is unsupported, which is Node', () => {
    expect(sanitizeHtml('<p>hello</p>')).toBe('')
    expect(sanitizeHtml('<script>alert(1)</script>')).toBe('')
  })

  it('returns the empty string for a purifier that is unsupported or has no sanitize', () => {
    const sanitize = vi.fn(() => '<p>x</p>')

    expect(sanitizeHtml('<p>x</p>', { isSupported: false, sanitize })).toBe('')
    expect(sanitizeHtml('<p>x</p>', { isSupported: true })).toBe('')
    expect(sanitizeHtml('<p>x</p>', {})).toBe('')
    expect(sanitize).not.toHaveBeenCalled()
  })

  it('never returns its input when it cannot sanitise', () => {
    for (const input of ['<b>x</b>', 'plain', '']) {
      expect(sanitizeHtml(input)).not.toContain(input === '' ? 'x' : input)
    }
  })

  it('hands a supported purifier the markup and the allow-list, and returns what it returns', () => {
    const sanitize = vi.fn((dirty: string) => `clean:${dirty}`)

    expect(sanitizeHtml('<p>x</p>', { isSupported: true, sanitize })).toBe('clean:<p>x</p>')
    expect(sanitize).toHaveBeenCalledWith('<p>x</p>', PURIFY_CONFIG)
  })

  it('renders nothing at all through the whole pipeline under Node', () => {
    expect(renderMarkdown('# hello FR55')).toBe('')
  })
})

describe('the allow-list', () => {
  it('is the tags rendered markdown can be, and no more', () => {
    expect([...ALLOWED_TAGS].sort()).toEqual(
      [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
        'em', 'strong', 'del', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span'
      ].sort()
    )
  })

  it('has no anchor, image, script, style, frame or form, and the forbid list names them', () => {
    for (const tag of ['a', 'img', 'script', 'style', 'iframe', 'form', 'svg', 'math', 'object']) {
      expect(ALLOWED_TAGS, tag).not.toContain(tag)
    }
    expect([...FORBID_TAGS].sort()).toEqual(['form', 'iframe', 'img', 'script', 'style'])
  })

  it('allows the class attribute and nothing else', () => {
    expect(ALLOWED_ATTR).toEqual(['class'])
    expect(PURIFY_CONFIG.ALLOW_DATA_ATTR).toBe(false)
    expect(PURIFY_CONFIG.ALLOW_ARIA_ATTR).toBe(false)
  })

  it('forbids style, every URL-bearing attribute and the event handlers by name', () => {
    for (const attribute of ['style', 'href', 'src', 'srcset', 'onclick', 'onerror', 'onload']) {
      expect(FORBID_ATTR, attribute).toContain(attribute)
    }
    expect(FORBID_ATTR.filter((name) => name.startsWith('on')).length).toBeGreaterThan(10)
  })
})
