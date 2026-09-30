import { rovingKey } from '../a11y/roving-tabindex'

/** The keys that activate a tile: `Enter` and `Space`, both native button clicks. */
const ACTIVATE_ON = ['Enter', ' '] as const

/**
 * Where a key press moves focus among `count` tiles, or `null` when it moves
 * nothing.
 *
 * Arrow travel — vertical, clamped at both ends — is `rovingKey`'s and no key
 * is named here. Everything that is not a move comes back `null`: `Enter` and
 * `Space` stay the browser's native click on the focused button, and `Tab` and
 * the off-axis arrows stay the browser's too.
 */
export function tileMove(key: string, index: number, count: number): number | null {
  const intent = rovingKey(key, {
    index,
    count,
    orientation: 'vertical',
    activateOn: ACTIVATE_ON
  })
  return intent.kind === 'move' ? intent.index : null
}

/**
 * The one tile that holds `tabindex="0"`: the one last moved to or activated,
 * else the current one, else the topmost. A moved-to id the list no longer
 * holds falls through, so a roster change can never leave the list with no tab
 * stop.
 */
export function tabStopId(
  order: readonly string[],
  movedToId: string | null,
  currentId: string | null
): string | null {
  if (movedToId !== null && order.includes(movedToId)) {
    return movedToId
  }
  if (currentId !== null && order.includes(currentId)) {
    return currentId
  }
  return order[0] ?? null
}
