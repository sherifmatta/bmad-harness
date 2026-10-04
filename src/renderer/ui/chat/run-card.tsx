import { useCallback, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import './run-card.css'
import { RunNoteFeed } from '../feed/run-note-feed'
import { useNow } from '../outputs/use-now'
import { formatElapsed } from '../status/format-elapsed'
import { StatusDot } from '../status/status-dot'
import type { ProseStore } from './prose-store'
import { noteOf, runDotState, runStatusText, subjectSections } from './run-status'
import type { RunCardEntry } from './transcript-entry'

/** How often the elapsed counter re-reads the clock: it writes whole seconds. */
const ELAPSED_TICK_MS = 1000

/**
 * The run card — Story 3.1's thin slice of DESIGN.md's *Document card*: a
 * head, then a body holding the run-note feed and the document text being
 * written, in one scroll container, told apart by typeface alone (notes in
 * sans, prose in mono). Born on `run:started`, it never shows a spinner, a
 * skeleton, a progress bar or a sentence standing in for one: until the first
 * note or the first piece of prose the body is the feed, mounted and empty.
 *
 * **Prose is never React state.** The text is read from the prose store and
 * written straight into one text node, at most once per animation frame: the
 * store calls back once a frame however many pieces arrived, and each call
 * appends the new tail to the node, or replaces it when a new call began.
 * Nothing here renders per piece; the head re-renders only when the path, or
 * whether there is any text, changes.
 *
 * **One document per card** (Story 3.12). A run may write several files; the
 * head path and the body follow one of them, the store's subject (the path
 * with the largest single `Write` so far), and the foot names every other file
 * the run wrote, never drawing it. The saved count is the subject's sections.
 *
 * The card is `aria-busy` while its run is in flight. Its lifecycle is
 * announced by the window's one live region, not here, and prose never is.
 */
export function RunCard({ entry, prose }: { entry: RunCardEntry; prose: ProseStore }): JSX.Element {
  const { runId } = entry
  const running = entry.status === 'running'
  const subscribe = useCallback((listener: () => void) => prose.subscribe(runId, listener), [prose, runId])
  const pathOf = (): string => prose.get(runId)?.path ?? ''
  const textHeld = (): boolean => (prose.get(runId)?.text ?? '') !== ''
  const pathsOf = (): readonly string[] => prose.paths(runId)
  const path = useSyncExternalStore(subscribe, pathOf, pathOf)
  const hasText = useSyncExternalStore(subscribe, textHeld, textHeld)
  const paths = useSyncExternalStore(subscribe, pathsOf, pathsOf)
  const others = paths.filter((each) => each !== path)
  const sections = subjectSections(entry, path)

  return (
    <section className="run-card" aria-busy={running ? true : undefined}>
      <div className="run-card-head">
        <StatusDot state={runDotState(entry)} />
        <span className="run-card-path">{path}</span>
        <RunStatus entry={entry} sections={sections} />
        <RunElapsed entry={entry} />
      </div>
      <div className="run-card-body">
        <div className="run-card-flow">
          <RunNoteFeed notes={entry.notes.map((note) => noteOf(note.text, note.at))} />
          <div className="run-card-prose" hidden={!hasText}>
            <ProseText runId={runId} prose={prose} />
            {running && hasText && <span className="run-card-caret" aria-hidden="true" />}
          </div>
        </div>
      </div>
      {others.length > 0 && (
        <div className="run-card-foot">
          <span>also written</span>
          {others.map((other) => (
            <span className="run-card-foot-path" key={other}>
              {other}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

/** The status string, counting the subject's sections; only a saved card reads the clock, for its age. */
function RunStatus({ entry, sections }: { entry: RunCardEntry; sections: number }): JSX.Element {
  const className = `run-card-status run-card-status--${entry.status}`
  if (entry.status !== 'finished') {
    return <span className={className}>{runStatusText(entry, entry.endedAt ?? entry.at, sections)}</span>
  }
  return <SavedStatus entry={entry} sections={sections} className={className} />
}

function SavedStatus({ entry, sections, className }: { entry: RunCardEntry; sections: number; className: string }): JSX.Element {
  const now = useNow()
  return <span className={className}>{runStatusText(entry, now, sections)}</span>
}

/** Elapsed from `run:started.at`: ticking while the run is in flight, fixed once it ends. */
function RunElapsed({ entry }: { entry: RunCardEntry }): JSX.Element {
  if (entry.status === 'running') {
    return <TickingElapsed since={entry.at} />
  }
  return <span className="run-card-elapsed">{formatElapsed((entry.endedAt ?? entry.at) - entry.at)}</span>
}

function TickingElapsed({ since }: { since: number }): JSX.Element {
  const now = useNow(ELAPSED_TICK_MS)
  return <span className="run-card-elapsed">{formatElapsed(now - since)}</span>
}

/** The document text, written by the store's frame callback into one text node. */
function ProseText({ runId, prose }: { runId: string; prose: ProseStore }): JSX.Element {
  const host = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const element = host.current
    if (element === null) {
      return
    }
    const node = element.ownerDocument.createTextNode('')
    element.replaceChildren(node)
    let callId: string | undefined
    const paint = (): void => {
      const held = prose.get(runId)
      const text = held?.text ?? ''
      // One DOM write: the new tail when the same call grew, else the whole text.
      // A call's text only ever grows, so the same call means the node holds a prefix of it;
      // a patch by an `Edit` and a switch of subject both carry another call.
      if (held !== undefined && held.callId === callId && text.length > node.length) {
        node.appendData(text.slice(node.length))
      } else if (text !== node.data) {
        node.data = text
      }
      callId = held?.callId
    }
    paint()
    return prose.subscribe(runId, paint)
  }, [prose, runId])

  return <span className="run-card-text" ref={host} />
}
