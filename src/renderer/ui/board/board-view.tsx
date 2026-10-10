import type { JSX } from 'react'

import type { BoardSnapshot } from '../../../shared/board'
import type { HarnessError } from '../../../shared/install'

/**
 * The Board's body (Story 6.3). It draws one thing so far: `no sprint status`
 * and the file being watched, when the snapshot says there is none or main could
 * not give one. No error dialog, no code, no stack. A snapshot that was read and
 * the time before the first one draw nothing: the regions are later stories', and
 * there is no spinner and no skeleton in between.
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
