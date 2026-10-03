/** An errno name is letters, digits and underscores; anything else is not shown. */
const ERRNO = /^[A-Za-z0-9_]{1,32}$/

/**
 * `code` when it has the shape of an errno name, else `fallback`: the one-word
 * `detail` a reply or a diagnostic may carry. The system's own message is never
 * passed on, because it names paths.
 */
export function errnoName(code: unknown, fallback = 'failed'): string {
  return typeof code === 'string' && ERRNO.test(code) ? code : fallback
}

/** The errno name of a thrown value, or `fallback` when it has none. */
export function errnoOf(error: unknown, fallback = 'failed'): string {
  const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  return errnoName(code, fallback)
}
