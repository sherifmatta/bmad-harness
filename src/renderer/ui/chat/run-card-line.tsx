import { memo, useCallback, useSyncExternalStore } from 'react'
import type { JSX } from 'react'

import './run-card-line.css'
import { StatusDot } from '../status/status-dot'
import type { ProseStore } from './prose-store'
import { RunElapsed } from './run-card'
import { RunStop } from './run-stop'
import { collapsedReason, runDotState } from './run-status'
import type { RunCardEntry } from './transcript-entry'

/**
 * The collapsed run card (Story 3.5, FR33, UX-DR34): a run in flight for a
 * persona the user is not viewing, drawn as one line in the thread. Four
 * fields, in order: the status dot, the persona's name, the reason of the run's
 * last note (the name of the section the text has shown, before any note), and
 * the elapsed time at the right edge. The stop control is the fourth field of
 * EXPERIENCE.md's table (Story 3.7): a sibling after the expanding button, since a
 * button inside a button is invalid, and its own tab stop. It is drawn while the
 * run is in flight and the window handed down an `onStop`, and is named for the
 * persona (`stop · <name>`).
 *
 * It is the same state, smaller. The elapsed ticks every second (a reduced-motion
 * setting does not stop it), the card carries `aria-busy`, and nothing here
 * animates, spins or draws a bar or a denominator. The reason is read through
 * the prose store as a string, so the line renders again only when its words
 * change, and never for a piece of prose.
 *
 * The line is one native button, so a click, `Enter` and `Space` all expand it
 * with no key handling here. What expanding does, and where focus goes, is
 * `onExpand`'s: it hands the run's id to the window, which draws the full card.
 */
export const RunCardLine = memo(function RunCardLine({
  entry,
  name,
  prose,
  onExpand,
  onStop
}: {
  entry: RunCardEntry
  /** The persona's name as the lifecycle line says it; empty for a card with no agent id. */
  name: string
  prose: ProseStore
  onExpand: (runId: string) => void
  /** The stop control was pressed, with the run's id; without it the line draws no stop control. */
  onStop?: ((runId: string) => void) | undefined
}): JSX.Element {
  const { runId } = entry
  const subscribe = useCallback((listener: () => void) => prose.subscribe(runId, listener), [prose, runId])
  const reasonOf = (): string => collapsedReason(entry, prose.progress(runId))
  const reason = useSyncExternalStore(subscribe, reasonOf, reasonOf)

  return (
    <section className="run-card-line" aria-busy>
      <button type="button" className="run-card-line-button" aria-expanded={false} onClick={() => onExpand(runId)}>
        <StatusDot state={runDotState(entry)} />
        {name !== '' && (
          <>
            <span className="run-card-line-name">{name}</span>
            <Separator />
          </>
        )}
        {reason !== '' && (
          <>
            <span className="run-card-line-reason">{reason}</span>
            <Separator />
          </>
        )}
        <RunElapsed entry={entry} />
      </button>
      {entry.status === 'running' && onStop !== undefined && <RunStop runId={runId} label={name} onStop={onStop} />}
    </section>
  )
})

/** The mark between two fields; the fields' own words carry everything, so it is hidden from a reader. */
function Separator(): JSX.Element {
  return (
    <span className="run-card-line-sep" aria-hidden="true">
      ·
    </span>
  )
}
