import { useState } from 'react'
import type { JSX, ReactNode } from 'react'

import './shell.css'
import type { AgentView, HarnessError, InstallSnapshot } from '../../../shared/install'
import type { RailSnapshot } from '../../../shared/rail'
import { ChatHeader } from '../chat/chat-header'
import type { PersonaState } from '../persona/portrait'
import { ConnectedOutputs } from '../outputs/outputs'
import { stateOf } from '../status/persona-state'
import { Team } from '../team/team'
import { currentAgent, displayOrder, groupAgents } from '../team/tile-groups'
import { Topbar } from './topbar'
import { useBranch } from './use-branch'
import { DEFAULT_VIEW, VIEWS } from './view'
import type { ViewId } from './view'

/** The label of a view, by id — the views name themselves, once, in `VIEWS`. */
function labelOf(id: ViewId): string {
  return VIEWS.find((view) => view.id === id)?.label ?? id
}

/** One half of the rail: a head over a scrolling body, empty unless given children. */
function RailHalf({ label, children }: { label: string; children?: ReactNode }): JSX.Element {
  return (
    <section className="rail-half">
      <div className="rail-head">
        <h3>{label}</h3>
      </div>
      <div className="rail-body">{children}</div>
    </section>
  )
}

/** Nothing reported yet, so every persona reads `idle` from an empty map. */
const NO_STATES: ReadonlyMap<string, PersonaState> = new Map()

/** No state has begun, so no counter has anything to count from. */
const NO_SINCE: ReadonlyMap<string, number> = new Map()

/**
 * The furniture the open room lives in (Story 1.9): a topbar, two views behind
 * one switch, and — in the 1:1 view — a chat column beside the rail.
 *
 * The view not showing stays mounted and `hidden`, never removed, so nothing
 * the user was doing is lost by looking at the other one. The Team half holds
 * the tiles and the chat column its header (Story 1.10); the Outputs half holds the
 * project's files (Story 1.11), and with no `rail` yet it is a head over an
 * empty body. The Party view is an empty region: its side panel is a later
 * story's, and no slot is reserved for it. `children` is what the thread holds.
 *
 * The shell owns which persona is current. It is derived at render from the
 * display order — the chosen id if the roster still has it, else the topmost
 * tile — so a roster change that removes the current agent lands in one frame.
 */
export function Shell({
  projectPath,
  snapshot,
  initialView = DEFAULT_VIEW,
  states = NO_STATES,
  since = NO_SINCE,
  rail = null,
  railFailure = null,
  onActivate,
  composer,
  children
}: {
  projectPath: string
  snapshot: InstallSnapshot
  /** Where the switch starts. The window always opens on the default; this is
      so the other state can be rendered without a DOM. */
  initialView?: ViewId
  /** Each persona's state, by agent id. Read, never written here: an absent id
      is `idle`. Main reports it; nothing in the renderer sets one. */
  states?: ReadonlyMap<string, PersonaState>
  /** When each persona's state began, in epoch milliseconds, by agent id. Only
      `work` reads it, as the instant its elapsed counter counts from. */
  since?: ReadonlyMap<string, number>
  /** The project's files, as main last pushed them. `null` until the first. */
  rail?: RailSnapshot | null
  /** Why there is no rail snapshot, when there is not one. */
  railFailure?: HarnessError | null
  /** Called with the agent's id on every tile selection, the current tile's too. */
  onActivate?: (agentId: string) => void
  /** The composer for the current persona, rendered in the chat column under the thread. */
  composer?: (agent: AgentView) => ReactNode
  children?: ReactNode
}): JSX.Element {
  const [view, setView] = useState<ViewId>(initialView)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const branch = useBranch()

  const ordered = displayOrder(groupAgents(snapshot.agents))
  const current = currentAgent(ordered, currentId)

  // With nobody listening, selecting is only choosing the current persona.
  const select =
    onActivate === undefined
      ? setCurrentId
      : (agentId: string): void => {
          setCurrentId(agentId)
          onActivate(agentId)
        }

  return (
    <div className="app">
      <Topbar
        projectPath={projectPath}
        agentCount={snapshot.agents.length}
        branch={branch}
        view={view}
        onView={setView}
      />
      <section
        className="view view-conversation"
        aria-label={labelOf('conversation')}
        hidden={view !== 'conversation'}
      >
        <div className="chat">
          {current !== null && (
            <ChatHeader key={current.id} agent={current} state={stateOf(current.id, states)} since={since.get(current.id)} />
          )}
          <div className="scroll">
            <div className="thread">{children}</div>
          </div>
          {current !== null && composer?.(current)}
        </div>
        <div className="rail">
          <RailHalf label="Team">
            <Team
              agents={snapshot.agents}
              menus={snapshot.menus}
              states={states}
              since={since}
              currentId={current?.id ?? null}
              onSelect={select}
            />
          </RailHalf>
          <RailHalf label="Outputs">
            <ConnectedOutputs
              snapshot={rail}
              failure={railFailure}
              agents={snapshot.agents}
              projectPath={projectPath}
            />
          </RailHalf>
        </div>
      </section>
      <section
        className="view view-party"
        aria-label={labelOf('party')}
        hidden={view !== 'party'}
      />
    </div>
  )
}
