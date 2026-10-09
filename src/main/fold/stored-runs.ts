import type { RunCardSnapshot, StoredRun } from '../../shared/conversation'
import type { EpochMs } from '../../shared/ids'
import { closeSteps } from '../../shared/run-steps'

/**
 * The run cards a transcript keeps, and what a launch makes of them. Pure: a
 * list and a card in, the next list out, no clock and no I/O.
 *
 * Each card is kept with the moment of the last event main heard of its run. A
 * card that was still `running` when the app went away is a run that was cut
 * off: it is read back as the run that ended with its session, at the moment it
 * was last heard of, so its elapsed time is a fact and not zero. A card that had
 * ended is read back as it ended. A step still running on it ends `failed` at that same moment.
 * Nothing here adds a status: a cut-off run is
 * `failed`, with the envelope every run ended by its session already carries.
 */

/** The run's card as it stands, with the moment of the event that made it so: a new card is added, a known one replaced. */
export function withRun(runs: readonly StoredRun[], card: RunCardSnapshot, at: EpochMs): StoredRun[] {
  const stored: StoredRun = { card, lastAt: at }
  const known = runs.findIndex((held) => held.card.runId === card.runId)
  if (known === -1) {
    return [...runs, stored]
  }
  const next = [...runs]
  next[known] = stored
  return next
}

/** A stored run as a launch after it reads it: terminal cards as they ended, a running one as the run its session ended. */
export function deadOf(stored: StoredRun): StoredRun {
  if (stored.card.status !== 'running') {
    return stored
  }
  return {
    lastAt: stored.lastAt,
    card: {
      ...stored.card,
      status: 'failed',
      endedAt: stored.lastAt,
      steps: closeSteps(stored.card.steps, stored.lastAt),
      error: { code: 'run/session-ended', message: 'run · the session ended' }
    }
  }
}
