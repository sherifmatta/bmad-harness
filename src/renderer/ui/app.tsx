import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { JSX } from 'react'

import { Announcer } from './a11y/announcer'
import { LiveRegion } from './a11y/live-region'
import { Composer } from './chat/composer'
import { handoffTarget } from './chat/handoff-target'
import { Turns } from './chat/transcript'
import { useConversation } from './chat/use-conversation'
import { ErrorLine } from './install/error-line'
import { Preflight } from './install/preflight'
import { announceable, newAnnouncements, roomState } from './install/install-state'
import { useInstall } from './install/use-install'
import { useRail } from './outputs/use-rail'
import { Shell } from './shell/shell'
import { currentAgent, displayOrder, groupAgents } from './team/tile-groups'
import type { SyslineRecord } from '../../shared/conversation'
import type { AgentView } from '../../shared/install'

/** No roster yet: the conversation is mounted before the install has answered. */
const NO_AGENTS: readonly AgentView[] = []

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
 */
export function App(): JSX.Element | null {
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const { snapshot, failure: installFailure } = useInstall()
  const { snapshot: rail, failure: railFailure } = useRail()
  const [announcer] = useState(() => new Announcer())
  const [currentId, setCurrentId] = useState<string | null>(null)
  // The persona whose composer takes focus when it appears, or when `n` moves: after an
  // `@` handoff, and after the user answers a decision with an option (`n` counts those).
  const [composerFocus, setComposerFocus] = useState<{ id: string; n: number } | null>(null)
  // A handoff is announced once, with the line the transcript shows.
  const announceHandoff = useCallback(
    (record: SyslineRecord) => announcer.announce(record.text, performance.now()),
    [announcer]
  )
  const conversation = useConversation(snapshot?.agents ?? NO_AGENTS, announceHandoff)
  const announced = useRef<ReadonlySet<string>>(new Set())

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
  return (
    <>
      <Shell
        key="shell"
        projectPath={projectPath}
        snapshot={snapshot}
        states={states}
        since={since}
        rail={rail}
        railFailure={railFailure}
        currentId={currentId}
        onCurrentChange={setCurrentId}
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
        composer={(agent) => (
          // Keyed apart from the chat header, which carries the same agent id in the same list.
          <Composer
            key={`composer-${agent.id}`}
            agentName={agent.name}
            focusOnMount={composerFocus?.id === agent.id}
            refocus={composerFocus?.id === agent.id ? composerFocus.n : 0}
            onSend={(text) => {
              const target = handoffTarget(text, snapshot.agents, agent.id)
              if (target === null) {
                conversation.send(agent.id, text)
                return
              }
              // The handoff first: the session opens and the sysline lands, and only
              // then does any text after the name go to the new persona as a turn.
              setCurrentId(target.agent.id)
              setComposerFocus({ id: target.agent.id, n: 0 })
              const handedOff = conversation.activate(target.agent.id)
              if (target.text !== '') {
                void handedOff.then(() => conversation.send(target.agent.id, target.text))
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
        <Turns entries={conversation.entries} onCancel={conversation.cancel} canAnswer={conversation.canAnswer} onChoose={answer} />
      </Shell>
      <LiveRegion key="live-region" announcer={announcer} />
    </>
  )
}
