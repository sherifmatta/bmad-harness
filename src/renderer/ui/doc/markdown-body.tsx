import { useMemo } from 'react'
import type { JSX } from 'react'
import { renderMarkdown } from './render-markdown'

/**
 * Rendered markdown, and the one place in the product that sets inner HTML.
 *
 * The string it sets is `renderMarkdown`'s output and nothing else: markdown-it
 * with HTML off, then an allow-listed DOMPurify pass that fails closed
 * (FR58, NFR8). Where that pass cannot run the string is empty and the body is
 * too. Nothing project-supplied reaches this component except as markdown
 * source, and nothing reaches the page but through that pipeline.
 */
export function MarkdownBody({ text }: { text: string }): JSX.Element {
  const html = useMemo(() => renderMarkdown(text), [text])
  return <div className="doc-md" dangerouslySetInnerHTML={{ __html: html }} />
}
