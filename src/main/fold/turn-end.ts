import type { FrameInput } from './frame'

/**
 * Whether a session's turn is over, folded from what the CLI said — pure and
 * immutable, with no I/O and no clock.
 *
 * A `result` row is the end of *a* turn, not of the turn the harness sent: a
 * session takes turns nobody sent, because background subagents finishing wake
 * the main thread, and each wake ends in a `result` of its own (the corpus has
 * 14 for 3 sends). The CLI says what is still running in
 * `system/background_tasks_changed`, which carries the whole live set, and a
 * session is only free when a main-thread `result` arrives with that set empty.
 * A `result` with tasks live leaves it busy, and the wake that follows ends it.
 *
 * Two edges follow from that. A main-thread message that starts while the
 * session is free is a turn nobody sent, and the session is busy again. And a CLI
 * that never sends the task frame leaves the set empty, which is the old rule:
 * one `result` ends the turn. A task that never reports done leaves the session
 * busy; the close control and the watchdog's harness line are for that.
 *
 * `is_error` and `subtype` say how a turn ended and do not change whether it did:
 * a failed `result` frees the session like any other, and `failed` carries it up.
 * The process exit code is never the signal. A `result` a subagent wrote is its
 * own and does not end the main thread's turn; the frame reader drops it.
 */
export type TurnState = {
  /** A turn is in flight: begun by the activation or a send, or by one nobody sent. */
  busy: boolean
  /** The ids of the background tasks the CLI last said are live. */
  tasks: ReadonlySet<string>
}

/** A session just opened: its activation turn is in flight and nothing is running behind it. */
export const initialTurn: TurnState = { busy: true, tasks: new Set() }

/** What a frame did to the turn, besides updating the state. */
export type TurnSignal =
  /** A main-thread `result` ended the turn: the session is free. */
  | { kind: 'ended'; failed: boolean; subtype: string | undefined }
  /** A `result` with background tasks live: a failed one is still news, and the session stays busy. */
  | { kind: 'failed-while-pending'; subtype: string | undefined }
  /** A main-thread message began while the session was free: a turn nobody sent. */
  | { kind: 'resumed' }

export type TurnStep = { state: TurnState; signal?: TurnSignal }

/** A turn the harness sends begins: busy, with the tasks as they were. */
export function beginTurn(state: TurnState): TurnState {
  return state.busy ? state : { ...state, busy: true }
}

/** Fold one narrowed frame into the turn. Frames that say nothing of it yield the state as it was. */
export function foldTurn(state: TurnState, input: FrameInput | undefined): TurnStep {
  switch (input?.kind) {
    case 'background-tasks':
      return { state: { ...state, tasks: new Set(input.taskIds) } }

    case 'turn-result': {
      // A result while the session is already free ends nothing: it is not told twice.
      if (!state.busy) {
        return { state }
      }
      if (state.tasks.size > 0) {
        return input.failed
          ? { state, signal: { kind: 'failed-while-pending', subtype: input.subtype } }
          : { state }
      }
      return {
        state: { ...state, busy: false },
        signal: { kind: 'ended', failed: input.failed, subtype: input.subtype }
      }
    }

    case 'message-start':
      return state.busy
        ? { state }
        : { state: { ...state, busy: true }, signal: { kind: 'resumed' } }

    default:
      return { state }
  }
}
