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
function acknowledged(kit: RunKit, entry: Entry): Promise<boolean> {
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
