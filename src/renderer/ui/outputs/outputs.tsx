import type { JSX } from 'react'

import './outputs.css'
import type { AgentView, HarnessError } from '../../../shared/install'
import type { RailSnapshot } from '../../../shared/rail'
import { ErrorLine } from '../install/error-line'
import { OutputRow } from './output-row'
import { groupRows } from './row-groups'
import { useNow } from './use-now'

/**
 * The rail's Outputs half (FR48, UX-DR18): one row per file under `_bmad/`,
 * grouped by directory.
 *
 * Before the first snapshot it draws nothing at all: no spinner, no sentence.
 * A snapshot with no rows is exactly two lines — that there are none, and the
 * path being watched — and no next step, skill name, persona or button. A rail
 * failure with no snapshot renders the envelope through the shared error line.
 *
 * A row's owner is the roster's name for the agent its class names, or nothing
 * when the roster lacks that agent. `now` is data, passed in so the markup can
 * be rendered at a fixed moment.
 */
export function Outputs({
  snapshot,
  failure,
  agents,
  projectPath,
  now
}: {
  snapshot: RailSnapshot | null
  failure: HarnessError | null
  agents: readonly AgentView[]
  projectPath: string
  now: number
}): JSX.Element | null {
  if (snapshot === null) {
    return failure === null ? null : (
      <div className="outputs-failure">
        <ErrorLine error={failure} />
      </div>
    )
  }

  if (snapshot.rows.length === 0) {
    return (
      <div className="outputs-empty">
        <p className="outputs-empty-line">no files under _bmad/ yet</p>
        <p className="outputs-empty-path">{`${projectPath}/_bmad`}</p>
      </div>
    )
  }

  const nameOf = new Map(agents.map((agent) => [agent.id, agent.name]))

  return (
    <div className="outputs">
      {groupRows(snapshot.rows).map((group) => (
        <div key={group.dir} className="outputs-group">
          <div className="rail-group">{group.dir}</div>
          <ul className="outputs-list">
            {group.rows.map((row) => (
              <OutputRow
                key={row.path}
                row={row}
                ownerName={row.owner === undefined ? undefined : nameOf.get(row.owner.agentId)}
                now={now}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** `Outputs` with its clock: the one thing the shell mounts. */
export function ConnectedOutputs(props: Omit<Parameters<typeof Outputs>[0], 'now'>): JSX.Element | null {
  return <Outputs {...props} now={useNow()} />
}
