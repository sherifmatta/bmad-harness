/**
 * The one hostile-markdown fixture of the product (Story 1.12, kept by 7.2 and audited by 7.6): raw script, style
 * and image markup, a `javascript:` link, a remote image, an anchor with a handler, and a paragraph with a handler
 * and a style. It is source text a persona or a skill could write; the pipeline must draw all of it as words and
 * none of it as an element. The document window's pipeline test, the chat turn's test and the epic's audit all
 * read this one copy. Nothing here is imported by the product.
 */
export const HOSTILE_MARKDOWN: string = [
  '<script>alert(1)</script>',
  '',
  '<style>p{display:none}</style>',
  '',
  '<img src=x onerror=alert(1)>',
  '',
  '[click](javascript:alert(1)) ![pic](http://example.com/x.png) <a href="http://x" onclick="y()">z</a>',
  '',
  '<p onclick="y()" style="color:red">raw</p>'
].join('\n')
