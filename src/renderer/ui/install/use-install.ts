import { useEffect, useState } from 'react'
import type { HarnessError, InstallSnapshot } from '../../../shared/install'
import { acceptSnapshot, connectInstall } from './install-state'

/**
 * The renderer's whole view of the install: the latest snapshot main has
 * pushed, or the reason it has none. Nothing is shown before the first one —
 * there is no pending state to draw.
 *
 * `connectInstall` subscribes before it asks, so a push that lands between
 * the two is not lost, and both go through `acceptSnapshot`, so the older of a
 * raced pair loses. One snapshot is one `setState`, which is the whole of "one
 * frame".
 */
export function useInstall(): {
  snapshot: InstallSnapshot | null
  failure: HarnessError | null
} {
  const [snapshot, setSnapshot] = useState<InstallSnapshot | null>(null)
  const [failure, setFailure] = useState<HarnessError | null>(null)

  // A preload that failed to load leaves no bridge at all.
  const bridgeAvailable =
    typeof window.harness?.getInstall === 'function' &&
    typeof window.harness?.onInstallChanged === 'function'

  useEffect(() => {
    if (!bridgeAvailable) {
      return
    }
    return connectInstall(window.harness, {
      // A valid snapshot supersedes an earlier failure.
      onSnapshot: (incoming) => {
        setSnapshot((current) => acceptSnapshot(current, incoming))
        setFailure(null)
      },
      onFailure: setFailure
    })
  }, [bridgeAvailable])

  return { snapshot, failure }
}
