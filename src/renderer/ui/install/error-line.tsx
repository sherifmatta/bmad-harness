import type { JSX } from 'react'

import './error-line.css'
import type { HarnessError } from '../../../shared/install'

/**
 * One harness error, as a line.
 *
 * `message` is what renders. `detail`, when there is one, sits behind a native
 * disclosure: the summary is a fixed label and the body holds the detail, so
 * the fact is one keypress away without being in the way (FR91). A native `<details>` is
 * keyboard-operable and takes the global focus treatment with no code here.
 *
 * No role and no live region: announcing resolver errors is the shell's job
 * once its live region is mounted, and this line is deliberately inert.
 */
export function ErrorLine({ error }: { error: HarnessError }): JSX.Element {
  return (
    <div className="error-line">
      <span className="error-line-message">{error.message}</span>
      {error.detail !== undefined && (
        <details className="error-line-detail">
          <summary className="error-line-summary">detail</summary>
          <span className="error-line-detail-text">{error.detail}</span>
        </details>
      )}
    </div>
  )
}
