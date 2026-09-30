import { useEffect, useState } from 'react'

/** The one bridge method the branch chip needs. */
export type BranchBridge = { getBranch?: () => Promise<string | null> }

/** The part of `window` the freshness rule needs. */
export type FocusTarget = {
  addEventListener(type: 'focus', listener: () => void): void
  removeEventListener(type: 'focus', listener: () => void): void
}

/**
 * Ask for the branch now, and again on every `focus`; hand each answer to
 * `onBranch`. Returns the way to stop.
 *
 * Apart from React so the ordering can be held in node. Two asks can overlap —
 * mount, then a quick refocus — and the later ask's answer must win however
 * the replies arrive, so each carries its sequence number and a reply older
 * than the newest one applied is dropped. After the returned stop, nothing is
 * delivered. A missing method or a rejection is `null`: no answer is a missing
 * fact, never a wrong one.
 */
export function watchBranch(
  bridge: BranchBridge | undefined,
  target: FocusTarget,
  onBranch: (branch: string | null) => void
): () => void {
  let live = true
  let asked = 0
  let applied = 0

  const ask = (): void => {
    asked += 1
    const mine = asked
    const deliver = (branch: string | null): void => {
      if (live && mine > applied) {
        applied = mine
        onBranch(branch)
      }
    }

    if (typeof bridge?.getBranch !== 'function') {
      deliver(null)
      return
    }
    bridge.getBranch().then(deliver, () => {
      deliver(null)
    })
  }

  ask()
  target.addEventListener('focus', ask)
  return () => {
    live = false
    target.removeEventListener('focus', ask)
  }
}

/** The checked-out branch of this window's project, or `null` when unanswered. */
export function useBranch(): string | null {
  const [branch, setBranch] = useState<string | null>(null)

  useEffect(() => watchBranch(window.harness, window, setBranch), [])

  return branch
}
