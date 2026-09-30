import { useEffect, useState } from 'react'

/** How often a row's age text is re-read. Coarse on purpose: the finest unit is a minute. */
export const NOW_TICK_MS = 30_000

/**
 * The current time, refreshed on one interval and cleared on unmount. The age
 * text that reads it is data: re-rendering it is neither announced nor
 * animated.
 */
export function useNow(intervalMs: number = NOW_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
