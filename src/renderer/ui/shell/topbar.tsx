import type { JSX } from 'react'

import { ViewSwitch } from './view-switch'
import type { ViewId } from './view'

/** `bmad · 5 agents`, `bmad · 1 agent` — the count, and nothing else claimed. */
function installChipText(agentCount: number): string {
  return `bmad · ${agentCount} ${agentCount === 1 ? 'agent' : 'agents'}`
}

/**
 * The topbar (FR13, UX-DR28): brand, separator, the project path, the install
 * chip, the branch chip, a spacer and the view switch.
 *
 * Its only tab stops are the switch's two buttons. There is no Help control,
 * no version string, and no tooltip carrying a fact the text does not. The
 * branch is project content and is rendered as text; when there is no answer
 * the chip is not rendered at all, so its absence is never a claim.
 */
export function Topbar({
  projectPath,
  agentCount,
  branch,
  view,
  onView
}: {
  projectPath: string
  agentCount: number
  branch: string | null
  view: ViewId
  onView: (next: ViewId) => void
}): JSX.Element {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">BMad Harness</span>
      </div>
      <div className="crumbs">
        <span className="crumbs-sep" aria-hidden="true">
          │
        </span>
        <span className="crumbs-path">{projectPath}</span>
        <span className="chip">{installChipText(agentCount)}</span>
        {branch !== null && <span className="chip">{branch}</span>}
      </div>
      <div className="spacer" />
      <ViewSwitch view={view} onChange={onView} />
    </header>
  )
}
