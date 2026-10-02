import type { JSX } from 'react'

import './sysline.css'

/**
 * The sysline — DESIGN.md's *Sysline*, EXPERIENCE.md's *Voice and Tone*. A line
 * the harness wrote in its own register: centred mono with a rule either side,
 * today the handoff notice.
 *
 * It is never a persona's turn. It takes no agent and renders no portrait, name
 * or time, so nothing about it can read as somebody's words; the text is React
 * text, exactly as main wrote it.
 */
export function Sysline({ text }: { text: string }): JSX.Element {
  return (
    <div className="sysline">
      <span className="sysline-text">{text}</span>
    </div>
  )
}
