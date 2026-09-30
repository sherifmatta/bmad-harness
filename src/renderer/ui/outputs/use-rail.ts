import { useEffect, useState } from 'react'
import type { HarnessError } from '../../../shared/install'
import type { RailSnapshot } from '../../../shared/rail'
import { acceptRail, connectRail } from './rail-state'

/**
 * The renderer's whole view of the rail: the latest snapshot main has pushed,
 * or the reason it has none. Nothing is shown before the first one.
 *
 * A valid snapshot supersedes an earlier failure, and one snapshot is one
 * `setState`, so the rows land in one frame.
 */
export function useRail(): { snapshot: RailSnapshot | null; failure: HarnessError | null } {
  const [snapshot, setSnapshot] = useState<RailSnapshot | null>(null)
  const [failure, setFailure] = useState<HarnessError | null>(null)

  // A preload that failed to load leaves no bridge at all.
  const bridgeAvailable =
    typeof window.harness?.getRail === 'function' &&
    typeof window.harness?.onRailChanged === 'function'

  useEffect(() => {
    if (!bridgeAvailable) {
      return
    }
    return connectRail(window.harness, {
      onSnapshot: (incoming) => {
        setSnapshot((current) => acceptRail(current, incoming))
        setFailure(null)
      },
      onFailure: setFailure
    })
  }, [bridgeAvailable])

  return { snapshot, failure }
}
