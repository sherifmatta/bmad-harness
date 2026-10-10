import type { JSX } from 'react'

import type { BoardSnapshot } from '../../../shared/board'
import type { HarnessError } from '../../../shared/install'
import { columnsOf } from './board-columns'

/**
 * The Board's body (Stories 6.3 and 6.4). A snapshot that says there is none, or
 * a failure from main, draws `no sprint status` and the file being watched: no
 * error dialog, no code, no stack. A snapshot that was read draws the story
 * board: one column per status, each story a card with its number and title and
 * nothing else. The other regions are Stories 6.5 to 6.7's. The time before the
 * first snapshot draws nothing: no spinner and no skeleton.
 *
 * A card is not a control: no handler, no tab stop, no live region. A new
 * snapshot replaces the columns in one render.
 *
 * `folder` is the rail's output folder, with its trailing `/`; the reader's own
 * path is main's, so it is built the same way here. With no rail snapshot yet
 * there is no path line.
 */
export function BoardView({
  snapshot,
  failure,
  folder
}: {
  snapshot: BoardSnapshot | null
  failure: HarnessError | null
  folder: string | undefined
}): JSX.Element | null {
  if (snapshot !== null && snapshot.kind === 'read') {
    return (
      <div className="board-stories">
        {columnsOf(snapshot).map(({ status, stories }) => (
          <section className="board-column" key={status}>
            <h3 className="board-column-head">{status}</h3>
            <ul className="board-cards">
              {stories.map((story) => (
                <li className="board-card" key={story.key}>
                  <span className="board-card-number">{story.number}</span>
                  <span className="board-card-title">{story.title}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    )
  }
  const none = snapshot === null ? failure !== null : snapshot.kind === 'none'
  if (!none) {
    return null
  }
  return (
    <div className="board-empty">
      <p className="board-empty-line">no sprint status</p>
      {folder !== undefined && <p className="board-empty-path">{`${folder}implementation-artifacts/sprint-status.yaml`}</p>}
    </div>
  )
}
