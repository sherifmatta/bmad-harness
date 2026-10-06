import type { RunCardSnapshot } from '../../shared/conversation'
import type { ContractEvent } from '../../shared/events'
import type { AgentId } from '../../shared/ids'
import type { RailAnnotation } from '../../shared/rail'
import { STOPPED, commonPrefix, progressLabel, sectionProgress } from '../../shared/section-progress'
import type { SectionPlace } from '../../shared/section-progress'

/**
 * What the stream says about the rail's rows: who is writing which file, and
 * where in it. Pure and immutable, a table and an event in, the next table out,
 * with no clock and no I/O.
 *
 * It is the stream's channel alone (FR49, AD-2). Nothing here says a file exists,
 * is changing or is saved: that is the watcher's, and this table never reaches
 * the rail's disk fields. An annotation is *held* here for a path whether or not
 * the watcher has made a row for it; the producer hands it to a row that exists
 * (`projections/rail-annotator.ts`).
 *
 * - `run:started` adds the run, in start order, with its persona.
 * - `doc:prose` reads the path's text from the run's card (which has folded the
 *   piece already) and says `writing`, with the section the text is at. The
 *   next piece of a path returns it to `writing` from `revising`.
 * - `doc:committed` that is `ok` and carries `text` (an `Edit` that applied)
 *   says `revising`, with the section holding the first changed character. Any
 *   other `ok` commit changes nothing: an `Edit` of a path no `Write` of the
 *   run started carries no text. A rejected commit of the call that set a
 *   path's text (a `Write`) stops the path being shown, and one of any other
 *   call (an `Edit`) changes nothing. What the path held (its text and the
 *   names seen) is kept, as the card's head keeps its own, so a retried `Write`
 *   and an applied `Edit` number the sections as the head does; the path's next
 *   `doc:prose` piece and an applied `Edit` show it again.
 * - `run:finished` drops the run and every annotation of it, and no other run's.
 * - `run:stopped` and `run:failed` keep the run, marked stopped: every path it
 *   was still showing reads the one word `stopped`, with no section, and the
 *   owner it already carried. What each path held is released, a terminal run
 *   costing its path names and nothing more, and a run that was showing nothing
 *   is dropped like a finished one. A piece of prose or a commit that arrives
 *   after a terminal event is ignored (`withPath`), and the stopped run lets a
 *   path go the moment another run writes it.
 *
 * `.memlog.md` never reaches here as prose: the route fold sends it nowhere.
 */

/**
 * The longest section name an annotation carries, in code points: a longer one is
 * cut, so no name crossing the bridge is longer. How much of it the rail draws is
 * the stylesheet's (`--rail-annotation-max`).
 */
export const NAME_MAX = 40

/**
 * What a run holds of one path: its text, the names seen in it, and where it is.
 * `live` is whether the path is shown: a rejected `Write` keeps what was held
 * and stops showing it.
 */
type HeldPath = {
  text: string
  seen: readonly string[]
  revising: boolean
  live: boolean
  section?: SectionPlace
}

type RunHeld = {
  agentId?: AgentId
  paths: ReadonlyMap<string, HeldPath>
  /** The run ended early: its paths read the one terminal word until another run takes them. */
  stopped?: true
}

/** Keyed by run id, in the order the runs started. Never mutated: every function returns a table. */
export type AnnotationTable = ReadonlyMap<string, RunHeld>

export const EMPTY_ANNOTATIONS: AnnotationTable = new Map()

/** What stands for the rest of a section name too long for the tag. */
const ELLIPSIS = '…'

/** A name of at most `NAME_MAX` code points: a longer one is its first `NAME_MAX - 1` and an ellipsis. */
function fitted(name: string): string {
  const points = Array.from(name)
  return points.length <= NAME_MAX ? name : `${points.slice(0, NAME_MAX - 1).join('')}${ELLIPSIS}`
}

function withPath(table: AnnotationTable, runId: string, path: string, held: HeldPath | undefined): AnnotationTable {
  const run = table.get(runId)
  // A run that has ended says nothing more: what came after its terminal event is not its writing.
  if (run === undefined || run.stopped === true) return table
  const paths = new Map(run.paths)
  if (held === undefined) paths.delete(path)
  else paths.set(path, held)
  const next = new Map(table)
  // A run writing a path takes it from any run that ended early still holding it: a file
  // someone is writing now is not a stopped run's any more, and the dead hold is let go.
  if (held?.live === true) {
    for (const [otherId, other] of table) {
      if (otherId === runId || other.stopped !== true || !other.paths.has(path)) continue
      const rest = new Map(other.paths)
      rest.delete(path)
      if (rest.size === 0) next.delete(otherId)
      else next.set(otherId, { ...other, paths: rest })
    }
  }
  return next.set(runId, { ...run, paths })
}

/**
 * Fold one event into the table. `card` is the card of the event's run as the
 * run projection holds it once the event is applied: the text a `Write` has
 * streamed so far is read from it. The table keeps a copy of each path's text
 * only to find where an `Edit` first changed it.
 */
export function foldAnnotations(
  table: AnnotationTable,
  event: ContractEvent,
  card?: RunCardSnapshot
): AnnotationTable {
  switch (event.name) {
    case 'run:started': {
      const { runId, agentId } = event.payload
      if (table.has(runId)) return table
      return new Map(table).set(runId, { ...(agentId === undefined ? {} : { agentId }), paths: new Map() })
    }

    case 'doc:prose': {
      const { runId, path } = event.payload
      const text = card?.documents.find((document) => document.path === path)?.text
      if (text === undefined || !table.has(runId)) return table
      if (text === '') return withPath(table, runId, path, undefined)
      const held = table.get(runId)?.paths.get(path)
      const { seen, section } = sectionProgress(text, held?.seen ?? [])
      return withPath(table, runId, path, { text, seen, revising: false, live: true, ...(section === undefined ? {} : { section }) })
    }

    case 'doc:committed': {
      if (!event.payload.ok) {
        // A rejected `Write` wrote nothing: the text its call set is not one the run is writing, but the card still
        // holds it and the head still counts its names, so it is kept and not shown. A rejected `Edit` leaves the
        // text of the `Write` before it, which is what the annotation still says.
        const { runId, path, callId } = event.payload
        const held = table.get(runId)?.paths.get(path)
        const setBy = card?.documents.find((document) => document.path === path)?.callId
        return held === undefined || !held.live || setBy !== callId ? table : withPath(table, runId, path, { ...held, live: false })
      }
      const { runId, path, text } = event.payload
      if (text === undefined || !table.has(runId)) return table
      if (text === '') return withPath(table, runId, path, undefined)
      const held = table.get(runId)?.paths.get(path)
      // The same offset the head reads: where the `Edit` first changed the document.
      const { seen, section } = sectionProgress(text, held?.seen ?? [], commonPrefix(held?.text ?? '', text))
      return withPath(table, runId, path, { text, seen, revising: true, live: true, ...(section === undefined ? {} : { section }) })
    }

    case 'run:finished': {
      if (!table.has(event.payload.runId)) return table
      const next = new Map(table)
      next.delete(event.payload.runId)
      return next
    }

    case 'run:stopped':
    case 'run:failed': {
      const { runId } = event.payload
      const run = table.get(runId)
      if (run === undefined || run.stopped === true) return table
      // Only the paths it was still showing, each released to the one word: no text, no names, no section.
      const paths = new Map<string, HeldPath>()
      for (const [path, held] of run.paths) {
        if (held.live) paths.set(path, { text: '', seen: [], revising: false, live: true })
      }
      const next = new Map(table)
      if (paths.size === 0) next.delete(runId)
      else next.set(runId, { ...run, paths, stopped: true })
      return next
    }

    default:
      return table
  }
}

/**
 * What the stream says of each path now: one annotation for every path a run
 * holds text for and shows. Where two runs hold one path, the later-started
 * run's shows (naming both is contention's, not this fold's) — except that a
 * run still writing a path always has the last word over one that ended early,
 * so the runs that ended are written first and overwritten.
 */
export function annotationsOf(table: AnnotationTable): Map<string, RailAnnotation> {
  const out = new Map<string, RailAnnotation>()
  const runs = [...table.values()]
  const ordered = [...runs.filter((run) => run.stopped === true), ...runs.filter((run) => run.stopped !== true)]
  for (const { agentId, paths, stopped } of ordered) {
    for (const [path, { revising, section, live }] of paths) {
      if (!live) continue
      const place = section === undefined ? undefined : { n: section.n, name: fitted(section.name) }
      out.set(path, {
        text: stopped === true ? STOPPED : progressLabel(revising, place),
        ...(agentId === undefined ? {} : { owner: { agentId } })
      })
    }
  }
  return out
}
