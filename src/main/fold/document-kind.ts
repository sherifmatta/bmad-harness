import type { DocKind } from '../../shared/document'

/**
 * How a document is rendered, decided from its name alone: a `.md` or
 * `.markdown` extension (any case) is markdown, everything else is plain text.
 * The extension of the last path segment only, so a directory named `x.md`
 * does not make its files markdown.
 */
export function documentKindFor(path: string): DocKind {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) {
    return 'text'
  }
  const extension = name.slice(dot + 1).toLowerCase()
  return extension === 'md' || extension === 'markdown' ? 'markdown' : 'text'
}
