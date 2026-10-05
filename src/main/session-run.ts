import { join, posix } from 'node:path'
import type { ContractEvent } from '../shared/events'
import type { RunId } from '../shared/ids'
import type { ArtifactObservation } from '../shared/rail'
import { pulledSections } from '../shared/section-plan'
import type { TemplatePlan } from '../shared/section-plan'
import type { Sender } from './bridge-kit'
import type { TranscriptRegistry } from './projections/transcript'
import { coalesce, flushProse } from './fold/coalesce'
import type { ProseBuffer } from './fold/coalesce'
import { tailMemlog } from './fold/memlog-tail'
import { MEMLOG, withoutPendingWrites } from './fold/route-frame'
import type { Entry, Service } from './session-registry'

/**
 * A run's life inside a session, for the registry that holds the session: it
 * starts on a dispatch, carries the run's routed events to the window, and
 * ends on the turn's end or the session's.
 *
 * - **Start.** The session is detached (a finished run's `live` ends when the
 *   next turn or run starts), the run is held on the entry and `run:started`
 *   is its first event, carrying the section plan the skill's template gave.
 * - **Events.** Everything the fold routes for the session goes through here.
 *   While a run is active, `doc:prose` is held in the prose buffer and joined
 *   (`fold/coalesce`): what is held is released before any other event, and on
 *   a timer from the injected `schedule`, so the window is told the run's text
 *   in far fewer pieces than the CLI streamed it, in order and whole. Each
 *   event is applied to the window's run cards and persona states, and told.
 * - **Notes.** A `.memlog.md` the watcher saw change is read again, and each
 *   entry past the count main already knew is a `run:note` of the one run in
 *   flight in the window. With none, or with two, the note is nobody's: a
 *   wrong card is worse than a missing note. The initial scan only counts. A
 *   note that is a concern scan naming Adapt-In sections of the skill's
 *   template carries them as `pulled`.
 * - **End.** The buffer is released, the writes still pending are dropped
 *   (none commits), and the terminal event is raised: `run:failed` for a
 *   result the CLI marked `is_error` or a session that ended mid-run,
 *   `run:finished` otherwise, after which the session is attached so the
 *   persona reads `live` once its turn is over.
 */

/**
 * How long main holds prose before telling the window, when nothing else
 * releases it: at most ten pieces a second per run, whatever the CLI's rate. A
 * replay at full rate joins a whole write into a handful of pieces; at the
 * recorded pace of `fast-path-sonnet` (about 22 deltas a second) it joins two
 * or three deltas into each (`tests/run-replay.test.ts`).
 */
export const PROSE_FLUSH_MS = 100

/** A CLI's own word for how a turn ended, when it is the plain word it always is. */
const SUBTYPE = /^[a-z][a-z0-9_]{0,39}$/

/** The run a session has in flight. */
export type ActiveRun = {
  runId: RunId
  code: string
  /** The Adapt-In names the skill's template offers, which a concern-scan note may pull into the plan. */
  menu: readonly string[]
  /** The section names the run's plan holds so far: the template's, then those pulled. */
  plan: readonly string[]
  /** Prose held for the window, not yet told. */
  prose: ProseBuffer
  /** Cancels the timer that will release `prose`, while one is set. */
  cancelFlush: (() => void) | undefined
}

/** What main knows of a window's memlogs: each one's entry count, and the read of it in flight. */
export type MemlogCounts = {
  counts: Map<string, number>
  reading: Map<string, Promise<void>>
}

export function createMemlogCounts(): MemlogCounts {
  return { counts: new Map(), reading: new Map() }
}

/** What the run's life needs of the registry. */
export type RunKit = {
  now: () => number
  schedule: (run: () => void, ms: number) => () => void
  emit: (sender: Sender, event: ContractEvent) => void
  /** What the persona said is kept in the transcript as well as told. */
  recordSaid: (entry: Entry, event: Extract<ContractEvent, { name: 'persona:said' }>) => void
  readText: (absolutePath: string) => Promise<string | undefined>
}

/** The kit, from what the registry holds: what the persona says is kept in the project's transcript. */
export function createRunKit(deps: Omit<RunKit, 'recordSaid'> & { transcripts: TranscriptRegistry }): RunKit {
  const { transcripts, ...rest } = deps
  return {
    ...rest,
    recordSaid: (entry, event) => transcripts.forProject(entry.projectRoot).recordPersonaSaid(event.payload)
  }
}

type Ending = { failed: boolean; subtype: string | undefined } | 'session-ended'

/**
 * Tell the window, and let the cards, the rail's annotations and the persona
 * states hear it, from the one event. The annotations read the event's run card
 * once the card has folded the event, and hear it before the window does.
 */
function tell(kit: RunKit, sender: Sender, service: Service, entry: Entry, events: ContractEvent[]): void {
  for (const event of events) {
    if (event.name === 'persona:said') {
      kit.recordSaid(entry, event)
    } else {
      service.runs.apply(event)
      service.annotations.apply(event, 'runId' in event.payload ? service.runs.card(event.payload.runId) : undefined)
    }
    kit.emit(sender, event)
    service.personas.apply(event)
  }
}

/** Release the prose a run holds, and cancel the timer that would have. */
function flush(kit: RunKit, sender: Sender, service: Service, entry: Entry): void {
  const run = entry.run
  if (run === undefined) return
  run.cancelFlush?.()
  run.cancelFlush = undefined
  const released = flushProse(run.prose)
  run.prose = released.buffer
  tell(kit, sender, service, entry, released.out)
}

/** Carry routed events to the window: prose held and joined while a run is active, all else at once. */
export function deliver(
  kit: RunKit,
  sender: Sender,
  service: Service,
  entry: Entry,
  events: ContractEvent[]
): void {
  for (const event of events) {
    const run = entry.run
    if (run === undefined) {
      tell(kit, sender, service, entry, [event])
      continue
    }
    const step = coalesce(run.prose, event)
    run.prose = step.buffer
    tell(kit, sender, service, entry, step.out)
  }
  const run = entry.run
  if (run !== undefined && run.prose !== undefined && run.cancelFlush === undefined) {
    run.cancelFlush = kit.schedule(() => {
      run.cancelFlush = undefined
      if (entry.run === run) flush(kit, sender, service, entry)
    }, PROSE_FLUSH_MS)
  }
}

/** A dispatch was written: the run begins, and `run:started` is its first event. */
export function startRun(
  kit: RunKit,
  sender: Sender,
  service: Service,
  entry: Entry,
  runId: RunId,
  code: string,
  template?: TemplatePlan
): void {
  service.personas.detach(entry.sessionId)
  const plan = template?.spine ?? []
  entry.run = { runId, code, menu: template?.menu ?? [], plan, prose: undefined, cancelFlush: undefined }
  tell(kit, sender, service, entry, [
    {
      name: 'run:started',
      payload: {
        runId,
        sessionId: entry.sessionId,
        agentId: entry.agentId,
        code,
        ...(plan.length === 0 ? {} : { plan: [...plan] }),
        at: kit.now()
      }
    }
  ])
}

/** The run's turn ended, or its session did: release, drop what never came back, and end it once. */
export function endRun(kit: RunKit, sender: Sender, service: Service, entry: Entry, ending: Ending): void {
  const run = entry.run
  if (run === undefined) return
  flush(kit, sender, service, entry)
  entry.run = undefined
  entry.route = withoutPendingWrites(entry.route)
  const base = { runId: run.runId, sessionId: entry.sessionId, at: kit.now() }
  let event: ContractEvent
  if (ending === 'session-ended') {
    event = {
      name: 'run:failed',
      payload: { ...base, error: { code: 'run/session-ended', message: 'run · the session ended' } }
    }
  } else if (ending.failed) {
    const detail = ending.subtype !== undefined && SUBTYPE.test(ending.subtype) ? { detail: ending.subtype } : {}
    event = { name: 'run:failed', payload: { ...base, error: { code: 'run/failed', message: 'run · the run failed', ...detail } } }
  } else {
    event = { name: 'run:finished', payload: base }
  }
  tell(kit, sender, service, entry, [event])
  if (event.name === 'run:finished') {
    service.personas.attach(entry.sessionId)
  }
}

/** Whether a project-relative path is a run's working notes. */
export function isMemlog(path: string): boolean {
  return posix.basename(path) === MEMLOG
}

/**
 * The watcher saw a file under `_bmad/`: if it is a memlog, read it again and
 * note what was appended. Reads of one file are taken in order. Only a memlog
 * concerns the sessions, so the window's service is asked for (and made, the
 * first time) only then. Resolves once this observation is accounted for;
 * never rejects.
 */
export function observeMemlog(
  kit: RunKit,
  sender: Sender,
  serviceOf: () => Service,
  projectRoot: string,
  observation: ArtifactObservation
): Promise<void> {
  const { path, type } = observation
  if (!isMemlog(path)) return Promise.resolve()
  const service = serviceOf()
  const memlogs = service.memlogs
  const at = kit.now()
  const previous = memlogs.reading.get(path) ?? Promise.resolve()
  const next = previous.then(async () => {
    if (type === 'artifact:removed') {
      memlogs.counts.delete(path)
      return
    }
    const text = await kit.readText(join(projectRoot, ...path.split('/')))
    if (text === undefined) return
    const tail = tailMemlog(memlogs.counts.get(path) ?? 0, text)
    memlogs.counts.set(path, tail.count)
    if (type === 'artifact:found' || tail.entries.length === 0) return
    const running = [...service.bySession.values()].filter((entry) => !entry.closed && entry.run !== undefined)
    const entry = running.length === 1 ? running[0] : undefined
    const run = entry?.run
    if (entry === undefined || run === undefined) return
    deliver(
      kit,
      sender,
      service,
      entry,
      tail.entries.map((text): ContractEvent => {
        // A concern scan that names Adapt-In sections adds them to the plan, once each.
        const pulled = pulledSections(run.menu, text, run.plan)
        run.plan = [...run.plan, ...pulled]
        return {
          name: 'run:note',
          payload: {
            runId: run.runId,
            sessionId: entry.sessionId,
            text,
            ...(pulled.length === 0 ? {} : { pulled }),
            at
          }
        }
      })
    )
  })
  const settled = next.catch(() => undefined)
  memlogs.reading.set(path, settled)
  return settled
}
