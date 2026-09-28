/**
 * A reason split into its emphasised and unemphasised runs.
 *
 * FR40, UX-DR20 and DESIGN.md all require the load-bearing clause of a run
 * note at 600 in `text`, and **nothing anywhere defines how that clause is
 * identified** — the mockup's emphasis is hand-authored `<b>` tags. Deriving
 * "the substantive phrase" would mean inventing a rule no source states, so
 * emphasis is rendered where the text marks it and nowhere else. `**…**` is
 * the only inline marker the memlog format can carry through the writer's
 * whitespace collapse, and there are two of them across 267 real entries: the
 * requirement stays satisfiable, and honest about how rarely it fires.
 *
 * Returning data rather than markup is what keeps this safe. The component
 * renders each span as a React child, which escapes by construction, so
 * project content can never become HTML — no markdown engine, no sanitizer,
 * no `dangerouslySetInnerHTML`. The attack surface is not reduced, it is
 * absent.
 */

/** One run of reason text, and whether it is the emphasised one. */
export type EmphasisSpan = {
  text: string
  emphasised: boolean
}

const MARKER = '**'

/**
 * Split `reason` on paired `**`.
 *
 * An unmatched marker is left as literal text — the format has no escape
 * sequence, so `a ** b` is a reason containing two asterisks and not a broken
 * document. Empty runs are dropped, so `**a**` is one span rather than three
 * and `a ****b` does not emit an emphasised nothing between its halves. An
 * empty reason yields no spans at all; the row still renders its three
 * children, because that is the component's rule and not this one's.
 */
export function emphasisSpans(reason: string): EmphasisSpan[] {
  const spans: EmphasisSpan[] = []
  const push = (text: string, emphasised: boolean): void => {
    if (text !== '') {
      spans.push({ text, emphasised })
    }
  }

  let at = 0
  for (;;) {
    const open = reason.indexOf(MARKER, at)
    if (open === -1) {
      break
    }
    const close = reason.indexOf(MARKER, open + MARKER.length)
    if (close === -1) {
      // Unpaired: everything from here on is literal, markers included.
      break
    }

    push(reason.slice(at, open), false)
    push(reason.slice(open + MARKER.length, close), true)
    at = close + MARKER.length
  }

  push(reason.slice(at), false)
  return spans
}
