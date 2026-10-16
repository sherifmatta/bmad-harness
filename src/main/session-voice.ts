import type { ContractEvent } from '../shared/events'
import type { SessionId } from '../shared/ids'
import type { Sender } from './bridge-kit'
import type { TranscriptRegistry } from './projections/transcript'

/**
 * What the harness says in its own voice, and when a session has been silent
 * long enough to say it. The words are lower case and plain, and carry nothing
 * the CLI wrote beyond a short subtype word.
 */

/** How long a busy session may say nothing, in any frame, before the harness says so. */
export const QUIET_MS = 120_000

/** A CLI's own word for how a turn ended, when it is the plain word it always is. */
const SUBTYPE = /^[a-z][a-z0-9_]{0,39}$/

export const LINES = {
  failed: (subtype: string | undefined): string =>
    subtype !== undefined && SUBTYPE.test(subtype) ? `turn failed · ${subtype}` : 'turn failed',
  exited: 'session ended · the process exited',
  // Placeholder copy until `bmad-ux` writes it: said when an interrupt was not acknowledged and the session ended with the run.
  stopEnded: 'stop not acknowledged · the session ended with the run',
  // Placeholder copy until `bmad-ux` writes it: said when an interrupt was acknowledged and the turn still did not end.
  stopUnfinished: 'stop sent · the turn did not end · the session ended with the run',
  // Placeholder copy until `bmad-ux` writes it: said once for a plain chat turn the user stopped, at its failed `result`.
  stopped: 'stopped · the turn ended early',
  // Placeholder copy until `bmad-ux` writes it: said when an interrupt of a plain chat turn was not acknowledged and the session ended with it.
  stopTurnEnded: 'stop not acknowledged · the session ended with the turn',
  // Placeholder copy until `bmad-ux` writes it: said when an interrupt of a plain chat turn was acknowledged and the turn still did not end.
  stopTurnUnfinished: 'stop sent · the turn did not end · the session ended with the turn',
  // Placeholder copy until `bmad-ux` writes it: said when a turn nobody sent begins after a stop the user asked for, and a run starts for it.
  carriedOn: 'carried on after the stop · a new run follows it',
  /**
   * Said once when a room first opens (Story 4.1): who opened it and who is present, by
   * the roster's display names (the id where a name is empty). Placeholder copy until
   * `bmad-ux` writes it, in the register of EXPERIENCE.md's sysline sample.
   */
  roomOpened: (names: readonly string[]): string => `room opened by you · present · ${names.join(' · ')}`,
  /** Said once when the user stops a room (Story 4.5): the harness's own fact, never a persona's voice. */
  roomStopped: 'room stopped · session released',
  /**
   * Said once when the user ends a persona's seat (Story 7.4): the thread keeps every turn, so
   * the line says the persona starts fresh. By the roster's display name (the id where there is
   * none). Placeholder copy until `bmad-ux` writes it.
   */
  seatEnded: (name: string): string => `session closed · ${name} starts fresh on the next message`,
  quiet: (ms: number): string =>
    `no output for ${Math.round(ms / 1000)}s · the session may be stuck · close it to start over`
}

/**
 * The harness's own line: kept in the transcript where it fell, and told to the
 * window as `harness:said`. The transcript is the project's, so the line is
 * found again by a window that reloads.
 */
export function createVoice(deps: {
  transcripts: TranscriptRegistry
  now: () => number
  emit: (sender: Sender, event: ContractEvent) => void
}): (
  sender: Sender,
  line: { sessionId: SessionId; projectRoot: string; text: string; room?: true; skillSession?: SessionId }
) => void {
  return (sender, { sessionId, projectRoot, text, room, skillSession }) => {
    const record = deps.transcripts.forProject(projectRoot).recordSysline(text, deps.now(), room, skillSession)
    deps.emit(sender, {
      name: 'harness:said',
      payload: {
        sessionId,
        id: record.id,
        text: record.text,
        at: record.at,
        ...(record.room === true ? { room: true } : {}),
        ...(record.skillSession === undefined ? {} : { skillSession: record.skillSession })
      }
    })
  }
}

export function defaultSchedule(run: () => void, ms: number): () => void {
  const timer = setTimeout(run, ms)
  timer.unref()
  return () => clearTimeout(timer)
}

/** What the silence clock reads and keeps of a session. */
export type Watched = {
  closed: boolean
  turn: { busy: boolean }
  /** Stops the clock, while one is running. */
  stopQuietClock: (() => void) | undefined
}

/**
 * The silence clock of a busy session: any frame at all starts it again, and
 * when it runs out `onQuiet` is told once. It only tells: nothing is closed,
 * interrupted or retried, and the close control the window shows for every open
 * session is the way out. A session that is not mid-turn, or is gone, has no
 * clock, and it is not run again until the next frame or turn. A permission
 * request is answered in Sources as it arrives and never reaches the clock;
 * the frames the CLI sends once it has its answer start the clock again, so a
 * turn left waiting on a control response is a silence like any other.
 */
export function createQuietClock<S, E extends Watched>(deps: {
  schedule: (run: () => void, ms: number) => () => void
  quietMs: number
  onQuiet: (sender: S, entry: E) => void
}): (sender: S, entry: E) => void {
  return (sender, entry) => {
    entry.stopQuietClock?.()
    entry.stopQuietClock = undefined
    if (entry.closed || !entry.turn.busy) {
      return
    }
    entry.stopQuietClock = deps.schedule(() => {
      entry.stopQuietClock = undefined
      if (!entry.closed && entry.turn.busy) {
        deps.onQuiet(sender, entry)
      }
    }, deps.quietMs)
  }
}
