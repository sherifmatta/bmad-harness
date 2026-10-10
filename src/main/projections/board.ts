import type { BoardBody, BoardSnapshot } from '../../shared/board'

/**
 * The Board read model (Story 6.2): the last body the file came to, as one
 * snapshot with a revision that only ever increases. The first body is the
 * baseline and is not pushed (it is the answer to the first `board.get`); every
 * later body that differs from the last is pushed once, so a write that changes
 * nothing the Board shows raises nothing. Pure of file, clock and window: the
 * bridge feeds it bodies and hears the changes.
 */

export type BoardProjection = {
  /** Take what the file now comes to. Returns whether it is a new revision. */
  apply(body: BoardBody): boolean
  /** The current snapshot, or `undefined` before the first body. */
  snapshot(): BoardSnapshot | undefined
}

export function createBoardProjection({ onChange }: { onChange: (snapshot: BoardSnapshot) => void }): BoardProjection {
  let current: BoardSnapshot | undefined
  let key: string | undefined

  return {
    apply(body) {
      const next = JSON.stringify(body)
      if (next === key) {
        return false
      }
      key = next
      const first = current === undefined
      current = { ...body, revision: (current?.revision ?? 0) + 1 }
      if (!first) {
        onChange(current)
      }
      return !first
    },
    snapshot: () => current
  }
}
