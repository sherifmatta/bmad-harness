import type { JSX } from 'react'

import type { HarnessError, InstallSnapshot } from '../../../shared/install'
import { ErrorLine } from './error-line'

/**
 * What a project that cannot open shows: every unmet prerequisite, then every
 * install error, then the failure that left no snapshot at all — each one a
 * line, in that order.
 *
 * The lines are the whole explanation. This component adds no heading, no
 * wrapper role and no control: a preflight message already names the fact and
 * its remedy, and nothing here may stand in for it or offer a step to take.
 * Announcing them politely needs the live region the shell mounts later.
 */
export function Preflight({
  snapshot,
  failure
}: {
  snapshot: InstallSnapshot | null
  failure: HarnessError | null
}): JSX.Element {
  return (
    <>
      {snapshot?.preflight.map((error, index) => (
        <ErrorLine key={`preflight-${error.code}-${index}`} error={error} />
      ))}
      {snapshot?.errors.map((error, index) => (
        <ErrorLine key={`errors-${error.code}-${index}`} error={error} />
      ))}
      {failure !== null && <ErrorLine key="failure" error={failure} />}
    </>
  )
}
