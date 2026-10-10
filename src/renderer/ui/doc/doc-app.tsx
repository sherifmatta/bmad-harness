import { useEffect, useRef, useState } from 'react'
import type { JSX, Ref } from 'react'

import './doc-window.css'
import type { DocSnapshot, DocState } from '../../../shared/document'
import { Announcer } from '../a11y/announcer'
import { LiveRegion } from '../a11y/live-region'
import { announcementFor } from './document-state'
import { footLeft, footRight } from './foot-text'
import { MarkdownBody } from './markdown-body'
import { useDocument } from './use-document'

/** Run a bridge command whose refusal the window has nothing to say about. */
function run(command: () => Promise<void>): () => void {
  return () => {
    command().catch(() => {})
  }
}

/**
 * The document window's page (FR55, FR57, UX-DR27): a scrim and, over it, the
 * window card — title bar, reading surface, foot.
 *
 * The OS window around it is only the stage; this page paints the scrim and the
 * card. The scrim is inert. The title bar carries the full path in mono and
 * exactly three controls; nothing else in the page is a control, and there is
 * no refresh, edit or save because there is no path to any of them.
 *
 * `snapshot` is `null` before the first one arrives, and the card is then
 * simply empty: no spinner, no sentence. The reading surface is the focusable
 * document region and takes focus when the window opens.
 */
export function DocWindowView({
  snapshot,
  failure,
  regionRef,
  onReveal,
  onOpenInEditor,
  onClose
}: {
  snapshot: DocSnapshot | null
  failure: string | null
  regionRef?: Ref<HTMLElement>
  onReveal: () => void
  onOpenInEditor: () => void
  onClose: () => void
}): JSX.Element {
  // A refused document is never read or revealed: the two escapes are off.
  const refused = snapshot?.state === 'refused'

  return (
    <>
      <div className="doc-scrim" aria-hidden="true" />
      <div className="doc-window">
        <div className="doc-titlebar">
          <span className="doc-lights" aria-hidden="true">
            <span className="doc-light" />
            <span className="doc-light" />
            <span className="doc-light" />
          </span>
          <span className="doc-path">{snapshot?.fullPath ?? ''}</span>
          <span className="doc-actions">
            <button type="button" className="ghost-btn" disabled={refused} onClick={onReveal}>
              Reveal in Finder
            </button>
            <button type="button" className="ghost-btn" disabled={refused} onClick={onOpenInEditor}>
              Open in editor
            </button>
            <button type="button" className="ghost-btn" onClick={onClose}>
              Close
            </button>
          </span>
        </div>
        <article className="doc-body focus-inset" tabIndex={-1} aria-label="Document" ref={regionRef}>
          {snapshot === null ? (
            failure !== null && <p className="doc-failure">{failure}</p>
          ) : snapshot.kind === 'markdown' ? (
            <MarkdownBody text={snapshot.text} />
          ) : (
            <pre className="doc-text">{snapshot.text}</pre>
          )}
        </article>
        <div className="doc-foot">
          <span>{footLeft(snapshot)}</span>
          <span className="doc-foot-kind">{footRight(snapshot)}</span>
        </div>
      </div>
    </>
  )
}

/**
 * The page's root: it connects to the bridge, owns the window's one announcer
 * and mounts the one live region, takes focus into the document region, and
 * speaks only the transition into `missing`, `unreadable` or `binary`.
 */
export function DocApp(): JSX.Element {
  const { snapshot, failure, available } = useDocument()
  const [announcer] = useState(() => new Announcer())
  const region = useRef<HTMLElement>(null)
  const previous = useRef<DocState | null>(null)

  useEffect(() => {
    // Focus lands here so the arrow keys and Page Down scroll the document, but a ring on a region
    // nobody tabbed to reads as a stray frame: `focusVisible: false` takes focus without drawing one.
    region.current?.focus({ focusVisible: false })
  }, [])

  useEffect(() => {
    if (snapshot === null) {
      return
    }
    const message = announcementFor(previous.current, snapshot.state)
    previous.current = snapshot.state
    if (message !== null) {
      announcer.announce(message, performance.now())
    }
  }, [announcer, snapshot])

  // A preload that failed to load leaves no bridge at all.
  if (!available) {
    return <p className="doc-unavailable">bridge/unavailable · the preload did not load</p>
  }

  return (
    <>
      <DocWindowView
        snapshot={snapshot}
        failure={failure}
        regionRef={region}
        onReveal={run(() => window.docWindow.revealInFinder())}
        onOpenInEditor={run(() => window.docWindow.openInEditor())}
        onClose={run(() => window.docWindow.close())}
      />
      <LiveRegion announcer={announcer} />
    </>
  )
}
