import { useEffect, useState } from 'react'
import type { ChangesSnapshot } from '../../../shared/changes'
import type { HarnessError } from '../../../shared/install'
import { acceptChanges, connectChanges } from './changes-state'
import type { ChangesBridge } from './changes-state'

/**
 * The renderer's whole view of the Changes half (Story 9.3): the latest snapshot
 * main has pushed, or the reason it has none. Nothing is shown before the first
 * one. Main reads git only while the window is in front; this hook only listens.
 *
 * A valid snapshot supersedes an earlier failure, and one snapshot is one
 * `setState`, so the rows land in one frame.
 */
export function useChanges(): { snapshot: ChangesSnapshot | null; failure: HarnessError | null } {
  const [snapshot, setSnapshot] = useState<ChangesSnapshot | null>(null)
  const [failure, setFailure] = useState<HarnessError | null>(null)

  // Read in the effect, never while rendering, so the half renders where there is no window at all.
  useEffect(() => {
    const bridge = window.harness as Partial<typeof window.harness> | undefined
    // A preload that failed to load leaves no bridge at all.
    if (typeof bridge?.getChanges !== 'function' || typeof bridge.onChangesChanged !== 'function') {
      return
    }
    return connectChanges(bridge as ChangesBridge, {
      onSnapshot: (incoming) => {
        setSnapshot((current) => acceptChanges(current, incoming))
        setFailure(null)
      },
      onFailure: setFailure
    })
  }, [])

  return { snapshot, failure }
}
