import { createRef, useCallback, useState } from 'react'
import type { JSX, ReactNode, RefObject } from 'react'

import './shell.css'
import type { AgentView, HarnessError, InstallSnapshot, MenuEntryView } from '../../../shared/install'
import { PANELS } from '../../../shared/layout'
import { stateLineOf } from '../../../shared/output-folder'
import type { BoardSnapshot } from '../../../shared/board'
import type { RailSnapshot } from '../../../shared/rail'
import { BoardView } from '../board/board-view'
import type { ProseStore } from '../chat/prose-store'
import type { TranscriptEntry } from '../chat/transcript-entry'
import { ChatHeader, NewSessionHeader, SkillHeader } from '../chat/chat-header'
import type { SkillSeat } from '../status/skill-seat'
import { OrphanHeader } from '../chat/orphan-header'
import { FollowScroller } from '../follow/follow-scroller'
import { PanelSplitter } from '../layout/panel-splitter'
import { usePanelWidth } from '../layout/use-panel-width'
import type { PersonaState } from '../status/persona-state'
import { ConnectedOutputs } from '../outputs/outputs'
import { OutputsFolder, OutputsState } from '../outputs/outputs-head'
import { stateOf } from '../status/persona-state'
import { Team } from '../team/team'
import { TeamStrip } from '../team/team-strip'
import { currentAgent, displayOrder, groupAgents } from '../team/tile-groups'
import { ThreadIntro } from './thread-intro'
import { Topbar } from './topbar'
import { useBoardChord } from './use-board-chord'
import { useBranch } from './use-branch'
import { DEFAULT_VIEW, VIEWS } from './view'
import type { ViewId } from './view'

/** The label of a view, by id — the views name themselves, once, in `VIEWS`. */
function labelOf(id: ViewId): string {
  return VIEWS.find((view) => view.id === id)?.label ?? id
}

/**
 * One half of a side panel: a head over a scrolling body, empty unless given children.
 * `trailing` is what the head holds on its right (the Outputs half's folder and
 * `change…`), and `beneath` a line between the head and the body that does not
 * scroll with it.
 */
function RailHalf({
  label,
  trailing,
  beneath,
  children
}: {
  label: string
  trailing?: ReactNode
  beneath?: ReactNode
  children?: ReactNode
}): JSX.Element {
  return (
    <section className="rail-half">
      <div className="rail-head">
        <h3>{label}</h3>
        {trailing !== undefined && trailing !== null && <div className="rail-head-trailing">{trailing}</div>}
      </div>
      {beneath}
      <div className="rail-body">{children}</div>
    </section>
  )
}

/**
 * What the chat column is turned to (Story 7.5): the New session chat, a skill-first session by its id, or the
 * current persona. A window opens on the New session chat; choosing a tile turns it to a persona.
 */
export type ChatMode = 'new' | 'persona' | { skillSession: string }

/** No skill-first session: no seats. */
const NO_SEATS: readonly SkillSeat[] = []

/** No session outlives the roster: no orphan header. */
const NO_ORPHANS: readonly AgentView[] = []

/** No session is open, so no header carries a close control. */
const NO_LIVE: ReadonlySet<string> = new Set()

/** A shell given no way to close an orphan still shows it. */
function ignore(): void {}

/** A persona the menus name nothing for has no entries to offer. */
const NO_ITEMS: readonly MenuEntryView[] = []

/** Nothing reported yet, so every persona reads `idle` from an empty map. */
const NO_STATES: ReadonlyMap<string, PersonaState> = new Map()

/** No transcript yet, so no persona is on a run. */
const NO_RUNS: readonly TranscriptEntry[] = []

/** No state has begun, so no counter has anything to count from. */
const NO_SINCE: ReadonlyMap<string, number> = new Map()

/**
 * The furniture the open room lives in (Story 1.9): a topbar, three views behind
 * one switch, and — in the 1:1 view — the Team sidebar, the chat column and the
 * Outputs rail, in that order.
 *
 * The view not showing stays mounted and `hidden`, never removed, so nothing
 * the user was doing is lost by looking at the other one. The Team half holds
 * the tiles and the chat column its header (Story 1.10); the Outputs half holds the
 * project's files (Story 1.11), and with no `rail` yet it is a head over an
 * empty body. The Team half is the sidebar's, under a strip of four counts; the
 * Outputs half is the rail's alone. The Board view holds what `board` says (Story 6.3): `no sprint status`, so far. The Party view holds what `party` gives it (Story 4.1): its side
 * panel is a later story's, and no slot is reserved for it. `children` is what
 * the thread holds.
 *
 * Which persona is current is derived at render from the display order — the
 * chosen id if the roster still has it, else nobody (Story 7.5) — so a roster
 * change that removes the current agent lands in one frame. With nobody current the
 * column is the New session chat. The chosen id is the window's (`App` passes it,
 * so `@<name>` can change it as a tile can) or, where none is passed, the shell's own.
 */
export function Shell({
  projectPath,
  snapshot,
  initialView = DEFAULT_VIEW,
  states = NO_STATES,
  since = NO_SINCE,
  rail = null,
  railFailure = null,
  board = null,
  boardFailure = null,
  runs = NO_RUNS,
  prose,
  onChooseFolder = ignore,
  currentId: chosenId,
  onCurrentChange,
  onActivate,
  onEndSession,
  orphans = NO_ORPHANS,
  onCloseOrphan,
  liveSessions = NO_LIVE,
  onCloseSession,
  turnsInFlight = NO_LIVE,
  onStopTurn,
  composer,
  sends = 0,
  pinned,
  party,
  threadEmpty = false,
  chat = 'persona',
  skillSeats = NO_SEATS,
  onNewSession = ignore,
  onSelectSeat,
  onCloseSkill,
  onStopSkill,
  skillBusy = NO_LIVE,
  skillComposer,
  newComposer,
  showView,
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
  /** The sprint status, as main last pushed it (Story 6.3). `null` until the first. */
  board?: BoardSnapshot | null
  /** Why there is no Board snapshot, when there is not one. */
  boardFailure?: HarnessError | null
  /** The window's transcript entries: the Board's Agents panel reads the run each working persona is on (Story 6.6). */
  runs?: readonly TranscriptEntry[]
  /** Where each run's document text is held: the Agents panel reads the path of a run's subject. */
  prose?: ProseStore
  /** Called when `change…` is pressed: the native folder chooser for the output folder (Story 5.4). */
  onChooseFolder?: () => void
  /** The current persona when the window holds it: `App` does, so `@<name>` can move it
      too. Left out, the shell keeps its own and selecting a tile is what changes it. */
  currentId?: string | null
  /** Called with the agent's id when a tile selection makes it current. */
  onCurrentChange?: (agentId: string) => void
  /** Called with the agent's id on every tile selection, the current tile's too. Selecting opens no
      session (Story 8.2); a caller uses this only to settle UI state such as pending composer focus. */
  onActivate?: (agentId: string) => void
  /** Called when the end-session control is activated. Without it the control is not rendered. */
  onEndSession?: () => void
  /** The personas the roster no longer names whose session is still open, in session
      order. Each gets a header of its own above the current persona's, and no tile. */
  orphans?: readonly AgentView[]
  /** Called with the agent's id when an orphan header's close control is activated. */
  onCloseOrphan?: (agentId: string) => void
  /** The agent ids that have a session open. The current persona's header carries a
      close control while it is one of them and `onCloseSession` is given. */
  liveSessions?: ReadonlySet<string>
  /** Called with the agent's id when the current persona's close control is activated. */
  onCloseSession?: (agentId: string) => void
  /** The agent ids whose live session has a turn in flight, a run or a plain chat turn (main's busy set).
      While the current persona is one of them the header's one control reads `Stop`. */
  turnsInFlight?: ReadonlySet<string>
  /** Called with the agent's id when the current persona's `Stop` is activated. */
  onStopTurn?: (agentId: string) => void
  /** The composer for the current persona, rendered in the chat column under the thread, and
      handed that persona's menu entries for the skill row it carries. */
  composer?: (
    agent: AgentView,
    items: readonly MenuEntryView[],
    fieldRef: RefObject<HTMLTextAreaElement | null>
  ) => ReactNode
  /** How many user turns the thread holds (Story 5.3): a rise puts the thread at its bottom, following. */
  sends?: number
  /** What is pinned at the top of the chat column for the current persona (Story 3.14): the
      running card. Called with the current persona; a `null` result draws no slot. */
  pinned?: (agent: AgentView) => ReactNode
  /** What the Party view holds (Story 4.1): the cast chooser and the party thread. Left out, the view is empty. */
  party?: ReactNode
  /** The thread holds nothing yet: the current persona is introduced in its place. */
  threadEmpty?: boolean
  /** What the chat column is turned to (Story 7.5). Left out it is the current persona's, as it always was; with
      no current persona, whatever was asked for, it is the New session chat. */
  chat?: ChatMode
  /** The skill-first sessions, in start order: the `Skill sessions` group of the Team half. */
  skillSeats?: readonly SkillSeat[]
  /** Called when the `Skill Session` button is pressed: the window turns to the New session chat. */
  onNewSession?: () => void
  /** Called with a seat's session id when it is chosen. */
  onSelectSeat?: (sessionId: string) => void
  /** Called with the session id when a skill-first session's `close session` is activated. */
  onCloseSkill?: (sessionId: string) => void
  /** Called with the session id when a skill-first session's `Stop` is activated. */
  onStopSkill?: (sessionId: string) => void
  /** The skill-first sessions that have a turn in flight, by session id: while the one in view is, its header reads `Stop`. */
  skillBusy?: ReadonlySet<string>
  /** The composer of the skill-first session in view. */
  skillComposer?: (seat: SkillSeat, fieldRef: RefObject<HTMLTextAreaElement | null>) => ReactNode
  /** The composer of the New session chat. */
  newComposer?: (fieldRef: RefObject<HTMLTextAreaElement | null>) => ReactNode
  /** A view the window asks the shell to show (the room, after `/bmad-party-mode`): shown once for each new `n`. */
  showView?: { view: ViewId; n: number }
  children?: ReactNode
}): JSX.Element {
  const [view, setView] = useState<ViewId>(initialView)
  const [ownId, setOwnId] = useState<string | null>(null)
  const branch = useBranch()
  // `g` then `b` shows the Board: the one chord, and only ever to this view.
  useBoardChord(useCallback(() => setView('board'), []))
  // The two side panels' widths (Story 5.5): each chosen by its own splitter and shown as the token's own
  // property overridden on the panel. They share one container and each reserves what the other takes: the
  // sidebar the rail's chosen-or-default, the rail the sidebar's width now, so the chat column keeps its minimum.
  const [railBase, setRailBase] = useState(PANELS.rail.default)
  const sidebarPanel = usePanelWidth('sidebar', railBase)
  const railPanel = usePanelWidth('rail', sidebarPanel.splitter.now)
  if (railPanel.base !== railBase) {
    setRailBase(railPanel.base)
  }
  const { holdContainer: holdSidebar, style: sidebarStyle, splitter: sidebarSplitter } = sidebarPanel
  const { holdContainer: holdRail, style: railStyle, splitter: railSplitter } = railPanel
  const holdView = useCallback(
    (element: HTMLElement | null): void => {
      holdSidebar(element)
      holdRail(element)
    },
    [holdSidebar, holdRail]
  )
  // The current composer's field, which the thread's `↓ latest` puts focus in (Story 5.3).
  const [fieldRef] = useState(() => createRef<HTMLTextAreaElement>())
  // The window asked for a view (the room, after `/bmad-party-mode`): shown once for each new request.
  const [shownN, setShownN] = useState(showView?.n)
  if (showView !== undefined && showView.n !== shownN) {
    setShownN(showView.n)
    setView(showView.view)
  }

  const currentId = chosenId === undefined ? ownId : chosenId
  const ordered = displayOrder(groupAgents(snapshot.agents))
  const current = currentAgent(ordered, currentId)
  // What the column is turned to: a seat that is gone, or a persona nobody chose, is the New session chat.
  const seat = typeof chat === 'object' ? skillSeats.find(({ sessionId }) => sessionId === chat.skillSession) : undefined
  const mode: 'new' | 'persona' | 'skill' = seat !== undefined ? 'skill' : chat === 'persona' && current !== null ? 'persona' : 'new'
  const persona = mode === 'persona' ? current : null

  const outputsLine = rail === null ? undefined : stateLineOf(rail, rail.refusal)
  const pinnedNode = persona === null ? null : (pinned?.(persona) ?? null)

  // With nobody listening, selecting is only choosing the current persona.
  const select =
    onActivate === undefined && onCurrentChange === undefined
      ? setOwnId
      : (agentId: string): void => {
          setOwnId(agentId)
          onCurrentChange?.(agentId)
          onActivate?.(agentId)
        }

  return (
    <div className="app">
      <Topbar
        projectPath={projectPath}
        agentCount={snapshot.agents.length}
        branch={branch}
        view={view}
        onView={setView}
        onEndSession={onEndSession}
      />
      <section
        className="view view-conversation"
        aria-label={labelOf('conversation')}
        hidden={view !== 'conversation'}
        ref={holdView}
      >
        <div className="sidebar" style={sidebarStyle}>
          <RailHalf
            label="Team"
            beneath={
              <>
                <TeamStrip agents={snapshot.agents} states={states} />
                <div className="skill-session-row">
                  <button
                    type="button"
                    className="skill-session-button"
                    aria-pressed={mode === 'new' && view === 'conversation'}
                    onClick={onNewSession}
                  >
                    Skill Session
                  </button>
                </div>
              </>
            }
          >
            <Team
              agents={snapshot.agents}
              menus={snapshot.menus}
              states={states}
              since={since}
              currentId={persona?.id ?? null}
              onSelect={select}
              skillSeats={skillSeats}
              currentSeatId={seat?.sessionId ?? null}
              onSelectSeat={onSelectSeat}
            />
          </RailHalf>
        </div>
        <PanelSplitter splitter={sidebarSplitter} />
        <div className="chat">
          {pinnedNode !== null && pinnedNode !== undefined && <div className="pinned">{pinnedNode}</div>}
          {orphans.map((orphan) => (
            // Prefixed: keeps these keys apart from the current persona's header key.
            <OrphanHeader key={`orphan-${orphan.id}`} agent={orphan} onClose={onCloseOrphan ?? ignore} />
          ))}
          {persona !== null && (
            <ChatHeader key={persona.id}
              agent={persona}
              state={stateOf(persona.id, states)}
              since={since.get(persona.id)}
              onClose={
                onCloseSession !== undefined && liveSessions.has(persona.id)
                  ? () => onCloseSession(persona.id)
                  : undefined
              }
              turnInFlight={turnsInFlight.has(persona.id)}
              onStop={onStopTurn === undefined ? undefined : () => onStopTurn(persona.id)}
            />
          )}
          {seat !== undefined && (
            <SkillHeader
              key={`skill-${seat.sessionId}`}
              skill={seat.skill}
              state={seat.state}
              since={seat.since}
              turnInFlight={skillBusy.has(seat.sessionId)}
              onClose={() => onCloseSkill?.(seat.sessionId)}
              onStop={onStopSkill === undefined ? undefined : () => onStopSkill(seat.sessionId)}
            />
          )}
          {mode === 'new' && <NewSessionHeader />}
          <FollowScroller
            className="scroll"
            contentClassName="thread"
            resetKey={seat === undefined ? (persona?.id ?? 'new') : `skill:${seat.sessionId}`}
            sends={sends}
            fieldRef={fieldRef}
          >
            {threadEmpty && persona !== null && <ThreadIntro agent={persona} items={snapshot.menus[persona.id] ?? NO_ITEMS} />}
            {children}
          </FollowScroller>
          {persona !== null && composer?.(persona, snapshot.menus[persona.id] ?? NO_ITEMS, fieldRef)}
          {seat !== undefined && skillComposer?.(seat, fieldRef)}
          {mode === 'new' && newComposer?.(fieldRef)}
        </div>
        <PanelSplitter splitter={railSplitter} />
        <div className="rail" style={railStyle}>
          <RailHalf
            label="Outputs"
            trailing={rail === null ? null : <OutputsFolder folder={rail.folder} onChange={onChooseFolder} />}
            beneath={outputsLine === undefined ? null : <OutputsState line={outputsLine} />}
          >
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
      >
        {party}
      </section>
      <section className="view view-board" aria-label={labelOf('board')} hidden={view !== 'board'}>
        <BoardView
          snapshot={board}
          failure={boardFailure}
          folder={rail?.folder}
          states={states}
          installed={snapshot.agents}
          entries={runs}
          prose={prose}
        />
      </section>
    </div>
  )
}
