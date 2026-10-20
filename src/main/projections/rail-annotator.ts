import type { RunCardSnapshot } from '../../shared/conversation'
import type { ContractEvent } from '../../shared/events'
import type { AgentId } from '../../shared/ids'
import type { RailAnnotation } from '../../shared/rail'
import { EMPTY_ANNOTATIONS, annotationsOf, foldAnnotations, foldWithoutAgent } from '../fold/rail-annotations'

/**
 * The producer behind the rail's annotation slot: what the stream says of a
 * window's rows, handed to the rail projection through its one stream-side seam
 * (`RailProjection.annotate`) and never any other way.
 *
 * It folds a window's run events (`fold/rail-annotations`) and keeps what it
 * wants said for every path a run in flight holds text for. The text of a
 * `Write` streams before the file exists, and the watcher makes a row only once
 * it has seen the file, so `annotate` of a path with no row changes nothing and
 * the annotation is told again whenever the watcher observes the path
 * (`observed`): a row made, remade after a removal or rewritten finds it there.
 * Nothing here creates, removes or settles a row, and the disk state is not its
 * to know.
 *
 * It tells the target only the difference from what it last told: a path whose
 * annotation moved, and `null` for one no longer held (its run ended). It tells
 * nothing while no target is bound; `bind` tells everything held.
 */

/** The one thing the producer needs of the rail projection. */
export type AnnotationTarget = {
  annotate(path: string, annotation: RailAnnotation | null): void
  /** A room session wrote `path` (Story 4.1). */
  markRoom(path: string): void
  /** A persona wrote `path`: it is no longer the room's. */
  unmarkRoom(path: string): void
  /** The conversation ended: no file is the room's any more. */
  clearRoom(): void
}

export type RailAnnotator = {
  /** Fold one event, with the card of the run it belongs to (if any) as it stands after the event. */
  apply(event: ContractEvent, card?: RunCardSnapshot): void
  /** The rail projection to tell, from now on: everything held is told at once. */
  bind(target: AnnotationTarget): void
  /** The watcher observed `path`: say its held annotation again. */
  observed(path: string): void
  /** A room session wrote these project-relative files: the rail's rows for them are the room's. */
  roomWrote(paths: readonly string[]): void
  /** A persona session wrote these files: any of them the room had is the persona's now. */
  personaWrote(paths: readonly string[]): void
  /** The conversation ended: every room mark goes. */
  roomCleared(): void
  /** A persona's thread was deleted (Story 8.5): the runs it held go, and the target is told `null` for the paths they held. */
  forgetAgent(agentId: AgentId): void
}

/** Whether two annotations name the same owners: both none, or the same ids in the same order (an empty list is not none). */
function sameOwners(a: RailAnnotation['owners'], b: RailAnnotation['owners']): boolean {
  if (a === undefined || b === undefined) return a === b
  return a.length === b.length && a.every((owner, at) => owner.agentId === b[at]?.agentId)
}

function same(a: RailAnnotation | undefined, b: RailAnnotation): boolean {
  return a !== undefined && a.text === b.text && a.owner?.agentId === b.owner?.agentId && sameOwners(a.owners, b.owners)
}

export function createRailAnnotator(): RailAnnotator {
  let table = EMPTY_ANNOTATIONS
  let target: AnnotationTarget | undefined
  /** What the target was last told, by path. */
  let told = new Map<string, RailAnnotation>()
  /** The files a room session wrote: told to the target once each, and again on `bind`. */
  const roomPaths = new Set<string>()

  /** Tell the target what moved since it was last told. */
  function tell(): void {
    if (target === undefined) return
    const held = annotationsOf(table)
    for (const [path, annotation] of held) {
      if (!same(told.get(path), annotation)) target.annotate(path, annotation)
    }
    for (const path of told.keys()) {
      if (!held.has(path)) target.annotate(path, null)
    }
    told = held
  }

  return {
    apply(event, card) {
      const next = foldAnnotations(table, event, card)
      if (next === table) return
      table = next
      tell()
    },

    bind(next) {
      target = next
      told = new Map()
      for (const path of roomPaths) next.markRoom(path)
      tell()
    },

    observed(path) {
      const annotation = annotationsOf(table).get(path)
      if (annotation !== undefined) target?.annotate(path, annotation)
    },

    personaWrote(paths) {
      for (const path of paths) {
        if (roomPaths.delete(path)) target?.unmarkRoom(path)
      }
    },

    forgetAgent(agentId) {
      const next = foldWithoutAgent(table, agentId)
      if (next === table) return
      table = next
      tell()
    },

    roomCleared() {
      if (roomPaths.size === 0) return
      roomPaths.clear()
      target?.clearRoom()
    },

    roomWrote(paths) {
      for (const path of paths) {
        if (roomPaths.has(path)) continue
        roomPaths.add(path)
        target?.markRoom(path)
      }
    }
  }
}
