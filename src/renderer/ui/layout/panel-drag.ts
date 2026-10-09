import type { KeyboardEvent, MouseEvent } from 'react'

import { effectiveWidth, growsRight, keyedWidth } from '../../../shared/layout'
import type { PanelId } from '../../../shared/layout'

/** The class on `body` while a splitter is dragged: the cursor and text selection are the stylesheet's. */
export const RESIZING_CLASS = 'is-resizing'

/** What the controller needs from the panel it drives, as of the last render. */
export type PanelState = {
  /** The width the user chose, or `null` for the default. */
  chosen: number | null
  /** The width of the container holding both columns; `null` while unknown. */
  available: number | null
}

/** What the controller does to the panel. */
export type PanelHost = {
  /** Show a width (or the default for `null`) without keeping it: the drag's own, and a cancelled drag's return. */
  show(width: number | null): void
  /** Show a width (or the default for `null`) and keep it. */
  keep(width: number | null): void
  /** Show that a drag has begun or ended. */
  dragging(on: boolean): void
}

export type PanelDrag = {
  /** Tell the controller how the panel stands, after each render. */
  sync(state: PanelState): void
  onMouseDown(event: MouseEvent<HTMLElement>): void
  onKeyDown(event: KeyboardEvent<HTMLElement>): void
  onDoubleClick(): void
  /** Give the body back its cursor and selection and drop the listeners: the panel is going. */
  dispose(): void
}

/**
 * One splitter's drag and keys (Story 5.5), apart from React so that the panel's
 * state stays state and this holds only what a gesture in flight must: where it
 * began and how to end it.
 *
 * A drag follows the pointer: the width at each move is the width it started at
 * plus how far the pointer has gone toward the panel's inner side (left for the
 * panels on the window's right, right for the sidebar; `growsRight`), held at
 * the limits, with no easing, snapping or transition. It ends on release
 * (the width reached is kept) or on `Escape`, the window losing focus or
 * `dispose` (the width it started at is back, nothing is kept); in every case
 * `body` is given back its cursor and its text selection.
 *
 * The keys, and a double-click, are `keyedWidth`'s.
 */
export function createPanelDrag(panel: PanelId, host: PanelHost): PanelDrag {
  let state: PanelState = { chosen: null, available: null }
  let end: (() => void) | null = null

  function onMouseDown(event: MouseEvent<HTMLElement>): void {
    // The primary button only: a ctrl-click is the context menu on macOS and may never see a mouseup.
    if (event.button !== 0 || event.ctrlKey || end !== null) {
      return
    }
    // No text selection starts, and the splitter takes focus by script so a key can follow the drag.
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    const startX = event.clientX
    const startChosen = state.chosen
    const startWidth = effectiveWidth(panel, startChosen, state.available)
    // What the pointer last reached, held here because a render may not have caught up with it.
    let reached = startWidth

    const finish = (): void => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', release)
      document.removeEventListener('keydown', cancelKey, true)
      window.removeEventListener('blur', cancel)
      document.body.classList.remove(RESIZING_CLASS)
      end = null
      host.dragging(false)
    }
    const move = (moved: globalThis.MouseEvent): void => {
      const travelled = growsRight(panel) ? moved.clientX - startX : startX - moved.clientX
      reached = effectiveWidth(panel, startWidth + travelled, state.available)
      host.show(reached)
    }
    const release = (): void => {
      finish()
      if (reached === startWidth) {
        // Pressed and let go where it was, or dragged back to it: nothing was chosen.
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
    document.body.classList.add(RESIZING_CLASS)
    host.dragging(true)
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', release)
    document.addEventListener('keydown', cancelKey, true)
    window.addEventListener('blur', cancel)
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    // A chord is the OS's or the app's, never the splitter's; `Shift` alone is the larger step.
    if (event.altKey || event.ctrlKey || event.metaKey) {
      return
    }
    // A drag in flight owns the width: a step now would be overwritten by its release or cancel.
    if (end !== null) {
      return
    }
    const current = effectiveWidth(panel, state.chosen, state.available)
    const next = keyedWidth(panel, current, event.key, event.shiftKey, state.available)
    if (next === undefined) {
      return
    }
    // Consumed, so the page does not scroll, even where the key changes nothing.
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
