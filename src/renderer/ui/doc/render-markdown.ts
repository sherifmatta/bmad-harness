import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import type { StateCore, Token } from 'markdown-it'

/**
 * The trust boundary of the document window (FR58, NFR8, AD-13).
 *
 * Project markdown is written by models and by people, and is untrusted. It
 * passes through two independent layers, and only what survives both ever
 * reaches the page:
 *
 *  1. `markdownToHtml` — `markdown-it` with `html: false`, so raw HTML in the
 *     source is escaped to visible text and never becomes an element; image
 *     tokens are dropped and their alt text kept as plain text; link tokens are
 *     dropped and their text kept, with no `href` anywhere (links are inert:
 *     the window navigates nowhere). Requirement ids are wrapped in a span.
 *     Pure, and exercised in full under Node.
 *  2. `sanitizeHtml` — DOMPurify with an explicit allow-list of tags and
 *     attributes. It **fails closed**: where DOMPurify is unsupported, which is
 *     what Node gives it and so what the test suite runs in, it returns `''`
 *     and never its input. Returning the input there would make every test of
 *     the pipeline pass through an unsanitised path.
 *
 * The one place in the product that sets inner HTML is fed only by `renderMarkdown`.
 */

/** Requirement ids: `FR55`, `NFR8`, `UX-DR27`, `AD-14`, `CAP-7`. */
const REQUIREMENT_ID = /\b(?:UX-DR|NFR|FR|AD|CAP)-?\d+\b/g

/** The tags rendered markdown can be. No `a`, because links are already text. */
export const ALLOWED_TAGS: readonly string[] = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'em',
  'strong',
  'del',
  'hr',
  'br',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'span'
]

/** The only attribute an element may carry. */
export const ALLOWED_ATTR: readonly string[] = ['class']

/** Named even though the allow-list already excludes them: a second, independent statement. */
export const FORBID_TAGS: readonly string[] = ['style', 'img', 'script', 'iframe', 'form']

/** Likewise: `style`, every URL-bearing attribute, and the event handlers. */
export const FORBID_ATTR: readonly string[] = [
  'style',
  'href',
  'src',
  'srcset',
  'onclick',
  'ondblclick',
  'onerror',
  'onload',
  'onabort',
  'onblur',
  'onchange',
  'onfocus',
  'oninput',
  'onkeydown',
  'onkeyup',
  'onmousedown',
  'onmouseenter',
  'onmouseleave',
  'onmousemove',
  'onmouseout',
  'onmouseover',
  'onmouseup',
  'onpointerdown',
  'onpointerup',
  'onsubmit',
  'ontoggle',
  'onwheel'
]

/**
 * A text token of `content`. Built from the state's own constructor so the
 * token belongs to the same markdown-it instance that will render it.
 */
function textToken(state: StateCore, content: string): Token {
  const token = new state.Token('text', '', 0)
  token.content = content
  return token
}

/**
 * Make what the source said inert, and mark the ids. Runs as the last core
 * rule, after `text_join`, over the children of every inline token.
 *
 * Images become their alt text; `token.content` is the raw alt. Links lose
 * their open and close tokens and keep what was between them. A table cell
 * loses its alignment style. Then, over
 * `text` tokens only, never `code_inline` or a fence, each requirement id is
 * wrapped. A token type the renderer has a rule for is the only way to get a
 * span out, so nothing the author wrote can name a class.
 */
function inertAndMarked(state: StateCore): void {
  for (const block of state.tokens) {
    // A table's column alignment is a `style` attribute; the page has none.
    if (block.type === 'th_open' || block.type === 'td_open') {
      block.attrs = null
      continue
    }
    if (block.type !== 'inline' || block.children === null) {
      continue
    }

    const children: Token[] = []
    for (const child of block.children) {
      if (child.type === 'link_open' || child.type === 'link_close') {
        continue
      }
      if (child.type === 'image') {
        children.push(textToken(state, child.content))
        continue
      }
      children.push(child)
    }

    const marked: Token[] = []
    for (const child of children) {
      if (child.type !== 'text') {
        marked.push(child)
        continue
      }

      let from = 0
      for (const match of child.content.matchAll(REQUIREMENT_ID)) {
        if (match.index > from) {
          marked.push(textToken(state, child.content.slice(from, match.index)))
        }
        marked.push(new state.Token('requirement_open', 'span', 1))
        marked.push(textToken(state, match[0]))
        marked.push(new state.Token('requirement_close', 'span', -1))
        from = match.index + match[0].length
      }
      marked.push(from === 0 ? child : textToken(state, child.content.slice(from)))
    }
    block.children = marked
  }
}

/**
 * The markdown layer: HTML off, no linkify, no typographer, images and links
 * made inert, requirement ids wrapped in `<span class="fr">`.
 */
export function createMarkdown(): InstanceType<typeof MarkdownIt> {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false })
  md.core.ruler.push('harness_inert_and_marked', inertAndMarked)
  md.renderer.rules['requirement_open'] = () => '<span class="fr">'
  md.renderer.rules['requirement_close'] = () => '</span>'
  return md
}

const markdown = createMarkdown()

/** Markdown source to HTML, before sanitising. Never put this on a page. */
export function markdownToHtml(text: string): string {
  return markdown.render(text)
}

/** The part of DOMPurify the sanitiser uses, so a test can stand in for it. */
export type Purifier = {
  isSupported?: boolean
  sanitize?: (dirty: string, config: Record<string, unknown>) => unknown
}

/** The DOMPurify configuration: the allow-list, stated explicitly. */
export const PURIFY_CONFIG = {
  ALLOWED_TAGS: [...ALLOWED_TAGS],
  ALLOWED_ATTR: [...ALLOWED_ATTR],
  FORBID_TAGS: [...FORBID_TAGS],
  FORBID_ATTR: [...FORBID_ATTR],
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
  ALLOW_UNKNOWN_PROTOCOLS: false
}

/**
 * The sanitising layer. Fails closed: with no working DOMPurify it returns the
 * empty string, never the input.
 */
export function sanitizeHtml(html: string, purifier: Purifier = DOMPurify): string {
  if (purifier.isSupported !== true || typeof purifier.sanitize !== 'function') {
    return ''
  }
  return String(purifier.sanitize(html, { ...PURIFY_CONFIG }))
}

/** The whole pipeline: markdown to sanitised HTML. */
export function renderMarkdown(text: string): string {
  return sanitizeHtml(markdownToHtml(text))
}
