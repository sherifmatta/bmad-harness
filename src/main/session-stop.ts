import type { Sender } from './bridge-kit'
import { endRun } from './session-run'
import type { RunKit } from './session-run'
import type { Entry, Service, SessionRegistry } from './session-registry'
import { LINES } from './session-voice'

/**
 * Stopping a run: the user's one way to halt a turn, and what happens when the
 * CLI does not answer.
 *
 * `stopRun` marks the run `stopping` and only then asks the session to
 * interrupt (`SessionProcess.interrupt`: one in-band line, never a signal). The
 * mark comes first because the CLI's answer and the turn's own `result` can
 * arrive in one chunk, and the `result` of an interrupted turn is a failed one:
 * it is the mark that lets the registry's fold end the run as `run:stopped`.
 * The terminal event is raised on that `result` and on nothing else, so nothing
 * changes on the card between the press and it, and an acknowledged stop never
 * closes, kills or discards the session and says nothing in the transcript. A
 * failed `result` that leaves the session busy, because background subagents
 * are still live, is that same `result`: the registry's fold ends the run on it
 * and the session frees itself when the tasks drain.
 *
 * A stop that is not acknowledged is the fallback. The interrupt was refused,
 * could not be written, or `STOP_ACK_MS` passed on the injected `schedule` with
 * no answer, and the run is still in flight: the session's process group is
 * killed, the card ends with `run:stopped`, the harness says so in its own line,
 * and the session is closed. If the turn ended, or the session went, while the
 * answer was awaited, there is nothing left to do: the run already has its one
 * terminal event. A late answer is dropped by the process.
 *
 * An acknowledged interrupt whose `result` never comes is the same fallback,
 * `STOP_RESULT_MS` later. The CLI answers an interrupt with the turn's `result`
 * in milliseconds (`spike-stop-semantics.md`), so a run still in flight that long
 * after the answer is a turn the CLI is not ending, and an inert stop control on
 * it is the one outcome the user cannot get out of but by closing the session.
 *
 * A second stop for a run already stopping is accepted and writes nothing. A run
 * that is not in flight is `'not-found'`, however it ended.
 *
 * The project's files are none of this module's business: it holds no path and
 * offers no way back.
 */

/** How long a stop waits for the CLI to accept the interrupt before the session is ended instead. */
export const STOP_ACK_MS = 3000

/** How long an acknowledged interrupt waits for the turn's `result` before the session is ended instead. */
export const STOP_RESULT_MS = 10_000

/** What a stop needs of the registry that holds the session. */
export type StopKit = {
  runs: RunKit
  /** The harness says a line in its own voice. */
  say: (sender: Sender, entry: Entry, text: string) => void
  finish: SessionRegistry['finish']
}

/** Whether the CLI accepted the interrupt: false for a refusal, a failed write, a closed process or `STOP_ACK_MS` of silence. */
export function acknowledged(kit: Pick<RunKit, 'schedule'>, entry: Entry): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const cancel = kit.schedule(() => resolve(false), STOP_ACK_MS)
    const settle = (answer: boolean): void => {
      cancel()
      resolve(answer)
    }
    try {
      const asked = entry.session?.interrupt() ?? Promise.resolve(false)
      asked.then(settle, () => settle(false))
    } catch {
      settle(false)
    }
  })
}

export async function stopRun(
  kit: StopKit,
  sender: Sender,
  service: Service,
  entry: Entry
): Promise<'ok' | 'not-found'> {
  const run = entry.run
  if (entry.closed || run === undefined) {
    return 'not-found'
  }
  if (run.stopping) {
    return 'ok'
  }
  run.stopping = true
  const accepted = await acknowledged(kit.runs, entry)
  // The turn ended, or the session went, while the answer was awaited: the run has its terminal event.
  if (entry.closed || entry.run !== run) {
    return 'ok'
  }
  if (accepted) {
    // Nothing cancels this when the run ends: it finds the run gone and does nothing.
    kit.runs.schedule(() => {
      if (!entry.closed && entry.run === run) {
        endWithSession(kit, sender, service, entry, LINES.stopUnfinished)
      }
    }, STOP_RESULT_MS)
    return 'ok'
  }
  endWithSession(kit, sender, service, entry, LINES.stopEnded)
  return 'ok'
}

/** The fallback: the process group is killed, the card ends stopped, the harness says so and the session closes. */
function endWithSession(kit: StopKit, sender: Sender, service: Service, entry: Entry, line: string): void {
  entry.session?.kill()
  endRun(kit.runs, sender, service, entry, 'stopped')
  kit.say(sender, entry, line)
  kit.finish(sender, service, entry, 'closed')
}

/**
 * The user sent into a room whose turn is in flight (Story 4.2): the speaker is interrupted and the
 * send waits for the turn to end, so what it writes is the next turn and nothing is queued or refused.
 *
 * The entry is marked `interrupting` first, for the reason `stopRun` marks its run: the turn ends on a
 * failed `result`, and the mark is what lets the registry's fold treat that as the user's own doing and
 * say nothing of a failure. The interrupt is asked as a stop's is (`acknowledged`, `STOP_ACK_MS`); once
 * the CLI accepts it, the turn has `STOP_RESULT_MS` to end, and the registry releases the entry's
 * `idleWaiters` when it does (or when the session goes). True means idle: the caller may write.
 *
 * Anything else gives up and leaves no trace: a refused or unanswered interrupt, a turn that does not end
 * in time. Nothing is killed, nothing is said, `interrupting` is cleared, and the caller refuses the send
 * as busy, as it always did.
 */
export async function interruptTurn(kit: Pick<RunKit, 'schedule'>, entry: Entry): Promise<boolean> {
  entry.interrupting = true
  const accepted = await acknowledged(kit, entry)
  if (!accepted || entry.closed) {
    entry.interrupting = false
    return false
  }
  // The turn may have ended while the answer was awaited.
  if (!entry.turn.busy) {
    return true
  }
  const idle = await new Promise<boolean>((resolve) => {
    const release = (): void => settle(true)
    const cancel = kit.schedule(() => settle(false), STOP_RESULT_MS)
    function settle(answer: boolean): void {
      cancel()
      const at = entry.idleWaiters.indexOf(release)
      if (at !== -1) entry.idleWaiters.splice(at, 1)
      resolve(answer)
    }
    entry.idleWaiters.push(release)
  })
  if (!idle) {
    entry.interrupting = false
  }
  return idle
}
