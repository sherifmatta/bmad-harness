/**
 * Whether a stored turn's `mention` is one to show (AD-25): the user's own turn to a persona, never the
 * room's, and `@` followed by one token without whitespace. Anything else loads as a plain turn.
 */
export function isStoredMention(record: { kind: string; room?: unknown }, mention: unknown): mention is string {
  return (
    record.kind === 'user' && record.room !== true && typeof mention === 'string' && /^@\S+$/.test(mention)
  )
}
