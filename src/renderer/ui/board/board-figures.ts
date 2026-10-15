import type { BoardSnapshot } from '../../../shared/board'
import type { AgentView } from '../../../shared/install'
import type { PersonaState } from '../persona/portrait'
import { stateOf } from '../status/persona-state'
import { columnsOf } from './board-columns'

/**
 * The overview's two figures (Story 6.5). `running` counts the roster's
 * personas in `work`, read as the tiles read them; an id outside the roster is
 * never counted. `inProgress` and `shown` both count over the stories the
 * columns draw, so the first never exceeds the second and the cell agrees with
 * the columns beneath it.
 */
export type Overview = { running: number; installedCount: number; inProgress: number; shown: number }

/** One epic's row: its own stories, all of them, whether or not the epic is done. */
export type EpicRow = { key: string; id: string; title: string; done: number; total: number; file?: string }

export function overviewOf(
  snapshot: BoardSnapshot,
  installed: readonly AgentView[],
  states: ReadonlyMap<string, PersonaState>
): Overview {
  const shown = columnsOf(snapshot).flatMap((column) => column.stories)
  return {
    running: installed.filter((agent) => stateOf(agent.id, states) === 'work').length,
    installedCount: installed.length,
    inProgress: shown.filter((story) => story.status === 'in-progress').length,
    shown: shown.length
  }
}

/** One row per epic in the file's order. A retrospective counts in neither figure. */
export function epicRowsOf(snapshot: BoardSnapshot): EpicRow[] {
  if (snapshot.kind !== 'read') {
    return []
  }
  return snapshot.epics.map((epic) => ({
    key: epic.key,
    id: `Epic ${epic.number}`,
    title: epic.title,
    done: epic.stories.filter((story) => story.status === 'done').length,
    total: epic.stories.length,
    ...(epic.file === undefined ? {} : { file: epic.file })
  }))
}
