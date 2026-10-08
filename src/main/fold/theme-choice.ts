import { isThemeChoice } from '../../shared/theme'
import type { ThemeChoice } from '../../shared/theme'

/**
 * What a stored theme is read as, as a rule over a value with no I/O. The file
 * itself is `sources/persistence/theme-file.ts`'s; reading it never throws and
 * hands this whatever it found.
 *
 * The harness has never been told a theme until the user chooses one, so the
 * default is *System*, and so is everything that is not one of the three words:
 * a missing file, bad JSON, a stored value of another shape or an unknown word.
 * None of those is an error, none is surfaced, and the next choice rewrites the
 * file.
 */

/** What the app holds before it has been told, and for anything it cannot read. */
export const DEFAULT_THEME_CHOICE: ThemeChoice = 'system'

/** The choice a stored value holds, or *System*. Never throws. */
export function parseThemeChoice(raw: unknown): ThemeChoice {
  if (typeof raw !== 'object' || raw === null || !('theme' in raw)) {
    return DEFAULT_THEME_CHOICE
  }
  return isThemeChoice(raw.theme) ? raw.theme : DEFAULT_THEME_CHOICE
}
