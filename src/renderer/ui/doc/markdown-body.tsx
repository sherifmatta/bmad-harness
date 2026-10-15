import { useMemo } from 'react'
import type { JSX, ReactNode } from 'react'
import { renderMarkdown } from './render-markdown'

/**
 * Rendered markdown, and the one place in the product that sets inner HTML.
 *
 * The string it sets is `renderMarkdown`'s output and nothing else: markdown-it
 * with HTML off, then an allow-listed DOMPurify pass that fails closed
 * (FR58, NFR8). Where that pass cannot run the string is empty and the body is
 * too. Nothing project-supplied reaches this component except as markdown
 * source, and nothing reaches the page but through that pipeline.
 *
 * `className` names the surface drawing it: the document window's `doc-md` by
 * default, the chat's `turn-md` for a persona's finished turn. `fallback` is what
 * is drawn instead when the pipeline gave back nothing for words that were not
 * blank, so a turn is never an empty row.
 */
export function MarkdownBody({
  text,
  className = 'doc-md',
  fallback
}: {
  text: string
  className?: string
  fallback?: ReactNode
}): JSX.Element {
  const html = useMemo(() => renderMarkdown(text), [text])
  if (html === '' && fallback !== undefined && text.trim() !== '') {
    return <>{fallback}</>
  }
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
