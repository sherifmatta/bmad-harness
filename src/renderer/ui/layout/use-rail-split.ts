import { useEffect, useLayoutEffect, useState } from 'react'
import type { CSSProperties, KeyboardEvent, MouseEvent } from 'react'

import { clampShare, effectiveShare, keyedShare, readShare, sharePercent, splitLimits } from '../../../shared/layout'
import { useLayoutContext } from './layout-context'
import { RESIZING_CLASS } from './panel-drag'

/** The class on `body`, beside `is-resizing`, while the rail split is dragged: the row-resize cursor is rail-split.css's. */
export const RESIZING_ROWS_CLASS = 'is-resizing-rows'

/** What the split element is given. */
export type RailSplitProps = {
  /** Whole percentages of the rail's height the Changes half may take, and takes now. */
  min: number
  max: number
  now: number
  dragging: boolean
  onMouseDown(event: MouseEvent<HTMLElement>): void
  onKeyDown(event: KeyboardEvent<HTMLElement>): void
  onDoubleClick(): void
}

/** What the controller needs from the split, as of the last render. */
type SplitState = { chosen: number | null; height: number | null }

/** What the controller does to the split. */
type SplitHost = {
  /** Show a share (or half and half for `null`) without keeping it. */
  show(share: number | null): void
  /** Show a share (or half and half for `null`) and keep it. */
  keep(share: number | null): void
  dragging(on: boolean): void
}

/** A share as it is kept: four places are more than a pixel of any rail. */
function tidy(share: number | null): number | null {
  return share === null ? null : readShare(Math.round(share * 10_000) / 10_000)
}

/**
 * The rail split's drag and keys (Story 9.3), apart from React as `panel-drag.ts` is
 * for the side panels, with `clientY` for `clientX`. A drag follows the pointer: the
 * share at each move is the share it started at plus how far the pointer has gone
 * down, as a part of the rail's height, held at the limits, with no easing or snap.
 * It ends on release (the share reached is kept) or on `Escape`, the window losing
 * focus or `dispose` (the share it started at is back, nothing is kept); in every
 * case `body` is given back its cursor and its text selection. The keys and a
 * double-click are `keyedShare`'s.
 */
export function createSplitDrag(host: SplitHost): {
  sync(state: SplitState): void
  onMouseDown(event: MouseEvent<HTMLElement>): void
  onKeyDown(event: KeyboardEvent<HTMLElement>): void
  onDoubleClick(): void
  dispose(): void
} {
  let state: SplitState = { chosen: null, height: null }
  let end: (() => void) | null = null

  function onMouseDown(event: MouseEvent<HTMLElement>): void {
    if (event.button !== 0 || event.ctrlKey || end !== null) {
      return
    }
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    const startY = event.clientY
    const startChosen = state.chosen
    const startShare = effectiveShare(startChosen, state.height)
    let reached = startShare

    const finish = (): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', release)
      document.removeEventListener('keydown', cancelKey, true)
      window.removeEventListener('blur', cancel)
      document.body.classList.remove(RESIZING_CLASS, RESIZING_ROWS_CLASS)
      end = null
      host.dragging(false)
    }
    const move = (moved: globalThis.MouseEvent): void => {
      const height = state.height
      if (height === null || !(height > 0)) {
        return
      }
      reached = clampShare(startShare + (moved.clientY - startY) / height, height)
      host.show(reached)
    }
    const release = (): void => {
      finish()
      if (reached === startShare) {
        host.show(startChosen)
      } else {
        host.keep(reached)
      }
    }
    const cancel = (): void => {
      finish()
      host.show(startChosen)
    }
    const cancelKey = (pressed: globalThis.KeyboardEvent): void => {
      if (pressed.key === 'Escape') {
        pressed.preventDefault()
        cancel()
      }
    }

    end = finish
    document.body.classList.add(RESIZING_CLASS, RESIZING_ROWS_CLASS)
    host.dragging(true)
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', release)
    document.addEventListener('keydown', cancelKey, true)
    window.addEventListener('blur', cancel)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.altKey || event.ctrlKey || event.metaKey || end !== null) {
      return
    }
    const current = effectiveShare(state.chosen, state.height)
    const next = keyedShare(current, event.key, event.shiftKey, state.height)
    if (next === undefined) {
      return
    }
    event.preventDefault()
    if (next === null) {
      host.keep(null)
    } else if (next !== current) {
      host.keep(next)
    }
  }

  return {
    sync(next) {
      state = next
    },
    onMouseDown,
    onKeyDown,
    onDoubleClick: () => host.keep(null),
    dispose: () => end?.()
  }
}

/**
 * The rail split's share (Story 9.3, UX-DR59): the part of the rail's height the
 * Changes half takes, above the Outputs half. The share the user chose is state
 * started from what was stored and kept through `saveRailSplit`; what is drawn is
 * `effectiveShare` of it at the rail's live height, so a short window draws less and
 * writes nothing, and a resize keeps the share. The rail is given through
 * `holdRail`, so it may mount later than the hook does.
 */
export function useRailSplit(): {
  /** Put on the `.rail` element. */
  holdRail(element: HTMLElement | null): void
  /** The Changes half's basis, then the Outputs half's, as `--rail-half-basis`. */
  changesStyle: CSSProperties
  outputsStyle: CSSProperties
  split: RailSplitProps
} {
  const { railSplit, saveRailSplit } = useLayoutContext()
  const [chosen, setChosen] = useState<number | null>(() => readShare(railSplit))
  const [rail, setRail] = useState<HTMLElement | null>(null)
  const [height, setHeight] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const [drag] = useState(() =>
    createSplitDrag({
      show: (share) => setChosen(tidy(share)),
      keep: (share) => {
        const kept = tidy(share)
        setChosen(kept)
        saveRailSplit(kept)
      },
      dragging: setDragging
    })
  )

  useLayoutEffect(() => {
    drag.sync({ chosen, height })
  })

  useEffect(() => {
    if (rail === null) {
      return
    }
    const measure = (): void => {
      const measured = rail.getBoundingClientRect().height
      setHeight(measured > 0 ? measured : null)
    }
    measure()
    if (typeof ResizeObserver !== 'function') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(rail)
    return () => observer.disconnect()
  }, [rail])

  useEffect(() => () => drag.dispose(), [drag])

  const share = effectiveShare(chosen, height)
  const limits = splitLimits(height)
  // A percentage to a hundredth of a percent: finer than any pixel of a rail, and no float noise in the style.
  const percent = (value: number): string => `${Math.round(value * 10_000) / 100}%`

  return {
    holdRail: setRail,
    changesStyle: { '--rail-half-basis': percent(share) } as CSSProperties,
    outputsStyle: { '--rail-half-basis': percent(1 - share) } as CSSProperties,
    split: {
      min: sharePercent(limits.min),
      max: sharePercent(limits.max),
      now: sharePercent(share),
      dragging,
      onMouseDown: drag.onMouseDown,
      onKeyDown: drag.onKeyDown,
      onDoubleClick: drag.onDoubleClick
    }
  }
}
