/**
 * Which agent a file belongs to, from its class alone (FR51, AD-19).
 *
 * The classes are the install contract's observed ones
 * (`bmad-install-contract.md:81-83`) and observed menus (`:66-72`), matched on
 * the case-insensitive basename in any directory. Anything else has no owner:
 * never a guess, never a default. No writing session exists in this epic, so
 * the session branch of FR51 is absent, not stubbed.
 *
 * Pipeline position is neither asked, stored nor parsed (FR10): the rail's
 * position is "which artifacts are present", and this file reads none of them.
 *
 * The sprint-status finding, recorded here and in the Story 1.11 spec. The
 * file is one more row with a class-derived owner (John's `IR` menu entry runs
 * `bmad-sprint-planning`), and its contents are never read. Verified against
 * the sprint-planning skill's own template during planning: `development_status`
 * is a flat map whose keys carry the structure (`epic-1`, `1-1-<slug>` and
 * `epic-1-retrospective` share one namespace, so position comes from parsing
 * key shape, not nesting); the status vocabulary is six values (`backlog`,
 * `ready-for-dev`, `in-progress`, `review`, `done`, `optional`), not the three
 * the install contract describes; timestamps are `MM-DD-YYYY HH:MM`, not ISO;
 * and an unrecognised status must degrade, not break. This file still never
 * reads it: the Board is that consumer from Story 6.2, through one fold in
 * `fold/sprint-status.ts` and one reader in `sources/project/`.
 */

const OWNER_BY_BASENAME: ReadonlyMap<string, string> = new Map([
  ['product-brief.md', 'bmad-agent-analyst'],
  ['prd.md', 'bmad-agent-pm'],
  ['architecture.md', 'bmad-agent-architect'],
  ['design.md', 'bmad-agent-ux-designer'],
  ['experience.md', 'bmad-agent-ux-designer'],
  ['sprint-status.yaml', 'bmad-agent-pm']
])

/** The owning agent's id for a project-relative POSIX path, or `undefined`. */
export function ownerAgentIdFor(path: string): string | undefined {
  const basename = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  return OWNER_BY_BASENAME.get(basename)
}
