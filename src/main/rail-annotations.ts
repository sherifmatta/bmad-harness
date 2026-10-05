import { createRailAnnotator } from './projections/rail-annotator'
import type { RailAnnotator } from './projections/rail-annotator'

const annotators = new WeakMap<object, RailAnnotator>()

/**
 * The rail annotator of one window, made on first ask and the same one for every
 * bridge that asks after, so the session bridge's run events and the rail
 * bridge's rows meet in one producer: the session side folds what the runs say,
 * and the rail side hands it the projection to tell and the paths the watcher
 * observes.
 *
 * Keyed by the window's own object, never its id, as the persona projection's
 * holder is (`persona-states.ts`): nothing outlives the window, and an id that
 * comes back after destruction finds a fresh one.
 */
export function railAnnotatorFor(sender: object): RailAnnotator {
  const existing = annotators.get(sender)
  if (existing !== undefined) {
    return existing
  }
  const annotator = createRailAnnotator()
  annotators.set(sender, annotator)
  return annotator
}
