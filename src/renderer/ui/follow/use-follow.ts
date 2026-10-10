import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { atBottom, bottomTop } from './follow-state'

/**
 * Following the thread (Story 5.3). A thread is either following (its newest
 * line is kept in view) or paused (the user's place is kept), and which one is
 * a fact about the scroller's metrics and the last scroll the user made:
 * nothing is stored and there is no setting.
 *
 * Growth while following moves the scroll position in the same frame and
 * instantly: a `ResizeObserver` on the content and on the scroller, and a
 * layout effect on every render. Growth while paused changes nothing.
 *
 * A scroll event whose `scrollTop` is the value this hook itself just set is
 * not a user scroll. That closes the race where, following, a burst grows the
 * content and the observer pins it, and a second burst lands before the browser
 * delivers the pin's scroll event: measured at delivery the thread is far from
 * the bottom, and would read as paused.
 *
 * A view that was hidden and is shown again (Story 6.3) puts a following thread
 * at its bottom, and a paused one back at the offset it was left at, still
 * paused. A browser may reset `scrollTop` on `display: none`, so that offset is
 * kept in a ref, from the last time the scroller was visible, and never read
 * back from the element once it is hidden.
 *
 * This is the renderer's scroll code, with the reveal's `scrollIntoView`.
 */

export type Follow = {
  /** The element that scrolls; put it on the scroller. */
  scroller: RefObject<HTMLDivElement | null>
  /** The element inside it that grows; put it on the content. */
  content: RefObject<HTMLDivElement | null>
  /** The thread is not following: the control is drawn. */
  paused: boolean
  /** The user was taken away from the bottom (the reveal): stay paused until the user resumes. */
  pause: () => void
  /** Go to the bottom and follow. */
  latest: () => void
  /** The scroller's scroll event. */
  onScroll: () => void
}

/**
 * @param resetKey what the thread shows: a change puts it at its bottom, following
 * @param sends how many user turns the thread holds: a rise puts it at its bottom, following
 */
export function useFollow(resetKey: unknown, sends: number): Follow {
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  /** The `scrollTop` this hook set last, until the user scrolls to another. */
  const placed = useRef<number | null>(null)
  const laid = useRef(false)
  /** The last `scrollTop` the scroller had while it was visible: what a paused thread returns to when shown. */
  const left = useRef(0)
  const seen = useRef({ resetKey, sends })
  const [paused, setPaused] = useState(false)

  const pin = useCallback(() => {
    const element = scroller.current
    if (element === null) {
      return
    }
    element.scrollTop = bottomTop(element.clientHeight, element.scrollHeight)
    placed.current = element.scrollTop
    if (element.clientHeight > 0) {
      left.current = element.scrollTop
    }
  }, [scroller])

  const latest = useCallback(() => {
    following.current = true
    setPaused(false)
    pin()
  }, [pin])

  const pause = useCallback(() => {
    const element = scroller.current
    following.current = false
    // The reveal's own scroll event carries this position, so it resumes nothing.
    placed.current = element?.scrollTop ?? null
    if (element !== null && element.clientHeight > 0) {
      left.current = element.scrollTop
    }
    setPaused(true)
  }, [scroller])

  const onScroll = useCallback(() => {
    const element = scroller.current
    // A hidden scroller has no height, so it would read as at its bottom: its events say nothing about the user.
    if (element === null || element.clientHeight === 0) {
      return
    }
    left.current = element.scrollTop
    if (element.scrollTop === placed.current) {
      return
    }
    placed.current = null
    const near = atBottom(element.scrollTop, element.clientHeight, element.scrollHeight)
    following.current = near
    setPaused(!near)
  }, [scroller])

  // Every render: a different thread or a send goes to the bottom, and a following thread keeps it.
  useLayoutEffect(() => {
    const before = seen.current
    seen.current = { resetKey, sends }
    if (resetKey !== before.resetKey || sends > before.sends) {
      latest()
      return
    }
    if (following.current) {
      pin()
    }
  })

  // Growth the render did not make: the content, and the scroller itself (a window resize, a view shown).
  useLayoutEffect(() => {
    const element = scroller.current
    if (element === null || typeof ResizeObserver === 'undefined') {
      return
    }
    laid.current = element.clientHeight > 0
    const observer = new ResizeObserver(() => {
      // A hidden view reports no height; the first time it has one it is shown. Following, that is the
      // bottom; paused, it is the offset it was left at, and it stays paused.
      const visible = element.clientHeight > 0
      const shown = visible && !laid.current
      laid.current = visible
      if (shown && following.current) {
        latest()
      } else if (shown) {
        element.scrollTop = left.current
        placed.current = element.scrollTop
      } else if (following.current) {
        pin()
      }
    })
    observer.observe(element)
    if (content.current !== null) {
      observer.observe(content.current)
    }
    return () => observer.disconnect()
  }, [scroller, content, latest, pin])

  return { scroller, content, paused, pause, latest, onScroll }
}
