import type { JSX } from 'react'

import './run-list.css'
import { RunNoteRow } from '../feed/run-note-feed'
import { StatusDot } from '../status/status-dot'
import { formatStepElapsed } from './format-step-elapsed'
import { runListRows } from './run-status'
import type { StepState } from './run-status'
import type { RunCardEntry } from './transcript-entry'
import type { RunCardStep } from '../../../shared/conversation'

/**
 * The run list (Story 3.17): the card body's one list of what the run did, in
 * fold order and newest last, above the document prose. Run notes keep the note
 * row Epic 1 drew; each tool step is a row of its own (DESIGN.md, Run step).
 * The container keeps the run-note feed's class: it is the same feed with the
 * steps added, not a second one.
 *
 * Nothing here is a list of what is still to come: no pending row, no count, no
 * mark that the card dropped earlier steps. A step row is no control and no
 * live region (no tab stop, no role), and the card's one announcement says
 * nothing of steps.
 */
export function RunList({ entry }: { entry: RunCardEntry }): JSX.Element {
  return (
    <div className="run-note-feed">
      {runListRows(entry).map((row, index) =>
        row.kind === 'note' ? (
          // Notes carry no identity: position is the key, as in the feed, and a note's place only ever moves with the steps ahead of it.
          <RunNoteRow note={row.note} key={`note-${index}`} />
        ) : (
          <RunStepRow step={row.step} state={row.state} elapsedMs={row.elapsedMs} key={`step-${row.step.callId}`} />
        )
      )}
    </div>
  )
}

/** One tool step: a mark, the verb and its target in mono, and the call's duration. A running step's duration is the text `now`, which carries its liveness when the pulse is still. */
function RunStepRow({ step, state, elapsedMs }: { step: RunCardStep; state: StepState; elapsedMs: number }): JSX.Element {
  return (
    <div className={`run-step run-step--${state}`}>
      <StepMark state={state} />
      <span className="run-step-label">{step.label}</span>
      <span className="run-step-elapsed">{state === 'running' ? 'now' : formatStepElapsed(elapsedMs)}</span>
    </div>
  )
}

/** The mark column: `✓` and `✕` are text, and the running mark is the shared work dot, hidden from a reader. */
function StepMark({ state }: { state: StepState }): JSX.Element {
  if (state === 'running') {
    return (
      <span className="run-step-mark run-step-mark--dot">
        <StatusDot state="work" />
      </span>
    )
  }
  return <span className="run-step-mark">{state === 'done' ? '✓' : '✕'}</span>
}
