/**
 * A turn's timestamp as the header shows it: the local wall-clock `HH:MM`,
 * 24-hour, zero-padded. Times cross the bridge as epoch milliseconds and are
 * formatted here and nowhere else, so a transcript restored on another day
 * reads the same as it did live.
 *
 * `timeZone` is an argument so a test can pin it; left out, the machine's own
 * zone is used. A value that is not a finite instant reads as an empty string
 * rather than throwing: a turn with a bad clock still shows its words.
 */
export function formatTurnTime(at: number, timeZone?: string): string {
  if (!Number.isFinite(at)) {
    return ''
  }
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone })
  }).format(date)
}

/**
 * A moment as the Board's recent-activity feed shows it: the local month, day
 * and wall-clock time as `MM-DD HH:MM`, 24-hour and zero-padded. The feed spans
 * days, so the date is part of it and `formatTurnTime` is not enough. Absolute,
 * never relative.
 *
 * `timeZone` is an argument so a test can pin it; left out, the machine's own
 * zone is used. A value that is not a finite instant reads as an empty string.
 */
export function formatEventTime(at: number, timeZone?: string): string {
  if (!Number.isFinite(at)) {
    return ''
  }
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const parts = new Intl.DateTimeFormat('en-GB', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone })
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((candidate) => candidate.type === type)?.value ?? ''

  return `${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}
