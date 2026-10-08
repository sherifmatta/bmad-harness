import type { JSX } from 'react'

import './panel-splitter.css'
import type { SplitterProps } from './use-panel-width'

/** What each splitter says it resizes: the harness's own words. */
const LABEL = { rail: 'rail width', room: 'room panel width' } as const

/**
 * A side panel's splitter (Story 5.5): a `separator` on the panel's inner edge,
 * one tab stop, exposing its value, minimum and maximum. It draws nothing at
 * rest (the panel's own border is the line); hover, drag and keyboard focus are
 * `panel-splitter.css`'s. It is a net-zero-width item in the row, so it takes no
 * room from either column. Whether it shows at all (not at ≤1000px, nor where
 * its panel is hidden) is the shell's two breakpoints.
 */
export function PanelSplitter({ splitter }: { splitter: SplitterProps }): JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={LABEL[splitter.panel]}
      aria-valuemin={splitter.min}
      aria-valuemax={splitter.max}
      aria-valuenow={splitter.now}
      tabIndex={0}
      className={`panel-splitter panel-splitter--${splitter.panel}${splitter.dragging ? ' is-dragging' : ''}`}
      onMouseDown={splitter.onMouseDown}
      onKeyDown={splitter.onKeyDown}
      onDoubleClick={splitter.onDoubleClick}
    />
  )
}
