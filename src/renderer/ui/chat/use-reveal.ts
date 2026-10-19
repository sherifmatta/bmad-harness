import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

import { useFollowPause } from '../follow/follow-context'

/**
 * The thread's one way of being shown a card it was not looking at (Story
 * 3.10). Main raised the window for a run that ended while the user was
 * elsewhere and pushed the run's id; the window holds that id as it holds a
 * focus request, the card named spends it, and the one scroll call the
 * renderer has brings the card's root into view. The scroll is instant, moves
 * no focus, opens nothing and sends no command; it switches nothing either: the
 * window turns the chat to the card's persona (Story 8.4) before it asks for
 * the scroll. It takes the user somewhere that is not the bottom, so it pauses the thread's
 * following (Story 5.3); only the user resumes it.
 */

/** The one bridge method this reads. Nothing else of the bridge. */
export type RevealBridge = {
  onRunRevealed(listener: (runId: string) => void): () => void
}

/**
 * Hear which run's card main raised the window for. Returns the way to stop
 * listening; with no bridge (a preload that failed to load) there is nothing
 * to hear.
 */
export function connectRunRevealed(
  bridge: Partial<RevealBridge> | undefined,
  onRevealed: (runId: string) => void
): () => void {
  if (typeof bridge?.onRunRevealed !== 'function') {
    return () => {}
  }
  return bridge.onRunRevealed(onRevealed)
}

/**
 * Scroll the element `ref` holds into view once, when `reveal` turns true,
 * and then say so (`onRevealed`), so whoever holds the request can spend it.
 * One scroll per request: while `reveal` stays true nothing scrolls again,
 * and a request made after the last was spent scrolls again. The card's own
 * ref is the target: no attribute, no query.
 */
export function useReveal(ref: RefObject<HTMLElement | null>, reveal: boolean, onRevealed?: () => void): void {
  const spent = useRef(false)
  const pause = useFollowPause()
  useLayoutEffect(() => {
    if (!reveal) {
      spent.current = false
      return
    }
    if (spent.current) {
      return
    }
    spent.current = true
    ref.current?.scrollIntoView({ block: 'start' })
    pause()
    onRevealed?.()
  }, [ref, reveal, onRevealed, pause])
}
