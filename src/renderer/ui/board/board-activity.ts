import type { AgentView } from '../../../shared/install'
import type { PersonaState } from '../persona/portrait'
import type { RunCardEntry, TranscriptEntry } from '../chat/transcript-entry'

/** How many rows the feed draws. Nothing says more exist. */
export const ACTIVITY_LIMIT = 20

/**
 * One Recent-activity row (Story 6.7): who, what it did (`started CP`,
 * `finished CP`, `stopped CP`, `failed CP`), the event's own time, the dot's
 * state, and whether the dot pulses. Only the start row of a run still running
 * pulses.
 */
export type ActivityRow = { key: string; name: string; did: string; at: number; state: PersonaState; pulse: boolean }

type Ranked = { row: ActivityRow; runAt: number; order: number; end: boolean }

/**
 * The feed, folded from the window's run entries (live runs and the stored ones
 * restored on launch, a cut-off one already read back `failed`). A run entry
 * with an `agentId` is a persona's run and gives a start row at `at`, and, once
 * it is no longer `running` and has an `endedAt`, an end row at that time: a
 * terminal entry with no `endedAt` raises none, and a time is never invented.
 * An entry with no `agentId` (a party session) raises nothing. The persona is
 * named as the roster names it, else by its id as written.
 *
 * Newest event first; a tie goes to the newer run, and an end row sits above its
 * own start row. The first {@link ACTIVITY_LIMIT} are returned.
 */
export function activityRowsOf(installed: readonly AgentView[], entries: readonly TranscriptEntry[]): ActivityRow[] {
  const names = new Map(installed.map((agent) => [agent.id, agent.name]))
  const ranked: Ranked[] = []
  entries.forEach((entry, order) => {
    if (entry.kind !== 'run' || entry.agentId === undefined) {
      return
    }
    const name = names.get(entry.agentId) ?? entry.agentId
    const said = (verb: string): string => (entry.code === undefined || entry.code === '' ? verb : `${verb} ${entry.code}`)
    ranked.push({
      row: { key: `${entry.id}:start`, name, did: said('started'), at: entry.at, state: 'work', pulse: entry.status === 'running' },
      runAt: entry.at,
      order,
      end: false
    })
    if (entry.status !== 'running' && entry.endedAt !== undefined) {
      ranked.push({
        row: { key: `${entry.id}:end`, name, did: said(entry.status), at: entry.endedAt, state: endState(entry), pulse: false },
        runAt: entry.at,
        order,
        end: true
      })
    }
  })
  return ranked
    .sort((a, b) => b.row.at - a.row.at || b.runAt - a.runAt || b.order - a.order || Number(b.end) - Number(a.end))
    .slice(0, ACTIVITY_LIMIT)
    .map(({ row }) => row)
}

function endState(entry: RunCardEntry): PersonaState {
  return entry.status === 'finished' ? 'idle' : 'error'
}
