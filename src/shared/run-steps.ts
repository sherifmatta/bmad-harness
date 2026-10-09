import type { RunCardStep } from './conversation'
import type { EpochMs } from './ids'
import type { RunStep } from './events'

/**
 * The run card's steps, folded once for both sides: main's card (`fold/run-card.ts`) and the
 * window's entry (`conversation-state.ts`) call these, so the two cannot drift
 * (`tests/run-card-parity.test.ts`). Pure and immutable: a list in, the next list out; the
 * list given back is the same one when the event changes nothing.
 */

/** The most steps a card keeps. */
export const MAX_STEPS = 300

/**
 * The steps after one `run:step` event. `notesCount` is how many notes the card holds now: a
 * step that begins records it. A repeated `running` for a known call, and a `done` or `failed`
 * for a call that is unknown or already closed, change nothing. Past the cap the oldest
 * finished step goes, never a running one.
 */
export function withStepEvent(
  steps: readonly RunCardStep[],
  notesCount: number,
  event: RunStep
): readonly RunCardStep[] {
  const at = steps.findIndex((step) => step.callId === event.callId)
  if (event.status === 'running') {
    if (at !== -1) return steps
    const next = [...steps, { callId: event.callId, label: event.label, status: 'running' as const, startedAt: event.at, notesBefore: notesCount }]
    if (next.length <= MAX_STEPS) return next
    const oldestFinished = next.findIndex((step) => step.status !== 'running')
    // Every step is running: nothing finished can go, and none running may, so the newcomer is not kept.
    if (oldestFinished === -1) return steps
    next.splice(oldestFinished, 1)
    return next
  }
  if (at === -1 || steps[at].status !== 'running') return steps
  const next = [...steps]
  next[at] = { ...steps[at], status: event.status, endedAt: event.at }
  return next
}

/** The steps with every running one closed `failed` at `at`: the run ended, or was found cut off. */
export function closeSteps(steps: readonly RunCardStep[], at: EpochMs): readonly RunCardStep[] {
  if (!steps.some((step) => step.status === 'running')) return steps
  return steps.map((step) => (step.status === 'running' ? { ...step, status: 'failed' as const, endedAt: at } : step))
}
