import type { JSX } from 'react'

import type { BoardSnapshot } from '../../../shared/board'
import type { AgentView, HarnessError } from '../../../shared/install'
import type { ProseStore } from '../chat/prose-store'
import type { TranscriptEntry } from '../chat/transcript-entry'
import type { PersonaState } from '../persona/portrait'
import { agentRowsOf } from './board-agents'
import { AgentsPanel } from './board-agents-panel'
import { columnsOf } from './board-columns'
import { epicRowsOf, overviewOf } from './board-figures'

/**
 * The Board's body (Stories 6.3 to 6.5). A snapshot that says there is none, or
 * a failure from main, draws `no sprint status` and the file being watched: no
 * error dialog, no code, no stack. A snapshot that was read draws the story
 * board: an overview of two plain figures, one column per status (each story a
 * card with its number and title and nothing else), and one text row per epic
 * reading `n of m stories done`, then the Agents panel (Story 6.6): one row per installed
 * persona with its state, and the run it is on. The recent-activity region is Story 6.7's.
 * The time before the first snapshot draws nothing: no spinner and no skeleton.
 *
 * A card, a figure and a row are not controls: no handler, no tab stop, no live
 * region and no percentage. A column with nothing in it says `no stories`, and an
 * epic row's words are backed by a thin bar that is decoration only (`aria-hidden`, drawn as an empty track and a filled span):
 * the words are the one place the figure is stated. (A design audit reversed the
 * first Epic 6 ruling that the Board carry neither.) A new snapshot or persona
 * state replaces the text in one render.
 *
 * `states` and `installed` are the tiles' own: the figure for agents running
 * counts the roster's personas in `work`. `entries` and `prose` are the window's:
 * a persona's run in flight is read from the entries and its subject path from
 * the prose store, as the run card reads them.
 *
 * `folder` is the rail's output folder, with its trailing `/`; the reader's own
 * path is main's, so it is built the same way here. With no rail snapshot yet
 * there is no path line.
 */
export function BoardView({
  snapshot,
  failure,
  folder,
  states,
  installed,
  entries,
  prose
}: {
  snapshot: BoardSnapshot | null
  failure: HarnessError | null
  folder: string | undefined
  states: ReadonlyMap<string, PersonaState>
  installed: readonly AgentView[]
  entries: readonly TranscriptEntry[]
  prose?: ProseStore | undefined
}): JSX.Element | null {
  if (snapshot !== null && snapshot.kind === 'read') {
    const overview = overviewOf(snapshot, installed, states)
    return (
      <>
        <div className="board-overview">
          <div className="board-figure">
            <p className="board-figure-label">agents running</p>
            <p className="board-figure-value">{overview.running}</p>
            <p className="board-figure-line">{`of ${overview.installedCount} installed`}</p>
          </div>
          <div className="board-figure">
            <p className="board-figure-label">stories in progress</p>
            <p className="board-figure-value">{overview.inProgress}</p>
            <p className="board-figure-line">{`of ${overview.shown} stories`}</p>
          </div>
        </div>
        <div className="board-stories">
          {columnsOf(snapshot).map(({ status, stories }) => (
            <section className="board-column" key={status}>
              <h3 className="board-column-head">{status}</h3>
              <ul className="board-cards">
                {stories.length === 0 && <li className="board-cards-empty">no stories</li>}
                {stories.map((story) => (
                  <li className="board-card" key={story.key}>
                    <span className="board-card-number">{story.number}</span>
                    <span className="board-card-title">{story.title}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <section className="board-epics">
          <h3 className="board-epics-head">epics</h3>
          <ul className="board-epic-rows">
            {epicRowsOf(snapshot).map((row) => (
              <li className="board-epic" key={row.key}>
                <span className="board-epic-id">{row.id}</span>
                {row.title !== '' && <span className="board-epic-title">{row.title}</span>}
                {row.total > 0 && (
                  <span className="board-epic-track" aria-hidden="true">
                    <span className="board-epic-fill" style={{ width: `${Math.round((row.done / row.total) * 100)}%` }} />
                  </span>
                )}
                <span className="board-epic-progress">
                  {row.total === 0 ? 'no stories' : `${row.done} of ${row.total} stories done`}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <AgentsPanel rows={agentRowsOf(installed, states, entries)} prose={prose} />
      </>
    )
  }
  const none = snapshot === null ? failure !== null : snapshot.kind === 'none'
  if (!none) {
    return null
  }
  return (
    <div className="board-empty">
      <p className="board-empty-line">no sprint status</p>
      {folder !== undefined && <p className="board-empty-path">{`${folder}implementation-artifacts/sprint-status.yaml`}</p>}
    </div>
  )
}
