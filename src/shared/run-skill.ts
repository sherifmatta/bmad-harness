/**
 * The name of the skill a run invoked, as a recorded fact (AD-24, Story 3.18): set by main
 * on `run:started` when the dispatched menu entry resolved to a skill, kept on the run's
 * card, inherited by a carry-on run. It is never an input: nothing dispatches or resolves
 * by it. A name that is not plain and bounded is left off wherever it would be recorded:
 * at dispatch, on the carry-on, and on a stored card read back.
 */
const PLAIN_SKILL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/

/** Whether `value` is a plain bounded skill name. */
export function isPlainSkillName(value: unknown): value is string {
  return typeof value === 'string' && PLAIN_SKILL_NAME.test(value)
}

/** The name when it is plain, else `undefined`: the one gate a recorded skill passes. */
export function skillOf(name: unknown): string | undefined {
  return isPlainSkillName(name) ? name : undefined
}
