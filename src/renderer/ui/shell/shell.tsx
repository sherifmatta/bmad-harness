import { useState } from 'react'
import type { JSX, ReactNode } from 'react'

import './shell.css'
import type { InstallSnapshot } from '../../../shared/install'
import { ChatHeader } from '../chat/chat-header'
import type { PersonaState } from '../persona/portrait'
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

/** No sessions exist in this epic, so every persona reads `idle` from an empty map. */
const NO_STATES: ReadonlyMap<string, PersonaState> = new Map()

/**
 * The furniture the open room lives in (Story 1.9): a topbar, two views behind
 * one switch, and — in the 1:1 view — a chat column beside the rail.
 *
 * The view not showing stays mounted and `hidden`, never removed, so nothing
 * the user was doing is lost by looking at the other one. The Team half holds
 * the tiles and the chat column its header (Story 1.10); the Outputs half is a
 * head over an empty body and the Party view is an empty region: the rows and
 * side panel are later stories', and no slot is reserved for them. `children`
 * is what the thread holds.
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
  children
}: {
  projectPath: string
  snapshot: InstallSnapshot
  /** Where the switch starts. The window always opens on the default; this is
      so the other state can be rendered without a DOM. */
  initialView?: ViewId
  /** Each persona's state, by agent id. Read, never written here: an absent id
      is `idle`, and with no sessions in this epic the map is empty. */
  states?: ReadonlyMap<string, PersonaState>
  children?: ReactNode
}): JSX.Element {
  const [view, setView] = useState<ViewId>(initialView)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const branch = useBranch()

  const ordered = displayOrder(groupAgents(snapshot.agents))
  const current = currentAgent(ordered, currentId)

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
            <ChatHeader key={current.id} agent={current} state={stateOf(current.id, states)} />
          )}
          <div className="scroll">
            <div className="thread">{children}</div>
          </div>
        </div>
        <div className="rail">
          <RailHalf label="Team">
            <Team
              agents={snapshot.agents}
              menus={snapshot.menus}
              states={states}
              currentId={current?.id ?? null}
              onSelect={setCurrentId}
            />
          </RailHalf>
          <RailHalf label="Outputs" />
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
