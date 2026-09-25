import { useEffect, useState } from 'react'
import type { JSX } from 'react'

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
  return <p>{projectPath}</p>
}
