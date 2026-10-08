import { createContext, useContext } from 'react'

/**
 * What a thread's scroller gives the cards inside it (Story 5.3): the one way
 * to say "the user was taken somewhere that is not the bottom". The reveal
 * calls it after its scroll, and nothing but the user resumes following. With
 * no scroller around (the pinned slot) there is nothing to pause.
 */
export const FollowContext = createContext<(() => void) | null>(null)

function nothing(): void {}

/** The pause of the thread this is drawn in, or a no-op outside one. */
export function useFollowPause(): () => void {
  return useContext(FollowContext) ?? nothing
}
