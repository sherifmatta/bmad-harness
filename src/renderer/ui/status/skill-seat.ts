/**
 * A skill-first session's seat in the rail (Story 7.5): `work`, `live`, or `ended`. The window derives it from
 * what it holds of the session (`chat/conversation-state`), and the rail and the chat header only draw it, so the
 * type lives where both may reach it.
 */
export type SkillSeat = {
  sessionId: string
  skill: string
  /** When the session started: the seat's `HH:MM` while another seat shares its name. */
  at: number
  state: 'work' | 'live' | 'ended'
  /** When the turn in flight began; only for `work`. */
  since: number | undefined
}

/**
 * The key a skill-first session's messages are queued under, and its seat's key in the rail's one roving list: a
 * persona's agent id can never hold the `:`, so the one map serves both without one reading the other's.
 */
const SKILL_KEY = 'skill:'

export const skillKey = (sessionId: string): string => `${SKILL_KEY}${sessionId}`

export const isSkillKey = (key: string): boolean => key.startsWith(SKILL_KEY)

export const skillIdOf = (key: string): string => key.slice(SKILL_KEY.length)
