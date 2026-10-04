import { scanHeadings } from './section-headings'

/**
 * The section plan, pure: what a run is predicted to write, read from the
 * skill's own template, and how the names it holds are compared. Main reads
 * the template once at dispatch and tells the window the names; the window
 * reads the section being written from the streamed text. Both use this.
 *
 * A *name* is a section's heading as a reader says it, with any leading
 * numbering stripped (`1. Vision` is `Vision`). Names are compared without
 * regard to case.
 */

/** The leading numbering of a heading: `1.`, `2)`, `3.1.` or `3.1`, and the space after it. */
const NUMBERING = /^(?:\d+(?:\.\d+)*[.)]|\d+(?:\.\d+)+)\s+/

/** A heading that is a `{placeholder}`, which stands for a name and is none. */
const PLACEHOLDER = /^\{[^}]*\}$/

/** Any ATX heading, of any level. */
const ANY_HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const CLOSING_FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/

/** A bullet whose first words are bold: its name is the bold text. */
const MENU_BULLET = /^\s*[-*+][ \t]+\*\*(.+?)\*\*/

const MENU_HEADING = /^adapt-in menu\b/i

const CONCERN_SCAN = /concern[ -]scan/i

/** A heading as the plan names it: numbering stripped, and the text trimmed. */
export function sectionName(heading: string): string {
  return heading.replace(NUMBERING, '').trim()
}

/** What two names are compared by. */
export function nameKey(name: string): string {
  return sectionName(name).toLowerCase()
}

/** The sections a skill's template predicts, and the names its Adapt-In menu offers. */
export type TemplatePlan = { spine: string[]; menu: string[] }

/** `names` without the ones whose key repeats an earlier one's. */
function distinct(names: readonly string[]): string[] {
  const keys = new Set<string>()
  const out: string[] = []
  for (const name of names) {
    const key = nameKey(name)
    if (key === '' || keys.has(key)) continue
    keys.add(key)
    out.push(name)
  }
  return out
}

function emphasisless(text: string): string {
  return text.replace(/[*`]/g, '').replace(/\s+/g, ' ').trim()
}

/** The names a template's document sections give: see `templatePlan`. */
function spineOf(text: string): string[] {
  const fenced = scanHeadings(text, 'inside')
  const headings = fenced.length > 0 ? fenced : scanHeadings(text, 'outside')
  return distinct(
    headings
      .map(({ name }) => sectionName(name))
      .filter((name) => name !== '' && !PLACEHOLDER.test(name))
  )
}

/** The bold names of the bullets under the template's `Adapt-In Menu` heading, in order. */
function menuOf(text: string): string[] {
  const names: string[] = []
  let fence: string | null = null
  let level = 0
  for (const line of text.split(/\r?\n/)) {
    if (fence !== null) {
      const closing = CLOSING_FENCE.exec(line)
      if (closing !== null && closing[1][0] === fence[0] && closing[1].length >= fence.length) fence = null
      continue
    }
    const fenced = FENCE.exec(line)
    if (fenced !== null) {
      fence = fenced[1]
      continue
    }
    const heading = ANY_HEADING.exec(line)
    if (heading !== null) {
      const depth = heading[1].length
      if (level === 0) {
        if (MENU_HEADING.test(emphasisless(heading[2] ?? ''))) level = depth
      } else if (depth <= level) {
        break
      }
      continue
    }
    if (level === 0) continue
    const bullet = MENU_BULLET.exec(line)
    if (bullet !== null) {
      const name = emphasisless(bullet[1])
      if (name !== '') names.push(name)
    }
  }
  return distinct(names)
}

/**
 * What a skill's template predicts.
 *
 * - `spine`: if any fenced code block holds a level-2 heading, the document
 *   sections are the level-2 headings inside fenced blocks and every one
 *   outside is scaffolding; else every level-2 heading. Emphasis is stripped,
 *   numbering is stripped, and a heading that is a `{placeholder}` is no
 *   section.
 * - `menu`: the bold names of the bullets under the template's `Adapt-In Menu`
 *   heading, which a concern scan may pull into the plan.
 */
export function templatePlan(text: string): TemplatePlan {
  return { spine: spineOf(text), menu: menuOf(text) }
}

/**
 * The menu names a memlog entry pulls into the plan: if the entry is a concern
 * scan (any case, a space or a hyphen), every menu name it contains, in menu
 * order, that the plan does not already hold. Names the menu does not have add
 * nothing.
 */
export function pulledSections(menu: readonly string[], note: string, plan: readonly string[] = []): string[] {
  if (!CONCERN_SCAN.test(note)) return []
  const lower = note.toLowerCase()
  const held = new Set(plan.map(nameKey))
  const pulled: string[] = []
  for (const name of menu) {
    const key = nameKey(name)
    if (key === '' || held.has(key) || !lower.includes(key)) continue
    held.add(key)
    pulled.push(name)
  }
  return pulled
}

/**
 * The name of the section that holds the character at `offset` of `text`: the
 * last level-2 heading that starts at or before it. None when no heading does.
 */
export function sectionAt(text: string, offset: number): string | undefined {
  let name: string | undefined
  for (const heading of scanHeadings(text)) {
    if (heading.offset > offset) break
    name = sectionName(heading.name)
  }
  return name === '' ? undefined : name
}

/**
 * The sections still to write, by name: every plan name not yet written, in
 * plan order, then the names seen in the document that the plan does not hold
 * (and no commit has written), in the order they were seen. `written` is what
 * confirmed commits of the document named.
 */
export function pendingSections(
  plan: readonly string[],
  written: readonly string[],
  seen: readonly string[]
): string[] {
  const done = new Set(written.map(nameKey))
  const listed = new Set<string>()
  const pending: string[] = []
  for (const name of [...plan, ...seen]) {
    const key = nameKey(name)
    if (key === '' || done.has(key) || listed.has(key)) continue
    listed.add(key)
    pending.push(sectionName(name))
  }
  return pending
}

/**
 * A plan with the names a note pulled added, each once: a name the plan already
 * holds (without regard to case) adds nothing. Both the card main holds and the
 * window's fold it with this, so the two plans are one.
 */
export function withPulled(plan: readonly string[] | undefined, pulled: readonly string[]): string[] {
  const held = new Set((plan ?? []).map(nameKey))
  const next = [...(plan ?? [])]
  for (const name of pulled) {
    const key = nameKey(name)
    if (key === '' || held.has(key)) continue
    held.add(key)
    next.push(name)
  }
  return next
}
