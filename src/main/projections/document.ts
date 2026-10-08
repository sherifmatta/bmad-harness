import type { DocKind, DocSnapshot, DocState } from '../../shared/document'
import type { DocRead } from '../sources/project/watch-document'

/**
 * The document read model: the latest thing main knows about one file, held as
 * a snapshot (FR56, AD-13).
 *
 * The first result the watcher delivers is the baseline. It is answered to the
 * window's first ask (`snapshot()`), never pushed. After that a snapshot is
 * pushed whenever it differs from the last, in text, state or truncation — not
 * per event — so a burst of writes is at most one push per distinct content.
 * `revision` goes up by one per snapshot that is handed out.
 *
 * A failed or non-text read never blanks the window: `missing`, `unreadable`
 * and `binary` change the state and keep the last good `text` (empty before
 * any good read). A `refused` document is one that resolved outside the output
 * folder it was opened under (`folder`, which the foot names).
 * If it was so at open it is a snapshot from the start, is never read, and
 * nothing changes it. If it becomes so later — the watcher's per-read check —
 * the state turns `refused` and the text is cleared, pushed like any change.
 */

export type DocumentProjection = {
  /** A result from the watcher. */
  apply(read: DocRead): void
  /** Resolves once there is a snapshot to answer the first ask with. */
  ready(): Promise<void>
  snapshot(): DocSnapshot
  dispose(): void
}

export function createDocumentProjection({
  path,
  fullPath,
  kind,
  folder,
  refused = false,
  onChange
}: {
  path: string
  fullPath: string
  kind: DocKind
  /** The output folder the document was opened under: project-relative, with a trailing `/`. */
  folder: string
  refused?: boolean
  onChange: (snapshot: DocSnapshot) => void
}): DocumentProjection {
  let state: DocState = refused ? 'refused' : 'missing'
  let text = ''
  let truncated = false
  let revision = refused ? 1 : 0
  let sent = ''
  let baselined = refused
  let disposed = false

  let markReady: () => void = () => {}
  const isReady = new Promise<void>((resolve) => {
    markReady = resolve
  })
  if (refused) {
    markReady()
  }

  const keyOf = (): string => JSON.stringify([state, text, truncated])
  const current = (): DocSnapshot => ({ revision, path, fullPath, kind, folder, state, text, truncated })

  return {
    apply(read) {
      if (disposed || refused) {
        return
      }

      state = read.state
      if (read.state === 'present') {
        text = read.text
        truncated = read.truncated
      } else if (read.state === 'refused') {
        // The file now leads outside the folder: nothing it said is kept.
        text = ''
        truncated = false
      }

      if (!baselined) {
        baselined = true
        revision = 1
        sent = keyOf()
        markReady()
        return
      }

      const key = keyOf()
      if (key === sent) {
        return
      }
      sent = key
      revision += 1
      onChange(current())
    },

    ready: () => isReady,

    snapshot: current,

    dispose() {
      disposed = true
    }
  }
}
