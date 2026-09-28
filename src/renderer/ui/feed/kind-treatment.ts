/**
 * Which of the three tag treatments a memlog kind takes.
 *
 * Written as a total function over an open vocabulary rather than as a lookup
 * table with a throw, because FR41's promise is the open vocabulary itself:
 * `memlog.py` gives `--type` no `choices=`, the host skill supplies the words,
 * and nineteen distinct kinds already occur across this repository's five
 * memlogs. A kind shipped by a future BMad release must render, not break the
 * feed — so "everything else" is the rule, not the error case, and `null` (an
 * untagged entry) is inside it rather than beside it.
 *
 * The four named kinds are FR41's, not DESIGN.md's. DESIGN.md names `open` for
 * the friction treatment; `open` does not occur in the real format and
 * `question`/`gap` do, which is the substitution FR41 records.
 */
export type KindTreatment = 'accent' | 'neutral' | 'friction'

/**
 * `decision` is the accent treatment, because a decision is the product's
 * whole point. `question` and `gap` are the warm friction treatment — an
 * unresolved question is someone pushing back, not a failure, so it takes
 * `disagree` and never `red`. Everything else, `assumption` and `note`
 * included, is neutral.
 *
 * The kind is compared as written: `parseMemlog` has already trimmed and
 * lower-cased it, and a second normalisation here would be a second rule about
 * casing in a second place.
 */
export function kindTreatment(kind: string | null): KindTreatment {
  if (kind === 'decision') {
    return 'accent'
  }
  if (kind === 'question' || kind === 'gap') {
    return 'friction'
  }
  return 'neutral'
}
