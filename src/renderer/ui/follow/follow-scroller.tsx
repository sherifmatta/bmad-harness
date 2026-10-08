import type { JSX, ReactNode, RefObject } from 'react'

import './follow.css'
import { FollowContext } from './follow-context'
import { useFollow } from './use-follow'

/**
 * A thread's scroller (Story 5.3), the one both the persona's thread and the
 * room's use: a frame, the scroller (`className`), the content that grows
 * (`contentClassName`) and, only while the thread is paused, one control.
 *
 * The control is a button with one literal string and nothing else: no count,
 * dot, sign or state of its own. It sits after the scroller in the document, so
 * it is one tab stop between the thread and the composer, and activating it
 * takes the thread to its bottom and puts focus in the composer (`fieldRef`;
 * with no composer mounted there is nothing to focus). It adds no role, no
 * live region and no tab stop to the scroller.
 */
export function FollowScroller({
  className,
  contentClassName,
  resetKey,
  sends = 0,
  fieldRef,
  children
}: {
  className: string
  contentClassName: string
  /** What the thread shows; a change puts it at its bottom, following. */
  resetKey?: unknown
  /** How many user turns it holds; a rise puts it at its bottom, following. */
  sends?: number
  /** The composer's field, which takes focus when the control is activated. */
  fieldRef?: RefObject<HTMLTextAreaElement | null>
  children?: ReactNode
}): JSX.Element {
  const { scroller, content, paused, pause, latest, onScroll } = useFollow(resetKey, sends)

  return (
    <div className="follow">
      <div className={className} ref={scroller} onScroll={onScroll}>
        <FollowContext.Provider value={pause}>
          <div className={contentClassName} ref={content}>
            {children}
          </div>
        </FollowContext.Provider>
      </div>
      {paused && (
        <div className="follow-edge">
          <button
            type="button"
            className="follow-latest"
            onClick={() => {
              latest()
              fieldRef?.current?.focus()
            }}
          >
            ↓ latest
          </button>
        </div>
      )}
    </div>
  )
}
