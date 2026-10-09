/**
 * The `@name` a user typed to hand the work to a persona, as main accepts it for the record (AD-25).
 *
 * It is `@` followed by one token without whitespace, and the token equals, ignoring case, the roster `name` of
 * the persona whose session receives the turn. Anything else, or no roster name to check against (a room has no
 * persona), is not a mention: `undefined`, and the turn goes on without one. The value is returned as typed,
 * case kept. Pure; the persona never receives it.
 */
export function validMention(mention: unknown, rosterName: string | undefined): string | undefined {
  if (typeof mention !== 'string' || rosterName === undefined) {
    return undefined
  }
  const token = /^@(\S+)$/.exec(mention)?.[1]
  if (token === undefined) {
    return undefined
  }
  return token.toLowerCase() === rosterName.trim().toLowerCase() ? mention : undefined
}
