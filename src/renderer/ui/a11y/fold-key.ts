/**
 * What a horizontal arrow does on a folder heading in the Outputs half (Story 5.5):
 * `←` folds the directory and `→` unfolds it. The list's own travel is vertical and
 * is `rovingKey`'s; these are its off-axis keys, which a heading claims. Arrows are
 * named here and nowhere else under `src/renderer/ui/`, so the sweep that keeps
 * every list one behaviour stays whole.
 *
 * Pure: it decides and returns; the heading does the folding and keeps focus.
 */
export function foldKey(key: string): 'fold' | 'unfold' | null {
  switch (key) {
    case 'ArrowLeft':
      return 'fold'
    case 'ArrowRight':
      return 'unfold'
    default:
      return null
  }
}
