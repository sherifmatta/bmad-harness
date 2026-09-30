import { rovingKey } from '../a11y/roving-tabindex'

/**
 * A rail row opens its document on `Enter` only (EXPERIENCE.md → *Keyboard
 * reach*), where a persona tile takes `Enter` and `Space` alike. Space is still
 * the native click of a button, and is accepted as such; it is simply not a key
 * this list claims.
 */
const ACTIVATE_ON = ['Enter'] as const

/**
 * Where a key press moves focus among `count` rows in visual order, or `null`
 * when it moves nothing.
 *
 * Travel — vertical, clamped at both ends — is `rovingKey`'s and no key is
 * named here. Everything that is not a move comes back `null`: `Enter` stays
 * the browser's native click on the focused button, and `Tab` and the off-axis
 * keys stay the browser's too.
 */
export function rowMove(key: string, index: number, count: number): number | null {
  const intent = rovingKey(key, {
    index,
    count,
    orientation: 'vertical',
    activateOn: ACTIVATE_ON
  })
  return intent.kind === 'move' ? intent.index : null
}

/**
 * The one row that holds `tabindex="0"`: the one last moved to or opened, else
 * the first in visual order. A moved-to path the list no longer holds falls
 * through to the first, so a change of rows can never leave the list with no
 * tab stop.
 */
export function tabStopPath(order: readonly string[], movedToPath: string | null): string | null {
  if (movedToPath !== null && order.includes(movedToPath)) {
    return movedToPath
  }
  return order[0] ?? null
}
