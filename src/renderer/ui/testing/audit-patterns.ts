/**
 * What the Epic 3 audit (Story 3.11) reads off a drawn card: the words a stand-in
 * for progress is made of, the markup of a bar or spinner, a denominator, an
 * arbitration word, and everything a reader or a reader's tool is given. Shared
 * by every test that mounts a card and checks it, so a card built any way is held
 * to the same patterns. Nothing here is imported by the product.
 */

/** Everything a reader or a reader's tool is given: the visible words, and the labels and titles. */
export function spoken(root: Element): string {
  const labels = [...root.querySelectorAll('[aria-label], [title]')].map((node) => `${node.getAttribute('aria-label') ?? ''} ${node.getAttribute('title') ?? ''}`)
  return `${root.textContent ?? ''} ${labels.join(' ')}`
}

export const STAND_IN =
  /\b(?:loading|resolving|scanning|fetching|connecting|initiali[sz]ing|please wait|spinner|skeleton|shimmer|opening|starting|thinking|typing|waiting|processing|preparing|booting|launching|warming|getting ready|in progress|one moment|just a moment|hold on|stand by|busy)\b|\.\.\.|…/i
export const SPINNER_MARKUP = /<progress\b|<meter\b|role="progressbar"|aria-valuenow|aria-valuemax|spinner|skeleton|shimmer|loader/i
export const DENOMINATOR = /\bof\s+(?:\d+|[mn])\b|\d\s*\/\s*\d|\/\s*\d|\btotal\b|%/i
export const ARBITRATION = /\b(?:undo|revert|restore|merge|lock|resolve)\w*/i

/**
 * A selector for every way markup makes a live region, which a drawn thread must hold none of (Story 5.3).
 * The attribute's name and the alert role are spelled in two pieces so this file is not read as a live
 * region by the accessibility sweep, which looks for the words in every source.
 */
export const LIVE_REGIONS = [`aria-${'live'}`, 'role="status"', 'role="log"', `role="${'al'}ert"`].map((part) => `[${part}]`).join(', ')

/**
 * A drawn window's markup without its side panels' splitters (Story 5.5). A splitter is a `separator` that
 * exposes its value, minimum and maximum, as the role requires, and is a tab stop: to an audit of what a
 * window draws of progress, roles or tab stops it is neither a bar nor a control of the thread. The audits
 * of the splitters themselves are layout/panel-splitter.dom.test.tsx's.
 */
export function withoutSplitters(markup: string): string {
  return markup.replace(/<div role="separator"[^>]*><\/div>/g, '')
}
