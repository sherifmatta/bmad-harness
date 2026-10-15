import { useLayoutEffect, useRef } from 'react'
import type { JSX } from 'react'

import type { SlashEntry } from './slash-query'
import './skill-list.css'

/**
 * The list a leading `/` opens above the composer (Story 7.3, FR131). A
 * `listbox` of `option` rows, each a name in mono and the words that say what
 * it is for. One row is current and is drawn with the shared focus ring; focus
 * itself stays in the textarea, which names the current row through
 * `aria-activedescendant`.
 *
 * It is silent: no live-region text, no count, heading, icon or accent fill,
 * and no control inside it. Choosing a row is the composer's, by key.
 */
export function SkillList({
  id,
  rowId,
  entries,
  current
}: {
  id: string
  /** The id of row `index`, which the textarea points at. */
  rowId: (index: number) => string
  entries: readonly SlashEntry[]
  current: number
}): JSX.Element {
  const held = useRef<HTMLDivElement>(null)

  // The current row stays in view as the arrows move it past the edge.
  useLayoutEffect(() => {
    held.current?.scrollIntoView?.({ block: 'nearest' })
  }, [current])

  return (
    <div className="skill-list" role="listbox" id={id} aria-label="Skills">
      {entries.map((entry, index) => (
        <div
          key={`${entry.name}-${index}`}
          ref={index === current ? held : undefined}
          id={rowId(index)}
          role="option"
          aria-selected={index === current}
          className={index === current ? 'skill-list-row skill-list-current' : 'skill-list-row'}
        >
          <span className="skill-list-name">{entry.name}</span>
          <span className="skill-list-description">{entry.description}</span>
        </div>
      ))}
    </div>
  )
}
