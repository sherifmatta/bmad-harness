import { Fragment, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'

import uxMemlog from '../../../_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/.memlog.md?raw'
import { Announcer } from './a11y/announcer'
import { LiveRegion } from './a11y/live-region'
import { RunNoteFeed } from './feed/run-note-feed'
import { parseMemlog } from './feed/memlog'
import { artParamsFor } from './persona/art-params'
import { ErrorLine } from './install/error-line'
import { Preflight } from './install/preflight'
import { announceable, newAnnouncements, roomState } from './install/install-state'
import { useInstall } from './install/use-install'
import { Initials } from './persona/initials'
import { portrait } from './persona/portrait'
import type { PortraitSize } from './persona/portrait'
import { Shell } from './shell/shell'
import type { HarnessError, InstallSnapshot } from '../../shared/install'

/**
 * Story 1.5 scaffolding, mounted in the shell's thread (Story 1.9).
 *
 * The story's whole purpose is a judgement — does the register split alone
 * keep reasoning distinct from prose, or does the feed read as a changelog? —
 * and an unmounted component cannot be judged. So the feed is mounted here,
 * over this repository's own UX memlog, read into the bundle at build time.
 *
 * It is a preview, not a surface: there is no document card, no scrolling
 * body, no card padding. Those are Epic 3's, and this story ships only the
 * rows the card will contain. Parsed once at module scope because the text is
 * a build-time constant and re-parsing it per render would say otherwise.
 */
const PREVIEW_NOTES = parseMemlog(uxMemlog)

/**
 * Story 1.7 scaffolding, mounted in the shell's thread (Story 1.9) until the
 * tiles arrive in Story 1.10.
 *
 * Story 1.6's acceptance is a human judgement — do these faces read as
 * plausible colleagues who could sit in a staff directory without comment, or
 * as a cartoon? — and FR75 is the one requirement in the epic that no
 * assertion can stand in for. A generator that is never mounted cannot be
 * judged, so everything the judgement needs is on screen: the project's own
 * team at all four render sizes, a derived grid of twelve agent ids, and a
 * stacked initials row.
 *
 * The team is read from the project's own install, through `useInstall`, so
 * this is also where a human confirms that the colleagues on screen are this
 * project's. Each is listed with its menu as plain lines beneath it, and every
 * resolver error is a line of its own.
 *
 * It is a preview, not a surface. There is no persona tile, no status dot, no
 * cast card and no chat header — those are Stories 1.9 and 1.10, and this
 * block carries no layout of its own so that none of it can be mistaken for
 * one. The twelve derived ids are the mockup's own grid, so the comparison the
 * judgement rests on is against the same population.
 */
/** The closed set, all of it — the judgement is about every size, not one. */
const PREVIEW_SIZES: PortraitSize[] = [32, 36, 38, 44]

/** `mockups/portrait.html:373` — the twelve ids the derived grid is drawn for. */
const PREVIEW_DERIVED = [
  'bmad-agent-qa',
  'bmad-agent-scrum-master',
  'bmad-agent-po',
  'bmad-agent-devops',
  'bmad-agent-tech-writer',
  'bmad-agent-security',
  'bmad-agent-data-eng',
  'bmad-agent-researcher',
  'bmad-agent-game-designer',
  'bmad-agent-narrative',
  'bmad-agent-level-designer',
  'bmad-agent-sound'
]

/** The mockup's own label derivation, so the grid reads as the same grid. */
function derivedName(agentId: string): string {
  return agentId
    .replace('bmad-agent-', '')
    .split('-')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * The renderer's root: it resolves the project this window was opened for, gates
 * the room on the install (Story 1.8), and mounts the shell around the preview
 * scaffolding when the room opens (Story 1.9). It owns the window's one
 * announcer and mounts the one live region on every screen that renders
 * anything. A literal colour, dimension or font stack here would be a defect.
 */
export function App(): JSX.Element | null {
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const { snapshot, failure: installFailure } = useInstall()
  const [announcer] = useState(() => new Announcer())
  const announced = useRef<ReadonlySet<string>>(new Set())

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
      <Shell key="shell" projectPath={projectPath} snapshot={snapshot}>
        <Preview snapshot={snapshot} installFailure={installFailure} />
      </Shell>
      <LiveRegion key="live-region" announcer={announcer} />
    </>
  )
}

/**
 * The scaffolding that lives in the thread until the tiles (Story 1.10) and the
 * document card (Epic 3) replace it. Content unchanged from Stories 1.5–1.7; the
 * project path it once opened with is the topbar's now.
 */
function Preview({
  snapshot,
  installFailure
}: {
  snapshot: InstallSnapshot | null
  installFailure: HarnessError | null
}): JSX.Element {
  return (
    <>
      {installFailure !== null && <ErrorLine error={installFailure} />}
      {snapshot?.errors.map((error, index) => (
        <ErrorLine key={`${error.code}-${index}`} error={error} />
      ))}
      {snapshot?.agents.map((persona) => (
        <Fragment key={persona.id}>
          <p>
            {PREVIEW_SIZES.map((size) => (
              <Fragment key={size}>
                {portrait(artParamsFor(persona.id), size, 'idle', persona)}
              </Fragment>
            ))}
            {persona.name} · {persona.title}
          </p>
          {(snapshot.menus[persona.id] ?? []).map((entry) => (
            <p key={entry.code}>
              {entry.code} · {entry.description}
            </p>
          ))}
        </Fragment>
      ))}
      <p>
        {PREVIEW_DERIVED.map((agentId) => (
          <Fragment key={agentId}>
            {portrait(artParamsFor(agentId), 44, 'idle', {
              name: derivedName(agentId),
              title: agentId
            })}
          </Fragment>
        ))}
      </p>
      <p>
        {snapshot?.agents.map((persona) => (
          <Initials
            key={persona.id}
            name={persona.name}
            title={persona.title}
            size={20}
            stacked
          />
        ))}
      </p>
      <p>
        <Initials name="Preview User" title="you" size={32} />
      </p>
      <RunNoteFeed notes={PREVIEW_NOTES} />
    </>
  )
}
