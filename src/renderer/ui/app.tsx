import { Fragment, useEffect, useState } from 'react'
import type { JSX } from 'react'

import uxMemlog from '../../../_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/.memlog.md?raw'
import { RunNoteFeed } from './feed/run-note-feed'
import { parseMemlog } from './feed/memlog'
import { artParamsFor } from './persona/art-params'
import { ErrorLine } from './install/error-line'
import { useInstall } from './install/use-install'
import { Initials } from './persona/initials'
import { portrait } from './persona/portrait'
import type { PortraitSize } from './persona/portrait'

/**
 * Story 1.5 scaffolding, replaced by the real shell in Story 1.9.
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
 * Story 1.7 scaffolding, replaced by the real shell in Story 1.9 and the tiles
 * in Story 1.10.
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
 * The placeholder renderer: it names the project this window was opened for and
 * nothing else. Unstyled by design — the visual contract is Story 1.3, and a
 * literal colour, dimension or font stack here would be a defect.
 */
export function App(): JSX.Element | null {
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const { snapshot, failure: installFailure } = useInstall()

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
  return (
    <>
      <p>{projectPath}</p>
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
