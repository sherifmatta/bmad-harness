import { useEffect, useState } from 'react'
import type { JSX } from 'react'

import uxMemlog from '../../../_bmad/planning-artifacts/ux-designs/ux-bmad-harness-2026-09-24/.memlog.md?raw'
import { RunNoteFeed } from './feed/run-note-feed'
import { parseMemlog } from './feed/memlog'

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
 * The placeholder renderer: it names the project this window was opened for and
 * nothing else. Unstyled by design — the visual contract is Story 1.3, and a
 * literal colour, dimension or font stack here would be a defect.
 */
export function App(): JSX.Element | null {
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

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
      <RunNoteFeed notes={PREVIEW_NOTES} />
    </>
  )
}
