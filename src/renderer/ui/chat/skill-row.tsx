import type { JSX } from 'react'

import './skill-row.css'
import type { MenuEntryView } from '../../../shared/install'

/**
 * The skill row — "<Persona> can …" above the composer, one button per entry
 * of the current persona's menu, each its description behind a leading code
 * chip (DESIGN.md `components.skill-button`, EXPERIENCE.md's skill buttons).
 *
 * A button knows nothing about what it runs: activating one hands its `code`
 * to `onRun`, which sends `menu.dispatch(sessionId, code)` and nothing else.
 * Main alone decides whether the code is a skill or a prompt; neither word, nor
 * any skill name, is here. No tooltip and no preview.
 *
 * The buttons are disabled while the persona's session has a turn in flight,
 * and only then; the composer below is never disabled. A persona with no
 * entries has no row.
 */
export function SkillRow({
  name,
  items,
  disabled,
  onRun
}: {
  name: string
  items: readonly MenuEntryView[]
  /** A turn is in flight in the persona's session. */
  disabled: boolean
  onRun: (code: string) => void
}): JSX.Element | null {
  if (items.length === 0) {
    return null
  }
  return (
    <div className="skill-row">
      <span className="skill-row-label">{`${name} can`}</span>
      {items.map((item) => (
        <button key={item.code} type="button" className="skill-button" disabled={disabled} onClick={() => onRun(item.code)}>
          <span className="skill-code">{item.code}</span>
          {item.description}
        </button>
      ))}
    </div>
  )
}
