import type { JSX } from 'react'

import './room-panel.css'
import { roomDestination } from '../../../shared/room-destination'
import type { RailRow } from '../../../shared/rail'
import { formatTurnTime } from '../chat/format-turn-time'

/**
 * The side panel of a live room (Story 4.3, FR67, FR69): the Room section and nothing else. Four
 * key/value rows, every one a fact the harness already holds: the topic (the user's own first message,
 * or `none yet`), when the room opened and by whom (always the user), the context (the project-relative
 * path of every rail row the room did not write, in rail order, one per line, or `none`), and where
 * the summary will be written, shown from the room's first moment.
 *
 * It reserves no slot, container or heading for any other section. Its class, `party-side`, is the one
 * the shell hides at 1180px and below. Topic and paths are project text, drawn as text; nothing here
 * announces.
 */
export function RoomPanel({
  topic,
  openedAt,
  rows,
  folder
}: {
  /** What the room is about, or `undefined` until the user's first message. */
  topic: string | undefined
  /** When the room opened, in epoch milliseconds. */
  openedAt: number | undefined
  /** The rail's rows; those a room wrote are not context. */
  rows: readonly RailRow[]
  /** The project's output folder, which the summary is written under (Story 5.4); `undefined` until the rail has said. */
  folder: string | undefined
}): JSX.Element {
  const context = rows.filter((row) => row.room !== true).map((row) => row.path)
  return (
    <aside className="party-side" aria-label="room">
      <h2 className="room-panel-heading">Room</h2>
      <div className="room-panel-row">
        <span className="room-panel-key">topic</span>
        <span className="room-panel-value">{topic ?? 'none yet'}</span>
      </div>
      <div className="room-panel-row">
        <span className="room-panel-key">opened</span>
        <span className="room-panel-value">{`${openedAt === undefined ? '' : formatTurnTime(openedAt)} by you`.trim()}</span>
      </div>
      <div className="room-panel-row">
        <span className="room-panel-key">context</span>
        <span className="room-panel-value">
          {context.length === 0
            ? 'none'
            : context.map((path) => (
                <span key={path} className="room-panel-path">
                  {path}
                </span>
              ))}
        </span>
      </div>
      <div className="room-panel-row">
        <span className="room-panel-key">writes to</span>
        <span className="room-panel-value room-panel-path">{folder === undefined ? 'none yet' : roomDestination(openedAt, topic, folder)}</span>
      </div>
    </aside>
  )
}
