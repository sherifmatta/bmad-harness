import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { ANNOUNCE_INTERVAL_MS, Announcer } from './announcer'

/**
 * The product's single polite live region (NFR22).
 *
 * Exactly one of these exists per window, and this file is the only place in
 * the product entitled to a live-region attribute at all: tests/
 * accessibility.test.ts sweeps `src/` and fails if a second one appears, if
 * any of them is `assertive`, or if the alert role turns up anywhere. Nothing
 * here is urgent enough to interrupt what the user is reading.
 *
 * `aria-atomic="false"`: only the part of the region that changed is read, not
 * the whole region re-read from the top each time. Each announcement arrives
 * as its own replacement node, so that changed part is the whole message.
 *
 * It is deliberately thin. The decision of *what* to say and *when* it is due
 * belongs to `Announcer`, which is pure; all this does is hold the clock the
 * announcer refuses to hold and put the result in the accessibility tree.
 * Nothing mounts it yet — the shell is Story 1.9.
 */

/**
 * How often the region asks whether a message is due. Derived from the throttle
 * rather than tuned: the announcer decides *whether* to speak, and polling at
 * exactly the throttle would make a message enqueued just after a tick wait
 * nearly two intervals, so the policy's "at most one every 2s" would read as
 * four in practice. A quarter of the interval bounds that overshoot at 250ms.
 */
const DRAIN_INTERVAL_MS = ANNOUNCE_INTERVAL_MS / 8

export function LiveRegion({ announcer }: { announcer: Announcer }): JSX.Element {
  // `seq` is what makes two identical messages two announcements. React bails
  // out of re-rendering equal state, and an unchanged DOM is a polite region
  // saying nothing at all — which would undo the queue's never-merged
  // guarantee at its only consumer.
  const [spoken, setSpoken] = useState({ message: '', seq: 0 })

  useEffect(() => {
    const drain = (): void => {
      // Monotonic, not wall clock: a backward clock correction would otherwise
      // block every announcement until wall time caught up. It also keeps the
      // announcer's "time is an argument, never a clock" discipline honest —
      // the clock lives here, and only here.
      const next = announcer.take(performance.now())
      if (next !== null) {
        setSpoken((previous) => ({ message: next, seq: previous.seq + 1 }))
      }
    }

    drain()
    const timer = setInterval(drain, DRAIN_INTERVAL_MS)
    return () => {
      clearInterval(timer)
    }
  }, [announcer])

  return (
    <div aria-live="polite" aria-atomic="false">
      {/* A fresh key replaces the node rather than editing its text, so a
          repeat of the previous message is still a DOM mutation and is still
          announced. */}
      <span key={spoken.seq}>{spoken.message}</span>
    </div>
  )
}
