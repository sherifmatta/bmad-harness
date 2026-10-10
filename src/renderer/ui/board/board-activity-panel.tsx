import type { JSX } from 'react'

import { formatEventTime } from '../chat/format-turn-time'
import { StatusDot } from '../status/status-dot'
import type { ActivityRow } from './board-activity'

/**
 * The Recent activity panel (Story 6.7): what the personas did, newest first,
 * one text row each: the status dot, the persona's name, what it did, and the
 * event's absolute time. A row is text, not a control: no handler, no tab stop,
 * no role, no live region, no tooltip. Only the dot of a run in flight pulses;
 * every other dot is drawn still. A new row is the render that changed the entries.
 */
export function ActivityPanel({ rows }: { rows: readonly ActivityRow[] }): JSX.Element {
  return (
    <section className="board-activity">
      <h3 className="board-activity-head">recent activity</h3>
      <ul className="board-activity-rows">
        {rows.map(({ key, name, did, at, state, pulse }) => (
          <li className={pulse ? 'board-activity-row' : 'board-activity-row board-activity-still'} key={key}>
            <StatusDot state={state} />
            <span className="board-activity-who">{name}</span>
            <span className="board-activity-did">{did}</span>
            <span className="board-activity-time">{formatEventTime(at)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
