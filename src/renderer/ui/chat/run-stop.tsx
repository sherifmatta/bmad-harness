import type { JSX } from 'react'

import './run-stop.css'

/**
 * The stop control (Story 3.7, FR83 to FR86): one native button reading `stop`,
 * drawn by the run card's head and by its collapsed line while the run is in
 * flight. Pressing it asks main to stop the run (`onStop` is the window's
 * `stopRun`) and does nothing else: no confirmation, no cost copy, no
 * spinner, no state of its own, and nothing is drawn between the press and the
 * run's terminal event, which removes the control with the card's `running`.
 *
 * It is never disabled and it never takes focus, whether it is drawn or removed;
 * it is its own tab stop under the shared focus ring. It announces nothing: the
 * window's lifecycle line already says the run ended. Its accessible name is
 * `stop`, and `stop · <label>` when it is handed the label that says whose stop
 * it is (the persona's name on a collapsed line, the document's path on a card).
 */
export function RunStop({
  runId,
  label,
  onStop
}: {
  runId: string
  label?: string | undefined
  onStop: (runId: string) => void
}): JSX.Element {
  return (
    <button
      type="button"
      className="run-stop"
      aria-label={label === undefined || label === '' ? undefined : `stop · ${label}`}
      onClick={() => onStop(runId)}
    >
      stop
    </button>
  )
}
