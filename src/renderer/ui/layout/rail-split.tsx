import type { JSX } from 'react'

import './rail-split.css'
import type { RailSplitProps } from './use-rail-split'

/**
 * The rail split (Story 9.3, UX-DR59): the side splitter turned on its side, between
 * the Changes half and the Outputs half, on the Outputs head's own top border. A
 * `separator` with `aria-orientation="horizontal"`, one tab stop, exposing the
 * Changes half's share as whole percentages. It draws nothing at rest (the head's
 * border is the line); hover, drag and keyboard focus are `rail-split.css`'s. It is
 * a net-zero-height item in the rail, so it takes no room from either half, and it
 * is not drawn at ≤1000px, where the halves stack (the shell's breakpoint).
 */
export function RailSplit({ split }: { split: RailSplitProps }): JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="rail split"
      aria-valuemin={split.min}
      aria-valuemax={split.max}
      aria-valuenow={split.now}
      tabIndex={0}
      className={`rail-split${split.dragging ? ' is-dragging' : ''}`}
      onMouseDown={split.onMouseDown}
      onKeyDown={split.onKeyDown}
      onDoubleClick={split.onDoubleClick}
    />
  )
}
