import { useEffect, useLayoutEffect, useState } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'

import { effectiveWidth, limitsFor, PANELS, readWidth } from '../../../shared/layout'
import type { PanelId } from '../../../shared/layout'
import { useLayoutContext } from './layout-context'
import { createPanelDrag } from './panel-drag'

export { RESIZING_CLASS } from './panel-drag'

/** What a splitter element is given. */
export type SplitterProps = {
  panel: PanelId
  min: number
  max: number
  now: number
  dragging: boolean
  onMouseDown(event: MouseEvent<HTMLElement>): void
  onKeyDown(event: KeyboardEvent<HTMLElement>): void
  onDoubleClick(): void
}

/** The custom property each panel's width is, which the stylesheets already read. */
const PROPERTY: Record<PanelId, string> = { sidebar: '--sidebar', rail: '--rail', room: '--party-side' }

/**
 * One panel's width (Story 5.5). The width the user chose is state the hook
 * holds, started from what was stored and kept through `saveWidth`; what the
 * panel shows is `effectiveWidth` of it at the width the container has, so a
 * narrowed window shows less and writes nothing, and a widened one shows the
 * chosen width again. The container is the element holding both columns and is
 * given through `holdContainer`, so it may mount later than the hook does.
 * The gestures are `panel-drag.ts`'s.
 *
 * Two panels may share one container: `reserved` is the width the other panel
 * takes out of it, so this panel's room is `container - reserved` and the column
 * between them keeps its minimum whichever panel is dragged.
 */
export function usePanelWidth(
  panel: PanelId,
  reserved = 0
): {
  /** Put on the container holding the panel and its neighbour. */
  holdContainer(element: HTMLElement | null): void
  /** The style that gives the panel its width, only while it differs from the token's default. */
  style: CSSProperties | undefined
  /** The width the user chose, or the default: what a neighbour reserves for this panel, before any holding to the range. */
  base: number
  splitter: SplitterProps
} {
  const { widths, saveWidth } = useLayoutContext()
  const [chosen, setChosen] = useState<number | null>(() => readWidth(widths[panel], panel))
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  // A container that has no width is unknown (no pull-in); one the other panel leaves no room in is never zero
  // or below, which would read as unknown too and lift every limit where the least is what is left.
  const available = containerWidth === null || !(containerWidth > 0) ? null : Math.max(1, containerWidth - reserved)

  const [drag] = useState(() =>
    createPanelDrag(panel, {
      show: setChosen,
      keep: (width) => {
        setChosen(width)
        saveWidth(panel, width)
      },
      dragging: setDragging
    })
  )

  useLayoutEffect(() => {
    drag.sync({ chosen, available })
  })

  useEffect(() => {
    if (container === null) {
      return
    }
    const measure = (): void => setContainerWidth(container.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver !== 'function') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    return () => observer.disconnect()
  }, [container])

  // A panel that goes while it is dragged takes the drag's listeners and the body's marks with it.
  useEffect(() => () => drag.dispose(), [drag])

  const now = effectiveWidth(panel, chosen, available)
  const limits = limitsFor(panel, available)

  return {
    holdContainer: setContainer,
    // Written whenever what is shown is not the token's own width: a chosen one, or a default pulled in.
    style:
      chosen === null && now === PANELS[panel].default
        ? undefined
        : ({ [PROPERTY[panel]]: `${now}px` } as CSSProperties),
    base: chosen ?? PANELS[panel].default,
    splitter: {
      panel,
      min: limits.min,
      max: limits.max,
      now,
      dragging,
      onMouseDown: drag.onMouseDown,
      onKeyDown: drag.onKeyDown,
      onDoubleClick: drag.onDoubleClick
    }
  }
}
