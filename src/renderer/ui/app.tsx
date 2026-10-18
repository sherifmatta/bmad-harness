import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'

import { Announcer } from './a11y/announcer'
import { LiveRegion } from './a11y/live-region'
import { Composer } from './chat/composer'
import { Sysline } from './chat/sysline'
import { handoffTarget } from './chat/handoff-target'
import { SkillRow } from './chat/skill-row'
import { RunCard } from './chat/run-card'
import { pinnedRun, Turns } from './chat/transcript'
import { isEntryInPersonaThread } from './chat/transcript-entry'
import type { PersonaInFlight, RunCollapse } from './chat/transcript'
import { useConversation } from './chat/use-conversation'
import { connectRunRevealed } from './chat/use-reveal'
import { ErrorLine } from './install/error-line'
import { LayoutContext } from './layout/layout-context'
import { useLayout } from './layout/use-layout'
import { Preflight } from './install/preflight'
import { announceable, newAnnouncements, roomState } from './install/install-state'
import { useInstall } from './install/use-install'
import { useBoard } from './board/use-board'
import { useRail } from './outputs/use-rail'
import { PartyView } from './party/party-view'
import { skillKey } from './status/skill-seat'
import { Shell } from './shell/shell'
import type { ChatMode } from './shell/shell'
import { currentAgent, displayOrder, groupAgents } from './team/tile-groups'
import type { SyslineRecord } from '../../shared/conversation'
import type { ViewId } from './shell/view'
import type { AgentView } from '../../shared/install'
import { refusalLine } from '../../shared/output-folder'

/** No roster yet: the conversation is mounted before the install has answered. */
const NO_AGENTS: readonly AgentView[] = []

/**
 * The New session chat (Story 7.5): a renderer surface with no session behind it, kept for the window with the
 * lines it refused a first message with. `id` tells one chat from the next, so a fresh one starts with an empty
 * field. One is always kept: sending a first message spends it and puts a fresh one in its place, so pressing
 * `Skill Session` again turns to an empty chat, as if it had been made then.
 */
type NewChat = { id: number; lines: readonly { id: string; text: string }[] }

/** A chat nobody has typed into: the one a window opens on, and the one that takes the place of a chat whose first message was sent. */
const freshChat = (id: number): NewChat => ({ id, lines: [] })

/** No run expanded: every card of a persona not viewed is a line. */
const NO_RUNS: ReadonlySet<string> = new Set()

/**
 * The renderer's root: it resolves the project this window was opened for, gates
 * the room on the install (Story 1.8), and mounts the shell around the
 * conversation when the room opens (Stories 1.9 and 2.4). It owns the window's
 * one announcer and mounts the one live region on every screen that renders
 * anything. A literal colour, dimension or font stack here would be a defect.
 *
 * The thread holds the install's errors, then the conversation's turns: a
 * persona's own words as they arrive and the user's own sends, and the sysline
 * main writes when the work is handed on. Selecting a tile opens that persona's
 * session, and leaves focus on the tile; the composer under the thread is keyed
 * by the current persona and sends to theirs, except that `@<name>` at the start
 * of a message hands the conversation to that persona instead (Story 2.9). The
 * window holds which persona is current so both ways move it.
 *
 * Each persona's chat draws that persona's thread alone (Story 8.1): its turns, the user's turns to it, the
 * harness's lines about its session and its run cards, by the one predicate in `shared/thread.ts`. A run in
 * flight for a persona that is not viewed is in that persona's chat and not drawn here; the one-line form it
 * had here (Story 3.5) stays declared, with no caller in a persona's chat, until Story 8.4. The window holds
 * the ids of the runs the user expanded, and the one run whose card, drawn just now in place of its line,
 * takes focus as it mounts: that request is made by the activation alone and is spent by the card taking it.
 *
 * Every card and line in flight carries the stop control (Story 3.7), the pinned
 * card too; they are all handed the conversation's one `stopRun`, which asks main
 * to stop the run by its id and says nothing of how that went.
 *
 * A run that ended while the user was in another window is told once there, and
 * activating it raises this window (Story 3.10): main then pushes the run's id, and
 * the window holds it as it holds a focus request, for the one card named to scroll
 * into view and spend. A request for a run the conversation does not hold (it
 * ended) is dropped on arrival. The current persona, the documents and the
 * sessions are not touched on this path.
 *
 * A window opens on the New session chat (Story 7.5): no persona is current until a tile is chosen. The chat column
 * is turned to that chat, a persona or a skill-first session's seat, and `ChatMode` says which. A first message typed
 * in the New session chat is sent as it is typed and main reads it: it starts a skill-first session, turns to a
 * persona's seat or the room (and the words after the name are sent there), or is refused, and then the refusal is a
 * line in that chat and the text stays in its field.
 */
export function App(): JSX.Element | null {
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const { snapshot, failure: installFailure } = useInstall()
  const { snapshot: rail, failure: railFailure } = useRail()
  const { snapshot: board, failure: boardFailure } = useBoard()
  // The panels' widths and the folded directories the window started from (Story 5.5), and how to keep them.
  const layout = useLayout()
  const [announcer] = useState(() => new Announcer())
  const [currentId, setCurrentId] = useState<string | null>(null)
  // What the chat column is turned to, and the one New session chat the window keeps until its first message is sent.
  const [chat, setChat] = useState<ChatMode>('new')
  const [newChat, setNewChat] = useState<NewChat>(() => freshChat(0))
  // The kept chat's half-typed text, so a turn to another chat and back finds it as it was.
  const [newDraft, setNewDraft] = useState('')
  const [showView, setShowView] = useState<{ view: ViewId; n: number } | undefined>(undefined)
  // The persona whose composer takes focus when it appears, or when `n` moves: after an
  // `@` handoff, and after the user answers a decision with an option (`n` counts those).
  const [composerFocus, setComposerFocus] = useState<{ id: string; n: number } | null>(null)
  // A handoff line is announced once, with the line the transcript shows. Main no longer writes one
  // (Story 7.4), so this is reachable only through a reply that carries one.
  const announceHandoff = useCallback(
    (record: SyslineRecord) => announcer.announce(record.text, performance.now()),
    [announcer]
  )
  // A run's start and end are announced once each, politely; its prose never is.
  const announceLifecycle = useCallback(
    (line: string) => announcer.announce(line, performance.now()),
    [announcer]
  )
  // `change…` asks main to open the native chooser. What came of it is the rail's
  // next snapshot (the folder, or a refusal), so nothing is waited for here.
  const chooseFolder = useCallback(() => {
    if (typeof window.harness?.chooseOutputFolder === 'function') {
      window.harness.chooseOutputFolder().catch(() => {})
    }
  }, [])
  // A refused choice is announced once, politely, when the snapshot first carries it
  // (Story 5.4): the one a window finds on connecting was announced when it was made.
  const seenRefusal = useRef<number | null | undefined>(undefined)
  const refusal = rail?.refusal
  const hasRail = rail !== null
  useEffect(() => {
    if (!hasRail) {
      return
    }
    const seq = refusal?.seq ?? null
    const before = seenRefusal.current
    seenRefusal.current = seq
    if (before !== undefined && refusal !== undefined && seq !== before) {
      announcer.announce(refusalLine(refusal), performance.now())
    }
  }, [announcer, hasRail, refusal])
  const conversation = useConversation(snapshot?.agents ?? NO_AGENTS, announceHandoff, announceLifecycle)
  const announced = useRef<ReadonlySet<string>>(new Set())
  const [expandedRuns, setExpandedRuns] = useState<ReadonlySet<string>>(NO_RUNS)
  const [focusRunId, setFocusRunId] = useState<string | undefined>(undefined)
  // A line was activated: its run stays expanded for good, and its card takes focus once.
  const expandRun = useCallback((runId: string) => {
    setExpandedRuns((held) => (held.has(runId) ? held : new Set(held).add(runId)))
    setFocusRunId(runId)
  }, [])
  // The card took focus as it mounted, which spends the request: a later mount of a
  // card (the pinned slot, the thread again) takes none.
  const focusSpent = useCallback(() => setFocusRunId(undefined), [])
  const [revealRunId, setRevealRunId] = useState<string | undefined>(undefined)
  // The entries as they stand when a reveal arrives, so the subscription is made once.
  const entriesRef = useRef(conversation.entries)
  useEffect(() => {
    entriesRef.current = conversation.entries
  }, [conversation.entries])
  // Main raised this window for a run: its card scrolls into view, when the thread
  // holds it. An id no entry holds is dropped here and nothing is held for later.
  useEffect(
    () =>
      connectRunRevealed(window.harness, (runId) => {
        if (entriesRef.current.some((entry) => entry.kind === 'run' && entry.runId === runId)) {
          setRevealRunId(runId)
        }
      }),
    []
  )
  // The card scrolled into view, which spends the request.
  const revealed = useCallback(() => setRevealRunId(undefined), [])

  // The shell reads two maps, so the one main-reported entry per persona is split
  // here; neither is ever written to by the window.
  const { states, since } = useMemo(
    () => ({
      states: new Map([...conversation.personas].map(([id, entry]) => [id, entry.state])),
      since: new Map([...conversation.personas].map(([id, entry]) => [id, entry.at]))
    }),
    [conversation.personas]
  )

  // Each line is spoken once, when it first appears: `message` only, never
  // `detail`. The key set is of the lines now, so one that clears and returns
  // is announced again.
  useEffect(() => {
    const { messages, keys } = newAnnouncements(
      announced.current,
      announceable(snapshot, installFailure)
    )
    announced.current = keys
    for (const message of messages) {
      announcer.announce(message, performance.now())
    }
  }, [announcer, snapshot, installFailure])

  // A preload that failed to load leaves no bridge at all. Read at render
  // rather than in the effect: without this the effect's call throws and the
  // window goes blank with nothing said about why.
  const bridgeAvailable = typeof window.harness?.getProjectPath === 'function'

  useEffect(() => {
    if (!bridgeAvailable) {
      return
    }

    let live = true
    window.harness
      .getProjectPath()
      .then((path) => {
        if (live) {
          setProjectPath(path)
        }
      })
      .catch((reason: unknown) => {
        if (live) {
          setFailure(String(reason))
        }
      })
    return () => {
      live = false
    }
  }, [bridgeAvailable])

  if (!bridgeAvailable) {
    return <p>bridge/unavailable · the preload did not load</p>
  }
  if (failure !== null) {
    return <p>{failure}</p>
  }
  if (projectPath === null) {
    return null
  }
  // A decision option is a message to the persona who asked, like any other. The
  // button that held focus goes with the block, so the user's place is that composer.
  const answer = (agentId: string, text: string): void => {
    conversation.send(agentId, text)
    setCurrentId(agentId)
    setComposerFocus((held) => ({ id: agentId, n: held?.id === agentId ? held.n + 1 : 1 }))
  }
  // Ending one persona's session, an orphan's or the current one's: the close
  // control goes with the session, so the user's place is the current persona's
  // composer, as after a decision answer.
  const closeSession = (agentId: string): void => {
    void conversation.close(agentId).then((closed) => {
      const current = currentAgent(displayOrder(groupAgents(snapshot?.agents ?? NO_AGENTS)), currentId)
      if (closed && current !== null) {
        setComposerFocus((held) => ({
          id: current.id,
          n: held?.id === current.id ? held.n + 1 : 1
        }))
      }
    })
  }
  // The personas with a live session and a turn in flight, run or chat: main's own busy set, which the
  // header's Stop reads (`turnsInFlight` leaves out a run that has said nothing yet).
  const busyPersonas = new Set([...conversation.live].filter((agentId) => !conversation.canAnswer(agentId)))
  // The New session chat's field takes focus when it appears, and again each time the window lands on it after a
  // skill-first session ended: a counter, so the same request can be made again.
  const landOnNew = (): void => setChat('new')
  // A first message from the New session chat: main reads it. A refusal is a line here, never a record, and the
  // text stays in the field; anything else spends the chat and turns the window to what main made of it.
  const sendFirst = (text: string): Promise<boolean> =>
    conversation.startFrom(text, Date.now()).then((outcome) => {
      if (outcome.kind === 'refused') {
        const line = outcome.line
        if (line !== undefined) {
          setNewChat((held) => ({ ...held, lines: [...held.lines, { id: `new-line-${held.lines.length}`, text: line }] }))
          announcer.announce(line, performance.now())
        }
        return false
      }
      setNewDraft('')
      setNewChat((held) => freshChat(held.id + 1))
      if (outcome.kind === 'skill') {
        setChat({ skillSession: outcome.sessionId })
        // The chat that held focus is spent: the user's place is the new session's composer, as after a seat.
        setComposerFocus({ id: skillKey(outcome.sessionId), n: 0 })
      } else if (outcome.kind === 'seat') {
        setCurrentId(outcome.agentId)
        setChat('persona')
        setComposerFocus({ id: outcome.agentId, n: 0 })
        if (outcome.rest !== '') {
          conversation.send(outcome.agentId, outcome.rest)
        }
      } else {
        setShowView((held) => ({ view: 'party', n: (held?.n ?? 0) + 1 }))
        if (outcome.rest !== '') {
          conversation.sendToRoom(outcome.rest)
        }
      }
      return true
    })
  const closeSkill = (sessionId: string): void => {
    void conversation.closeSkill(sessionId).then((closed) => {
      if (closed) {
        landOnNew()
      }
    })
  }
  const room = roomState(snapshot, installFailure)
  if (room === 'pending') {
    return null
  }
  // Story 1.8 gate: the room opens only when preflight passes; what opens is the shell (Story 1.9).
  // The live region carries one key in both branches so a blocked-to-open change keeps it mounted.
  if (room === 'blocked') {
    return (
      <>
        <p>{projectPath}</p>
        <Preflight snapshot={snapshot} failure={installFailure} />
        <LiveRegion key="live-region" announcer={announcer} />
      </>
    )
  }
  if (snapshot === null) {
    return null
  }
  // The viewed persona, resolved as the shell resolves it, and the one run card of theirs in
  // flight: drawn in the shell's pinned slot and skipped in the thread (Story 3.14).
  const current = currentAgent(displayOrder(groupAgents(snapshot.agents)), currentId)
  // What the column is turned to, as the shell resolves it: a seat that is gone, or a persona nobody chose, is the New session chat.
  const seat = typeof chat === 'object' ? conversation.skillSeats.find(({ sessionId }) => sessionId === chat.skillSession) : undefined
  const mode: 'new' | 'persona' | 'skill' = seat !== undefined ? 'skill' : chat === 'persona' && current !== null ? 'persona' : 'new'
  const viewed = mode === 'persona' ? current : null
  const pinnedEntry = pinnedRun(conversation.entries, viewed?.id)
  // The personas with a turn in flight, by main's state, each named as the transcript names them:
  // the roster's, an orphan's, else the id standing as the name.
  const inFlight: PersonaInFlight[] = [...conversation.turnsInFlight].map(([agentId, turn]) => ({
    agent:
      snapshot.agents.find((agent) => agent.id === agentId) ??
      conversation.orphans.find((agent) => agent.id === agentId) ?? {
        id: agentId,
        module: '',
        name: agentId,
        title: '',
        icon: '',
        description: ''
      },
    since: turn.since,
    entryId: turn.entryId
  }))
  // The user's own turns in the thread in view, outside the room: a rise is a send, and the thread goes to its bottom (Story 5.3).
  // A skill-first session's thread counts its own, and the shared one none of them (Story 7.5).
  // A persona's chat counts the user's turns in its own thread alone (Story 8.1).
  const scope = seat?.sessionId
  const sends = conversation.entries.filter((entry) =>
    viewed === null
      ? entry.kind === 'user' && entry.room !== true && entry.skillSession === scope
      : entry.kind === 'user' && isEntryInPersonaThread(entry, viewed.id)
  ).length
  // A card names its persona as the lifecycle line does: the roster's name, an orphan's, else the id.
  const collapse: RunCollapse = {
    viewedId: viewed?.id,
    expanded: expandedRuns,
    nameOf: (agentId) =>
      agentId === undefined
        ? ''
        : snapshot.agents.find((agent) => agent.id === agentId)?.name ||
          conversation.orphans.find((agent) => agent.id === agentId)?.name ||
          agentId,
    onExpand: expandRun,
    focusRunId,
    onFocused: focusSpent,
    revealRunId,
    onRevealed: revealed
  }
  return (
    <LayoutContext.Provider value={layout}>
      <Shell
        key="shell"
        projectPath={projectPath}
        snapshot={snapshot}
        states={states}
        since={since}
        rail={rail}
        railFailure={railFailure}
        board={board}
        boardFailure={boardFailure}
        runs={conversation.entries}
        prose={conversation.prose}
        onChooseFolder={chooseFolder}
        currentId={currentId}
        onCurrentChange={(agentId) => {
          setCurrentId(agentId)
          // A tile turns the chat to its persona; the New session chat is left kept, as it was.
          setChat('persona')
        }}
        onActivate={(agentId) => {
          // A tile never moves focus, so nothing is waiting to take it.
          setComposerFocus(null)
          void conversation.activate(agentId)
        }}
        onEndSession={() => {
          void conversation.end(projectPath).then((ended) => {
            if (ended) {
              announcer.announce('conversation · ended', performance.now())
            }
          })
        }}
        orphans={conversation.orphans}
        onCloseOrphan={closeSession}
        liveSessions={conversation.live}
        onCloseSession={closeSession}
        turnsInFlight={busyPersonas}
        onStopTurn={(agentId) => void conversation.stopTurn(agentId)}
        pinned={() =>
          pinnedEntry === null ? null : (
            <RunCard key={pinnedEntry.id} entry={pinnedEntry} prose={conversation.prose} onStop={conversation.stopRun} />
          )
        }
        party={
          <PartyView
            agents={snapshot.agents}
            room={conversation.room}
            roomCast={conversation.roomCast}
            speaker={conversation.speaker}
            inFlight={conversation.roomInFlight}
            entries={conversation.entries}
            topic={conversation.roomTopic}
            openedAt={conversation.roomOpenedAt}
            turns={conversation.roomTurns}
            returned={conversation.roomReturned}
            rows={rail?.rows ?? []}
            folder={rail?.folder}
            onOpen={(cast) => void conversation.openRoom(cast)}
            onSend={conversation.sendToRoom}
            onWriteSummary={rail === null ? undefined : () => conversation.writeSummary(rail.folder)}
            onStop={() => void conversation.stopRoom()}
          />
        }
        sends={sends}
        threadEmpty={
          viewed === null
            ? conversation.entries.every((entry) => entry.skillSession !== undefined)
            : !conversation.entries.some((entry) => isEntryInPersonaThread(entry, viewed.id))
        }
        chat={seat === undefined ? (mode === 'persona' ? 'persona' : 'new') : { skillSession: seat.sessionId }}
        skillSeats={conversation.skillSeats}
        onNewSession={landOnNew}
        onSelectSeat={(sessionId) => setChat({ skillSession: sessionId })}
        onCloseSkill={closeSkill}
        onStopSkill={(sessionId) => void conversation.stopSkill(sessionId)}
        skillBusy={conversation.busy}
        showView={showView}
        skillComposer={(skillSeat, fieldRef) => (
          // Keyed by the session: each seat's field is its own. It has no `/` list: nothing inside a session suggests starting another.
          <Composer
            key={`skill-composer-${skillSeat.sessionId}`}
            agentName={skillSeat.skill}
            fieldRef={fieldRef}
            focusOnMount={composerFocus?.id === skillKey(skillSeat.sessionId)}
            onSend={(text) => conversation.sendToSkill(skillSeat.sessionId, text)}
          />
        )}
        newComposer={(fieldRef) => (
          // The New session chat's field: empty, no placeholder, focused, given the `/` list and nothing else.
          <Composer
            key={`new-composer-${newChat.id}`}
            fieldRef={fieldRef}
            slashEntries={snapshot.skills}
            focusOnMount
            initialText={newDraft}
            onTextChange={setNewDraft}
            onSend={sendFirst}
          />
        )}
        composer={(agent, items, fieldRef) => (
          // Keyed apart from the chat header, which carries the same agent id in the same list.
          <Composer
            key={`composer-${agent.id}`}
            agentName={agent.name}
            head={
              // The persona's skills, once it has a live session to run them in. The
              // row sends a code and nothing else; it is held while a turn is in flight.
              conversation.sessionOf(agent.id) === undefined ? undefined : (
                <SkillRow
                  name={agent.name}
                  items={items}
                  disabled={!conversation.canAnswer(agent.id)}
                  onRun={(code) => conversation.runSkill(agent.id, code)}
                />
              )
            }
            fieldRef={fieldRef}
            slashEntries={snapshot.skills}
            focusOnMount={composerFocus?.id === agent.id}
            refocus={composerFocus?.id === agent.id ? composerFocus.n : 0}
            onSend={(text) => {
              const target = handoffTarget(text, snapshot.agents, agent.id)
              if (target === null) {
                conversation.send(agent.id, text)
                return
              }
              // Turning to the persona first: its seat opens (or is found live) and nothing is written
              // to the thread (Story 7.4), and only then does any text after the name go to it as a turn.
              setCurrentId(target.agent.id)
              setComposerFocus({ id: target.agent.id, n: 0 })
              const handedOff = conversation.activate(target.agent.id)
              if (target.text !== '') {
                // The typed `@name` rides beside the text for display; the persona receives the text alone (AD-25).
                void handedOff.then(() => conversation.send(target.agent.id, target.text, target.mention))
              }
            }}
          />
        )}
      >
        {installFailure !== null && <ErrorLine error={installFailure} />}
        {snapshot.errors.map((error, index) => (
          <ErrorLine key={`${error.code}-${index}`} error={error} />
        ))}
        {conversation.failure !== null && <ErrorLine error={conversation.failure} />}
        {mode === 'new' && newChat.lines.map((line) => <Sysline key={line.id} text={line.text} />)}
        {mode === 'skill' && seat !== undefined && (
          <Turns
            entries={conversation.entries}
            onCancel={conversation.cancel}
            prose={conversation.prose}
            collapse={collapse}
            onStop={conversation.stopRun}
            skillView={{ sessionId: seat.sessionId, name: seat.skill, inFlight: conversation.skillInFlight(seat.sessionId) }}
          />
        )}
        {mode === 'persona' && (
          <Turns entries={conversation.entries} onCancel={conversation.cancel} canAnswer={conversation.canAnswer} onChoose={answer} prose={conversation.prose} pinnedRunId={pinnedEntry?.id} collapse={collapse} onStop={conversation.stopRun} inFlight={inFlight} personaView={viewed?.id} />
        )}
      </Shell>
      <LiveRegion key="live-region" announcer={announcer} />
    </LayoutContext.Provider>
  )
}
