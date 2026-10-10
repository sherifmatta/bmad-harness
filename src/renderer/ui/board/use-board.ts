import { useEffect, useState } from 'react'
import type { HarnessError } from '../../../shared/install'
import type { BoardSnapshot } from '../../../shared/board'
import { acceptBoard, connectBoard } from './board-state'

/**
 * The renderer's whole view of the Board: the latest snapshot main has pushed,
 * or the reason it has none. Nothing is shown before the first one.
 *
 * A valid snapshot supersedes an earlier failure, and one snapshot is one
 * `setState`, so the Board lands in one frame.
 */
export function useBoard(): { snapshot: BoardSnapshot | null; failure: HarnessError | null } {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null)
  const [failure, setFailure] = useState<HarnessError | null>(null)

  // A preload that failed to load leaves no bridge at all.
  const bridgeAvailable =
    typeof window.harness?.getBoard === 'function' &&
    typeof window.harness?.onBoardChanged === 'function'

  useEffect(() => {
    if (!bridgeAvailable) {
      return
    }
    return connectBoard(window.harness, {
      onSnapshot: (incoming) => {
        setSnapshot((current) => acceptBoard(current, incoming))
        setFailure(null)
      },
      onFailure: setFailure
    })
  }, [bridgeAvailable])

  return { snapshot, failure }
}
