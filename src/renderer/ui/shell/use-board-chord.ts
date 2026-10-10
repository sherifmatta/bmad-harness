import { useEffect, useRef } from 'react'

import { IDLE, isFieldTarget, nextChord } from './board-chord'
import type { ChordState } from './board-chord'

/**
 * Installs the Board chord (Story 6.3): one `keydown` listener on the document,
 * for as long as the caller is mounted. It acts only on a key with no modifier
 * held and whose target is not a field; any other key, or a field, puts the
 * chord back to idle. Nothing is prevented, announced or focused.
 */
export function useBoardChord(onBoard: () => void): void {
  const held = useRef(onBoard)
  useEffect(() => {
    held.current = onBoard
  }, [onBoard])

  useEffect(() => {
    let state: ChordState = IDLE
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isFieldTarget(event.target)) {
        state = IDLE
        return
      }
      const step = nextChord(state, event.key, performance.now())
      state = step.state
      if (step.fired) {
        held.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
