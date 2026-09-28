import { Fragment } from 'react'
import type { JSX } from 'react'

import './run-note.css'
import { emphasisSpans } from './emphasis'
import { kindTreatment } from './kind-treatment'
import type { RunNote } from './memlog'

/**
 * The run-note feed — the product's central claim, rendered: you read why a
 * run decided something rather than being told afterwards.
 *
 * Two rules here are assertions rather than implementation details.
 *
 * **Three grid children, always.** An absent time renders an empty first cell
 * rather than no cell, so the grid keeps its columns and the kind tag never
 * slides left into the time column (FR40, UX-DR20). Every note read from a
 * file has an absent time, because the `.memlog.md` format carries none — the
 * case no mockup has ever drawn, since every mockup row has a timestamp. An
 * empty cell has no text and so no real baseline; the grid synthesises one
 * from its box, which leaves it at the top of the row while the kind and the
 * reason go on aligning to each other. That is the outcome the row needs, and
 * it is why the cell is kept rather than the claim that it carries a baseline
 * of its own.
 *
 * **Reason text is React children and nothing else.** No
 * `dangerouslySetInnerHTML`, no markdown engine, no sanitizer: project content
 * is untrusted the moment it is rendered, and `emphasisSpans` returns data so
 * that `<strong>` can be a React element that escapes its text by
 * construction.
 *
 * The author is parsed but not rendered. FR40 names three slots — time, kind,
 * reason — and attribution is not one of them; `parseMemlog` resolves it
 * because the tag has to be taken apart to read the kind correctly either way,
 * and dropping it here is what keeps the row to the three slots the contract
 * specifies.
 *
 * `notes` is a prop rather than a path. Epic 3 mounts this same component
 * against a live stream of appends, and a component that read files could not
 * be reused there.
 */
export function RunNoteFeed({ notes }: { notes: RunNote[] }): JSX.Element {
  return (
    <div className="run-note-feed">
      {notes.map((note, index) => (
        // The memlog carries no per-entry identity — no timestamp, no id, and
        // two identical entries are legal. Position is the only key the format
        // can supply, and it is the right one: the feed is append-only in file
        // order, so a row's index never changes once it exists.
        <div className="run-note" key={index}>
          <span className="run-note-time">{note.time ?? ''}</span>
          <span className={`run-note-kind run-note-kind--${kindTreatment(note.kind)}`}>
            {note.kind ?? ''}
          </span>
          <span className="run-note-reason">
            {emphasisSpans(note.reason).map((span, at) =>
              span.emphasised ? (
                <strong key={at}>{span.text}</strong>
              ) : (
                <Fragment key={at}>{span.text}</Fragment>
              )
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
