import { useState } from 'react'
import type { JSX, ReactNode } from 'react'

import './shell.css'
import type { InstallSnapshot } from '../../../shared/install'
import { Topbar } from './topbar'
import { useBranch } from './use-branch'
import { DEFAULT_VIEW, VIEWS } from './view'
import type { ViewId } from './view'

/** The label of a view, by id — the views name themselves, once, in `VIEWS`. */
function labelOf(id: ViewId): string {
  return VIEWS.find((view) => view.id === id)?.label ?? id
}

/** One half of the rail: a head over an empty scrolling body. */
function RailHalf({ label }: { label: string }): JSX.Element {
  return (
    <section className="rail-half">
      <div className="rail-head">
        <h3>{label}</h3>
      </div>
      <div className="rail-body" />
    </section>
  )
}

/**
 * The furniture the open room lives in (Story 1.9): a topbar, two views behind
 * one switch, and — in the 1:1 view — a chat column beside the rail.
 *
 * The view not showing stays mounted and `hidden`, never removed, so nothing
 * the user was doing is lost by looking at the other one. The rail halves are
 * heads over empty bodies and the Party view is an empty region: the tiles,
 * rows and side panel are later stories', and no slot is reserved for them.
 * `children` is what the thread holds.
 */
export function Shell({
  projectPath,
  snapshot,
  initialView = DEFAULT_VIEW,
  children
}: {
  projectPath: string
  snapshot: InstallSnapshot
  /** Where the switch starts. The window always opens on the default; this is
      so the other state can be rendered without a DOM. */
  initialView?: ViewId
  children?: ReactNode
}): JSX.Element {
  const [view, setView] = useState<ViewId>(initialView)
  const branch = useBranch()

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
          <div className="scroll">
            <div className="thread">{children}</div>
          </div>
        </div>
        <div className="rail">
          <RailHalf label="Team" />
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
