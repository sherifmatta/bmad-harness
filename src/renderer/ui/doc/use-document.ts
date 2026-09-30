import { useEffect, useState } from 'react'
import type { DocSnapshot } from '../../../shared/document'
import { acceptDocument, connectDocument } from './document-state'

/**
 * The document window's whole view of the file: the latest snapshot main has
 * pushed, or the reason it has none. Nothing is shown before the first one, and
 * the window never reads anything itself.
 *
 * `available` is false when the preload did not load: there is then no bridge
 * at all, and the window says so instead of throwing.
 */
export function useDocument(): {
  snapshot: DocSnapshot | null
  failure: string | null
  available: boolean
} {
  const [snapshot, setSnapshot] = useState<DocSnapshot | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const available =
    typeof window.docWindow?.getDocument === 'function' &&
    typeof window.docWindow?.onDocumentChanged === 'function'

  useEffect(() => {
    if (!available) {
      return
    }
    return connectDocument(window.docWindow, {
      onSnapshot: (incoming) => {
        setSnapshot((current) => acceptDocument(current, incoming))
        setFailure(null)
      },
      onFailure: setFailure
    })
  }, [available])

  return { snapshot, failure, available }
}
